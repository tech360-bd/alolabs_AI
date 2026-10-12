import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRouter } from '@/lib/ai-router';
import { getQueueStats } from '@/lib/job-queue';
import { RUN_QUEUE } from '@/lib/runs';

/**
 * GET /api/v1/health — public health check (no auth): liveness + subsystem status.
 */

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  try {
    await db.$queryRawUnsafe('SELECT 1');
    checks.database = { status: 'ok' };
  } catch {
    // This endpoint is public. Never echo connection strings or driver errors.
    checks.database = { status: 'error', detail: 'Database unavailable' };
  }

  try {
    const router = getRouter();
    const health = await router.getHealthStatus();
    const providers = Array.from(health.entries()).map(([name, h]) => ({
      provider: name,
      healthy: h.isHealthy,
      circuitOpen: h.circuitOpen,
    }));
    const anyHealthy = providers.some((p) => p.healthy);
    checks.modelRouter = {
      status: anyHealthy ? 'ok' : 'degraded',
      detail: anyHealthy
        ? `${providers.filter((p) => p.healthy).length}/${providers.length} providers healthy`
        : 'Configuration required: no AI provider is configured or reachable',
    };
  } catch {
    checks.modelRouter = { status: 'degraded', detail: 'AI provider status unavailable' };
  }

  try {
    const stats = await getQueueStats(RUN_QUEUE);
    checks.queue = { status: 'ok', detail: `${stats.pending} pending, ${stats.processing} processing` };
  } catch {
    checks.queue = { status: 'error', detail: 'Queue unavailable' };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return NextResponse.json(
    {
      success: true,
      data: {
        status: allOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '1.0.0',
        checks,
      },
    },
    { status: allOk ? 200 : 503 },
  );
}
