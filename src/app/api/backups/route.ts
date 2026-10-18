import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getBackupConfig, listBackups, saveBackupConfig, type BackupConfig } from '@/lib/backups';

/**
 * /api/backups — backup registry + configuration.
 *
 * GET  → { data: BackupView[], config: BackupConfig }
 * POST → { action: 'update_config', config } updates the schedule settings.
 *
 * This is the endpoint the Backup panel reads. The actual dump creation lives
 * in /api/backups/create and /api/db/backup (both use src/lib/backups).
 */

function errorResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (error instanceof Error && error.message === 'Forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (error instanceof Error && error.message.startsWith('Configuration required')) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  console.error('Backups API error:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Internal server error' },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await requireAuth();
    const [data, config] = await Promise.all([listBackups(), getBackupConfig()]);
    return NextResponse.json({ data, config, total: data.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      config?: Partial<BackupConfig>;
    };
    if (body.action !== 'update_config' || !body.config) {
      return NextResponse.json(
        { error: 'Unsupported action. Expected { action: "update_config", config }.' },
        { status: 400 },
      );
    }

    const config: BackupConfig = {
      autoBackup: Boolean(body.config.autoBackup),
      schedule: typeof body.config.schedule === 'string' ? body.config.schedule.slice(0, 40) : 'daily',
      retentionDays:
        typeof body.config.retentionDays === 'number' && Number.isFinite(body.config.retentionDays)
          ? Math.min(3650, Math.max(1, Math.round(body.config.retentionDays)))
          : 30,
      compression: Boolean(body.config.compression),
    };

    const saved = await saveBackupConfig(config);
    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    return errorResponse(error);
  }
}
