/**
 * Backup engine — real, restorable logical dumps.
 *
 * Responsibilities:
 *   - create a readable SQL dump from the configured database (schema + rows)
 *   - persist a registry record so every UI can list backups
 *   - validate a dump and stage it for restore
 *   - replay a dump in place only when explicitly enabled
 *
 * Backups produced here supersede the old row-count-only files: they contain
 * `CREATE TABLE` and `INSERT` statements and are verified before being
 * registered.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, copyFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '@/lib/db';
import {
  createBackupSource,
  createReplayTarget,
  parseDatabaseUrl,
  readTable,
  type BackupSource,
} from './sources';
import {
  dropStatements,
  renderDump,
  validateDump,
  type DumpValidation,
  type SqlDialect,
  type TableDump,
} from './dump';

export const BACKUP_DIR = join(process.cwd(), 'db', 'backups');
const REGISTRY_PREFIX = 'db:backup:';
const CONFIG_KEY = 'backup:config';
const RESTORE_STAGING_DIR = join(process.cwd(), 'db', 'restore-staging');
const MAX_RESTORE_BYTES = 512 * 1024 * 1024;

export interface BackupConfig {
  autoBackup: boolean;
  schedule: string;
  retentionDays: number;
  compression: boolean;
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  autoBackup: true,
  schedule: 'daily',
  retentionDays: 30,
  compression: false,
};

/** Shape returned to the Backup panel (size + duration are MB / seconds). */
export interface BackupView {
  id: string;
  key: string;
  backupId: string;
  type: string;
  size: number;
  status: string;
  duration: number;
  compression: boolean;
  createdAt: string;
  updatedAt: string;
  /** Extra, non-panel fields. */
  filename: string;
  checksum?: string;
  dialect?: SqlDialect;
  tables?: number;
  rows?: number;
  source?: string;
}

interface StoredBackupRecord {
  filename: string;
  adapterName: string;
  sizeBytes: number;
  createdAt: string;
  type: string;
  storage: 'local' | 's3';
  status?: string;
  durationMs?: number;
  checksum?: string;
  dialect?: SqlDialect;
  tables?: number;
  rows?: number;
  source?: string;
  recoveryPoint?: string;
}

function toView(record: StoredBackupRecord, exists: boolean): BackupView {
  const sizeMb = record.sizeBytes / (1024 * 1024);
  const createdAt = record.createdAt;
  return {
    id: record.filename,
    key: record.filename,
    backupId: record.filename,
    type: record.type,
    size: Math.round(sizeMb * 100) / 100,
    status: exists ? record.status ?? 'completed' : 'failed',
    duration: Math.round((record.durationMs ?? 0) / 1000),
    compression: record.filename.endsWith('.gz'),
    createdAt,
    updatedAt: createdAt,
    filename: record.filename,
    checksum: record.checksum,
    dialect: record.dialect,
    tables: record.tables,
    rows: record.rows,
    source: record.source,
  };
}

async function readRegistry(): Promise<StoredBackupRecord[]> {
  const rows = await db.settings.findMany({ where: { key: { startsWith: REGISTRY_PREFIX } } });
  const records: StoredBackupRecord[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.value) as StoredBackupRecord;
      if (parsed && typeof parsed.filename === 'string') records.push(parsed);
    } catch {
      // Malformed registry entries are skipped, never guessed at.
    }
  }
  return records;
}

/** List backups, reconciling the registry against files on disk. */
export async function listBackups(): Promise<BackupView[]> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const records = await readRegistry();
  const views: BackupView[] = [];
  for (const record of records) {
    let exists = false;
    try {
      const info = await stat(join(BACKUP_DIR, record.filename));
      exists = info.isFile();
    } catch {
      exists = false;
    }
    views.push(toView(record, exists));
  }
  return views.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBackupConfig(): Promise<BackupConfig> {
  const row = await db.settings.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return { ...DEFAULT_BACKUP_CONFIG };
  try {
    const parsed = JSON.parse(row.value) as Partial<BackupConfig>;
    return { ...DEFAULT_BACKUP_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_BACKUP_CONFIG };
  }
}

export async function saveBackupConfig(config: BackupConfig): Promise<BackupConfig> {
  const merged: BackupConfig = { ...DEFAULT_BACKUP_CONFIG, ...config };
  await db.settings.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(merged), type: 'json' },
    create: { id: randomUUID(), key: CONFIG_KEY, value: JSON.stringify(merged), type: 'json' },
  });
  return merged;
}

export interface CreateBackupOptions {
  userId?: string;
  adapterName?: string;
  type?: string;
  /** Reuse an open source (used by tests / long-lived workers). */
  source?: BackupSource;
}

export interface CreateBackupResult {
  view: BackupView;
  validation: DumpValidation;
  durationMs: number;
}

/**
 * Create a validated, restorable dump and register it.
 * Throws (never writes a partial record) when the dump is not restorable.
 */
export async function createBackup(options: CreateBackupOptions = {}): Promise<CreateBackupResult> {
  const startedAt = Date.now();
  const source = options.source ?? createBackupSource();
  const adapterName = options.adapterName ?? 'primary';
  await mkdir(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${adapterName}-${timestamp}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  let tablesCount = 0;
  let rowsCount = 0;

  try {
    const tables = await source.listTables();
    const tableDumps: TableDump[] = [];
    for (const table of tables) {
      const dump = await readTable(source, table);
      if (dump.rows.length === 0 && !dump.schema) continue;
      tableDumps.push(dump);
      tablesCount += 1;
      rowsCount += dump.rows.length;
    }

    const rendered = renderDump(tableDumps, {
      dialect: source.dialect,
      database: source.database,
      source: source.sourceNote,
    });

    if (rendered.rows === 0 && rendered.tables === 0) {
      throw new Error('Database has no tables to back up; refusing to register an empty backup');
    }

    const validation = validateDump(rendered.sql);
    if (!validation.ok) {
      throw new Error(`Generated dump failed validation: ${validation.errors.join('; ')}`);
    }

    // Write to a temporary file first so a crash cannot leave a half dump
    // registered as "completed".
    const partialPath = `${filepath}.partial`;
    await writeFile(partialPath, rendered.sql, { encoding: 'utf8', mode: 0o600 });
    await rename(partialPath, filepath);

    const sizeBytes = Buffer.byteLength(rendered.sql, 'utf8');
    const checksum = createHash('sha256').update(rendered.sql).digest('hex');
    const durationMs = Date.now() - startedAt;

    const record: StoredBackupRecord = {
      filename,
      adapterName,
      sizeBytes,
      createdAt: new Date().toISOString(),
      type: options.type ?? 'manual',
      storage: 'local',
      status: 'completed',
      durationMs,
      checksum,
      dialect: source.dialect,
      tables: tablesCount,
      rows: rowsCount,
      source: source.sourceNote,
    };

    await db.settings.upsert({
      where: { key: `${REGISTRY_PREFIX}${filename}` },
      update: { value: JSON.stringify(record), type: 'json' },
      create: {
        id: randomUUID(),
        key: `${REGISTRY_PREFIX}${filename}`,
        value: JSON.stringify(record),
        type: 'json',
      },
    });

    await db.auditLog
      .create({
        data: {
          ...(options.userId ? { userId: options.userId } : {}),
          action: 'backup_create',
          resource: 'backup',
          details: JSON.stringify({ filename, sizeBytes, tables: tablesCount, rows: rowsCount, checksum }),
        },
      })
      .catch(() => {
        /* audit must never block a completed backup */
      });

    return {
      view: toView(record, true),
      validation,
      durationMs,
    };
  } finally {
    await source.close().catch(() => undefined);
  }
}

export interface RestoreResult {
  applied: boolean;
  filename: string;
  safetyBackup: string | null;
  stagedPath: string | null;
  validation: DumpValidation;
  message: string;
}

/**
 * Restore a registered backup.
 *
 * Safety model:
 *   1. the dump is read from disk and validated structurally;
 *   2. a fresh safety backup of the *current* database is taken first;
 *   3. the dump is copied to db/restore-staging/;
 *   4. in-place replay happens only when BACKUP_RESTORE_IN_PLACE=1, because
 *      it drops and recreates tables. Otherwise the caller is told exactly
 *      where the verified dump is staged.
 */
export async function restoreBackup(
  backupId: string,
  options: { userId?: string; inPlace?: boolean } = {},
): Promise<RestoreResult> {
  if (typeof backupId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(backupId)) {
    throw new Error('Invalid backup id');
  }
  const recordRow = await db.settings.findUnique({ where: { key: `${REGISTRY_PREFIX}${backupId}` } });
  if (!recordRow) throw new Error(`Backup "${backupId}" is not registered`);
  const record = JSON.parse(recordRow.value) as StoredBackupRecord;

  const sourcePath = join(BACKUP_DIR, record.filename);
  const info = await stat(sourcePath).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`Backup file "${record.filename}" is missing from disk`);
  if (info.size > MAX_RESTORE_BYTES) throw new Error('Backup exceeds the 512 MiB restore limit');

  const sql = await readFile(sourcePath, 'utf8');
  const validation = validateDump(sql);
  if (!validation.ok) {
    throw new Error(`Backup failed validation: ${validation.errors.join('; ')}`);
  }

  // 2. Safety backup of the current state before touching anything.
  let safetyBackup: string | null = null;
  try {
    const safety = await createBackup({ userId: options.userId, type: 'pre-restore' });
    safetyBackup = safety.view.filename;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Refusing to restore without a safety backup: ${reason}`);
  }

  // 3. Stage a verified copy.
  await mkdir(RESTORE_STAGING_DIR, { recursive: true });
  const stagedPath = join(RESTORE_STAGING_DIR, `${Date.now()}-${record.filename}`);
  await copyFile(sourcePath, stagedPath);

  // 4. Replay only when explicitly enabled.
  const inPlace = options.inPlace ?? process.env.BACKUP_RESTORE_IN_PLACE === '1';
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  if (!inPlace) {
    return {
      applied: false,
      filename: record.filename,
      safetyBackup,
      stagedPath,
      validation,
      message:
        'Backup validated and staged. In-place replay is disabled; set BACKUP_RESTORE_IN_PLACE=1 and call restore again to apply it.',
    };
  }
  if (!parsed) throw new Error('Configuration required: DATABASE_URL is not a supported database URL');

  const target = createReplayTarget(process.env.DATABASE_URL);
  try {
    if (record.dialect && record.dialect !== target.dialect) {
      throw new Error(
        `Dialect mismatch: backup was taken from ${record.dialect}, target database is ${target.dialect}`,
      );
    }

    // Drop the tables present in the dump so CREATE TABLE can run, then replay.
    const droppedTables = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z0-9_.]+)["`]?/gi)]
      .map((match) => match[1]);
    await target.exec(dropStatements(droppedTables, target.dialect).join('\n'));
    await target.exec(sql);

    await db.auditLog
      .create({
        data: {
          ...(options.userId ? { userId: options.userId } : {}),
          action: 'backup_restore',
          resource: 'backup',
          details: JSON.stringify({
            filename: record.filename,
            safetyBackup,
            stagedPath,
            applied: true,
            tables: validation.tables,
            inserts: validation.inserts,
          }),
        },
      })
      .catch(() => undefined);

    return {
      applied: true,
      filename: record.filename,
      safetyBackup,
      stagedPath,
      validation,
      message: `Backup applied. Safety backup: ${safetyBackup ?? 'none'}.`,
    };
  } finally {
    await target.close().catch(() => undefined);
  }
}

export { validateDump };
export type { DumpValidation };
