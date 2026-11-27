import { NextRequest, NextResponse } from 'next/server';
import { alertOnHealth, evaluateEnvironmentHealth } from '@/lib/backup/status';
import { requireMachineToken } from '@/lib/api/machine-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/ops/backups/health — is the backup series still alive?
 *
 * The scheduled monitor calls this instead of scraping the app: a job that stops
 * running leaves no failing run to notice, so something outside the backup path has
 * to ask. It evaluates and **raises the alert itself** (deduplicated per day), so
 * the caller does not need to understand the rules.
 *
 * Same bearer gate as ingest, and the same fail-closed behaviour: without
 * `BACKUP_INGEST_TOKEN` this answers 503 rather than exposing infrastructure state.
 */
export async function GET(request: NextRequest) {
  const auth = requireMachineToken(request, { unconfiguredMessage: 'Backup monitoring is not configured' });
  if (!auth.ok) return auth.response!;

  const environment = request.nextUrl.searchParams.get('environment') ?? 'production';
  const maxAgeHoursRaw = request.nextUrl.searchParams.get('maxAgeHours');
  const maxAgeHours = maxAgeHoursRaw ? Number.parseInt(maxAgeHoursRaw, 10) : undefined;

  const health = await evaluateEnvironmentHealth(environment, {
    ...(maxAgeHours && Number.isFinite(maxAgeHours) ? { maxAgeHours } : {}),
  });
  const alerted = await alertOnHealth(health);

  return NextResponse.json({ ...health, alerted });
}
