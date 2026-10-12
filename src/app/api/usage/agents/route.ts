import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// GET /api/usage/agents — agent usage data with summaries
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    let summaries = await db.agentUsageSummary.findMany({
      skip,
      take: limit,
      orderBy: { calculatedAt: 'desc' },
    });

    // If no summaries exist, generate on-the-fly from agentRun.groupBy
    if (summaries.length === 0) {
      const grouped = await db.agentRun.groupBy({
        by: ['agentId'],
        _count: { id: true },
        _avg: { durationMs: true },
        where: { status: 'completed' },
      });

      const failedGrouped = await db.agentRun.groupBy({
        by: ['agentId'],
        _count: { id: true },
        where: { status: 'failed' },
      });

      const failedMap = new Map(failedGrouped.map((g) => [g.agentId, g._count.id]));

      summaries = grouped.map((g) => ({
        id: `generated-${g.agentId}`,
        agentId: g.agentId,
        period: 'all',
        totalRuns: g._count.id,
        successCount: g._count.id,
        failureCount: failedMap.get(g.agentId) || 0,
        avgRuntimeMs: Math.round(g._avg.durationMs || 0),
        totalTokensUsed: 0,
        calculatedAt: new Date(),
      }));
    }

    const total = await db.agentUsageSummary.count();
    const totalSuccess = await db.agentRun.count({ where: { status: 'completed' } });
    const totalFailed = await db.agentRun.count({ where: { status: 'failed' } });
    const totalRunning = await db.agentRun.count({ where: { status: 'running' } });

    return NextResponse.json({
      data: summaries,
      total: total || summaries.length,
      page,
      limit,
      stats: {
        totalRuns: totalSuccess + totalFailed + totalRunning,
        successCount: totalSuccess,
        failureCount: totalFailed,
        runningCount: totalRunning,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}