/**
 * Workforce plan builder — pure and deterministic.
 *
 * Input: the 100-department registry. Output: one department spec per
 * department and exactly 20 agent specs per department (2,000 total). The
 * plan contains no database identifiers and no timestamps, so the same input
 * always yields byte-identical output and the same planHash.
 */

import type { DepartmentConfig } from '@/lib/department-registry/types';
import {
  ALO_TENANT,
  AGENTS_PER_DEPARTMENT,
  DEPARTMENT_COUNT,
  MANAGED_BY,
  PRIMARY_AGENT_COUNT,
  PROVISIONED_STATUS,
  WORKFORCE_PLAN_VERSION,
  agentBusinessKey,
} from './constants';
import {
  GLOBALLY_FORBIDDEN_TOOLS,
  ROLE_CATALOG,
  SENSITIVE_ACTIONS,
  TOOL_CATEGORY_MEMBERS,
  type AgentRoleTemplate,
  type ModelPolicy,
} from './roles';
import { canonicalJson, sha256Hex, specHash } from './canonical';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DepartmentSpec {
  /** 1-based position in the plan (department 1 owns AGENT-0001 … AGENT-0020). */
  sequence: number;
  /** Registry department id, e.g. dept_executive_office. */
  registryId: string;
  /** Registry code, e.g. EXEC-OFFICE. */
  code: string;
  /** Business slug stored in Department.slug (lowercase code). */
  slug: string;
  name: string;
  group: string;
  description: string;
  status: 'active' | 'inactive' | 'archived';
  sortOrder: number;
  agentCount: number;
  /** Business key of the department orchestrator (the Director Agent). */
  orchestratorAgentId: string;
  budgetLimit: number;
  allowedModels: string[];
  allowedProviders: string[];
  permissions: string[];
  tools: string[];
  knowledgeSources: string[];
  kpis: string[];
  sla: { responseTimeMs: number; uptimePercent: number };
}

export interface AgentSpec {
  /** 1-based global sequence, AGENT-0001 … AGENT-2000. */
  sequence: number;
  agentId: string;
  departmentSlug: string;
  departmentName: string;
  roleKey: AgentRoleTemplate['key'];
  name: string;
  slug: string;
  purpose: string;
  type: AgentRoleTemplate['type'];
  role: AgentRoleTemplate['role'];
  systemInstructions: string;
  allowedSkills: string[];
  forbiddenSkills: string[];
  allowedTools: string[];
  forbiddenTools: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  workflowSteps: string[];
  protectionRules: string[];
  approvalRules: string[];
  handoffRules: string[];
  qualityChecklist: string[];
  selfImprovement: Record<string, unknown>;
  productivityRules: Record<string, unknown>;
  modelConfig: {
    policy: ModelPolicy;
    fallbackPolicy: ModelPolicy;
    /** Concrete model is resolved by the model router at run time, never pinned here. */
    pinnedModel: null;
    maxOutputTokens: number;
    temperature: number;
  };
  knowledgeAccess: {
    scope: string;
    departmentSlug: string;
    sources: string[];
    crossDepartment: false;
  };
  memoryPolicy: {
    profile: AgentRoleTemplate['memoryProfile'];
    scope: 'department_agent';
    retentionDays: number;
    personalDataAllowed: false;
  };
  resourceLimits: {
    maxConcurrentTasks: number;
    maxTokensPerTask: number;
    dailyTokenBudget: number;
    timeoutSeconds: number;
  };
  taskQueue: {
    queueName: 'agentos';
    partitionKey: string;
  };
  evaluationProfile: {
    suiteId: string;
    metrics: readonly string[];
    thresholds: Record<string, number>;
    lastEvaluatedAt: null;
  };
  status: typeof PROVISIONED_STATUS;
  version: 1;
}

export interface WorkforcePlan {
  planVersion: typeof WORKFORCE_PLAN_VERSION;
  departments: DepartmentSpec[];
  agents: AgentSpec[];
  /** SHA-256 over every department and agent spec. Changes iff the plan changes. */
  planHash: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const RESOURCE_BY_POLICY: Record<ModelPolicy, AgentSpec['resourceLimits']> = {
  fast: { maxConcurrentTasks: 4, maxTokensPerTask: 4000, dailyTokenBudget: 100000, timeoutSeconds: 180 },
  balanced: { maxConcurrentTasks: 2, maxTokensPerTask: 8000, dailyTokenBudget: 150000, timeoutSeconds: 300 },
  reasoning: { maxConcurrentTasks: 2, maxTokensPerTask: 16000, dailyTokenBudget: 250000, timeoutSeconds: 600 },
  coding: { maxConcurrentTasks: 2, maxTokensPerTask: 12000, dailyTokenBudget: 200000, timeoutSeconds: 600 },
  vision: { maxConcurrentTasks: 1, maxTokensPerTask: 8000, dailyTokenBudget: 100000, timeoutSeconds: 300 },
};

const FALLBACK_POLICY: Record<ModelPolicy, ModelPolicy> = {
  fast: 'balanced',
  balanced: 'fast',
  reasoning: 'balanced',
  coding: 'reasoning',
  vision: 'balanced',
};

/**
 * Approved tools = department tools ∩ role tool category. A role never gets a
 * tool its department does not own. If that intersection is empty the role
 * receives the department's first tool so it is still usable.
 */
export function approvedToolsFor(deptTools: readonly string[], role: AgentRoleTemplate): string[] {
  if (role.toolCategory === 'all') return [...deptTools];
  const members = TOOL_CATEGORY_MEMBERS[role.toolCategory];
  const picked = deptTools.filter((tool) => members.includes(tool));
  return picked.length > 0 ? picked : deptTools.slice(0, 1);
}

function buildSystemInstructions(dept: DepartmentSpec, role: AgentRoleTemplate, agentName: string): string {
  return [
    `You are ${agentName}, a ${role.role} agent in the ${dept.name} department of ALO Labs.`,
    `Purpose: ${role.purpose}`,
    `Operate only for tenant "${ALO_TENANT.slug}" and within department "${dept.slug}". Never read or change another department's or tenant's data.`,
    `Use only your approved tools. Actions in this list require explicit human approval before execution: ${SENSITIVE_ACTIONS.join(', ')}.`,
    'Cite the source for every factual claim. If evidence is missing or uncertain, say so instead of guessing.',
    'Record each task outcome and any escalation in the execution history.',
  ].join('\n');
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build the complete plan. Throws if the input does not describe exactly
 * DEPARTMENT_COUNT departments with unique codes and ids — the plan is
 * fail-closed; it never silently provisions a different shape.
 */
export function buildWorkforcePlan(registry: readonly DepartmentConfig[]): WorkforcePlan {
  if (registry.length !== DEPARTMENT_COUNT) {
    throw new Error(`workforce plan requires exactly ${DEPARTMENT_COUNT} departments, registry has ${registry.length}`);
  }
  const codes = new Set(registry.map((d) => d.departmentCode));
  const ids = new Set(registry.map((d) => d.departmentId));
  if (codes.size !== registry.length) throw new Error('duplicate department codes in registry');
  if (ids.size !== registry.length) throw new Error('duplicate department ids in registry');

  const ordered = [...registry].sort(
    (a, b) => a.priority - b.priority || a.departmentCode.localeCompare(b.departmentCode),
  );

  const departments: DepartmentSpec[] = [];
  const agents: AgentSpec[] = [];

  ordered.forEach((dept, deptIndex) => {
    const sequence = deptIndex + 1;
    const slug = slugify(dept.departmentCode);
    const firstAgentSeq = deptIndex * AGENTS_PER_DEPARTMENT + 1;
    const spec: DepartmentSpec = {
      sequence,
      registryId: dept.departmentId,
      code: dept.departmentCode,
      slug,
      name: dept.departmentName,
      group: dept.group,
      description: dept.description,
      status: dept.status,
      sortOrder: dept.priority,
      agentCount: AGENTS_PER_DEPARTMENT,
      orchestratorAgentId: agentBusinessKey(firstAgentSeq),
      budgetLimit: dept.budgetLimit,
      allowedModels: [...dept.allowedModels],
      allowedProviders: [...dept.allowedProviders],
      permissions: [...dept.permissions],
      tools: [...dept.tools],
      knowledgeSources: [...dept.knowledgeSources],
      kpis: [...dept.kpis],
      sla: { ...dept.sla },
    };
    departments.push(spec);

    if (ROLE_CATALOG.length !== AGENTS_PER_DEPARTMENT) {
      throw new Error(`role catalog must contain ${AGENTS_PER_DEPARTMENT} roles, has ${ROLE_CATALOG.length}`);
    }

    ROLE_CATALOG.forEach((role, roleIndex) => {
      const agentSeq = firstAgentSeq + roleIndex;
      const agentId = agentBusinessKey(agentSeq);
      const name = `${dept.departmentName} ${role.title}`;
      const allowedTools = approvedToolsFor(dept.tools, role);
      const forbiddenTools = [
        ...GLOBALLY_FORBIDDEN_TOOLS,
        ...dept.tools.filter((tool) => !allowedTools.includes(tool)),
      ];
      agents.push({
        sequence: agentSeq,
        agentId,
        departmentSlug: slug,
        departmentName: dept.departmentName,
        roleKey: role.key,
        name,
        slug: `${slug}-${role.key}`,
        purpose: role.purpose,
        type: role.type,
        role: role.role,
        systemInstructions: buildSystemInstructions(spec, role, name),
        allowedSkills: [...role.skills],
        forbiddenSkills: [],
        allowedTools,
        forbiddenTools,
        inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, context: { type: 'string' } } },
        outputSchema: { type: 'object', required: ['result', 'status'], properties: { result: { type: 'string' }, status: { type: 'string' }, citations: { type: 'array' } } },
        workflowSteps: ['intake', 'plan', 'execute', 'verify', 'report'],
        protectionRules: ['No data exfiltration', 'No cross-tenant or cross-department access', 'Maintain audit log'],
        approvalRules: [...SENSITIVE_ACTIONS],
        handoffRules: ['Transfer context on hand-off', 'Confirm receipt on hand-off'],
        qualityChecklist: ['Verify output accuracy', 'Check completeness', 'Cite sources for factual claims'],
        selfImprovement: { enabled: true, requiresApproval: true, targets: ['instructions', 'retrieval', 'skills'] },
        productivityRules: { minQualityScore: 0.8 },
        modelConfig: {
          policy: role.modelPolicy,
          fallbackPolicy: FALLBACK_POLICY[role.modelPolicy],
          pinnedModel: null,
          maxOutputTokens: RESOURCE_BY_POLICY[role.modelPolicy].maxTokensPerTask,
          temperature: role.modelPolicy === 'reasoning' || role.modelPolicy === 'coding' ? 0.2 : 0.4,
        },
        knowledgeAccess: {
          scope: `department:${slug}`,
          departmentSlug: slug,
          sources: [...dept.knowledgeSources],
          crossDepartment: false,
        },
        memoryPolicy: {
          profile: role.memoryProfile,
          scope: 'department_agent',
          retentionDays: role.memoryProfile === 'long' ? 365 : 90,
          personalDataAllowed: false,
        },
        resourceLimits: { ...RESOURCE_BY_POLICY[role.modelPolicy] },
        taskQueue: { queueName: 'agentos', partitionKey: `agent:${agentId}` },
        evaluationProfile: {
          suiteId: `role:${role.key}`,
          metrics: [...role.evaluationMetrics],
          thresholds: { task_success_rate: 0.8, citation_coverage: 0.9, policy_violations: 0 },
          lastEvaluatedAt: null,
        },
        status: PROVISIONED_STATUS,
        version: 1,
      });
    });
  });

  if (agents.length !== PRIMARY_AGENT_COUNT) {
    throw new Error(`workforce plan produced ${agents.length} agents, expected ${PRIMARY_AGENT_COUNT}`);
  }

  const planHash = sha256Hex(canonicalJson({ planVersion: WORKFORCE_PLAN_VERSION, departments, agents }));
  return { planVersion: WORKFORCE_PLAN_VERSION, departments, agents, planHash };
}

/**
 * Hash of the fields that define a spec. Lifecycle `status` is excluded on
 * purpose: execution verification may advance an agent past `provisioned`,
 * and re-provisioning must not demote it.
 */
export function agentSpecHash(agent: AgentSpec): string {
  const { status: _status, ...rest } = agent;
  void _status;
  return specHash(rest);
}

export function departmentSpecHash(dept: DepartmentSpec): string {
  return specHash(dept);
}

export const PROVISIONING_MARKER = { managedBy: MANAGED_BY, planVersion: WORKFORCE_PLAN_VERSION } as const;
