import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { LocalStorageProvider } from '@/lib/storage/local-storage';

/**
 * Isolated backup → restore exercise.
 *
 * No production credentials ever reach these scripts: `childEnv()` strips
 * every database/password/secret variable from the inherited environment, so
 * the only `DATABASE_URL` a backup can see is the throw-away SQLite file
 * written into a temporary directory by the fixture.
 */

const REPO_ROOT = process.cwd();
const BACKUP_SCRIPT = join(REPO_ROOT, 'deploy', 'scripts', 'backup.sh');
const CHECKSUM_SCRIPT = join(REPO_ROOT, 'deploy', 'scripts', 'verify-backup-checksums.sh');
const RESTORE_SCRIPT = join(REPO_ROOT, 'deploy', 'scripts', 'restore.sh');

/** Anything matching this can never be handed to a backup/restore script. */
const SENSITIVE_ENV_PATTERN = /(DATABASE|MYSQL|MARIADB|POSTGRES|PGPASSWORD|PASSWORD|SECRET|TOKEN|STORAGE_)/i;

function childEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SENSITIVE_ENV_PATTERN.test(key)) continue; // never leak production credentials into a test child process
    env[key] = value;
  }
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runScript(script: string, args: string[], overrides: Record<string, string | undefined> = {}): CommandResult {
  const result = spawnSync('bash', [script, ...args], {
    cwd: REPO_ROOT,
    env: childEnv(overrides),
    encoding: 'utf8',
    timeout: 60000,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

interface Fixture {
  root: string;
  app: string;
  backups: string;
  restore: string;
  dbFile: string;
  bytes: Buffer;
  storageBase: string;
  uploadedId: string;
  uploadedChecksum: string;
  /** Writes the non-secret `.env` the backup script sources. */
  writeEnv: (extra?: Record<string, string>) => void;
}

async function createFixture(options: { externalStorage?: boolean } = {}): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'alo-backup-'));
  const app = join(root, 'app');
  const backups = join(root, 'snapshots');
  const restore = join(root, 'restored');
  mkdirSync(app);
  mkdirSync(backups);
  mkdirSync(restore);

  const dbFile = join(app, 'test.sqlite');
  const db = new Database(dbFile);
  db.exec("CREATE TABLE Evidence (id TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO Evidence VALUES ('one','preserved')");
  db.close();

  const storageBase = options.externalStorage ? join(root, 'external-storage') : join(app, 'uploads');
  const storage = new LocalStorageProvider({ basePath: storageBase });
  const bytes = Buffer.from('private file retained after restore');
  const uploaded = await storage.upload(bytes, 'record.txt', {
    companyId: 'company-a',
    uploadedBy: 'user-a',
    folder: 'evidence',
  });

  const writeEnv = (extra: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      DATABASE_URL: `file:${dbFile}`,
      STORAGE_PROVIDER: 'local',
      STORAGE_LOCAL_PATH: storageBase,
      ...extra,
    };
    const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
    // Non-secret, test-only environment: a throw-away SQLite file and a
    // throw-away storage directory. Production credentials are never read.
    writeFileSync(join(app, '.env'), `${lines.join('\n')}\n`, { mode: 0o600 });
  };
  writeEnv();

  return {
    root,
    app,
    backups,
    restore,
    dbFile,
    bytes,
    storageBase,
    uploadedId: uploaded.id,
    uploadedChecksum: uploaded.checksum,
    writeEnv,
  };
}

function onlySnapshot(backups: string): string {
  const entries = readdirSync(backups);
  expect(entries).toHaveLength(1);
  return join(backups, entries[0]);
}

/**
 * Minimal BSD/macOS userland emulation: the shims reject the GNU-only flags
 * that broke `deploy/scripts/backup.sh` on macOS (`realpath -m`,
 * `realpath --relative-to`, `readlink -f`, `find -printf`, `stat -c`,
 * `rm --one-file-system`) and remove `sha256sum` from the environment, so a
 * Linux runner proves the macOS code path too.
 */
function createBsdUserlandShims(): string {
  const dir = mkdtempSync(join(tmpdir(), 'alo-bsd-shim-'));
  const write = (name: string, body: string) => writeFileSync(join(dir, name), body, { mode: 0o755 });

  write('realpath', `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    -m|--relative-to*|-e|-s|-q|-P|-L) echo "realpath: illegal option -- \${arg#-}" >&2; echo "usage: realpath [-q] [path ...]" >&2; exit 1 ;;
  esac
done
exec node -e 'for (const p of process.argv.slice(1)) console.log(require("path").resolve(p))' "$@"
`);

  write('readlink', `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    -f|-e|-m) echo "readlink: illegal option -- \${arg#-}" >&2; exit 1 ;;
  esac
done
exec node -e 'const fs=require("fs"); for (const p of process.argv.slice(1)) console.log(fs.readlinkSync(p))' "$@"
`);

  write('find', `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    -printf*) echo "find: -printf: unknown primary or operator" >&2; exit 1 ;;
  esac
done
exec ${execFileSync('bash', ['-c', 'command -v find']).toString().trim()} "$@"
`);

  write('stat', `#!/bin/sh
if [ "$1" = "-c" ]; then echo "stat: illegal option -- c" >&2; exit 1; fi
if [ "$1" = "-f" ]; then
  fmt="$2"; shift 2
  case "$fmt" in
    *%m*)
      for f in "$@"; do
        node -e 'console.log(Math.floor(require("fs").statSync(process.argv[1]).mtimeMs / 1000))' "$f"
      done
      exit 0
      ;;
    *) echo "stat: unsupported format: $fmt" >&2; exit 1 ;;
  esac
fi
echo "stat: unsupported invocation" >&2; exit 1
`);

  write('rm', `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    --one-file-system) echo "rm: illegal option -- -" >&2; exit 1 ;;
  esac
done
exec ${execFileSync('bash', ['-c', 'command -v rm']).toString().trim()} "$@"
`);

  // macOS has no `sha256sum`; emulate its absence, not just its name.
  write('sha256sum', `#!/bin/sh
echo "sha256sum: command not found" >&2
exit 127
`);

  return dir;
}

describe('isolated real backup → restore (not production certification)', () => {
  it('preserves SQLite rows, private file bytes and tenant ownership metadata', async () => {
    const fixture = await createFixture();
    try {
      const result = runScript(BACKUP_SCRIPT, [], {
        APP_DIR: fixture.app,
        BACKUP_DIR: fixture.backups,
        ENV_FILE: join(fixture.app, '.env'),
      });
      expect(result.stderr).not.toContain('illegal option');
      expect(result.status).toBe(0);

      const snapshot = onlySnapshot(fixture.backups);

      // Portable checksum verification (GNU sha256sum or macOS shasum).
      const checksums = runScript(CHECKSUM_SCRIPT, [snapshot]);
      expect(checksums.status).toBe(0);

      const restoredDb = new Database(join(snapshot, 'database.sqlite'), { readonly: true });
      try {
        expect(restoredDb.prepare('SELECT value FROM Evidence WHERE id=?').get('one')).toEqual({ value: 'preserved' });
        expect(restoredDb.pragma('integrity_check', { simple: true })).toBe('ok');
      } finally {
        restoredDb.close();
      }

      execFileSync('tar', ['-xzf', join(snapshot, 'application-storage.tar.gz'), '-C', fixture.restore], { timeout: 30000 });
      const restoredStorage = new LocalStorageProvider({ basePath: join(fixture.restore, 'uploads') });
      const metadata = await restoredStorage.getMetadata(fixture.uploadedId);
      expect(metadata).toMatchObject({ companyId: 'company-a', uploadedBy: 'user-a', checksum: fixture.uploadedChecksum });
      const downloaded = await restoredStorage.download(fixture.uploadedId);
      expect(downloaded).toEqual(fixture.bytes);
      expect(createHash('sha256').update(downloaded).digest('hex')).toBe(fixture.uploadedChecksum);

      const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8'));
      expect(manifest).toMatchObject({ database_backup_verified: true, storage_included: true, restore_tested: false });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('detects corruption of a captured artifact through the checksum manifest', async () => {
    const fixture = await createFixture();
    try {
      expect(
        runScript(BACKUP_SCRIPT, [], { APP_DIR: fixture.app, BACKUP_DIR: fixture.backups }).status,
      ).toBe(0);
      const snapshot = onlySnapshot(fixture.backups);
      expect(runScript(CHECKSUM_SCRIPT, [snapshot]).status).toBe(0);

      writeFileSync(join(snapshot, 'database.sqlite'), Buffer.from('tampered'));
      const tampered = runScript(CHECKSUM_SCRIPT, [snapshot]);
      expect(tampered.status).not.toBe(0);
      expect(`${tampered.stdout}${tampered.stderr}`).toMatch(/FAILED|checksum did NOT match|computed checksum did NOT match/i);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('archives storage configured outside the application directory without escaping the archive', async () => {
    const fixture = await createFixture({ externalStorage: true });
    try {
      const result = runScript(BACKUP_SCRIPT, [], { APP_DIR: fixture.app, BACKUP_DIR: fixture.backups });
      expect(result.status).toBe(0);

      const snapshot = onlySnapshot(fixture.backups);
      const archive = join(snapshot, 'configured-storage.tar.gz');
      expect(existsSync(archive)).toBe(true);

      const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', timeout: 30000 })
        .split('\n')
        .filter((entry) => entry.length > 0);
      for (const entry of listing) {
        expect(entry.startsWith('/')).toBe(false);
        expect(entry.split('/')).not.toContain('..');
      }

      execFileSync('tar', ['-xzf', archive, '-C', fixture.restore], { timeout: 30000 });
      const restoredStorage = new LocalStorageProvider({ basePath: fixture.restore });
      expect(await restoredStorage.getMetadata(fixture.uploadedId)).toMatchObject({
        companyId: 'company-a',
        uploadedBy: 'user-a',
      });
      expect(await restoredStorage.download(fixture.uploadedId)).toEqual(fixture.bytes);

      const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8'));
      expect(manifest).toMatchObject({ external_storage_included: true, restore_tested: false });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('refuses a storage path that points into the backup directory', async () => {
    const fixture = await createFixture({ externalStorage: true });
    try {
      fixture.writeEnv({ STORAGE_LOCAL_PATH: fixture.backups });
      const result = runScript(BACKUP_SCRIPT, [], { APP_DIR: fixture.app, BACKUP_DIR: fixture.backups });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('storage points into backup directory');
      const created = readdirSync(fixture.backups);
      expect(created).toHaveLength(1);
      expect(existsSync(join(fixture.backups, created[0], 'manifest.json'))).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('fails the backup when the configured database file is missing', async () => {
    const fixture = await createFixture();
    try {
      fixture.writeEnv({ DATABASE_URL: `file:${join(fixture.app, 'missing.sqlite')}` });
      const result = runScript(BACKUP_SCRIPT, [], { APP_DIR: fixture.app, BACKUP_DIR: fixture.backups });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('active SQLite database is missing or empty');
      const created = readdirSync(fixture.backups);
      expect(created).toHaveLength(1);
      expect(existsSync(join(fixture.backups, created[0], 'manifest.json'))).toBe(false);
      expect(existsSync(join(fixture.backups, created[0], 'database.sqlite'))).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps automated production restore blocked and leaves the database untouched', async () => {
    const fixture = await createFixture();
    try {
      const before = sha256File(fixture.dbFile);
      const result = runScript(RESTORE_SCRIPT, [], {
        APP_DIR: fixture.app,
        BACKUP_DIR: fixture.backups,
        DATABASE_URL: `file:${fixture.dbFile}`,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('BLOCKED');
      expect(sha256File(fixture.dbFile)).toBe(before);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('runs the backup end to end on a BSD/macOS userland without GNU-only flags', async () => {
    const fixture = await createFixture();
    const shims = createBsdUserlandShims();
    try {
      const result = runScript(BACKUP_SCRIPT, [], {
        APP_DIR: fixture.app,
        BACKUP_DIR: fixture.backups,
        PATH: `${shims}:${process.env.PATH ?? ''}`,
      });
      expect(`${result.stdout}${result.stderr}`).not.toContain('illegal option');
      expect(result.status).toBe(0);

      const snapshot = onlySnapshot(fixture.backups);
      expect(runScript(CHECKSUM_SCRIPT, [snapshot], { PATH: `${shims}:${process.env.PATH ?? ''}` }).status).toBe(0);

      const restoredDb = new Database(join(snapshot, 'database.sqlite'), { readonly: true });
      try {
        expect(restoredDb.prepare('SELECT value FROM Evidence WHERE id=?').get('one')).toEqual({ value: 'preserved' });
      } finally {
        restoredDb.close();
      }

      execFileSync('tar', ['-xzf', join(snapshot, 'application-storage.tar.gz'), '-C', fixture.restore], { timeout: 30000 });
      const restoredStorage = new LocalStorageProvider({ basePath: join(fixture.restore, 'uploads') });
      expect(await restoredStorage.download(fixture.uploadedId)).toEqual(fixture.bytes);
      expect(await restoredStorage.getMetadata(fixture.uploadedId)).toMatchObject({ companyId: 'company-a' });
    } finally {
      rmSync(shims, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps GNU-only coreutils flags out of the backup and restore scripts', () => {
    const scripts = [BACKUP_SCRIPT, RESTORE_SCRIPT, CHECKSUM_SCRIPT];
    const gnuOnly = [
      /realpath\s+-m/,
      /realpath\s+--relative-to/,
      /readlink\s+-f/,
      /find\s+[^\n]*-printf/,
      /\bmapfile\b/,
      /\breadarray\b/,
      /\brm\s+[^\n]*--one-file-system/,
      /\bsha256sum\b/,
    ];
    for (const script of scripts) {
      const source = readFileSync(script, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*#/.test(line)) // comments may name the flags they replace
        .join('\n');
      for (const pattern of gnuOnly) {
        expect(source, `${script} must not use ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
