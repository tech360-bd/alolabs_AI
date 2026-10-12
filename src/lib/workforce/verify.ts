/**
 * Workforce verifier — checks stored rows against the plan.
 *
 * This verifier does NOT claim that agents are operational. It proves the
 * *configuration* of the workforce: counts, ownership, uniqueness, required
 * fields and drift. Operational status requires execution evidence (a
 * completed verified task per agent) and is reported separately as
 * `agentsOperational`, which is zero unless agents were promoted to `active`.
 */

import { AGENTS_PER_DEPARTMENT, DEPARTMENT_COUNT, PRIMARY_AGENT_COUNT } from './constants';
import { GLOBALLY_FORBIDDEN_TOOLS } from './roles';
import type { WorkforcePlan } from './plan';
import {
  agentProjection,
  departmentProjection,
  agentWrite,
  departmentWrite,
  isManagedAgent,
  isManagedDepartment,
  type StoredAgent,
  type StoredDepartment,
} from './provision';

export interface VerifyCheck {
  id: string;
  pass: boolean;
  expected: number | string;
  actual: number | string;
  detail?: string;
}

export interface VerifyReport {
  ok: boolean;
  planHash: string;
  checks: VerifyCheck[];
  counts: {
    departmentsOwned: number;
    agentsOwned: number;
    agentsDrifted: number;
    departmentsDrifted: number;
    agentsOrphaned: number;
    agentsCrossTenantKeyClash: number;
    agentsOperational: number;
    agentsProvisioned: number;
    legacyUnownedAgents: number;
    legacyUnownedDepartments: number;
  };
  drift: Array<{ entity: 'department' | 'agent'; key: string; reason: string }>;
}

function parseJsonArray(value: string): unknown[] | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function verifyWorkforce(
  plan: WorkforcePlan,
  input: {
    tenantId: string | null;
    departments: StoredDepartment[];
    agents: StoredAgent[];
  },
): VerifyReport {
  const checks: VerifyCheck[] = [];
  const drift: VerifyReport['drift'] = [];
  const check = (id: string, pass: boolean, expected: number | string, actual: number | string, detail?: string) =>
    checks.push({ id, pass, expected, actual, ...(detail ? { detail } : {}) });

  const tenantId = input.tenantId ?? '__no_tenant__';
  const ownedDepts = input.departments.filter((d) => isManagedDepartment(d, tenantId));
  const ownedAgents = input.agents.filter((a) => isManagedAgent(a, tenantId));
  const legacyUnownedAgents = input.agents.filter((a) => a.companyId === null).length;
  const legacyUnownedDepartments = input.departments.filter((d) => d.companyId === null).length;

  // Departments ------------------------------------------------------------
  check('departments.count', ownedDepts.length === DEPARTMENT_COUNT, DEPARTMENT_COUNT, ownedDepts.length);

  const deptBySlug = new Map<string, StoredDepartment>();
  for (const d of ownedDepts) deptBySlug.set(d.slug, d);
  const missingDepts = plan.departments.filter((d) => !deptBySlug.has(d.slug));
  check('departments.plan_coverage', missingDepts.length === 0, 0, missingDepts.length,
    missingDepts.slice(0, 5).map((d) => d.slug).join(', ') || undefined);

  let departmentsDrifted = 0;
  for (const spec of plan.departments) {
    const stored = deptBySlug.get(spec.slug);
    if (!stored) continue;
    const desired = departmentWrite(spec, tenantId);
    if (departmentProjection(stored) !== departmentProjection(desired)) {
      departmentsDrifted++;
      drift.push({ entity: 'department', key: spec.slug, reason: 'stored department differs from plan' });
    }
  }
  check('departments.no_drift', departmentsDrifted === 0, 0, departmentsDrifted);

  // Agents -----------------------------------------------------------------
  check('agents.count', ownedAgents.length === PRIMARY_AGENT_COUNT, PRIMARY_AGENT_COUNT, ownedAgents.length);

  const agentByKey = new Map<string, StoredAgent>();
  for (const a of ownedAgents) agentByKey.set(a.agentId, a);
  const planAgentKeys = new Set(plan.agents.map((a) => a.agentId));
  const missingAgents = plan.agents.filter((a) => !agentByKey.has(a.agentId));
  check('agents.plan_coverage', missingAgents.length === 0, 0, missingAgents.length,
    missingAgents.slice(0, 5).map((a) => a.agentId).join(', ') || undefined);

  const orphans = ownedAgents.filter((a) => !planAgentKeys.has(a.agentId));
  check('agents.no_orphans', orphans.length === 0, 0, orphans.length);

  // Agent keys that exist in the database under a DIFFERENT tenant (or no tenant
  // but a managed-looking profile) — a collision the provisioner must not overwrite.
  const clashes = input.agents.filter(
    (a) => planAgentKeys.has(a.agentId) && !isManagedAgent(a, tenantId),
  );
  check('agents.no_foreign_key_clash', clashes.length === 0, 0, clashes.length,
    clashes.slice(0, 5).map((a) => a.agentId).join(', ') || undefined);

  const perDept = new Map<string, number>();
  for (const a of ownedAgents) {
    const slug = a.departmentSlug ?? '';
    perDept.set(slug, (perDept.get(slug) ?? 0) + 1);
  }
  const badQuota = plan.departments.filter((d) => (perDept.get(d.slug) ?? 0) !== AGENTS_PER_DEPARTMENT);
  check('agents.per_department_quota', badQuota.length === 0, 0, badQuota.length,
    badQuota.slice(0, 5).map((d) => `${d.slug}=${perDept.get(d.slug) ?? 0}`).join(', ') || undefined);

  const agentSlugs = new Set<string>();
  let slugDuplicates = 0;
  for (const a of ownedAgents) {
    if (agentSlugs.has(a.slug)) slugDuplicates++;
    agentSlugs.add(a.slug);
  }
  check('agents.unique_slugs', slugDuplicates === 0, 0, slugDuplicates);

  // Department ownership: each owned agent must reference an owned department and
  // that department must be the one its plan spec names.
  const deptIdToSlug = new Map<string, string>();
  for (const d of ownedDepts) deptIdToSlug.set(d.id, d.slug);
  const wrongDept = ownedAgents.filter((a) => deptIdToSlug.get(a.departmentId) !== a.departmentSlug);
  check('agents.department_ownership', wrongDept.length === 0, 0, wrongDept.length);

  // Orchestrator: each department's orchestrator must be one of its own agents.
  const orchestratorBad = plan.departments.filter((spec) => {
    const agent = agentByKey.get(spec.orchestratorAgentId);
    return !agent || agent.departmentSlug !== spec.slug;
  });
  check('departments.orchestrator_assigned', orchestratorBad.length === 0, 0, orchestratorBad.length,
    orchestratorBad.slice(0, 5).map((d) => d.slug).join(', ') || undefined);

  // Required configuration fields, per owned agent that exists in the plan.
  let missingFields = 0;
  const missingDetail: string[] = [];
  let agentsDrifted = 0;
  for (const spec of plan.agents) {
    const stored = agentByKey.get(spec.agentId);
    if (!stored) continue;
    const profile = parseObject(stored.runtimeProfile);
    const problems: string[] = [];
    if (!stored.name.trim()) problems.push('name');
    if (!stored.purpose.trim()) problems.push('purpose');
    if (!stored.systemInstructions.trim()) problems.push('systemInstructions');
    if (!(parseJsonArray(stored.allowedSkills)?.length)) problems.push('allowedSkills');
    const allowedTools = parseJsonArray(stored.allowedTools) ?? [];
    const forbiddenTools = parseJsonArray(stored.forbiddenTools) ?? [];
    if (allowedTools.length === 0) problems.push('allowedTools');
    if (!GLOBALLY_FORBIDDEN_TOOLS.every((t) => forbiddenTools.includes(t))) problems.push('forbiddenTools');
    if (allowedTools.some((t) => forbiddenTools.includes(t))) problems.push('tool_overlap');
    if (!profile || !profile.modelConfig) problems.push('modelConfig');
    if (!profile || !profile.knowledgeAccess) problems.push('knowledgeAccess');
    if (!profile || !profile.memoryPolicy) problems.push('memoryPolicy');
    if (!profile || !profile.resourceLimits) problems.push('resourceLimits');
    if (!profile || !profile.taskQueue) problems.push('taskQueue');
    if (!profile || !profile.evaluationProfile) problems.push('evaluationProfile');
    const knowledge = profile?.knowledgeAccess as { scope?: string; crossDepartment?: boolean } | undefined;
    if (knowledge && (knowledge.scope !== `department:${spec.departmentSlug}` || knowledge.crossDepartment !== false)) {
      problems.push('knowledge_scope');
    }
    if (problems.length > 0) {
      missingFields++;
      if (missingDetail.length < 5) missingDetail.push(`${spec.agentId}: ${problems.join('|')}`);
    }

    const desired = agentWrite(spec, stored.departmentId, tenantId);
    if (agentProjection(stored, stored.departmentSlug ?? '') !== agentProjection(desired, spec.departmentSlug)) {
      agentsDrifted++;
      if (drift.length < 200) drift.push({ entity: 'agent', key: spec.agentId, reason: 'stored agent differs from plan' });
    }
  }
  check('agents.required_fields', missingFields === 0, 0, missingFields, missingDetail.join('; ') || undefined);
  check('agents.no_drift', agentsDrifted === 0, 0, agentsDrifted);

  // Lifecycle (informational for configuration; execution evidence required for "operational").
  const agentsOperational = ownedAgents.filter((a) => a.status === 'active').length;
  const agentsProvisioned = ownedAgents.filter((a) => a.status === 'provisioned').length;

  const ok = checks.every((c) => c.pass);
  return {
    ok,
    planHash: plan.planHash,
    checks,
    counts: {
      departmentsOwned: ownedDepts.length,
      agentsOwned: ownedAgents.length,
      agentsDrifted,
      departmentsDrifted,
      agentsOrphaned: orphans.length,
      agentsCrossTenantKeyClash: clashes.length,
      agentsOperational,
      agentsProvisioned,
      legacyUnownedAgents,
      legacyUnownedDepartments,
    },
    drift,
  };
}

