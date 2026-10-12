/**
 * Idempotent workforce provisioner.
 *
 * Behaviour contract (covered by unit and real-database tests):
 *  - Running the provisioner twice on the same store creates nothing the
 *    second time and writes nothing (every row reports `unchanged`).
 *  - A managed row whose stored projection drifted from the plan is updated;
 *    any other row is left alone.
 *  - A row the provisioner does not own (no `provisioning.managedBy` marker,
 *    or owned by another tenant) is reported as a conflict and never
 *    overwritten. Conflicts make the run fail.
 *  - Lifecycle `status` is never written on update. A new agent is created as
 *    `provisioned`; verification, not provisioning, promotes it.
 *  - `dryRun` performs every read and computes the full report with no writes.
 */

import { ALO_TENANT, AGENT_ID_PATTERN, MANAGED_BY, PROVISIONED_STATUS, WORKFORCE_PLAN_VERSION } from './constants';
import { canonicalJson, sha256Hex } from './canonical';
import type { AgentSpec, DepartmentSpec, WorkforcePlan } from './plan';

// ─── Store port ──────────────────────────────────────────────────────────────

/** Department row as the provisioner reads it. JSON columns are raw strings. */
export interface StoredDepartment {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  agentCount: number;
  sortOrder: number;
  status: string;
  companyId: string | null;
  runtimeProfile: string;
}

/** Agent row as the provisioner reads it, joined with its department slug. */
export interface StoredAgent {
  id: string;
  agentId: string;
  name: string;
  slug: string;
  departmentId: string;
  departmentSlug: string | null;
  departmentName: string;
  purpose: string;
  type: string;
  role: string;
  allowedSkills: string;
  forbiddenSkills: string;
  allowedTools: string;
  forbiddenTools: string;
  inputSchema: string;
  outputSchema: string;
  workflowSteps: string;
  protectionRules: string;
  approvalRules: string;
  handoffRules: string;
  qualityChecklist: string;
  selfImprovement: string;
  productivityRules: string;
  status: string;
  version: number;
  companyId: string | null;
  systemInstructions: string;
  runtimeProfile: string;
}

export interface DepartmentWrite {
  name: string;
  slug: string;
  description: string;
  agentCount: number;
  sortOrder: number;
  companyId: string;
  runtimeProfile: string;
}

export interface AgentWrite {
  agentId: string;
  name: string;
  slug: string;
  departmentId: string;
  departmentName: string;
  purpose: string;
  type: string;
  role: string;
  allowedSkills: string;
  forbiddenSkills: string;
  allowedTools: string;
  forbiddenTools: string;
  inputSchema: string;
  outputSchema: string;
  workflowSteps: string;
  protectionRules: string;
  approvalRules: string;
  handoffRules: string;
  qualityChecklist: string;
  selfImprovement: string;
  productivityRules: string;
  version: number;
  companyId: string;
  systemInstructions: string;
  runtimeProfile: string;
}

export interface WorkforceStore {
  findTenantId(slug: string): Promise<string | null>;
  createTenant(input: { slug: string; name: string }): Promise<string>;
  findDepartments(keys: { slugs: string[]; names: string[] }): Promise<StoredDepartment[]>;
  createDepartment(data: DepartmentWrite & { status: string }): Promise<string>;
  updateDepartment(id: string, data: Omit<DepartmentWrite, 'slug'>): Promise<void>;
  findAgents(keys: { agentIds: string[]; slugs: string[] }): Promise<StoredAgent[]>;
  createAgents(rows: Array<AgentWrite & { status: string }>): Promise<void>;
  updateAgent(id: string, data: Omit<AgentWrite, 'agentId'>): Promise<void>;
  /** Every department and agent row, for verification and orphan detection. */
  loadAll(): Promise<{ departments: StoredDepartment[]; agents: StoredAgent[] }>;
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ProvisionCounts {
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
}

export interface ProvisionConflict {
  entity: 'department' | 'agent';
  key: string;
  reason: string;
}

export interface ProvisionReport {
  planVersion: string;
  planHash: string;
  dryRun: boolean;
  tenant: { slug: string; created: boolean };
  departments: ProvisionCounts;
  agents: ProvisionCounts;
  conflicts: ProvisionConflict[];
  /** True only if no conflicts were found. */
  ok: boolean;
}

// ─── Projections ─────────────────────────────────────────────────────────────

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseProfile(value: string): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

/** Managed = carries the provisioner marker AND belongs to the ALO tenant. */
export function isManagedDepartment(row: Pick<StoredDepartment, 'runtimeProfile' | 'companyId'>, tenantId: string): boolean {
  const provisioning = parseProfile(row.runtimeProfile).provisioning as { managedBy?: string } | undefined;
  return provisioning?.managedBy === MANAGED_BY && row.companyId === tenantId;
}

export function isManagedAgent(row: Pick<StoredAgent, 'runtimeProfile' | 'companyId'>, tenantId: string): boolean {
  const provisioning = parseProfile(row.runtimeProfile).provisioning as { managedBy?: string } | undefined;
  return provisioning?.managedBy === MANAGED_BY && row.companyId === tenantId;
}

export function departmentWrite(spec: DepartmentSpec, tenantId: string): DepartmentWrite {
  const profile = {
    registryId: spec.registryId,
    code: spec.code,
    group: spec.group,
    orchestratorAgentId: spec.orchestratorAgentId,
    budgetLimit: spec.budgetLimit,
    allowedModels: spec.allowedModels,
    allowedProviders: spec.allowedProviders,
    permissions: spec.permissions,
    tools: spec.tools,
    knowledgeSources: spec.knowledgeSources,
    kpis: spec.kpis,
    sla: spec.sla,
    provisioning: {
      managedBy: MANAGED_BY,
      planVersion: WORKFORCE_PLAN_VERSION,
      sequence: spec.sequence,
    },
  };
  return {
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    agentCount: spec.agentCount,
    sortOrder: spec.sortOrder,
    companyId: tenantId,
    runtimeProfile: canonicalJson(profile),
  };
}

/** Agent write needs the department row id; `departmentId` is filled in by the caller. */
export function agentWrite(spec: AgentSpec, departmentId: string, tenantId: string): AgentWrite {
  const provisioning = { managedBy: MANAGED_BY, planVersion: WORKFORCE_PLAN_VERSION, sequence: spec.sequence };
  const profile = {
    modelConfig: spec.modelConfig,
    knowledgeAccess: spec.knowledgeAccess,
    memoryPolicy: spec.memoryPolicy,
    resourceLimits: spec.resourceLimits,
    taskQueue: spec.taskQueue,
    evaluationProfile: spec.evaluationProfile,
    roleKey: spec.roleKey,
    provisioning,
  };
  return {
    agentId: spec.agentId,
    name: spec.name,
    slug: spec.slug,
    departmentId,
    departmentName: spec.departmentName,
    purpose: spec.purpose,
    type: spec.type,
    role: spec.role,
    allowedSkills: canonicalJson(spec.allowedSkills),
    forbiddenSkills: canonicalJson(spec.forbiddenSkills),
    allowedTools: canonicalJson(spec.allowedTools),
    forbiddenTools: canonicalJson(spec.forbiddenTools),
    inputSchema: canonicalJson(spec.inputSchema),
    outputSchema: canonicalJson(spec.outputSchema),
    workflowSteps: canonicalJson(spec.workflowSteps),
    protectionRules: canonicalJson(spec.protectionRules),
    approvalRules: canonicalJson(spec.approvalRules),
    handoffRules: canonicalJson(spec.handoffRules),
    qualityChecklist: canonicalJson(spec.qualityChecklist),
    selfImprovement: canonicalJson(spec.selfImprovement),
    productivityRules: canonicalJson(spec.productivityRules),
    version: spec.version,
    companyId: tenantId,
    systemInstructions: spec.systemInstructions,
    runtimeProfile: canonicalJson(profile),
  };
}

/** Comparable projection of a stored department (no ids, no lifecycle status). */
export function departmentProjection(row: StoredDepartment | DepartmentWrite): string {
  return sha256Hex(
    canonicalJson({
      name: row.name,
      slug: row.slug,
      description: row.description ?? '',
      agentCount: row.agentCount,
      sortOrder: row.sortOrder,
      companyId: row.companyId ?? '',
      runtimeProfile: parseProfile(row.runtimeProfile),
    }),
  );
}

/** Comparable projection of an agent. Department is compared by slug, not id. */
export function agentProjection(row: AgentWrite | StoredAgent, departmentSlug: string): string {
  return sha256Hex(
    canonicalJson({
      agentId: row.agentId,
      name: row.name,
      slug: row.slug,
      departmentSlug,
      departmentName: row.departmentName,
      purpose: row.purpose,
      type: row.type,
      role: row.role,
      allowedSkills: parseJson(row.allowedSkills),
      forbiddenSkills: parseJson(row.forbiddenSkills),
      allowedTools: parseJson(row.allowedTools),
      forbiddenTools: parseJson(row.forbiddenTools),
      inputSchema: parseJson(row.inputSchema),
      outputSchema: parseJson(row.outputSchema),
      workflowSteps: parseJson(row.workflowSteps),
      protectionRules: parseJson(row.protectionRules),
      approvalRules: parseJson(row.approvalRules),
      handoffRules: parseJson(row.handoffRules),
      qualityChecklist: parseJson(row.qualityChecklist),
      selfImprovement: parseJson(row.selfImprovement),
      productivityRules: parseJson(row.productivityRules),
      version: row.version,
      companyId: row.companyId ?? '',
      systemInstructions: row.systemInstructions,
      runtimeProfile: parseProfile(row.runtimeProfile),
    }),
  );
}

// ─── Provisioner ─────────────────────────────────────────────────────────────

const CHUNK = 200;

function emptyCounts(): ProvisionCounts {
  return { created: 0, updated: 0, unchanged: 0, conflicts: 0 };
}

export async function provisionWorkforce(
  store: WorkforceStore,
  plan: WorkforcePlan,
  options: { dryRun?: boolean; tenant?: { slug: string; name: string } } = {},
): Promise<ProvisionReport> {
  const dryRun = options.dryRun === true;
  const tenant = options.tenant ?? ALO_TENANT;
  const conflicts: ProvisionConflict[] = [];
  const departments = emptyCounts();
  const agents = emptyCounts();

  // 1. Tenant. In dry-run we only look it up; a missing tenant is "would create".
  let tenantId = await store.findTenantId(tenant.slug);
  const tenantCreated = tenantId === null;
  if (tenantId === null && !dryRun) tenantId = await store.createTenant({ slug: tenant.slug, name: tenant.name });
  const tenantKey = tenantId ?? '__would_create__';

  // 2. Departments.
  const storedDepts = await store.findDepartments({
    slugs: plan.departments.map((d) => d.slug),
    names: plan.departments.map((d) => d.name),
  });
  const deptBySlug = new Map<string, StoredDepartment>();
  for (const row of storedDepts) deptBySlug.set(row.slug, row);
  const deptIdBySlug = new Map<string, string>();

  for (const spec of plan.departments) {
    const desired = departmentWrite(spec, tenantKey);
    const existing = deptBySlug.get(spec.slug);
    const nameClash = storedDepts.find((row) => row.name === spec.name && row.slug !== spec.slug);
    if (nameClash) {
      departments.conflicts++;
      conflicts.push({ entity: 'department', key: spec.slug, reason: `name "${spec.name}" already used by department ${nameClash.slug}` });
      continue;
    }
    if (!existing) {
      departments.created++;
      if (!dryRun) deptIdBySlug.set(spec.slug, await store.createDepartment({ ...desired, status: spec.status }));
      continue;
    }
    if (!tenantId || !isManagedDepartment(existing, tenantId)) {
      departments.conflicts++;
      conflicts.push({ entity: 'department', key: spec.slug, reason: 'existing department is not owned by the ALO workforce plan; refusing to overwrite' });
      deptIdBySlug.set(spec.slug, existing.id);
      continue;
    }
    deptIdBySlug.set(spec.slug, existing.id);
    if (departmentProjection(existing) === departmentProjection(desired)) {
      departments.unchanged++;
      continue;
    }
    departments.updated++;
    if (!dryRun) {
      const { slug: _slug, ...data } = desired;
      void _slug;
      await store.updateDepartment(existing.id, data);
    }
  }

  // 3. Agents.
  const storedAgents = await store.findAgents({
    agentIds: plan.agents.map((a) => a.agentId),
    slugs: plan.agents.map((a) => a.slug),
  });
  const agentByKey = new Map<string, StoredAgent>();
  for (const row of storedAgents) agentByKey.set(row.agentId, row);
  const bySlug = new Map<string, StoredAgent>();
  for (const row of storedAgents) bySlug.set(row.slug, row);

  const toCreate: Array<AgentWrite & { status: string }> = [];
  const toUpdate: Array<{ id: string; data: Omit<AgentWrite, 'agentId'> }> = [];

  for (const spec of plan.agents) {
    if (!AGENT_ID_PATTERN.test(spec.agentId)) {
      agents.conflicts++;
      conflicts.push({ entity: 'agent', key: spec.agentId, reason: 'agent business key does not match AGENT-NNNN' });
      continue;
    }
    const deptId = deptIdBySlug.get(spec.departmentSlug);
    const existing = agentByKey.get(spec.agentId);
    const slugClash = bySlug.get(spec.slug);
    if (slugClash && slugClash.agentId !== spec.agentId) {
      agents.conflicts++;
      conflicts.push({ entity: 'agent', key: spec.agentId, reason: `slug "${spec.slug}" already used by ${slugClash.agentId}` });
      continue;
    }
    if (!deptId) {
      // Dry-run for a department that does not exist yet: count as would-create.
      if (dryRun) {
        agents.created++;
        continue;
      }
      agents.conflicts++;
      conflicts.push({ entity: 'agent', key: spec.agentId, reason: `department ${spec.departmentSlug} is not available` });
      continue;
    }
    if (!existing) {
      agents.created++;
      if (!dryRun) toCreate.push({ ...agentWrite(spec, deptId, tenantKey), status: PROVISIONED_STATUS });
      continue;
    }
    if (!tenantId || !isManagedAgent(existing, tenantId)) {
      agents.conflicts++;
      conflicts.push({ entity: 'agent', key: spec.agentId, reason: 'existing agent is not owned by the ALO workforce plan; refusing to overwrite' });
      continue;
    }
    const desired = agentWrite(spec, deptId, tenantKey);
    // Stored side uses the department slug joined from the database, so a row
    // attached to the wrong department is detected as drift.
    if (agentProjection(existing, existing.departmentSlug ?? '') === agentProjection(desired, spec.departmentSlug)) {
      agents.unchanged++;
      continue;
    }
    agents.updated++;
    if (!dryRun) {
      const { agentId: _agentId, ...data } = desired;
      void _agentId;
      toUpdate.push({ id: existing.id, data });
    }
  }

  if (!dryRun) {
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await store.createAgents(toCreate.slice(i, i + CHUNK));
    }
    for (const update of toUpdate) await store.updateAgent(update.id, update.data);
  }

  const conflictTotal = departments.conflicts + agents.conflicts;
  return {
    planVersion: plan.planVersion,
    planHash: plan.planHash,
    dryRun,
    tenant: { slug: tenant.slug, created: tenantCreated },
    departments,
    agents,
    conflicts,
    ok: conflictTotal === 0,
  };
}
