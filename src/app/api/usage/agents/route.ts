import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyAuth } from '@/lib/api-auth';

// GET /api/usage/agents — tenant-scoped agent usage summaries.
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;
    const companyScope = { companyId: user.companyId };

    let total = await db.agentUsageSummary.count({ where: companyScope });
    let summaries = await db.agentUsageSummary.findMany({
      where: companyScope,
      skip,
      take: limit,
      orderBy: { calculatedAt: 'desc' },
    });

    // If this tenant has no persisted summaries, compute a tenant-scoped view
    // from its actual agent runs. The synthesized records are not persisted.
    if (total === 0) {
      const grouped = await db.agentRun.groupBy({
        by: ['agentId'],
        _count: { id: true },
        _avg: { durationMs: true },
        where: { ...companyScope, status: 'completed' },
      });

      const failedGrouped = await db.agentRun.groupBy({
        by: ['agentId'],
        _count: { id: true },
        where: { ...companyScope, status: 'failed' },
      });

      const failedMap = new Map(failedGrouped.map((group) => [group.agentId, group._count.id]));
      const generatedSummaries = grouped.map((group) => ({
        id: `generated-${user.companyId}-${group.agentId}`,
        companyId: user.companyId,
        agentId: group.agentId,
        period: 'all',
        totalRuns: group._count.id,
        successCount: group._count.id,
        failureCount: failedMap.get(group.agentId) || 0,
        avgRuntimeMs: Math.round(group._avg.durationMs || 0),
        totalTokensUsed: 0,
        calculatedAt: new Date(),
      }));
      total = generatedSummaries.length;
      summaries = generatedSummaries.slice(skip, skip + limit);
    }

    const totalSuccess = await db.agentRun.count({ where: { ...companyScope, status: 'completed' } });
    const totalFailed = await db.agentRun.count({ where: { ...companyScope, status: 'failed' } });
    const totalRunning = await db.agentRun.count({ where: { ...companyScope, status: 'running' } });

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
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[Agent Usage] Failed to load usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
