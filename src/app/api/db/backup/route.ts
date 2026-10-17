/**
 * Database Backup API
 * POST /api/db/backup — Create a restorable database backup
 * GET  /api/db/backup — List available backups
 *
 * Creation is delegated to src/lib/backups (schema + INSERT statements,
 * validated before it is registered). The old implementation this file used
 * emitted only per-table row counts, which could never be restored.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createBackup, listBackups } from '@/lib/backups';

export async function GET() {
  try {
    await requireAuth();
    const backups = await listBackups();
    return NextResponse.json({
      backups: backups.map((backup) => ({
        filename: backup.filename,
        adapterName: 'primary',
        sizeBytes: Math.round(backup.size * 1024 * 1024),
        createdAt: backup.createdAt,
        type: backup.type,
        storage: 'local',
        status: backup.status,
        tables: backup.tables,
        rows: backup.rows,
        checksum: backup.checksum,
      })),
      total: backups.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Backup list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireAuth();
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const result = await createBackup({ userId: user.userId, type: 'manual' });
    return NextResponse.json({
      success: true,
      backup: {
        filename: result.view.filename,
        adapterName: 'primary',
        sizeBytes: Math.round(result.view.size * 1024 * 1024),
        createdAt: result.view.createdAt,
        type: result.view.type,
        storage: 'local',
        status: 'completed',
        tables: result.view.tables,
        rows: result.view.rows,
        checksum: result.view.checksum,
      },
      validation: result.validation,
      durationMs: result.durationMs,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Backup create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
