/**
 * Multi-agent orchestration — agent registry.
 *
 * The coordinator needs to know which agents exist, what they can do, whether they
 * are healthy, and which tenant they belong to. This module builds that view from
 * two sources and never invents an agent:
 *
 * 1. **Company agents** — real `Agent` rows, scoped to the company. Their
 *    capabilities are derived from their role and department, and their tools from
 *    the `allowedTools` column the agent builder already writes.
 * 2. **Platform capabilities** — capabilities this deployment genuinely has:
 *    analysis (the AI router), operations (the run engine and gate scripts),
 *    capacity (the capacity plan and probes), repository (the GitHub assessment).
 *    Capabilities it does *not* have are registered as `unavailable` on purpose, so
 *    a plan that needs them fails with a reason instead of dispatching to nobody.
 */

import { db } from '@/lib/db';
import type { AgentDescriptor, AgentKind } from './plan';

/** Tools each built-in capability may use. Empty = read/analyse only. */
const PLATFORM_AGENTS: readonly AgentDescriptor[] = [
  {
    id: 'platform.analysis',
    name: 'Analysis (AI router)',
    kind: 'analysis',
    capabilities: ['analysis', 'summarise', 'compare', 'report'],
    tools: ['web_search', 'wikipedia_summary', 'analyze_public_page', 'stack_register'],
    health: 'available',
    maxConcurrency: 2,
    tenantScope: 'platform',
    version: '1',
    resourceBudget: { tokensPerRun: 60_000, minutesPerRun: 10 },
  },
  {
    id: 'platform.repository',
    name: 'Repository intelligence',
    kind: 'analysis',
    capabilities: ['repository', 'analysis', 'license', 'security'],
    tools: ['github_repository_assess', 'stack_register'],
    health: 'available',
    maxConcurrency: 2,
    tenantScope: 'platform',
    version: '1',
    resourceBudget: { tokensPerRun: 20_000, minutesPerRun: 5 },
  },
  {
    id: 'platform.operations',
    name: 'Operations (run engine + gates)',
    kind: 'operations',
    capabilities: ['operations', 'capacity', 'testing', 'deployment'],
    tools: ['stack_register', 'browser_verify'],
    health: 'available',
    maxConcurrency: 1,
    tenantScope: 'platform',
    version: '1',
    resourceBudget: { tokensPerRun: 10_000, minutesPerRun: 15 },
  },
  {
    id: 'platform.browser',
    name: 'Browser verification',
    kind: 'browser',
    capabilities: ['browser'],
    tools: ['browser_verify'],
    // No Chromium binary in this deployment, so the capability is registered and
    // reported unavailable rather than silently missing from the registry.
    health: 'unavailable',
    maxConcurrency: 1,
    tenantScope: 'platform',
    version: '1',
    resourceBudget: { tokensPerRun: 0, minutesPerRun: 5 },
  },
  {
    id: 'platform.coding',
    name: 'Coding agent',
    kind: 'coding',
    capabilities: ['coding', 'testing'],
    tools: [],
    // No coding adapter is bound to a repository checkout in this deployment.
    health: 'unavailable',
    maxConcurrency: 1,
    tenantScope: 'platform',
    version: '1',
    resourceBudget: { tokensPerRun: 200_000, minutesPerRun: 45 },
  },
];

const ROLE_CAPABILITIES: Record<string, string[]> = {
  manager: ['analysis', 'operations'],
  planner: ['analysis'],
  execution: ['operations', 'coding'],
  qa: ['testing', 'analysis'],
  report: ['analysis', 'summarise'],
  automation: ['operations'],
  safety: ['analysis', 'security'],
  memory: ['analysis'],
  productivity: ['analysis', 'operations'],
  owner_approval: ['analysis'],
  specialist: ['analysis'],
};

function kindForRole(role: string): AgentKind {
  if (role === 'qa') return 'analysis';
  if (role === 'execution' || role === 'automation') return 'operations';
  if (role === 'safety') return 'analysis';
  return 'ai';
}

function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Build the registry for one tenant.
 *
 * Company agents are scoped by `companyId` (or global, when the column is null,
 * which is how the platform's own agents are seeded). A non-active agent is
 * registered as `degraded`/`unavailable` so the plan reports it instead of
 * offering work it cannot take.
 */
export async function discoverAgents(companyId?: string): Promise<AgentDescriptor[]> {
  const rows = await db.agent
    .findMany({
      where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
      select: {
        id: true,
        name: true,
        role: true,
        type: true,
        departmentName: true,
        status: true,
        allowedTools: true,
        companyId: true,
      },
      take: 200,
      orderBy: { name: 'asc' },
    })
    .catch(() => []);

  const companyAgents: AgentDescriptor[] = rows.map((agent) => {
    const roleCapabilities = ROLE_CAPABILITIES[agent.role] ?? ['analysis'];
    const department = (agent.departmentName ?? '').toLowerCase();
    const derived: string[] = [...roleCapabilities];
    if (/engineer|develop|code|build/.test(department)) derived.push('coding');
    if (/qa|quality|test/.test(department)) derived.push('testing');
    if (/research|analysis|intel/.test(department)) derived.push('analysis', 'repository');
    if (/ops|devops|infra|platform/.test(department)) derived.push('operations', 'capacity');
    if (/security|compliance/.test(department)) derived.push('security');
    if (/browser|web/.test(department)) derived.push('browser');

    return {
      id: `company.${agent.id}`,
      name: agent.name,
      kind: kindForRole(agent.role),
      capabilities: Array.from(new Set(derived)),
      tools: parseStringList(agent.allowedTools),
      health: agent.status === 'active' ? 'available' : agent.status === 'paused' ? 'degraded' : 'unavailable',
      maxConcurrency: 1,
      tenantScope: agent.companyId ? 'company' : 'platform',
      ...(agent.companyId ? { companyId: agent.companyId } : {}),
      version: agent.type,
      resourceBudget: { tokensPerRun: 40_000, minutesPerRun: 15 },
    };
  });

  return [...PLATFORM_AGENTS, ...companyAgents];
}

/** The registry the UI and the API show — includes the unavailable entries. */
export function platformAgents(): readonly AgentDescriptor[] {
  return PLATFORM_AGENTS;
}
