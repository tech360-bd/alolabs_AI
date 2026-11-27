import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * The host-side apply script.
 *
 * This is the only process that turns a configuration version into a running
 * environment, so its failure modes are the ones that matter: a partially written
 * file, world-readable credentials, a payload for the wrong project, a value that
 * breaks every dotenv parser, or a "success" claimed without a health check.
 *
 * Every case runs against temporary directories with throw-away values. No
 * production path, credential or service is touched.
 */

const SCRIPT = join(process.cwd(), 'deploy', 'scripts', 'apply-environment.sh');

const CHECKSUM = 'a'.repeat(64);

interface Fixture {
  root: string;
  payload: string;
  target: string;
  write: (payload: Record<string, unknown>) => void;
  run: (args: string[]) => { status: number; stdout: string; stderr: string };
}

function fixture(values: Record<string, string> = { LOG_LEVEL: 'info', API_KEY: 'sk-test-1234567890' }): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'alo-env-apply-'));
  const payload = join(root, 'payload.json');
  const target = join(root, '.env.staging');
  const write = (body: Record<string, unknown>) => writeFileSync(payload, JSON.stringify(body), { mode: 0o600 });
  write({
    projectSlug: 'agentos',
    environment: 'staging',
    version: 7,
    checksum: CHECKSUM,
    values,
  });
  writeFileSync(target, 'LEGACY=1\n');

  const run = (args: string[]) => {
    const result = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', timeout: 60_000 });
    return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  };

  return { root, payload, target, write, run };
}

function cleanup(root: string) {
  rmSync(root, { recursive: true, force: true });
}

describe('apply-environment.sh', () => {
  it('writes the file atomically with mode 600 and reports the keys, not the values', () => {
    const f = fixture();
    try {
      const result = f.run([
        '--payload', f.payload,
        '--target', f.target,
        '--expect-project', 'agentos',
        '--expect-environment', 'staging',
      ]);

      expect(result.status).toBe(0);
      expect(statSync(f.target).mode & 0o777).toBe(0o600);
      const written = readFileSync(f.target, 'utf8');
      expect(written).toBe('API_KEY=sk-test-1234567890\nLOG_LEVEL=info\n');
      expect(written.split('\n').filter(Boolean)).toHaveLength(2);

      // The human-facing output must never contain a value.
      expect(result.stdout).not.toContain('sk-test-1234567890');
      expect(result.stdout).toContain('API_KEY');
      expect(result.stdout).toContain('APPLY_OK=1');
    } finally {
      cleanup(f.root);
    }
  });

  it('keeps a timestamped backup of the previous file', () => {
    const f = fixture();
    try {
      expect(f.run(['--payload', f.payload, '--target', f.target]).status).toBe(0);
      const backups = readdirSync(f.root).filter((name) => name.startsWith('.env.staging.bak.'));
      expect(backups).toHaveLength(1);
      expect(readFileSync(join(f.root, backups[0]), 'utf8')).toBe('LEGACY=1\n');
    } finally {
      cleanup(f.root);
    }
  });

  it('refuses a payload for another project or environment', () => {
    const f = fixture();
    try {
      const wrongProject = f.run(['--payload', f.payload, '--target', f.target, '--expect-project', 'someone-else']);
      expect(wrongProject.status).toBe(4);
      expect(wrongProject.stderr).toContain('APPLY_ERROR');
      expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');

      const wrongEnvironment = f.run(['--payload', f.payload, '--target', f.target, '--expect-environment', 'production']);
      expect(wrongEnvironment.status).toBe(4);
      expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');
    } finally {
      cleanup(f.root);
    }
  });

  it('rejects a malformed payload instead of writing a partial environment', () => {
    const f = fixture();
    try {
      for (const body of [
        { projectSlug: 'agentos', environment: 'staging', version: 1, checksum: 'short', values: { A: 'b' } },
        { projectSlug: 'agentos', environment: 'production', version: 1, checksum: CHECKSUM, values: {} },
        { projectSlug: 'agentos', environment: 'staging', version: 1, checksum: CHECKSUM, values: { lowercase: 'x' } },
        { projectSlug: 'agentos', environment: 'staging', version: 1, checksum: CHECKSUM, values: { A: 'line\nbreak' } },
        { projectSlug: 'agentos', environment: 'nowhere', version: 1, checksum: CHECKSUM, values: { A: 'b' } },
      ]) {
        f.write(body);
        const result = f.run(['--payload', f.payload, '--target', f.target]);
        expect(result.status, JSON.stringify(body)).toBe(3);
        expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');
      }

      writeFileSync(f.payload, 'not json at all');
      expect(f.run(['--payload', f.payload, '--target', f.target]).status).toBe(3);
      expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');
    } finally {
      cleanup(f.root);
    }
  });

  it('validates without writing in --dry-run and --check', () => {
    const f = fixture();
    try {
      const dry = f.run(['--payload', f.payload, '--target', f.target, '--dry-run']);
      expect(dry.status).toBe(0);
      expect(dry.stdout).toContain('APPLY_DRY_RUN=1');
      expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');

      const check = f.run(['--payload', f.payload, '--target', f.target, '--check']);
      expect(check.status).toBe(0);
      expect(check.stdout).toContain('APPLY_VALIDATED=1');
      expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');
    } finally {
      cleanup(f.root);
    }
  });

  it('fails when the reload or health command fails, and says which', () => {
    const f = fixture();
    try {
      const reload = f.run(['--payload', f.payload, '--target', f.target, '--reload-cmd', 'exit 1']);
      expect(reload.status).toBe(5);
      expect(reload.stderr).toContain('reload command failed');

      const health = f.run(['--payload', f.payload, '--target', f.target, '--reload-cmd', 'true', '--health-cmd', 'exit 1']);
      expect(health.status).toBe(6);
      expect(health.stderr).toContain('health check failed');
    } finally {
      cleanup(f.root);
    }
  });

  it('succeeds only when both commands pass', () => {
    const f = fixture();
    try {
      const result = f.run([
        '--payload', f.payload,
        '--target', f.target,
        '--reload-cmd', 'true',
        '--health-cmd', 'true',
      ]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('APPLY_HEALTHY=1');
    } finally {
      cleanup(f.root);
    }
  });

  it('rolls back to the newest backup', () => {
    const f = fixture();
    try {
      expect(f.run(['--payload', f.payload, '--target', f.target]).status).toBe(0);
      expect(readFileSync(f.target, 'utf8')).toContain('API_KEY');

      const rollback = f.run(['--target', f.target, '--rollback']);
      expect(rollback.status).toBe(0);
      expect(rollback.stdout).toContain('APPLY_ROLLED_BACK=');
      expect(readFileSync(f.target, 'utf8')).toBe('LEGACY=1\n');
      expect(statSync(f.target).mode & 0o777).toBe(0o600);
    } finally {
      cleanup(f.root);
    }
  });

  it('refuses to roll back when there is nothing to restore', () => {
    const f = fixture();
    try {
      const result = f.run(['--target', f.target, '--rollback']);
      expect(result.status).toBe(7);
      expect(result.stderr).toContain('no backup');
    } finally {
      cleanup(f.root);
    }
  });

  it('leaves no staging files behind on failure', () => {
    const f = fixture();
    try {
      f.write({ projectSlug: 'agentos', environment: 'staging', version: 1, checksum: CHECKSUM, values: { A: 'b' } });
      f.run(['--payload', f.payload, '--target', f.target, '--reload-cmd', 'exit 1']);
      const leftovers = readdirSync(f.root).filter((name) => name.includes('.new-') || name.includes('.restore-'));
      expect(leftovers).toEqual([]);
      expect(existsSync(f.target)).toBe(true);
    } finally {
      cleanup(f.root);
    }
  });
});
