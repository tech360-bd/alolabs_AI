import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/jobs/stats — aggregate job statistics
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const [wfTotal, wfRunning, wfCompleted, wfFailed, wfAvg] = await Promise.all([
      db.workflowRun.count(),
      db.workflowRun.count({ where: { status: 'running' } }),
      db.workflowRun.count({ where: { status: 'completed' } }),
      db.workflowRun.count({ where: { status: 'failed' } }),
      db.workflowRun.aggregate({
        where: { status: 'completed', durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
    ]);

    const [agTotal, agRunning, agCompleted, agFailed, agAvg] = await Promise.all([
      db.agentRun.count(),
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}