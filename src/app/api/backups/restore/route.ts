import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { restoreBackup } from '@/lib/backups';

/**
 * POST /api/backups/restore — validate, stage and (optionally) apply a backup.
 *
 * Body: { backupId: string, inPlace?: boolean }
 *
 * A safety backup of the current database is always taken before anything is
 * staged. In-place replay additionally requires BACKUP_RESTORE_IN_PLACE=1.
 * The response reports `applied` so the UI never claims more than happened.
 */

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      backupId?: unknown;
      inPlace?: unknown;
    };
    const backupId = typeof body.backupId === 'string' ? body.backupId : '';
    if (!backupId) {
      return NextResponse.json({ error: 'backupId is required' }, { status: 400 });
    }

    const result = await restoreBackup(backupId, {
      userId: user.userId,
      ...(typeof body.inPlace === 'boolean' ? { inPlace: body.inPlace } : {}),
    });

    return NextResponse.json({
      success: true,
      applied: result.applied,
      message: result.message,
      safetyBackup: result.safetyBackup,
      stagedPath: result.stagedPath,
      validation: result.validation,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && /not registered|missing from disk|failed validation|Invalid backup id/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Backup restore error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backup restore failed' },
      { status: 500 },
    );
  }
}
