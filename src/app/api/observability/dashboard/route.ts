import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/observability/dashboard — comprehensive observability dashboard
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Run all queries in parallel for performance
    const [
      // System metrics: request counts
      recentUsageLogs,
      usageLogs24h,
      errorLogsCount,
      // Active alerts
      alerts,
      // Queue health
      queues,
      queueItemStats,
      // Token budget status
      tokenBudgets,
      recentTokenUsage,
      tokenUsage24h,
      // Recent metrics
      recentMetrics,
      // Agent run stats
      agentRuns,
      workflowRuns,
      skillRuns,
      // Additional summary queries
      activeAgentCount,
      activeQueueDepth,
      firingAlertCount,
      allRuns24h,
    ] = await Promise.all([
      // Request counts (last hour)
      db.usageLog.findMany({
        where: { createdAt: { gte: oneHourAgo } },
        take: 5000,
        select: { status: true, createdAt: true, companyId: true },
      }),

      // Request counts (24h)
      db.usageLog.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),

      // Error rate (last hour)
      db.errorLog.count({
        where: { createdAt: { gte: oneHourAgo } },
      }),

      // Active alerts
      db.alert.findMany({
        orderBy: { updatedAt: 'desc' },
      }),

      // Queue health
      db.jobQueue.findMany(),

      db.queueItem.groupBy({
        by: ['queueId', 'status'],
        _count: true,
      }),

      // Token budgets for all companies
      db.tokenBudget.findMany({
        include: { company: { select: { name: true, slug: true } } },
      }),

      // Recent token usage (last 100)
      db.tokenUsage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),

      // Token usage (24h)
      db.tokenUsage.aggregate({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        _sum: { totalTokens: true },
      }),

      // Recent metrics (last hour)
      db.metric.findMany({
        where: { createdAt: { gte: oneHourAgo } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),

      // Agent run stats (24h)
      db.agentRun.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        select: { status: true, durationMs: true, createdAt: true },
      }),

      // Workflow run stats (24h)
      db.workflowRun.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        select: { status: true, durationMs: true, createdAt: true },
      }),

      // Skill run stats (24h)
      db.skillRun.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        select: { status: true, durationMs: true, createdAt: true },
      }),

      // Active agents count
      db.agent.count({ where: { status: 'active' } }),

      // Active queue depth (queued + processing)
      db.queueItem.count({ where: { status: { in: ['queued', 'processing'] } } }),

      // Firing alert count
      db.alert.count({ where: { isFiring: true } }),

      // All runs in 24h for avg response time
      db.agentRun.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo }, durationMs: { not: null } },
        select: { durationMs: true },
        take: 5000,
      }),
    ]);

    // === SYSTEM METRICS ===
    const totalRequestsLastHour = recentUsageLogs.length;
    const failedRequestsLastHour = recentUsageLogs.filter(
      (l) => l.status === 'failed' || l.status === 'blocked'
    ).length;
    const errorRateLastHour = totalRequestsLastHour > 0
      ? Math.round((failedRequestsLastHour / totalRequestsLastHour) * 10000) / 100
      : 0;

    // Process memory usage proxy
    const memUsage = process.memoryUsage();
    const memoryMetrics = {
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
    };

    // Agent/Workflow/Skill run stats
    const computeRuns = (runs: Array<{ status: string; durationMs: number | null; createdAt: Date }>) => {
      const total = runs.length;
      const completed = runs.filter((r) => r.status === 'completed').length;
      const failed = runs.filter((r) => r.status === 'failed').length;
      const running = runs.filter((r) => r.status === 'running').length;
      const durations = runs
        .filter((r) => r.durationMs !== null)
        .map((r) => r.durationMs!);
      const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

      return { total, completed, failed, running, avgDurationMs: avgDuration };
    };

    const agentRunStats = computeRuns(agentRuns);
    const workflowRunStats = computeRuns(workflowRuns);
    const skillRunStats = computeRuns(skillRuns);

    // === ACTIVE ALERTS ===
    const activeAlerts = alerts
      .map((a) => {
        const isSilenced = a.silencedUntil ? now < new Date(a.silencedUntil) : false;
        return {
          id: a.id,
          name: a.name,
          severity: a.severity,
          isFiring: a.isFiring,
          isSilenced,
          lastFiredAt: a.lastFiredAt?.toISOString() ?? null,
        };
      })
      .filter((a) => a.isFiring && !a.isSilenced);

    const alertSummary = {
      total: alerts.length,
      firing: alerts.filter((a) => a.isFiring).length,
      silenced: alerts.filter((a) => a.silencedUntil && now < new Date(a.silencedUntil)).length,
      bySeverity: {
        critical: alerts.filter((a) => a.severity === 'critical' && a.isFiring && (!a.silencedUntil || now >= new Date(a.silencedUntil))).length,
        warning: alerts.filter((a) => a.severity === 'warning' && a.isFiring && (!a.silencedUntil || now >= new Date(a.silencedUntil))).length,
        info: alerts.filter((a) => a.severity === 'info' && a.isFiring && (!a.silencedUntil || now >= new Date(a.silencedUntil))).length,
      },
    };

    // === QUEUE HEALTH ===
    const queueItemMap = new Map<string, Record<string, number>>();
    for (const item of queueItemStats) {
      if (!queueItemMap.has(item.queueId)) queueItemMap.set(item.queueId, {});
      queueItemMap.get(item.queueId)![item.status] = item._count;
    }

    const queueHealth = queues.map((q) => {
      const counts = queueItemMap.get(q.id) || {};
      const queued = counts['queued'] || 0;
      const processing = counts['processing'] || 0;
      const completed = counts['completed'] || 0;
      const failed = counts['failed'] || 0;
      const total = Object.values(counts).reduce((a: number, b: number) => a + b, 0);

      return {
        id: q.id,
        name: q.name,
        isActive: q.isActive,
        concurrency: q.concurrency,
        maxRetries: q.maxRetries,
        stats: { queued, processing, completed, failed, total },
        utilization: q.concurrency > 0 ? Math.round((processing / q.concurrency) * 100) : 0,
      };
    });

    // === TOKEN BUDGET STATUS ===
    const tokenBudgetStatus = tokenBudgets.map((b) => {
      const monthlyPercent = b.monthlyBudget > 0
        ? Math.round((b.monthlyUsed / b.monthlyBudget) * 10000) / 100
        : 0;
      const dailyPercent = b.dailyBudget > 0
        ? Math.round((b.dailyUsed / b.dailyBudget) * 10000) / 100
        : 0;

      return {
        companyId: b.companyId,
        companyName: b.company?.name || 'Unknown',
        companySlug: b.company?.slug || '',
        monthly: {
          budget: b.monthlyBudget,
          used: b.monthlyUsed,
          remaining: Math.max(0, b.monthlyBudget - b.monthlyUsed),
          percent: monthlyPercent,
          isWarning: monthlyPercent >= b.warningThreshold * 100,
          isBlocked: monthlyPercent >= b.blockThreshold * 100,
        },
        daily: {
          budget: b.dailyBudget,
          used: b.dailyUsed,
          remaining: Math.max(0, b.dailyBudget - b.dailyUsed),
          percent: dailyPercent,
          isWarning: dailyPercent >= b.warningThreshold * 100,
          isBlocked: dailyPercent >= b.blockThreshold * 100,
        },
        lastResetAt: b.lastResetAt.toISOString(),
      };
    });

    // Recent token usage summary
    const totalTokensLast100 = recentTokenUsage.reduce((sum, u) => sum + u.totalTokens, 0);
    const totalCostLast100 = recentTokenUsage.reduce((sum, u) => sum + u.costEstimate, 0);

    // === RECENT METRICS TRENDS ===
    // Group metrics by name for trend summary
    const metricTrends = new Map<string, { latest: number; min: number; max: number; count: number; avg: number }>();
    for (const m of recentMetrics) {
      const existing = metricTrends.get(m.name);
      if (existing) {
        existing.latest = m.value;
        existing.min = Math.min(existing.min, m.value);
        existing.max = Math.max(existing.max, m.value);
        existing.count += 1;
        existing.avg = (existing.avg * (existing.count - 1) + m.value) / existing.count;
      } else {
        metricTrends.set(m.name, {
          latest: m.value,
          min: m.value,
          max: m.value,
          count: 1,
          avg: m.value,
        });
      }
    }

    const metricsSummary = Array.from(metricTrends.entries()).map(([name, stats]) => ({
      name,
      latest: Math.round(stats.latest * 10000) / 10000,
      min: Math.round(stats.min * 10000) / 10000,
      max: Math.round(stats.max * 10000) / 10000,
      avg: Math.round(stats.avg * 10000) / 10000,
      dataPoints: stats.count,
    }));

    // === TOP-LEVEL SUMMARY ===
    const totalRequests24h = typeof usageLogs24h === 'number' ? usageLogs24h : 0;
    const errorRate24h = totalRequestsLastHour > 0
      ? Math.round((failedRequestsLastHour / totalRequestsLastHour) * 10000) / 100
      : 0;
    const allDurations = allRuns24h.map((r) => r.durationMs!);
    const avgResponseTime = allDurations.length > 0
      ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
      : 0;
    const tokenUsage24hTotal = tokenUsage24h._sum.totalTokens || 0;

    // Determine overall system health
    const systemHealth = errorRateLastHour > 10 || firingAlertCount > 5
      ? 'degraded'
      : 'healthy';

    // Top endpoints (group usage logs by agent name)
    const endpointMap = new Map<string, number>();
    for (const log of recentUsageLogs) {
      const key = (log as Record<string, unknown>).agentName as string || 'unknown';
      endpointMap.set(key, (endpointMap.get(key) || 0) + 1);
    }
    const topEndpoints = Array.from(endpointMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const summary = {
      systemHealth,
      activeAgents: activeAgentCount,
      totalRequests24h,
      avgResponseTime,
      tokenUsage24h: tokenUsage24hTotal,
      queueDepth: activeQueueDepth,
      activeAlerts: firingAlertCount,
      topEndpoints,
      errorRate24h,
    };

    // === ASSEMBLE DASHBOARD ===
    const dashboard = {
      timestamp: now.toISOString(),
      summary,
      system: {
        memory: memoryMetrics,
        requestsLastHour: totalRequestsLastHour,
        errorRateLastHour: `${errorRateLastHour}%`,
        errorLogsLastHour: errorLogsCount,
        uptime: process.uptime(),
      },
      runs: {
        agent: agentRunStats,
        workflow: workflowRunStats,
        skill: skillRunStats,
        total: agentRunStats.total + workflowRunStats.total + skillRunStats.total,
      },
      alerts: {
        active: activeAlerts,
        summary: alertSummary,
      },
      queues: queueHealth,
      tokenBudgets: tokenBudgetStatus,
      tokenUsage: {
        last100Records: {
          totalTokens: totalTokensLast100,
          totalCost: Math.round(totalCostLast100 * 10000) / 10000,
          recordCount: recentTokenUsage.length,
        },
      },
      metrics: {
        summary: metricsSummary,
        dataPointsLastHour: recentMetrics.length,
      },
    };

    return NextResponse.json({ data: dashboard });
  } catch (error) {
    console.error('GET /api/observability/dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}