/**
 * Database Restore API
 * POST /api/db/restore — Restore from a backup
 * Validates backup integrity before restoring.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { DatabaseManager } from '@/lib/db-adapters/manager';
import { readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

// ─── Types ──────────────────────────────────────────────────────────

interface RestoreRequest {
  filename: string;
  adapterName?: string;
  storage?: 'local' | 's3';
  verifyOnly?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

const BACKUP_DIR = join(process.cwd(), 'db', 'backups');

/**
 * Validate backup integrity:
 * - File must exist and be non-empty
 * - File must contain recognizable SQL patterns
 */
async function validateBackup(
  filename: string,
  storage: string,
): Promise<{ valid: boolean; sizeBytes: number; error?: string; preview?: string }> {
  let content: string;

  if (storage === 's3') {
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
      const stream = await minioClient.getObject(bucket, filename);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      content = Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      return {
        valid: false,
        sizeBytes: 0,
        error: `S3 read failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    // Sanitize filename - reject absolute paths and path traversal
    const sanitizedName = filename.replace(/[\/\\\.]/g, '').replace(/\.\./g, '')
    if (!sanitizedName || sanitizedName !== filename.replace(/[\/\\]/g, '')) {
      return {
        valid: false,
        sizeBytes: 0,
        error: 'Invalid filename',
      }
    }
    const filepath = join(BACKUP_DIR, sanitizedName)

    // Additional check: ensure resolved path is within BACKUP_DIR
    const resolvedPath = resolve(filepath)
    const resolvedBackup = resolve(BACKUP_DIR)
    if (!resolvedPath.startsWith(resolvedBackup + '/')) {
      return {
        valid: false,
        sizeBytes: 0,
        error: 'Invalid filename',
      }
    }

    try {
      const fileStat = await stat(filepath);
      if (fileStat.size === 0) {
        return {
          valid: false,
          sizeBytes: 0,
          error: 'Backup file is empty',
        };
      }

      content = await readFile(filepath, 'utf-8');
    } catch (err) {
      return {
        valid: false,
        sizeBytes: 0,
        error: `File read failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const sizeBytes = Buffer.byteLength(content, 'utf-8');

  // Basic SQL validation
  const hasSQLMarkers =
    content.includes('--') ||
    content.includes('CREATE') ||
    content.includes('INSERT') ||
    content.includes('SELECT') ||
    content.includes('BEGIN') ||
    content.includes('COMMIT');

  if (!hasSQLMarkers) {
    return {
      valid: false,
      sizeBytes,
      error: 'File does not appear to contain valid SQL',
    };
  }

  // Check for suspicious patterns (path traversal, shell injection)
  const dangerousPatterns = [/;\s*DROP\s+DATABASE/i, /;\s*SHUTDOWN/i, /;\s*rm\s+-rf/i];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return {
        valid: false,
        sizeBytes,
        error: 'Backup contains potentially destructive statements and was rejected',
      };
    }
  }

  const preview = content.slice(0, 500);

  return { valid: true, sizeBytes, preview };
}

/**
 * Execute the restore by replaying SQL statements.
 * This is a simplified implementation — production would use pg_restore or similar.
 */
async function executeRestore(
  filename: string,
  storage: string,
  adapterName: string,
): Promise<{ statementsExecuted: number; durationMs: number }> {
  const manager = new DatabaseManager();
  await manager.autoConfigure();
  const adapter = manager.getAdapter(adapterName);

  let content: string;

  if (storage === 's3') {
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
      const stream = await minioClient.getObject(bucket, filename);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      content = Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      throw new Error(`S3 read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    // Sanitize filename - reject absolute paths and path traversal
    const sanitizedName = filename.replace(/[\/\\\.]/g, '').replace(/\.\./g, '')
    if (!sanitizedName || sanitizedName !== filename.replace(/[\/\\]/g, '')) {
      throw new Error('Invalid filename')
    }
    const filepath = join(BACKUP_DIR, sanitizedName)

    // Additional check: ensure resolved path is within BACKUP_DIR
    const resolvedPath = resolve(filepath)
    const resolvedBackup = resolve(BACKUP_DIR)
    if (!resolvedPath.startsWith(resolvedBackup + '/')) {
      throw new Error('Invalid filename')
    }

    content = await readFile(filepath, 'utf-8');
  }

  // Split into statements (simple split on semicolons, skip comments)
  const statements = content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const startTime = Date.now();
  let executed = 0;

  for (const stmt of statements) {
    try {
      await adapter.query(stmt);
      executed++;
    } catch (err) {
      // Log but continue — some statements may fail on re-run
      console.warn(`Restore statement failed (skipping): ${stmt.slice(0, 80)}...`);
    }
  }

  return {
    statementsExecuted: executed,
    durationMs: Date.now() - startTime,
  };
}

// ─── POST: Restore ──────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin access required' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as RestoreRequest;
    const {
      filename,
      adapterName = 'primary',
      storage = 'local',
      verifyOnly = false,
    } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'filename is required' },
        { status: 400 },
      );
    }

    // Validate backup integrity first
    const validation = await validateBackup(filename, storage);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Backup validation failed',
          details: validation.error,
        },
        { status: 400 },
      );
    }

    // If verify-only, return validation results
    if (verifyOnly) {
      return NextResponse.json({
        success: true,
        verified: true,
        filename,
        storage,
        sizeBytes: validation.sizeBytes,
        preview: validation.preview,
      });
    }

    // Execute restore
    const startTime = Date.now();
    const result = await executeRestore(filename, storage, adapterName);
    const totalDuration = Date.now() - startTime;

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'db_restore',
        resource: 'backup',
        details: JSON.stringify({
          filename,
          adapterName,
          storage,
          statementsExecuted: result.statementsExecuted,
          durationMs: totalDuration,
          backupSizeBytes: validation.sizeBytes,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully',
      filename,
      adapterName,
      storage,
      statementsExecuted: result.statementsExecuted,
      durationMs: totalDuration,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('DB restore error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}