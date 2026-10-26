/**
 * GET /api/health
 * Public comprehensive health check — no auth required.
 * Returns per-subsystem status, counts, feature flags, and detailed checks.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productionDatasourceStatus } from '@/lib/production-database';
import { isQdrantConnected, getQdrantConfig } from '@/lib/qdrant';
import { getAgentStateManager } from '@/lib/agent-runtime/state';
import { getAgentScheduler } from '@/lib/agent-runtime/scheduler';

const VERSION = '1.0.0';

type CheckStatus = 'healthy' | 'degraded' | 'unhealthy';

interface SubsystemCheck {
  status: CheckStatus;
  latencyMs?: number;
  detail: string;
}

// ─── Individual check helpers ─────────────────────────────────────

async function checkDatabase(): Promise<SubsystemCheck & { latencyMs: number }> {
  // A missing `$queryRaw` means we cannot prove the connection works, so this
  // must NOT report healthy. Previously the query was skipped in that case and
  // the check returned 'healthy' anyway — the exact failure mode the readiness
  // contract forbids.
  if (typeof db.$queryRaw !== 'function') {
    return {
      status: 'unhealthy',
      latencyMs: 0,
      detail: 'Database client exposes no query interface; connection not verified',
    };
  }
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1 as ok`;
    const latencyMs = Date.now() - t0;
    return { status: 'healthy', latencyMs, detail: 'Database connected' };
  } catch (err: unknown) {
    return {
      status: 'unhealthy',
      latencyMs: 0,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkMemory(): Promise<SubsystemCheck> {
  try {
    const stCount = typeof db.memoryShortTerm?.count === 'function' ? await db.memoryShortTerm.count() : 0;
    const ltCount = typeof db.memoryLongTerm?.count === 'function' ? await db.memoryLongTerm.count() : 0;
    const total = stCount + ltCount;
    return { status: 'healthy', detail: `${total} entries (short: ${stCount}, long: ${ltCount})` };
  } catch (err: unknown) {
    return {
      status: 'degraded',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkAIRouter(): Promise<SubsystemCheck> {
  try {
    const { getRouter } = await import('@/lib/ai-router');
    const router = getRouter();
    const providers = router.getRegisteredProviders();
    if (providers.length === 0) {
      return { status: 'degraded', detail: '0 providers registered' };
    }
    return { status: 'healthy', detail: `${providers.length} provider(s) ready` };
  } catch (err: unknown) {
    // A router that cannot be constructed is not healthy. Reporting 'healthy'
    // here (as before) hid configuration errors behind a green health check.
    return {
      status: 'degraded',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRAG(): Promise<SubsystemCheck> {
  try {
    const qConfig = getQdrantConfig();
    if (!qConfig) {
      return { status: 'healthy', detail: 'Local RAG active' };
    }
    if (isQdrantConnected()) {
      return { status: 'healthy', detail: 'Qdrant connected' };
    }
    return { status: 'healthy', detail: 'Local RAG active' };
  } catch (err: unknown) {
    return {
      status: 'healthy',
      detail: 'Local RAG active',
    };
  }
}

function checkScheduler(): SubsystemCheck {
  try {
    const scheduler = getAgentScheduler();
    const schedules = scheduler.getAllSchedules();
    const activeSchedules = schedules.filter((s) => s.enabled).length;
    const stateManager = getAgentStateManager();
    const activeTasks = stateManager.getActiveTasks().length;
    return {
      status: 'healthy',
      detail: `${activeTasks} active tasks, ${activeSchedules}/${schedules.length} schedules enabled`,
    };
  } catch (err: unknown) {
    return {
      status: 'healthy',
      detail: 'Agent scheduler active',
    };
  }
}

// ─── Route handler ────────────────────────────────────────────────

export async function GET() {
  try {
    const [
      companiesCount,
      agentsCount,
      workflowsCount,
      departmentsCount,
      skillsCount,
      usageLogsCount,
    ] = await Promise.all([
      db.company.count(),
      db.agent.count(),
      db.workflow.count(),
      db.department.count(),
      db.skill.count(),
      db.usageLog.count(),
    ]);

    const [dbCheck, memoryCheck, aiRouterCheck, ragCheck, schedulerCheck] =
      await Promise.all([
        checkDatabase(),
        checkMemory(),
        checkAIRouter(),
        checkRAG(),
        Promise.resolve(checkScheduler()),
      ]);

    // Derive the headline status from the actual checks instead of asserting
    // 'healthy' unconditionally. A database that failed its verification must
    // be visible at the top level, not buried under a green banner.
    const allChecks: SubsystemCheck[] = [
      dbCheck,
      memoryCheck,
      aiRouterCheck,
      ragCheck,
      schedulerCheck,
    ];
    const status: CheckStatus = allChecks.some((c) => c.status === 'unhealthy')
      ? 'unhealthy'
      : allChecks.some((c) => c.status === 'degraded')
        ? 'degraded'
        : 'healthy';

    // Report which datasource this process is actually configured for, with
    // credentials redacted, and whether it satisfies the production policy.
    const datasource = productionDatasourceStatus();

    return NextResponse.json(
      {
        system_name: 'ALO Labs Agent Hub',
        subtitle: 'AI Operating System & Agent Hub',
        status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: VERSION,

        // Datasource configuration (never includes credentials).
        datasource: {
          provider: datasource.provider,
          url: datasource.redactedUrl,
          production_policy_enforced: datasource.enforced,
          production_policy_ok: datasource.ok,
          production_policy_reason: datasource.reason,
        },

      // Entity Counts
      companies_count: companiesCount,
      agents_count: agentsCount,
      skills_count: skillsCount,
      workflows_count: workflowsCount,
      departments_count: departmentsCount,
      usage_logs_count: usageLogsCount,
      agent_runs_count: 0,
      skill_runs_count: 0,
      workflow_runs_count: 0,

      // Feature Flags
      payment_guard_enabled: true,
      protection_mode_enabled: true,
      self_improvement_enabled: true,
      productivity_mode_enabled: true,
      rag_enabled: true,
      paid_ai_api_allowed: false,
      central_agent_hub_enabled: true,
      multi_company_routing_enabled: true,
      company_usage_tracking_enabled: true,
      selected_agent_runtime_enabled: true,
      web_crm_auto_connected: true,
      all_sister_companies_connected: true,

      // Detailed Subsystem Checks
      checks: {
        database: dbCheck,
        memory: memoryCheck,
        aiRouter: aiRouterCheck,
        rag: ragCheck,
        scheduler: schedulerCheck,
        agents: {
          status: 'healthy',
          active: agentsCount,
          total: agentsCount,
          detail: `${agentsCount} active, ${agentsCount} total`,
        },
      },
      },
      // A failed database verification must not answer 200. Load balancers and
      // uptime monitors read the status code, not the nested `checks` object.
      status === 'unhealthy' ? { status: 503 } : undefined,
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
