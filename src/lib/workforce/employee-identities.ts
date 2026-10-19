import { ALO_TENANT, DEPARTMENT_COUNT, MANAGED_BY, PRIMARY_AGENT_COUNT, WORKFORCE_PLAN_VERSION } from './constants';
import { canonicalJson, sha256Hex } from './canonical';
import { SENSITIVE_ACTIONS, type AgentRoleKey, type ModelPolicy } from './roles';
import type { AgentSpec } from './plan';

export const AI_EMPLOYEE_STATUSES = ['provisioned', 'tested', 'active', 'suspended', 'retired'] as const;
export type AIEmployeeStatus = (typeof AI_EMPLOYEE_STATUSES)[number];
export const AI_EMPLOYEE_MANAGED_BY = 'workforce-plan';

export interface AIEmployeeSpec {
  sequence: number;
  employeeKey: string;
  agentKey: string;
  departmentSlug: string;
  departmentName: string;
  roleKey: AgentRoleKey;
  title: string;
  responsibilities: string;
  modelPolicy: ModelPolicy;
  allowedTools: string[];
  permissionProfile: Record<string, unknown>;
  memoryScope: Record<string, unknown>;
  resourceLimits: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  supervisorEmployeeKey: string | null;
  configurationHash: string;
  status: 'provisioned';
  managedBy: typeof AI_EMPLOYEE_MANAGED_BY;
  planVersion: typeof WORKFORCE_PLAN_VERSION;
}

export function aiEmployeeBusinessKey(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > PRIMARY_AGENT_COUNT) {
    throw new RangeError(`AI employee sequence must be between 1 and ${PRIMARY_AGENT_COUNT}`);
  }
  return `AIEMP-${String(sequence).padStart(4, '0')}`;
}

/**
 * Build one employee identity per existing planned agent. Identities are role
 * records, not model processes: no model is pinned and all task work uses the
 * shared AgentOS execution pool.
 */
export function buildAIEmployeePlan(agents: readonly AgentSpec[]): AIEmployeeSpec[] {
  if (agents.length !== PRIMARY_AGENT_COUNT) {
    throw new Error(`AI employee plan requires ${PRIMARY_AGENT_COUNT} planned agents, received ${agents.length}`);
  }

  const seenAgentKeys = new Set<string>();
  const seenSequences = new Set<number>();
  const directorByDepartment = new Map<string, AgentSpec>();
  const agentsByDepartment = new Map<string, AgentSpec[]>();

  for (const agent of agents) {
    if (seenAgentKeys.has(agent.agentId)) throw new Error(`duplicate agent identity ${agent.agentId}`);
    if (seenSequences.has(agent.sequence)) throw new Error(`duplicate agent sequence ${agent.sequence}`);
    seenAgentKeys.add(agent.agentId);
    seenSequences.add(agent.sequence);
    const rows = agentsByDepartment.get(agent.departmentSlug) ?? [];
    rows.push(agent);
    agentsByDepartment.set(agent.departmentSlug, rows);
    if (agent.roleKey === 'director') {
      if (directorByDepartment.has(agent.departmentSlug)) throw new Error(`duplicate department director: ${agent.departmentSlug}`);
      directorByDepartment.set(agent.departmentSlug, agent);
    }
  }

  if (agentsByDepartment.size !== DEPARTMENT_COUNT) {
    throw new Error(`AI employee plan requires ${DEPARTMENT_COUNT} departments, received ${agentsByDepartment.size}`);
  }
  for (const [departmentSlug, rows] of agentsByDepartment) {
    if (rows.length !== 20) throw new Error(`department ${departmentSlug} must have exactly 20 role identities`);
    if (!directorByDepartment.has(departmentSlug)) throw new Error(`department ${departmentSlug} has no director identity`);
  }

  const specs = [...agents].sort((a, b) => a.sequence - b.sequence).map((agent): AIEmployeeSpec => {
    const director = directorByDepartment.get(agent.departmentSlug)!;
    const employeeKey = aiEmployeeBusinessKey(agent.sequence);
    const body = {
      employeeKey,
      agentKey: agent.agentId,
      departmentSlug: agent.departmentSlug,
      departmentName: agent.departmentName,
      roleKey: agent.roleKey,
      title: agent.name,
      responsibilities: agent.purpose,
      modelPolicy: agent.modelConfig.policy,
      allowedTools: [...agent.allowedTools],
      permissionProfile: {
        tenant: ALO_TENANT.slug,
        departmentSlug: agent.departmentSlug,
        allowedTools: [...agent.allowedTools],
        forbiddenTools: [...agent.forbiddenTools],
        allowedSkills: [...agent.allowedSkills],
        forbiddenSkills: [...agent.forbiddenSkills],
        sensitiveActionsRequireHumanApproval: [...SENSITIVE_ACTIONS],
        mayChangeOwnPermissions: false,
        maySelectUnapprovedModels: false,
      },
      memoryScope: {
        knowledge: agent.knowledgeAccess,
        memory: agent.memoryPolicy,
      },
      resourceLimits: agent.resourceLimits,
      approvalPolicy: {
        approvalRules: agent.approvalRules,
        handoffRules: agent.handoffRules,
        qualityChecklist: agent.qualityChecklist,
        evaluationProfile: agent.evaluationProfile,
      },
      supervisorEmployeeKey: agent.roleKey === 'director' ? null : aiEmployeeBusinessKey(director.sequence),
      managedBy: AI_EMPLOYEE_MANAGED_BY as AIEmployeeSpec['managedBy'],
      planVersion: WORKFORCE_PLAN_VERSION as AIEmployeeSpec['planVersion'],
    };
    return {
      sequence: agent.sequence,
      ...body,
      configurationHash: sha256Hex(canonicalJson(body)),
      status: 'provisioned',
    };
  });

  if (new Set(specs.map((spec) => spec.employeeKey)).size !== PRIMARY_AGENT_COUNT) {
    throw new Error('AI employee business keys are not unique');
  }
  return specs;
}

export interface AIEmployeeAgentRecord {
  id: string;
  agentKey: string;
  companyId: string | null;
  departmentId: string;
  departmentSlug: string | null;
  departmentCompanyId: string | null;
  runtimeProfile: string;
}

export interface StoredAIEmployeeIdentity {
  id: string;
  employeeKey: string;
  companyId: string;
  departmentId: string;
  agentDbId: string;
  status: string;
  managedBy: string | null;
  configurationHash: string;
}

export interface AIEmployeeWrite {
  employeeKey: string;
  companyId: string;
  departmentId: string;
  agentDbId: string;
  roleKey: string;
  title: string;
  responsibilities: string;
  modelPolicy: string;
  allowedTools: string;
  permissionProfile: string;
  memoryScope: string;
  resourceLimits: string;
  approvalPolicy: string;
  managedBy: string;
  planVersion: string;
  configurationHash: string;
  supervisorEmployeeKey: string | null;
  createdBy: string;
  updatedBy: string;
}

export interface AIEmployeeVerificationRecord {
  id: string;
  employeeKey: string;
  companyId: string;
  departmentId: string;
  agentDbId: string;
  roleKey: string;
  title: string;
  status: string;
  managedBy: string | null;
  planVersion: string | null;
  configurationHash: string;
  supervisorEmployeeKey: string | null;
  lastVerifiedAt: Date | null;
  lastVerificationExecutionId: string | null;
  agentKey: string | null;
  agentCompanyId: string | null;
  agentDepartmentId: string | null;
  agentDepartmentSlug: string | null;
  agentDepartmentCompanyId: string | null;
  agentManagedBy: string | null;
  executionEvidenceValid: boolean;
}

export interface AIEmployeeStore {
  findAgents(companyId: string, agentKeys: string[]): Promise<AIEmployeeAgentRecord[]>;
  findEmployees(companyId: string, employeeKeys: string[], agentDbIds: string[]): Promise<StoredAIEmployeeIdentity[]>;
  listEmployees(companyId: string): Promise<AIEmployeeVerificationRecord[]>;
  applyChanges(input: {
    companyId: string;
    actorUserId: string;
    create: AIEmployeeWrite[];
    update: Array<{ id: string; data: Omit<AIEmployeeWrite, 'employeeKey' | 'companyId' | 'agentDbId' | 'createdBy'> }>;
  }): Promise<void>;
}

export interface AIEmployeeProvisionConflict {
  key: string;
  reason: string;
}

export interface AIEmployeeVerificationCheck {
  name: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
}

export interface AIEmployeeVerificationReport {
  ok: boolean;
  companyId: string;
  planHash: string;
  checks: AIEmployeeVerificationCheck[];
  counts: {
    identities: number;
    active: number;
    tested: number;
    provisioned: number;
    suspended: number;
    retired: number;
    missing: number;
    orphaned: number;
    invalidExecutionEvidence: number;
  };
}

export function verifyAIEmployeeIdentities(
  specs: readonly AIEmployeeSpec[],
  rows: readonly AIEmployeeVerificationRecord[],
  companyId: string,
): AIEmployeeVerificationReport {
  const checks: AIEmployeeVerificationCheck[] = [];
  const check = (name: string, pass: boolean, expected: unknown, actual: unknown) => checks.push({ name, pass, expected, actual });
  const planHash = sha256Hex(canonicalJson(specs.map(({ sequence: _sequence, ...spec }) => spec)));
  const byKey = new Map<string, AIEmployeeVerificationRecord>();
  let duplicateKeys = 0;
  let duplicateAgents = 0;
  const seenAgents = new Set<string>();
  for (const row of rows) {
    if (byKey.has(row.employeeKey)) duplicateKeys++;
    else byKey.set(row.employeeKey, row);
    if (seenAgents.has(row.agentDbId)) duplicateAgents++;
    seenAgents.add(row.agentDbId);
  }

  const expectedKeys = new Set(specs.map((spec) => spec.employeeKey));
  const missingSpecs = specs.filter((spec) => !byKey.has(spec.employeeKey));
  const orphans = rows.filter((row) => !expectedKeys.has(row.employeeKey));
  const supervisorMissing: string[] = [];
  let configurationDrift = 0;
  let tenantMismatches = 0;
  let assignmentMismatches = 0;
  let invalidStatuses = 0;
  let invalidExecutionEvidence = 0;

  const specByKey = new Map(specs.map((spec) => [spec.employeeKey, spec]));
  for (const row of rows) {
    const spec = specByKey.get(row.employeeKey);
    if (!spec) continue;
    if (row.companyId !== companyId || row.agentCompanyId !== companyId || row.agentDepartmentCompanyId !== companyId || row.agentManagedBy !== MANAGED_BY) tenantMismatches++;
    if (row.agentKey !== spec.agentKey || row.agentDepartmentId !== row.departmentId || row.agentDepartmentSlug !== spec.departmentSlug) assignmentMismatches++;
    if (row.managedBy !== AI_EMPLOYEE_MANAGED_BY || row.planVersion !== WORKFORCE_PLAN_VERSION || row.configurationHash !== spec.configurationHash) configurationDrift++;
    if (!AI_EMPLOYEE_STATUSES.includes(row.status as AIEmployeeStatus)) invalidStatuses++;
    if (row.supervisorEmployeeKey !== spec.supervisorEmployeeKey) configurationDrift++;
    if (row.supervisorEmployeeKey && !byKey.has(row.supervisorEmployeeKey)) supervisorMissing.push(row.employeeKey);
    if ((row.status === 'tested' || row.status === 'active') && (!row.lastVerifiedAt || !row.lastVerificationExecutionId || !row.executionEvidenceValid)) {
      invalidExecutionEvidence++;
    }
  }

  check('employee.count', rows.length === PRIMARY_AGENT_COUNT, PRIMARY_AGENT_COUNT, rows.length);
  check('employee.keys.unique', duplicateKeys === 0, 0, duplicateKeys);
  check('employee.agents.unique', duplicateAgents === 0, 0, duplicateAgents);
  check('employee.plan_coverage', missingSpecs.length === 0, 0, missingSpecs.length);
  check('employee.no_orphans', orphans.length === 0, 0, orphans.length);
  check('employee.tenant_isolation', tenantMismatches === 0, 0, tenantMismatches);
  check('employee.agent_assignment', assignmentMismatches === 0, 0, assignmentMismatches);
  check('employee.configuration', configurationDrift === 0, 0, configurationDrift);
  check('employee.supervisors', supervisorMissing.length === 0, 0, supervisorMissing.length);
  check('employee.status_values', invalidStatuses === 0, 0, invalidStatuses);
  check('employee.execution_evidence', invalidExecutionEvidence === 0, 0, invalidExecutionEvidence);

  const counts = {
    identities: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    tested: rows.filter((row) => row.status === 'tested').length,
    provisioned: rows.filter((row) => row.status === 'provisioned').length,
    suspended: rows.filter((row) => row.status === 'suspended').length,
    retired: rows.filter((row) => row.status === 'retired').length,
    missing: missingSpecs.length,
    orphaned: orphans.length,
    invalidExecutionEvidence,
  };
  return { ok: checks.every((item) => item.pass), companyId, planHash, checks, counts };
}

export interface AIEmployeeProvisionReport {
  companyId: string;
  planVersion: string;
  planHash: string;
  dryRun: boolean;
  employees: { created: number; updated: number; unchanged: number; conflicts: number };
  conflicts: AIEmployeeProvisionConflict[];
  ok: boolean;
}

function parseManagedBy(runtimeProfile: string): string | null {
  try {
    const parsed: unknown = JSON.parse(runtimeProfile);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const provisioning = (parsed as Record<string, unknown>).provisioning;
    if (!provisioning || typeof provisioning !== 'object' || Array.isArray(provisioning)) return null;
    const managedBy = (provisioning as Record<string, unknown>).managedBy;
    return typeof managedBy === 'string' ? managedBy : null;
  } catch {
    return null;
  }
}

function writeFor(spec: AIEmployeeSpec, agent: AIEmployeeAgentRecord, companyId: string, actorUserId: string): AIEmployeeWrite {
  return {
    employeeKey: spec.employeeKey,
    companyId,
    departmentId: agent.departmentId,
    agentDbId: agent.id,
    roleKey: spec.roleKey,
    title: spec.title,
    responsibilities: spec.responsibilities,
    modelPolicy: spec.modelPolicy,
    allowedTools: canonicalJson(spec.allowedTools),
    permissionProfile: canonicalJson(spec.permissionProfile),
    memoryScope: canonicalJson(spec.memoryScope),
    resourceLimits: canonicalJson(spec.resourceLimits),
    approvalPolicy: canonicalJson(spec.approvalPolicy),
    managedBy: AI_EMPLOYEE_MANAGED_BY,
    planVersion: spec.planVersion,
    configurationHash: spec.configurationHash,
    supervisorEmployeeKey: spec.supervisorEmployeeKey,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  };
}

/**
 * Idempotent, additive identity provisioning. It never creates or edits agents,
 * never overwrites an unmanaged employee row, and never promotes lifecycle
 * status. Any conflict aborts the complete write batch.
 */
export async function provisionAIEmployeeIdentities(
  store: AIEmployeeStore,
  companyId: string,
  specs: readonly AIEmployeeSpec[],
  options: { dryRun?: boolean; actorUserId?: string } = {},
): Promise<AIEmployeeProvisionReport> {
  if (!companyId.trim()) throw new Error('companyId is required');
  if (specs.length !== PRIMARY_AGENT_COUNT) throw new Error(`expected ${PRIMARY_AGENT_COUNT} employee identities, received ${specs.length}`);

  const dryRun = options.dryRun === true;
  const actorUserId = options.actorUserId ?? 'system:ai-employee-provisioner';
  const planHash = sha256Hex(canonicalJson(specs.map(({ sequence: _sequence, ...spec }) => spec)));
  const employees = { created: 0, updated: 0, unchanged: 0, conflicts: 0 };
  const conflicts: AIEmployeeProvisionConflict[] = [];
  const employeeKeys = specs.map((spec) => spec.employeeKey);
  const agentKeys = specs.map((spec) => spec.agentKey);

  if (new Set(employeeKeys).size !== specs.length) throw new Error('duplicate employee keys in plan');
  if (new Set(agentKeys).size !== specs.length) throw new Error('duplicate agent keys in employee plan');

  const agentRows = await store.findAgents(companyId, agentKeys);
  const agentsByKey = new Map(agentRows.map((agent) => [agent.agentKey, agent]));
  const validAgents = new Map<string, AIEmployeeAgentRecord>();
  for (const spec of specs) {
    const agent = agentsByKey.get(spec.agentKey);
    if (!agent) {
      conflicts.push({ key: spec.employeeKey, reason: `managed agent ${spec.agentKey} is not provisioned for this tenant` });
      continue;
    }
    if (agent.companyId !== companyId || agent.departmentCompanyId !== companyId) {
      conflicts.push({ key: spec.employeeKey, reason: 'agent or department is not owned by the requested tenant' });
      continue;
    }
    if (agent.departmentSlug !== spec.departmentSlug) {
      conflicts.push({ key: spec.employeeKey, reason: `agent is assigned to ${agent.departmentSlug ?? 'an unknown department'}, expected ${spec.departmentSlug}` });
      continue;
    }
    if (parseManagedBy(agent.runtimeProfile) !== MANAGED_BY) {
      conflicts.push({ key: spec.employeeKey, reason: 'agent is not managed by the verified workforce plan' });
      continue;
    }
    validAgents.set(spec.agentKey, agent);
  }

  const agentDbIds = [...validAgents.values()].map((agent) => agent.id);
  const existingRows = await store.findEmployees(companyId, employeeKeys, agentDbIds);
  const byEmployeeKey = new Map<string, StoredAIEmployeeIdentity>();
  const byAgentDbId = new Map<string, StoredAIEmployeeIdentity>();
  for (const row of existingRows) {
    if (row.companyId !== companyId) {
      conflicts.push({ key: row.employeeKey, reason: 'employee identity query returned a foreign-tenant row' });
      continue;
    }
    if (byEmployeeKey.has(row.employeeKey) && byEmployeeKey.get(row.employeeKey)?.id !== row.id) {
      conflicts.push({ key: row.employeeKey, reason: 'duplicate employee identity key in tenant' });
      continue;
    }
    byEmployeeKey.set(row.employeeKey, row);
    byAgentDbId.set(row.agentDbId, row);
  }

  const create: AIEmployeeWrite[] = [];
  const update: Array<{ id: string; data: Omit<AIEmployeeWrite, 'employeeKey' | 'companyId' | 'agentDbId' | 'createdBy'> }> = [];
  for (const spec of specs) {
    const agent = validAgents.get(spec.agentKey);
    if (!agent) continue;
    const existing = byEmployeeKey.get(spec.employeeKey);
    const agentIdentity = byAgentDbId.get(agent.id);
    if (!existing) {
      if (agentIdentity) {
        conflicts.push({ key: spec.employeeKey, reason: `agent ${spec.agentKey} is already assigned to employee ${agentIdentity.employeeKey}` });
        continue;
      }
      employees.created++;
      create.push(writeFor(spec, agent, companyId, actorUserId));
      continue;
    }
    if (existing.agentDbId !== agent.id) {
      conflicts.push({ key: spec.employeeKey, reason: `employee key already points to a different agent (${existing.agentDbId})` });
      continue;
    }
    if (existing.managedBy !== AI_EMPLOYEE_MANAGED_BY) {
      conflicts.push({ key: spec.employeeKey, reason: 'existing identity is not managed by the workforce plan; refusing to overwrite' });
      continue;
    }
    if (existing.configurationHash === spec.configurationHash && existing.departmentId === agent.departmentId) {
      employees.unchanged++;
      continue;
    }
    employees.updated++;
    const { employeeKey: _employeeKey, companyId: _companyId, agentDbId: _agentDbId, createdBy: _createdBy, ...data } = writeFor(spec, agent, companyId, actorUserId);
    void _employeeKey; void _companyId; void _agentDbId; void _createdBy;
    update.push({ id: existing.id, data });
  }

  employees.conflicts = conflicts.length;
  if (conflicts.length > 0) {
    employees.created = 0;
    employees.updated = 0;
    return { companyId, planVersion: WORKFORCE_PLAN_VERSION, planHash, dryRun, employees, conflicts, ok: false };
  }

  if (!dryRun && (create.length > 0 || update.length > 0)) {
    await store.applyChanges({ companyId, actorUserId, create, update });
  }

  return { companyId, planVersion: WORKFORCE_PLAN_VERSION, planHash, dryRun, employees, conflicts, ok: true };
}
