/**
 * GET /api/health/deep
 * Authenticated deep diagnostics — requires valid Bearer token.
 * Returns detailed per-subsystem health with extra diagnostic information.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { db } from '@/lib/db';
import { isQdrantConnected, getQdrantConfig, pingQdrant, getQdrantStats, listCollections } from '@/lib/qdrant';
import { getAgentStateManager } from '@/lib/agent-runtime/state';
import { getAgentScheduler } from '@/lib/agent-runtime/scheduler';
import { getMemoryStore } from '@/lib/memory';

const VERSION = '1.0.0';

type CheckStatus = 'healthy' | 'degraded' | 'unhealthy';

interface SubsystemCheck {
  status: CheckStatus;
  latencyMs?: number;
  detail: string;
}

// ─── Check helpers (enhanced for deep) ────────────────────────────

async function checkDatabase(): Promise<SubsystemCheck & { latencyMs: number; sizeBytes?: number }> {
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1 as ok`;
    const latencyMs = Date.now() - t0;

    // DB file size
    let sizeBytes: number | undefined;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const dbPath = path.join(process.cwd(), 'db', 'custom.db');
      const stat = fs.statSync(dbPath);
      sizeBytes = stat.size;
    } catch {
      // File size not available
    }

    return { status: 'healthy', latencyMs, sizeBytes, detail: 'SQLite connected' };
  } catch (err: unknown) {
    return {
      status: 'unhealthy',
      latencyMs: 0,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkMemory(): Promise<SubsystemCheck & { stats?: Awaited<ReturnType<InstanceType<typeof import('@/lib/memory').PersistentMemoryStore>['getStats']>> }> {
  try {
    const store = getMemoryStore();
    const stats = await store.getStats();
    return {
      status: 'healthy',
      detail: `${stats.total} entries`,
      stats,
    };
  } catch (err: unknown) {
    return {
      status: 'degraded',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkAIRouter(): Promise<SubsystemCheck & { providers?: { name: string; healthy: boolean; circuitOpen: boolean; latencyMs: number }[] }> {
  try {
    const { getRouter } = await import('@/lib/ai-router');
    const router = getRouter();
    const providers = router.getRegisteredProviders();
    if (providers.length === 0) {
      return { status: 'degraded', detail: '0 providers registered' };
    }

    // Get detailed health from router
    const healthMap = await router.getHealthStatus();
    const providerDetails = Array.from(healthMap.entries()).map(([name, health]) => ({
      name,
      healthy: health.isHealthy,
      circuitOpen: health.circuitOpen,
      latencyMs: health.latencyMs,
    }));

    const healthyCount = providerDetails.filter(p => p.healthy && !p.circuitOpen).length;
    const status: CheckStatus = healthyCount === 0 ? 'unhealthy' : healthyCount < providers.length ? 'degraded' : 'healthy';

    return {
      status,
      detail: `${healthyCount}/${providers.length} providers healthy`,
      providers: providerDetails,
    };
  } catch (err: unknown) {
    return {
      status: 'unhealthy',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRAG(): Promise<SubsystemCheck & { collections?: { name: string; points: number }[]; fallbackMode: boolean }> {
  try {
    const qConfig = getQdrantConfig();
    if (!qConfig) {
      return {
        status: 'degraded',
        fallbackMode: true,
        detail: 'Qdrant not configured — SQLite fallback mode',
      };
    }

    if (!isQdrantConnected()) {
      return {
        status: 'degraded',
        fallbackMode: true,
        detail: 'Qdrant configured but not connected — SQLite fallback mode',
      };
    }

    const t0 = Date.now();
    const ping = await pingQdrant();
    const latencyMs = Date.now() - t0;

    if (!ping.success) {
      return {
        status: 'degraded',
        latencyMs,
        fallbackMode: true,
        detail: `Qdrant ping failed: ${ping.error || 'unknown'}`,
      };
    }

    const stats = await getQdrantStats();
    const collections = await listCollections();
    const collectionSummary = collections.map(c => ({
      name: c.name,
      points: c.points_count,
    }));

    return {
      status: 'healthy',
      latencyMs,
      fallbackMode: false,
      detail: `Qdrant connected — ${stats.collectionsCount ?? 0} collections, ${stats.totalPoints ?? 0} points`,
      collections: collectionSummary,
    };
  } catch (err: unknown) {
    return {
      status: 'degraded',
      fallbackMode: true,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkScheduler(): SubsystemCheck & { activeTasks: number; totalSchedules: number; enabledSchedules: number; overdueTasks: number; resourceUsage: Record<string, unknown> } {
  try {
    const scheduler = getAgentScheduler();
    const schedules = scheduler.getAllSchedules();
    const activeSchedules = schedules.filter(s => s.enabled).length;
    const stateManager = getAgentStateManager();
    const activeTasks = stateManager.getActiveTasks();
    const overdueTasks = stateManager.getOverdueTasks();
    const resourceUsage = stateManager.getAllResourceUsage();

    return {
      status: activeTasks.length > 50 ? 'degraded' : 'healthy',
      detail: `${activeTasks.length} active tasks, ${activeSchedules}/${schedules.length} schedules enabled`,
      activeTasks: activeTasks.length,
      totalSchedules: schedules.length,
      enabledSchedules: activeSchedules,
      overdueTasks: overdueTasks.length,
      resourceUsage,
    };
  } catch (err: unknown) {
    return {
      status: 'degraded',
      detail: err instanceof Error ? err.message : String(err),
      activeTasks: 0,
      totalSchedules: 0,
      enabledSchedules: 0,
      overdueTasks: 0,
      resourceUsage: {},
    };
  }
}

async function checkAgents(): Promise<SubsystemCheck & { active: number; total: number; topUnhealthy: { agentId: string; name: string; status: string }[] }> {
  try {
    const [active, total, unhealthyAgents] = await Promise.all([
      db.agent.count({ where: { status: 'active' } }),
      db.agent.count(),
      db.agent.findMany({
        where: { status: { not: 'active' } },
        select: { agentId: true, name: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      status: 'healthy',
      active,
      total,
      topUnhealthy: unhealthyAgents.map(a => ({
        agentId: a.agentId,
        name: a.name,
        status: a.status,
      })),
      detail: `${active} active, ${total} total`,
    };
  } catch (err: unknown) {
    return {
      status: 'degraded',
      active: 0,
      total: 0,
      topUnhealthy: [],
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getRecentErrorCounts(): Promise<{ lastHour: number; lastDay: number; bySource: Record<string, number> }> {
  try {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const oneDayAgo = new Date(Date.now() - 86_400_000);

    const [lastHour, lastDay, bySourceRows] = await Promise.all([
      db.errorLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
      db.errorLog.count({ where: { createdAt: { gte: oneDayAgo } } }),
      db.errorLog.groupBy({
        by: ['source'],
        where: { createdAt: { gte: oneHourAgo } },
        _count: true,
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    const bySource: Record<string, number> = {};
    for (const row of bySourceRows) {
      bySource[row.source] = row._count;
    }

    return { lastHour, lastDay, bySource };
  } catch {
    return { lastHour: 0, lastDay: 0, bySource: {} };
  }
}

// ─── Overall status computation ───────────────────────────────────

function computeOverallStatus(checks: SubsystemCheck[]): CheckStatus {
  if (checks.some(c => c.status === 'unhealthy')) return 'unhealthy';
  if (checks.some(c => c.status === 'degraded')) return 'degraded';
  return 'healthy';
}

// ─── Route handler (authenticated) ────────────────────────────────

export const GET = withAuth(async (_request, _context, _user) => {
  const [dbCheck, memoryCheck, aiRouterCheck, ragCheck, schedulerCheck, agentsCheck, errorCounts] =
    await Promise.all([
      checkDatabase(),
      checkMemory(),
      checkAIRouter(),
      checkRAG(),
      Promise.resolve(checkScheduler()),
      checkAgents(),
      getRecentErrorCounts(),
    ]);

  const checks = [dbCheck, memoryCheck, aiRouterCheck, ragCheck, schedulerCheck, agentsCheck];
  const overallStatus = computeOverallStatus(checks);

  // Memory usage
  const memUsage = process.memoryUsage();
  const resourceUsage = {
    heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
    rssMb: Math.round(memUsage.rss / 1024 / 1024),
  };

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: VERSION,
    resourceUsage,
    checks: {
      database: dbCheck,
      memory: memoryCheck,
      aiRouter: aiRouterCheck,
      rag: ragCheck,
      scheduler: schedulerCheck,
      agents: {
        status: agentsCheck.status,
        active: agentsCheck.active,
        total: agentsCheck.total,
        detail: agentsCheck.detail,
        topUnhealthy: agentsCheck.topUnhealthy,
      },
    },
    recentErrors: errorCounts,
  });
});
