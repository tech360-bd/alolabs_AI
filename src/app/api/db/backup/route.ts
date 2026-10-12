/**
 * Database Backup API
 * POST /api/db/backup — Create a database backup
 * GET  /api/db/backup — List available backups
 * Supports local file and S3 storage.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { DatabaseManager } from '@/lib/db-adapters/manager';
import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';

// ─── Types ──────────────────────────────────────────────────────────

interface BackupRecord {
  filename: string;
  adapterName: string;
  sizeBytes: number;
  createdAt: string;
  type: string;
  storage: 'local' | 's3';
}

// ─── Helpers ────────────────────────────────────────────────────────

const BACKUP_DIR = join(process.cwd(), 'db', 'backups');

async function ensureBackupDir(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true });
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function saveBackupLocally(
  backupBuffer: Buffer,
  adapterName: string,
): Promise<BackupRecord> {
  await ensureBackupDir();

  const timestamp = getTimestamp();
  const filename = `backup-${adapterName}-${timestamp}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  await writeFile(filepath, backupBuffer, 'utf-8');

  const record: BackupRecord = {
    filename,
    adapterName,
    sizeBytes: backupBuffer.length,
    createdAt: new Date().toISOString(),
    type: 'manual',
    storage: 'local',
  };

  await db.settings.create({
    data: {
      key: `db:backup:${filename}`,
      value: JSON.stringify(record),
    },
  });

  return record;
}

async function saveBackupToS3(
  backupBuffer: Buffer,
  adapterName: string,
): Promise<BackupRecord> {
  const timestamp = getTimestamp();
  const filename = `backups/${adapterName}/${timestamp}.sql`;

  try {
    // @ts-expect-error -- minio is an optional dependency for S3 backups
    const { MinioClient } = await import('minio');
    const minioClient = new MinioClient({
      endPoint: process.env.S3_ENDPOINT || 'localhost',
      port: parseInt(process.env.S3_PORT || '9000', 10),
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      useSSL: process.env.S3_USE_SSL === 'true',
    });

    const bucket = process.env.S3_BACKUP_BUCKET || 'aios-backups';

    // Ensure bucket exists
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket, 'us-east-1');
    }

    await minioClient.putObject(bucket, filename, backupBuffer);

    const record: BackupRecord = {
      filename,
      adapterName,
      sizeBytes: backupBuffer.length,
      createdAt: new Date().toISOString(),
      type: 'manual',
      storage: 's3',
    };

    await db.settings.create({
      data: {
        key: `db:backup:${filename}`,
        value: JSON.stringify(record),
      },
    });

    return record;
  } catch (err) {
    throw new Error(
      `S3 backup failed: ${err instanceof Error ? err.message : String(err)}. Ensure MinIO/S3 is configured.`,
    );
  }
}

async function listLocalBackups(): Promise<BackupRecord[]> {
  try {
    await ensureBackupDir();
    const files = await readdir(BACKUP_DIR);
    const backups: BackupRecord[] = [];

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      const filepath = join(BACKUP_DIR, file);
      const fileStat = await stat(filepath);

      backups.push({
        filename: file,
        adapterName: 'local',
        sizeBytes: fileStat.size,
        createdAt: fileStat.mtime.toISOString(),
        type: 'file',
        storage: 'local',
      });
    }

    return backups.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch {
    return [];
  }
}

async function listDatabaseBackups(): Promise<BackupRecord[]> {
  const records = await db.settings.findMany({
    where: { key: { startsWith: 'db:backup:' } },
    orderBy: { createdAt: 'desc' },
  });

  return records
    .map((r) => {
      try {
        return JSON.parse(r.value) as BackupRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is BackupRecord => r !== null);
}

// ─── GET: List Backups ──────────────────────────────────────────────

export async function GET() {
  try {
    await requireAuth();

    const [dbBackups, localBackups] = await Promise.all([
      listDatabaseBackups(),
      listLocalBackups(),
    ]);

    // Merge and deduplicate by filename
    const seen = new Set<string>();
    const allBackups: BackupRecord[] = [];

    for (const backup of [...dbBackups, ...localBackups]) {
      const key = `${backup.storage}:${backup.filename}`;
      if (!seen.has(key)) {
        seen.add(key);
        allBackups.push(backup);
      }
    }

    return NextResponse.json({
      backups: allBackups,
      total: allBackups.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Backup list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── POST: Create Backup ────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: admin access required' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      adapterName = 'primary',
      storage = 'local',
    } = body as { adapterName?: string; storage?: 'local' | 's3' };

    const manager = new DatabaseManager();
    await manager.autoConfigure();

    const startTime = Date.now();
    const backupBuffer = await manager.backup(adapterName);
    const duration = Date.now() - startTime;

    let record: BackupRecord;

    if (storage === 's3') {
      record = await saveBackupToS3(backupBuffer, adapterName);
    } else {
      record = await saveBackupLocally(backupBuffer, adapterName);
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'db_backup_create',
        resource: 'backup',
        details: JSON.stringify({
          ...record,
          durationMs: duration,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      backup: record,
      durationMs: duration,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Backup create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}