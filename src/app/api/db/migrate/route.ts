/**
 * Database Migrate API
 * POST /api/db/migrate — Trigger database migration.
 * Supports migrating between database types with automatic backup.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { DatabaseManager } from '@/lib/db-adapters/manager';
import type { DatabaseConfig, MigrationStep } from '@/lib/db-adapters/types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// ─── Migrations registry ────────────────────────────────────────────

/**
 * Migration registry — loads schema migration steps.
 * Extend this registry to add additional migration versions.
 */
function getMigrations(targetType: string): MigrationStep[] {
  // Load migration steps — extend with additional versions as needed
  return [
    {
      version: '20240101000000',
      name: 'initial_schema',
      up: `
        CREATE TABLE IF NOT EXISTS _schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
      down: 'DROP TABLE IF EXISTS _schema_migrations;',
    },
  ];
}

// ─── Backup before migration ────────────────────────────────────────

async function createPreMigrationBackup(adapterName: string): Promise<string> {
  const manager = new DatabaseManager();
  await manager.autoConfigure();

  try {
    const backupBuffer = await manager.backup(adapterName);

    // Ensure backups directory exists
    const backupDir = join(process.cwd(), 'db', 'backups');
    await mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pre-migration-${timestamp}.sql`;
    const filepath = join(backupDir, filename);

    await writeFile(filepath, backupBuffer, 'utf-8');

    // Record backup in database
    await db.settings.create({
      data: {
        key: `db:backup:${filename}`,
        value: JSON.stringify({
          filename,
          adapterName,
          sizeBytes: backupBuffer.length,
          createdAt: new Date().toISOString(),
          type: 'pre-migration',
        }),
      },
    });

    return filename;
  } catch (err) {
    console.error('Pre-migration backup failed:', err);
    throw new Error(
      `Pre-migration backup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── POST: Trigger Migration ────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    // Only live super_admins can trigger schema migrations across the platform
    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin access required' },
        { status: 403 },
      );
    }
    const liveUser = await db.user.findUnique({
      where: { id: user.userId },
      select: { role: true, isActive: true },
    });
    if (!liveUser?.isActive || liveUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin access required' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      targetType,
      adapterName = 'primary',
      createBackup = true,
      migrations: customMigrations,
    } = body as {
      targetType?: string;
      adapterName?: string;
      createBackup?: boolean;
      migrations?: MigrationStep[];
    };

    if (customMigrations !== undefined) {
      return NextResponse.json(
        { error: 'Custom SQL migrations via HTTP API are disabled for security' },
        { status: 403 },
      );
    }

    if (typeof adapterName !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(adapterName)) {
      return NextResponse.json({ error: 'Invalid adapterName' }, { status: 400 });
    }

    const migrations = getMigrations(targetType ?? 'primary');

    // Pre-migration backup is mandatory unless explicitly skipped in non-production
    let backupFilename: string | null = null;
    const mustBackup = process.env.NODE_ENV === 'production' || createBackup !== false;
    if (mustBackup) {
      try {
        backupFilename = await createPreMigrationBackup(adapterName);
      } catch {
        return NextResponse.json(
          { error: 'Migration aborted: pre-migration backup failed' },
          { status: 500 },
        );
      }
    }

    // Run migration via DatabaseManager
    const manager = new DatabaseManager();
    await manager.autoConfigure();

    try {
      await manager.migrate(adapterName, migrations);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await db.auditLog.create({
        data: {
          userId: user.userId,
          action: 'db_migration_failed',
          resource: 'database',
          details: JSON.stringify({
            adapterName,
            targetType,
            error: errorMsg,
            backupFilename,
          }),
        },
      });

      return NextResponse.json(
        {
          error: 'Migration failed',
          details: errorMsg,
          backupFilename,
        },
        { status: 500 },
      );
    }

    // Record success
    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'db_migration',
        resource: 'database',
        details: JSON.stringify({
          adapterName,
          targetType,
          migrationCount: migrations.length,
          backupFilename,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `${migrations.length} migration(s) applied successfully`,
      adapterName,
      targetType,
      backupFilename,
      appliedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('DB migrate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}