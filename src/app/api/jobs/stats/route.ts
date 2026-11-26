import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';

// GET /api/jobs/stats — aggregate job statistics
export async function GET(request: NextRequest) {
  // Session → live Company membership. Authentication alone never authorises.
  const tenant = await legacyTenant(request);
  try {
    const [wfTotal, wfRunning, wfCompleted, wfFailed, wfAvg] = await Promise.all([
      db.workflowRun.count({ where: tenantWhere(tenant) }),
      db.workflowRun.count({ where: tenantWhere(tenant, { status: 'running' }) }),
      db.workflowRun.count({ where: tenantWhere(tenant, { status: 'completed' }) }),
      db.workflowRun.count({ where: tenantWhere(tenant, { status: 'failed' }) }),
      db.workflowRun.aggregate({
      where: tenantWhere(tenant),
        where: { status: 'completed', durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
    ]);

    const [agTotal, agRunning, agCompleted, agFailed, agAvg] = await Promise.all([
      db.agentRun.count({ where: tenantWhere(tenant) }),
      db.agentRun.count({ where: { status: 'running' } }),
      db.agentRun.count({ where: { status: 'completed' } }),
      db.agentRun.count({ where: { status: 'failed' } }),
      db.agentRun.aggregate({
        where: { status: 'completed', durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
    ]);

    const total = wfTotal + agTotal;
    const running = wfRunning + agRunning;
    const completed = wfCompleted + agCompleted;
    const failed = wfFailed + agFailed;

    // Calculate combined average
    const allDurations = [
      ...(wfAvg._avg.durationMs ? [wfAvg._avg.durationMs] : []),
      ...(agAvg._avg.durationMs ? [agAvg._avg.durationMs] : []),
    ];
    const avgDurationMs = allDurations.length > 0
      ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
      : null;

    return NextResponse.json({
      total,
      running,
      completed,
      failed,
      avgDurationMs: avgDurationMs ? Math.round(avgDurationMs) : null,
    });
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}