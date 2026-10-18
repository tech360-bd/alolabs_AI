#!/usr/bin/env npx tsx
/**
 * Workforce activation & readiness audit (READ-ONLY).
 *
 * Produces the Phase-12 inventory from the live database instead of trusting
 * dashboard counters. It never writes to the database.
 *
 * Lifecycle used here (deliberately stricter than "row exists"):
 *
 *   CREATED      row present
 *   CONFIGURED   + system instructions, purpose, model config, input/output
 *                  schema, active department (allowed tools may be empty when
 *                  no implemented runtime capability matches)
 *   READY        + the configured model policy actually resolves to a
 *                  registered, circuit-closed provider right now
 *   DEMONSTRATED + at least one completed AgentRun with output, within
 *                  --days (default 30)
 *
 * An agent is operational only when DEMONSTRATED. Configuration readiness is
 * reported separately and never conflated with execution evidence.
 *
 * Usage (on the production host, from the repo root):
 *   npx tsx scripts/activate-workforce.ts
 *   npx tsx scripts/activate-workforce.ts --json > workforce-inventory.json
 *   npx tsx scripts/activate-workforce.ts --days 7 --limit 25
 *   npx tsx scripts/activate-workforce.ts --company <company-id>
 */

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ensureRouterSynced } from '@/lib/ai-router';

type Stage = 'created' | 'configured' | 'ready' | 'demonstrated';

interface AgentVerdict {
  agentId: string;
  name: string;
  department: string;
  role: string;
  modelPolicy: string | null;
  stage: Stage;
  blockers: string[];
  runs: { total: number; completed: number; failed: number; lastRunAt: string | null };
  tools: string[];
}

interface DepartmentVerdict {
  department: string;
  agents: number;
  configured: number;
  ready: number;
  demonstrated: number;
  failing: number;
  readinessScore: number;
  blockers: string[];
}

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hasInstructions(agent: { systemInstructions: string | null }): boolean {
  return typeof agent.systemInstructions === 'string' && agent.systemInstructions.trim().length >= 40;
}

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return value.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  }
}

async function flushStdout(): Promise<void> {
  await new Promise<void>((resolve) => process.stdout.write('', () => resolve()));
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const days = Math.max(1, parseInt(argValue('--days', '30'), 10) || 30);
  const limit = Math.max(1, parseInt(argValue('--limit', '15'), 10) || 15);
  const companyId = argValue('--company', '');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // ── 1. Model gateway reality ─────────────────────────────────────────
  let providerSummaries: Array<{ provider: string; models?: string[]; circuitOpen?: boolean }> = [];
  let routerError: string | null = null;
  let aliasResolvable = new Map<string, { ok: boolean; reason?: string }>();
  try {
    const router = await ensureRouterSynced({ force: true });
    providerSummaries = router.getProviderSummaries() as typeof providerSummaries;

    for (const alias of ['fast', 'balanced', 'reasoning', 'coding', 'vision']) {
      try {
        router.route({ model: alias, messages: [{ role: 'user', content: 'ping' }] });
        aliasResolvable.set(alias, { ok: true });
      } catch (error) {
        aliasResolvable.set(alias, { ok: false, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    routerError = error instanceof Error ? error.message : String(error);
  }

  const providersLive = providerSummaries.filter((p) => !p.circuitOpen).length;

  // ── 2. Tenant-owned and explicitly shared inventory ───────────────────
  const whereCompany = companyId
    ? { OR: [{ companyId }, { agentCompanyAccess: { some: { companyId } } }] }
    : undefined;
  const [departments, agents] = await Promise.all([
    db.department.findMany({
      where: companyId ? { companyId } : undefined,
      select: { id: true, name: true, slug: true, status: true, companyId: true },
    }),
    db.agent.findMany({
      where: whereCompany,
      select: {
        id: true,
        agentId: true,
        name: true,
        role: true,
        type: true,
        status: true,
        departmentId: true,
        departmentName: true,
        purpose: true,
        systemInstructions: true,
        allowedTools: true,
        forbiddenTools: true,
        inputSchema: true,
        outputSchema: true,
        runtimeProfile: true,
        companyId: true,
        ...(companyId ? {
          agentCompanyAccess: {
            where: { companyId },
            select: { companyId: true },
          },
        } : {}),
        department: { select: { id: true, name: true, status: true, companyId: true } },
      },
    }),
  ]);

  const departmentStatus = new Map(departments.map((d) => [d.id, d.status]));
  const agentDbIds = agents.map((agent) => agent.id);
  const agentDbIdSet = new Set(agentDbIds);
  const runCompanyScope = companyId ? { companyId } : {};

  // AgentRun.agentId is Agent.id, not the external business key. Aggregate
  // company-scoped runs first, then retain only selected agent IDs in memory;
  // a 2,000-value SQL IN list exceeds SQLite's bind-parameter limit.
  // ── 3. Tenant-scoped execution evidence ───────────────────────────────
  const [allRunGroups, runs, demonstratedRuns] = agentDbIds.length > 0
    ? await Promise.all([
        db.agentRun.groupBy({
          by: ['agentId', 'status'],
          where: runCompanyScope,
          _count: { _all: true },
        }),
        db.agentRun.groupBy({
          by: ['agentId', 'status'],
          where: { ...runCompanyScope, createdAt: { gte: since } },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
        db.agentRun.groupBy({
          by: ['agentId'],
          where: {
            ...runCompanyScope,
            status: 'completed',
            createdAt: { gte: since },
            AND: [{ output: { not: null } }, { output: { not: '' } }],
          },
          _count: { _all: true },
        }),
      ])
    : [[], [], []] as const;

  const scopedRunGroups = allRunGroups.filter((run) => agentDbIdSet.has(run.agentId));
  const agentRunTotal = scopedRunGroups.reduce((total, run) => total + run._count._all, 0);
  const agentRunCompleted = scopedRunGroups
    .filter((run) => run.status === 'completed')
    .reduce((total, run) => total + run._count._all, 0);
  const agentRunFailed = scopedRunGroups
    .filter((run) => run.status === 'failed' || run.status === 'error')
    .reduce((total, run) => total + run._count._all, 0);

  // ToolRun has no companyId. For company mode, attribute only rows joined by
  // ToolRun.taskId to a company-owned AgentRun; never merge a shared agent's
  // tool activity from another company. Global mode retains the raw total.
  let toolRunGroups: Array<{ agentDbId: string; toolRunCount: bigint | number }> = [];
  if (agentDbIds.length > 0 && companyId) {
    toolRunGroups = await db.$queryRaw<Array<{ agentDbId: string; toolRunCount: bigint | number }>>(Prisma.sql`
      SELECT ar.agentId AS agentDbId, COUNT(*) AS toolRunCount
      FROM ToolRun tr
      INNER JOIN AgentRun ar ON ar.id = tr.taskId
      WHERE ar.companyId = ${companyId}
      GROUP BY ar.agentId
    `);
  } else if (agentDbIds.length > 0) {
    toolRunGroups = await db.toolRun.groupBy({
      by: ['agentId'],
      _count: { _all: true },
    }).then((groups) => groups.flatMap((group) =>
      typeof group.agentId === 'string'
        ? [{ agentDbId: group.agentId, toolRunCount: group._count._all }]
        : [],
    )).catch(() => []);
  }
  const toolRunTotal = toolRunGroups
    .filter((run) => agentDbIdSet.has(run.agentDbId))
    .reduce((total, run) => total + Number(run.toolRunCount), 0);
  const demonstratedAgentIds = new Set(
    demonstratedRuns.filter((run) => agentDbIdSet.has(run.agentId)).map((run) => run.agentId),
  );

  const runsByAgent = new Map<string, { total: number; completed: number; failed: number; lastRunAt: Date | null }>();
  for (const row of runs) {
    if (!agentDbIdSet.has(row.agentId)) continue;
    const entry = runsByAgent.get(row.agentId) ?? { total: 0, completed: 0, failed: 0, lastRunAt: null };
    entry.total += row._count._all;
    if (row.status === 'completed') entry.completed += row._count._all;
    if (row.status === 'failed' || row.status === 'error') entry.failed += row._count._all;
    if (row._max.createdAt && (!entry.lastRunAt || row._max.createdAt > entry.lastRunAt)) {
      entry.lastRunAt = row._max.createdAt;
    }
    runsByAgent.set(row.agentId, entry);
  }

  // ── 4. Per-agent verdict ─────────────────────────────────────────────
  const verdicts: AgentVerdict[] = agents.map((agent) => {
    const blockers: string[] = [];
    const profile = safeJson<{ modelConfig?: { policy?: string; pinnedModel?: string | null } }>(
      agent.runtimeProfile,
      {},
    );
    const policy = profile.modelConfig?.pinnedModel || profile.modelConfig?.policy || null;

    if (!hasInstructions(agent)) blockers.push('system instructions missing or too short');
    if (!agent.purpose || agent.purpose.trim().length < 10) blockers.push('purpose/job description missing');
    if (!policy) blockers.push('no model policy configured');
    if (parseList(agent.inputSchema).length === 0 && !agent.inputSchema?.includes('properties')) {
      blockers.push('input schema missing');
    }
    if (!agent.outputSchema?.includes('properties')) blockers.push('output schema missing');
    // Empty allowedTools is a valid fail-closed configuration when the
    // department capability/role intersection has no implemented runtime tool.
    if (companyId && agent.companyId === companyId &&
        !agent.agentCompanyAccess?.some((access) => access.companyId === companyId)) {
      blockers.push('explicit company access grant missing');
    }
    if (companyId && agent.companyId === companyId && agent.department?.companyId !== companyId) {
      blockers.push('department is not owned by this company');
    }
    if (agent.status !== 'active') blockers.push(`agent status is "${agent.status}"`);
    const departmentIsVisible = !companyId || agent.department?.companyId === companyId;
    if (departmentIsVisible && agent.department && departmentStatus.get(agent.department.id) !== 'active') {
      blockers.push('department is not active');
    }
    if (providersLive === 0) blockers.push('no model provider registered (gateway offline)');
    if (policy && aliasResolvable.get(policy)?.ok === false) {
      blockers.push(`model alias "${policy}" cannot be routed: ${aliasResolvable.get(policy)?.reason ?? 'no provider'}`);
    }

    const evidence = runsByAgent.get(agent.id) ?? { total: 0, completed: 0, failed: 0, lastRunAt: null };

    let stage: Stage = 'created';
    const hardConfigBlockers = blockers.filter(
      (b) => !b.startsWith('no model provider') && !b.startsWith('model alias') && !b.startsWith('agent status'),
    );
    if (hardConfigBlockers.length === 0) stage = 'configured';
    if (stage === 'configured' && !blockers.some((b) => b.includes('provider') || b.includes('model alias'))) {
      stage = 'ready';
    }
    if (stage === 'ready' && demonstratedAgentIds.has(agent.id)) stage = 'demonstrated';

    return {
      agentId: agent.agentId,
      name: agent.name,
      department: departmentIsVisible ? agent.departmentName : 'Shared Agent (department hidden)',
      role: agent.role,
      modelPolicy: policy,
      stage,
      blockers,
      runs: {
        total: evidence.total,
        completed: evidence.completed,
        failed: evidence.failed,
        lastRunAt: evidence.lastRunAt ? evidence.lastRunAt.toISOString() : null,
      },
      tools: parseList(agent.allowedTools),
    };
  });

  // ── 5. Per-department readiness ──────────────────────────────────────
  const byDepartment = new Map<string, DepartmentVerdict>();
  for (const verdict of verdicts) {
    const entry = byDepartment.get(verdict.department) ?? {
      department: verdict.department,
      agents: 0,
      configured: 0,
      ready: 0,
      demonstrated: 0,
      failing: 0,
      readinessScore: 0,
      blockers: [],
    };
    entry.agents += 1;
    if (verdict.stage !== 'created') entry.configured += 1;
    if (verdict.stage === 'ready' || verdict.stage === 'demonstrated') entry.ready += 1;
    if (verdict.stage === 'demonstrated') entry.demonstrated += 1;
    if (verdict.runs.failed > 0) entry.failing += 1;
    byDepartment.set(verdict.department, entry);
  }
  for (const entry of byDepartment.values()) {
    // 40% configured, 30% ready, 30% demonstrated — a department cannot score
    // well on configuration alone.
    entry.readinessScore = entry.agents
      ? Math.round(
          ((entry.configured / entry.agents) * 0.4 + (entry.ready / entry.agents) * 0.3 + (entry.demonstrated / entry.agents) * 0.3) *
            100,
        )
      : 0;
    if (entry.demonstrated === 0) entry.blockers.push('no demonstrated executions in the window');
  }

  const totals = {
    departments: departments.length,
    agents: agents.length,
    created: verdicts.filter((v) => v.stage === 'created').length,
    configured: verdicts.filter((v) => v.stage === 'configured').length,
    ready: verdicts.filter((v) => v.stage === 'ready').length,
    demonstrated: verdicts.filter((v) => v.stage === 'demonstrated').length,
    failing: verdicts.filter((v) => v.runs.failed > 0).length,
    agentRuns: agentRunTotal,
    agentRunsCompleted: agentRunCompleted,
    agentRunsFailed: agentRunFailed,
    toolRuns: toolRunTotal,
    toolRunScope: companyId ? 'linked to company-scoped AgentRun rows' : 'global ToolRun rows',
    providersLive,
    providers: providerSummaries.map((p) => p.provider),
    routerError,
  };

  const departmentsReport = [...byDepartment.values()].sort((a, b) => b.readinessScore - a.readinessScore);
  const failingAgents = verdicts.filter((v) => v.runs.failed > 0).slice(0, limit);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scope: { companyId: companyId || null, departmentCount: departments.length, agentCount: agents.length },
          windowDays: days,
          totals,
          departments: departmentsReport,
          agents: verdicts,
        },
        null,
        2,
      ),
    );
    await flushStdout();
    return;
  }

  const line = '─'.repeat(64);
  console.log(line);
  console.log('WORKFORCE ACTIVATION REPORT — read-only');
  console.log(`generated: ${new Date().toISOString()}  window: ${days}d`);
  console.log(`company scope: ${companyId || 'all companies'}`);
  console.log(line);
  console.log(`departments            : ${totals.departments}`);
  console.log(`agents (rows)          : ${totals.agents}`);
  console.log(`  created only         : ${totals.created}`);
  console.log(`  configured           : ${totals.configured}`);
  console.log(`  ready (routable)     : ${totals.ready}`);
  console.log(`  demonstrated         : ${totals.demonstrated}   <-- operational`);
  console.log(`  with failures        : ${totals.failing}`);
  console.log(`agent runs             : ${totals.agentRuns} (completed ${totals.agentRunsCompleted}, failed ${totals.agentRunsFailed})`);
  console.log(`tool runs              : ${totals.toolRuns} (${totals.toolRunScope})`);
  console.log(`model providers live   : ${totals.providersLive} ${totals.providers.length ? `[${totals.providers.join(', ')}]` : ''}`);
  if (totals.routerError) console.log(`gateway error          : ${totals.routerError}`);
  console.log(line);
  console.log('DEPARTMENT READINESS (top / bottom)');
  for (const dept of [...departmentsReport.slice(0, 5), ...departmentsReport.slice(-5)]) {
    console.log(
      `  ${String(dept.readinessScore).padStart(3)}%  ${dept.department.slice(0, 34).padEnd(34)} ` +
        `agents=${String(dept.agents).padStart(3)} ready=${String(dept.ready).padStart(3)} demonstrated=${String(dept.demonstrated).padStart(3)}`,
    );
  }
  if (failingAgents.length) {
    console.log(line);
    console.log('AGENTS WITH FAILED RUNS');
    for (const agent of failingAgents) {
      console.log(`  ${agent.agentId}  ${agent.name.slice(0, 40)}  failed=${agent.runs.failed}`);
    }
  }
  const commonBlockers = new Map<string, number>();
  for (const verdict of verdicts) {
    for (const blocker of verdict.blockers) commonBlockers.set(blocker, (commonBlockers.get(blocker) ?? 0) + 1);
  }
  console.log(line);
  console.log('TOP BLOCKERS');
  for (const [blocker, count] of [...commonBlockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${String(count).padStart(5)}  ${blocker}`);
  }
  console.log(line);
  console.log('An agent is operational ONLY at stage "demonstrated". Configuration is not execution.');
  await flushStdout();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Workforce activation audit failed:', error);
    process.exit(1);
  });
