// @vitest-environment node
/**
 * Workforce plan, provisioner and verifier — behaviour tests against an
 * in-memory store that implements the same port as the Prisma adapter.
 * Real-database behaviour is covered by __tests__/integration/workforce-provisioning.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { getDepartmentRegistry } from '@/lib/department-registry';
import type { DepartmentConfig } from '@/lib/department-registry/types';
import {
  AGENTS_PER_DEPARTMENT,
  ALO_TENANT,
  DEPARTMENT_COUNT,
  MANAGED_BY,
  PRIMARY_AGENT_COUNT,
  agentBusinessKey,
} from '@/lib/workforce/constants';
import { AGENT_ROLE_VALUES, GLOBALLY_FORBIDDEN_TOOLS, ROLE_CATALOG, SENSITIVE_ACTIONS } from '@/lib/workforce/roles';
import { approvedToolsFor, buildWorkforcePlan, type WorkforcePlan } from '@/lib/workforce/plan';
import {
  provisionWorkforce,
  type AgentWrite,
  type DepartmentWrite,
  type StoredAgent,
  type StoredDepartment,
  type WorkforceStore,
} from '@/lib/workforce/provision';
import { verifyWorkforce } from '@/lib/workforce/verify';

const registry = getDepartmentRegistry().getAllDepartments();
const plan = buildWorkforcePlan(registry);

// ─── In-memory store ─────────────────────────────────────────────────────────

class MemoryStore implements WorkforceStore {
  tenants = new Map<string, { id: string; slug: string }>();
  depts = new Map<string, StoredDepartment>();
  agents = new Map<string, StoredAgent>();
  writes = 0;
  private seq = 0;

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  async findTenantId(slug: string) {
    return this.tenants.get(slug)?.id ?? null;
  }
  async createTenant({ slug }: { slug: string; name: string }) {
    this.writes++;
    const id = this.nextId('co');
    this.tenants.set(slug, { id, slug });
    return id;
  }
  async findDepartments({ slugs, names }: { slugs: string[]; names: string[] }) {
    return [...this.depts.values()].filter((d) => slugs.includes(d.slug) || names.includes(d.name));
  }
  async createDepartment(data: DepartmentWrite & { status: string }) {
    this.writes++;
    const id = this.nextId('dept');
    this.depts.set(id, { id, status: data.status, ...toDeptRow(data) });
    return id;
  }
  async updateDepartment(id: string, data: Omit<DepartmentWrite, 'slug'>) {
    this.writes++;
    const existing = this.depts.get(id)!;
    this.depts.set(id, { ...existing, ...toDeptRow({ ...data, slug: existing.slug }) });
  }
  async findAgents({ agentIds, slugs }: { agentIds: string[]; slugs: string[] }) {
    return [...this.agents.values()].filter((a) => agentIds.includes(a.agentId) || slugs.includes(a.slug));
  }
  async createAgents(rows: Array<AgentWrite & { status: string }>) {
    for (const row of rows) {
      this.writes++;
      const id = this.nextId('agent');
      const { status, ...write } = row;
      this.agents.set(id, this.toStored(id, write, status));
    }
  }
  async updateAgent(id: string, data: Omit<AgentWrite, 'agentId'>) {
    this.writes++;
    const existing = this.agents.get(id)!;
    this.agents.set(id, this.toStored(id, { ...data, agentId: existing.agentId }, existing.status));
  }
  async loadAll() {
    return { departments: [...this.depts.values()], agents: [...this.agents.values()] };
  }

  /** Test helper: direct write that bypasses provisioning. */
  seedAgent(row: Partial<StoredAgent> & { agentId: string; slug: string }) {
    const id = this.nextId('agent');
    this.agents.set(id, { ...this.blankAgent(id), ...row });
    return id;
  }

  private blankAgent(id: string): StoredAgent {
    return {
      id, agentId: '', name: '', slug: '', departmentId: '', departmentSlug: null, departmentName: '',
      purpose: '', type: '', role: '', allowedSkills: '[]', forbiddenSkills: '[]', allowedTools: '[]',
      forbiddenTools: '[]', inputSchema: '{}', outputSchema: '{}', workflowSteps: '[]', protectionRules: '[]',
      approvalRules: '[]', handoffRules: '[]', qualityChecklist: '[]', selfImprovement: '{}',
      productivityRules: '{}', status: 'provisioned', version: 1, companyId: null, systemInstructions: '',
      runtimeProfile: '{}',
    };
  }

  private toStored(id: string, write: AgentWrite, status: string): StoredAgent {
    const deptSlug = [...this.depts.values()].find((d) => d.id === write.departmentId)?.slug ?? null;
    return { ...this.blankAgent(id), ...write, id, status, departmentSlug: deptSlug };
  }
}

function toDeptRow(data: DepartmentWrite) {
  return {
    name: data.name,
    slug: data.slug,
    description: data.description,
    agentCount: data.agentCount,
    sortOrder: data.sortOrder,
    companyId: data.companyId,
    runtimeProfile: data.runtimeProfile,
  };
}

function storedRowsFor(store: MemoryStore) {
  return { departments: [...store.depts.values()], agents: [...store.agents.values()] };
}

async function provisionedStore() {
  const store = new MemoryStore();
  const report = await provisionWorkforce(store, plan);
  return { store, report };
}

function tenantId(store: MemoryStore): string {
  return store.tenants.get(ALO_TENANT.slug)!.id;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

describe('workforce plan — shape and identity', () => {
  it('registry supplies exactly 100 departments with unique codes, ids and names', () => {
    expect(registry).toHaveLength(DEPARTMENT_COUNT);
    expect(new Set(registry.map((d) => d.departmentCode)).size).toBe(DEPARTMENT_COUNT);
    expect(new Set(registry.map((d) => d.departmentId)).size).toBe(DEPARTMENT_COUNT);
    expect(new Set(registry.map((d) => d.departmentName)).size).toBe(DEPARTMENT_COUNT);
  });

  it('registry per-department quotas sum to exactly 2,000 primary agents', () => {
    const total = registry.reduce((sum, d) => sum + d.agentCount, 0);
    expect(total).toBe(PRIMARY_AGENT_COUNT);
    expect(registry.every((d) => d.agentCount === AGENTS_PER_DEPARTMENT)).toBe(true);
  });

  it('produces 100 department specs and 2,000 agent specs', () => {
    expect(plan.departments).toHaveLength(DEPARTMENT_COUNT);
    expect(plan.agents).toHaveLength(PRIMARY_AGENT_COUNT);
  });

  it('assigns AGENT-0001 … AGENT-2000 exactly once each', () => {
    const keys = plan.agents.map((a) => a.agentId);
    expect(new Set(keys).size).toBe(PRIMARY_AGENT_COUNT);
    expect(keys[0]).toBe('AGENT-0001');
    expect(keys[PRIMARY_AGENT_COUNT - 1]).toBe('AGENT-2000');
    expect(keys.every((k) => /^AGENT-\d{4}$/.test(k))).toBe(true);
  });

  it('gives every department exactly 20 agents in a contiguous block', () => {
    plan.departments.forEach((dept, index) => {
      const agents = plan.agents.filter((a) => a.departmentSlug === dept.slug);
      expect(agents).toHaveLength(AGENTS_PER_DEPARTMENT);
      const seqs = agents.map((a) => a.sequence).sort((a, b) => a - b);
      expect(seqs[0]).toBe(index * AGENTS_PER_DEPARTMENT + 1);
      expect(seqs[AGENTS_PER_DEPARTMENT - 1]).toBe((index + 1) * AGENTS_PER_DEPARTMENT);
    });
  });

  it('uses unique department slugs and unique agent slugs', () => {
    expect(new Set(plan.departments.map((d) => d.slug)).size).toBe(DEPARTMENT_COUNT);
    expect(new Set(plan.agents.map((a) => a.slug)).size).toBe(PRIMARY_AGENT_COUNT);
  });

  it('is deterministic: identical input gives an identical plan hash', () => {
    expect(buildWorkforcePlan(registry).planHash).toBe(plan.planHash);
  });

  it('changes the plan hash when any configured field changes', () => {
    const mutated: DepartmentConfig[] = registry.map((d, i) =>
      i === 0 ? { ...d, description: `${d.description} (changed)` } : d,
    );
    expect(buildWorkforcePlan(mutated).planHash).not.toBe(plan.planHash);
  });

  it('is fail-closed: refuses a registry that is not exactly 100 departments', () => {
    expect(() => buildWorkforcePlan(registry.slice(0, 99))).toThrow(/exactly 100/);
  });

  it('is fail-closed: refuses duplicate department codes', () => {
    const dup = registry.map((d, i) => (i === 1 ? { ...d, departmentCode: registry[0].departmentCode } : d));
    expect(() => buildWorkforcePlan(dup)).toThrow(/duplicate department codes/);
  });

  it('gives each department a director orchestrator that is one of its own agents', () => {
    for (const dept of plan.departments) {
      const orchestrator = plan.agents.find((a) => a.agentId === dept.orchestratorAgentId);
      expect(orchestrator?.departmentSlug).toBe(dept.slug);
      expect(orchestrator?.roleKey).toBe('director');
    }
  });

  it('keeps the role catalog at exactly 20 roles, each with a valid Agent.role value', () => {
    expect(ROLE_CATALOG).toHaveLength(AGENTS_PER_DEPARTMENT);
    expect(new Set(ROLE_CATALOG.map((r) => r.key)).size).toBe(AGENTS_PER_DEPARTMENT);
    for (const role of ROLE_CATALOG) expect(AGENT_ROLE_VALUES).toContain(role.role);
  });
});

describe('workforce plan — per-agent configuration', () => {
  it('gives every agent every required configuration field, non-empty', () => {
    for (const agent of plan.agents) {
      expect(agent.name.trim()).not.toBe('');
      expect(agent.purpose.trim()).not.toBe('');
      expect(agent.systemInstructions.trim()).not.toBe('');
      expect(agent.allowedSkills.length).toBeGreaterThan(0);
      expect(agent.allowedTools.length).toBeGreaterThan(0);
      expect(agent.modelConfig.policy).toBeTruthy();
      expect(agent.knowledgeAccess.scope).toBe(`department:${agent.departmentSlug}`);
      expect(agent.memoryPolicy.profile).toBeTruthy();
      expect(agent.resourceLimits.maxTokensPerTask).toBeGreaterThan(0);
      expect(agent.taskQueue.partitionKey).toBe(`agent:${agent.agentId}`);
      expect(agent.evaluationProfile.suiteId).toMatch(/^role:/);
      expect(agent.version).toBe(1);
    }
  });

  it('never pins a concrete model; the router resolves models at run time', () => {
    expect(plan.agents.every((a) => a.modelConfig.pinnedModel === null)).toBe(true);
  });

  it('provisions every agent as "provisioned" — never "active" before execution verification', () => {
    expect(plan.agents.every((a) => a.status === 'provisioned')).toBe(true);
  });

  it('grants only department-owned tools and never a globally forbidden tool', () => {
    const deptTools = new Map(plan.departments.map((d) => [d.slug, d.tools]));
    for (const agent of plan.agents) {
      const owned = deptTools.get(agent.departmentSlug)!;
      expect(agent.allowedTools.every((t) => owned.includes(t))).toBe(true);
      expect(agent.allowedTools.some((t) => agent.forbiddenTools.includes(t))).toBe(false);
      for (const forbidden of GLOBALLY_FORBIDDEN_TOOLS) expect(agent.forbiddenTools).toContain(forbidden);
    }
  });

  it('scopes knowledge to the agent\'s own department and never cross-department', () => {
    for (const agent of plan.agents) {
      expect(agent.knowledgeAccess.departmentSlug).toBe(agent.departmentSlug);
      expect(agent.knowledgeAccess.crossDepartment).toBe(false);
    }
  });

  it('anchors system instructions to the tenant and the department', () => {
    for (const agent of plan.agents.slice(0, 50)) {
      expect(agent.systemInstructions).toContain(`"${ALO_TENANT.slug}"`);
      expect(agent.systemInstructions).toContain(`"${agent.departmentSlug}"`);
    }
  });

  it('requires human approval for every sensitive action class', () => {
    for (const agent of plan.agents) {
      for (const action of SENSITIVE_ACTIONS) expect(agent.approvalRules).toContain(action);
    }
  });

  it('approvedToolsFor never returns a tool outside the department and falls back when the category is empty', () => {
    const role = ROLE_CATALOG.find((r) => r.toolCategory === 'communication')!;
    expect(approvedToolsFor(['analytics'], role)).toEqual(['analytics']);
    expect(approvedToolsFor(['email', 'crm', 'database'], role)).toEqual(['email', 'crm']);
    const all = ROLE_CATALOG.find((r) => r.toolCategory === 'all')!;
    expect(approvedToolsFor(['a', 'b'], all)).toEqual(['a', 'b']);
  });

  it('plans agent numbering exactly as agentBusinessKey', () => {
    expect(plan.agents[41].agentId).toBe(agentBusinessKey(42));
    expect(() => agentBusinessKey(0)).toThrow(RangeError);
    expect(() => agentBusinessKey(2001)).toThrow(RangeError);
  });
});

// ─── Provisioner ─────────────────────────────────────────────────────────────

describe('workforce provisioner (in-memory store)', () => {
  it('creates the tenant, 100 departments and 2,000 agents on first run', async () => {
    const { store, report } = await provisionedStore();
    expect(report.ok).toBe(true);
    expect(report.tenant.created).toBe(true);
    expect(report.departments).toEqual({ created: DEPARTMENT_COUNT, updated: 0, unchanged: 0, conflicts: 0 });
    expect(report.agents).toEqual({ created: PRIMARY_AGENT_COUNT, updated: 0, unchanged: 0, conflicts: 0 });
    expect(store.depts.size).toBe(DEPARTMENT_COUNT);
    expect(store.agents.size).toBe(PRIMARY_AGENT_COUNT);
  });

  it('is idempotent: a second run creates, updates and writes nothing', async () => {
    const { store } = await provisionedStore();
    const writesBefore = store.writes;
    const report = await provisionWorkforce(store, plan);
    expect(report.ok).toBe(true);
    expect(report.departments).toEqual({ created: 0, updated: 0, unchanged: DEPARTMENT_COUNT, conflicts: 0 });
    expect(report.agents).toEqual({ created: 0, updated: 0, unchanged: PRIMARY_AGENT_COUNT, conflicts: 0 });
    expect(report.tenant.created).toBe(false);
    expect(store.writes).toBe(writesBefore);
  });

  it('dry-run reports the same planned counts and performs no writes', async () => {
    const store = new MemoryStore();
    const report = await provisionWorkforce(store, plan, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.departments.created).toBe(DEPARTMENT_COUNT);
    expect(report.agents.created).toBe(PRIMARY_AGENT_COUNT);
    expect(store.writes).toBe(0);
    expect(store.agents.size).toBe(0);
  });

  it('updates exactly the managed rows that drifted, and nothing else', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0777')!;
    store.agents.set(target.id, { ...target, purpose: 'TAMPERED' });
    const report = await provisionWorkforce(store, plan);
    expect(report.agents).toEqual({ created: 0, updated: 1, unchanged: PRIMARY_AGENT_COUNT - 1, conflicts: 0 });
    expect(store.agents.get(target.id)!.purpose).not.toBe('TAMPERED');
  });

  it('never demotes or promotes lifecycle status on update', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0002')!;
    store.agents.set(target.id, { ...target, status: 'active', purpose: 'TAMPERED' });
    const report = await provisionWorkforce(store, plan);
    expect(report.agents.updated).toBe(1);
    expect(store.agents.get(target.id)!.status).toBe('active');
  });

  it('keeps an agent that was verified to "active" as unchanged on re-provision', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0003')!;
    store.agents.set(target.id, { ...target, status: 'active' });
    const report = await provisionWorkforce(store, plan);
    expect(report.agents.unchanged).toBe(PRIMARY_AGENT_COUNT);
    expect(report.agents.updated).toBe(0);
  });

  it('refuses to overwrite an unmanaged agent that holds a plan business key', async () => {
    const store = new MemoryStore();
    store.seedAgent({ agentId: 'AGENT-0005', slug: 'legacy-starter', name: 'Legacy Starter', companyId: null, runtimeProfile: '{}' });
    const report = await provisionWorkforce(store, plan);
    expect(report.ok).toBe(false);
    expect(report.agents.conflicts).toBe(1);
    expect(report.conflicts[0]).toMatchObject({ entity: 'agent', key: 'AGENT-0005' });
    expect([...store.agents.values()].find((a) => a.agentId === 'AGENT-0005')!.name).toBe('Legacy Starter');
  });

  it('refuses to adopt a row owned by another tenant even if it carries the managed marker', async () => {
    const store = new MemoryStore();
    store.tenants.set('other-co', { id: 'co_other', slug: 'other-co' });
    store.seedAgent({
      agentId: 'AGENT-0006', slug: 'foreign', name: 'Foreign', companyId: 'co_other',
      runtimeProfile: JSON.stringify({ provisioning: { managedBy: MANAGED_BY } }),
    });
    const report = await provisionWorkforce(store, plan);
    expect(report.ok).toBe(false);
    expect(report.conflicts.some((c) => c.key === 'AGENT-0006')).toBe(true);
  });

  it('refuses an agent slug that is already used by a different business key', async () => {
    const store = new MemoryStore();
    store.seedAgent({ agentId: 'AGENT-9999', slug: plan.agents[0].slug, name: 'Squatter', companyId: null, runtimeProfile: '{}' });
    const report = await provisionWorkforce(store, plan);
    expect(report.ok).toBe(false);
    expect(report.conflicts.some((c) => c.reason.includes('slug'))).toBe(true);
  });

  it('refuses a department name already used by a different department slug', async () => {
    const store = new MemoryStore();
    store.depts.set('dept_legacy', {
      id: 'dept_legacy', name: plan.departments[0].name, slug: 'legacy-exec', description: null, agentCount: 20,
      sortOrder: 0, status: 'active', companyId: null, runtimeProfile: '{}',
    });
    const report = await provisionWorkforce(store, plan);
    expect(report.ok).toBe(false);
    expect(report.conflicts.some((c) => c.entity === 'department')).toBe(true);
  });

  it('a conflicting run creates nothing for the conflicting key but still reports every other row', async () => {
    const store = new MemoryStore();
    store.seedAgent({ agentId: 'AGENT-0010', slug: 'legacy', name: 'Legacy', companyId: null, runtimeProfile: '{}' });
    const report = await provisionWorkforce(store, plan);
    expect(report.agents.created).toBe(PRIMARY_AGENT_COUNT - 1);
    expect(report.agents.conflicts).toBe(1);
  });
});

// ─── Verifier ────────────────────────────────────────────────────────────────

describe('workforce verifier', () => {
  it('passes on a correctly provisioned workforce', async () => {
    const { store } = await provisionedStore();
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.pass)).toBe(true);
    expect(report.counts.agentsOwned).toBe(PRIMARY_AGENT_COUNT);
    expect(report.counts.departmentsOwned).toBe(DEPARTMENT_COUNT);
    expect(report.counts.agentsOperational).toBe(0);
    expect(report.planHash).toBe(plan.planHash);
  });

  it('fails when an agent is missing (plan coverage)', async () => {
    const { store } = await provisionedStore();
    const victim = [...store.agents.entries()].find(([, a]) => a.agentId === 'AGENT-0100')![0];
    store.agents.delete(victim);
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'agents.count')!.pass).toBe(false);
    expect(report.checks.find((c) => c.id === 'agents.plan_coverage')!.pass).toBe(false);
  });

  it('fails on an orphan agent owned by the tenant outside the plan', async () => {
    const { store } = await provisionedStore();
    store.seedAgent({ agentId: 'AGENT-9001', slug: 'orphan', name: 'Orphan', companyId: tenantId(store), runtimeProfile: JSON.stringify({ provisioning: { managedBy: MANAGED_BY } }) });
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.checks.find((c) => c.id === 'agents.no_orphans')!.pass).toBe(false);
    expect(report.counts.agentsOrphaned).toBe(1);
  });

  it('fails when a stored agent drifted from the plan', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0042')!;
    store.agents.set(target.id, { ...target, systemInstructions: 'something else entirely' });
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.ok).toBe(false);
    expect(report.counts.agentsDrifted).toBe(1);
    expect(report.drift.find((d) => d.key === 'AGENT-0042')).toBeTruthy();
  });

  it('fails when an agent is attached to the wrong department', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0050')!;
    const wrong = plan.departments[0].slug;
    store.agents.set(target.id, { ...target, departmentSlug: wrong });
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.ok).toBe(false);
    expect(report.counts.agentsDrifted).toBeGreaterThanOrEqual(1);
  });

  it('fails when a required configuration field is blank', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0060')!;
    store.agents.set(target.id, { ...target, systemInstructions: '' });
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    const check = report.checks.find((c) => c.id === 'agents.required_fields')!;
    expect(check.pass).toBe(false);
    expect(check.detail).toContain('AGENT-0060');
  });

  it('fails when an agent holds a tool that is also forbidden', async () => {
    const { store } = await provisionedStore();
    const target = [...store.agents.values()].find((a) => a.agentId === 'AGENT-0061')!;
    store.agents.set(target.id, { ...target, forbiddenTools: JSON.stringify(['terminal']), allowedTools: JSON.stringify(['terminal', 'analytics']) });
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.checks.find((c) => c.id === 'agents.required_fields')!.pass).toBe(false);
  });

  it('fails when the tenant has a department count other than 100', async () => {
    const { store } = await provisionedStore();
    const extra = [...store.depts.values()][0];
    store.depts.delete(extra.id);
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.checks.find((c) => c.id === 'departments.count')!.pass).toBe(false);
  });

  it('reports legacy unowned rows without treating them as tenant rows', async () => {
    const { store } = await provisionedStore();
    store.seedAgent({ agentId: 'AGENT-LEGACY-1', slug: 'legacy-1', name: 'Legacy', companyId: null, runtimeProfile: '{}' });
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.ok).toBe(true);
    expect(report.counts.legacyUnownedAgents).toBe(1);
    expect(report.counts.agentsOwned).toBe(PRIMARY_AGENT_COUNT);
  });

  it('never reports agents as operational just because they are provisioned', async () => {
    const { store } = await provisionedStore();
    const report = verifyWorkforce(plan, { tenantId: tenantId(store), ...storedRowsFor(store) });
    expect(report.counts.agentsOperational).toBe(0);
    expect(report.counts.agentsProvisioned).toBe(PRIMARY_AGENT_COUNT);
  });

  it('with no tenant at all, fails closed', () => {
    const report = verifyWorkforce(plan as WorkforcePlan, { tenantId: null, departments: [], agents: [] });
    expect(report.ok).toBe(false);
    expect(report.counts.agentsOwned).toBe(0);
  });
});

describe('role catalog sanity', () => {
  it('lists the director first so the orchestrator is deterministic', () => {
    expect(ROLE_CATALOG[0].key).toBe('director');
  });
});
