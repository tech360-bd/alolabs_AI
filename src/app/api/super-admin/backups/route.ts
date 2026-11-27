import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { db } from '@/lib/db';
import { evaluateBackupHealth, DEFAULT_MAX_AGE_HOURS } from '@/lib/backup/status';
import { listPlatformNotifications } from '@/lib/notifications/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/super-admin/backups — backup status for the operator dashboard.
 *
 * Answers the questions that matter when a backup has quietly stopped:
 * when was the last attempt, when was the last *verified* success, how old is it,
 * how big, does the checksum match what was published, and has a restore ever been
 * proven. `verdict` is derived, not stored, so it cannot drift from the rows.
 *
 * `super_admin` only. Backup metadata is infrastructure, not tenant data, so there
 * is no company filter here — and nothing returned can contain a credential.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const environment = request.nextUrl.searchParams.get('environment') ?? 'production';
  const maxAgeHoursRaw = request.nextUrl.searchParams.get('maxAgeHours');
  const maxAgeHours = maxAgeHoursRaw ? Number.parseInt(maxAgeHoursRaw, 10) : DEFAULT_MAX_AGE_HOURS;

  const [runs, notifications] = await Promise.all([
    db.backupRun.findMany({
      where: { environment },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        environment: true,
        status: true,
        stage: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        databaseProvider: true,
        artifactPath: true,
        artifactBytes: true,
        checksum: true,
        restoreTested: true,
        restoreVerifiedAt: true,
        commit: true,
        failureExcerpt: true,
        source: true,
        createdAt: true,
      },
    }),
    listPlatformNotifications(10),
  ]);

  const health = evaluateBackupHealth(
    runs.map((run) => ({
      environment: run.environment,
      status: run.status,
      stage: run.stage,
      finishedAt: run.finishedAt,
      restoreTested: run.restoreTested,
      restoreVerifiedAt: run.restoreVerifiedAt,
      artifactBytes: run.artifactBytes,
      checksum: run.checksum,
    })),
    { environment, maxAgeHours: Number.isFinite(maxAgeHours) ? maxAgeHours : DEFAULT_MAX_AGE_HOURS },
  );

  return NextResponse.json({
    health,
    // BigInt does not survive JSON.stringify; sizes are reported as numbers.
    runs: runs.map((run) => ({
      ...run,
      artifactBytes: run.artifactBytes == null ? null : Number(run.artifactBytes),
    })),
    alerts: notifications,
    // The most recent attempt per stage, so an operator can see where it stops.
    lastFailure: runs.find((run) => run.status === 'failed')
      ? {
          stage: runs.find((run) => run.status === 'failed')?.stage ?? 'unknown',
          excerpt: runs.find((run) => run.status === 'failed')?.failureExcerpt ?? null,
          at: runs.find((run) => run.status === 'failed')?.finishedAt ?? null,
        }
      : null,
  });
}
