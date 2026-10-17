import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createBackup } from '@/lib/backups';

/**
 * POST /api/backups/create — create a real, restorable logical dump.
 *
 * The response includes the validation summary (tables / INSERT statements) so
 * the UI can prove the file is restorable rather than trusting a status flag.
 */

export async function POST() {
  try {
    const user = await requireAuth();
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const result = await createBackup({ userId: user.userId, type: 'manual' });
    return NextResponse.json(
      {
        success: true,
        backup: result.view,
        validation: result.validation,
        durationMs: result.durationMs,
      },
      { status: 201 },
    );
  } catch (error) {
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
      { error: error instanceof Error ? error.message : 'Backup creation failed' },
      { status: 500 },
    );
  }
}
