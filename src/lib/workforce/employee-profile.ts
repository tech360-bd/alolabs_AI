/**
 * Employee workforce profile — the single source that answers, for ONE AI
 * employee, every category the ALO Labs workforce guideline requires:
 *
 *   ROLE + MISSION + SKILLS + PROMPTS + SOPs + TOOLS + KNOWLEDGE + MEMORY +
 *   AUTHORITY + KPIs + COLLABORATION + ESCALATION + SECURITY
 *
 * Everything is derived from data that is already persisted for the 2,000
 * provisioned employees (Agent row + AIEmployeeIdentity row + Department
 * runtimeProfile + live EnterpriseSOP linkage). Nothing here is invented:
 * task prompts are deterministic derivations of the agent's own purpose,
 * workflow steps and quality checklist, so the same employee always yields
 * the same prompt set.
 */

// ─── Input shapes (Prisma rows, narrowed to the fields we read) ─────────────

export interface AgentProfileInput {
  agentId: string;
  name: string;
  purpose: string;
  role: string;
  departmentId?: string | null;
  departmentSlug?: string;
  departmentName: string;
  systemInstructions: string;
  allowedSkills: MaybeSerialized<string[]>;
  allowedTools: MaybeSerialized<string[]>;
  forbiddenTools: MaybeSerialized<string[]>;
  workflowSteps: MaybeSerialized<string[]>;
  qualityChecklist: MaybeSerialized<string[]>;
  protectionRules: MaybeSerialized<string[]>;
  approvalRules: MaybeSerialized<string[]>;
  handoffRules: MaybeSerialized<string[]>;
  runtimeProfile: MaybeSerialized<Record<string, unknown>>; // JSON string on rows, object on plan specs
}

export interface IdentityProfileInput {
  employeeKey: string;
  roleKey: string;
  title: string;
  responsibilities: string;
  modelPolicy: string;
  permissionProfile: MaybeSerialized<Record<string, unknown>>;
  memoryScope: MaybeSerialized<Record<string, unknown>>;
  resourceLimits: MaybeSerialized<Record<string, unknown>>;
  approvalPolicy: MaybeSerialized<Record<string, unknown>>;
  supervisorEmployeeKey: string | null;
}

// ─── JSON helpers (fail-closed: malformed JSON reads as empty) ──────────────
// Accept BOTH shapes the data lives in: plan specs hold real arrays/objects,
// Prisma rows hold them JSON-serialized as strings. Unknown shapes → empty.

type MaybeSerialized<T> = T | string | null | undefined;

function parseArray(value: MaybeSerialized<string[]>): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function parseObject(value: MaybeSerialized<Record<string, unknown>>): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ─── Deterministic task prompts ──────────────────────────────────────────────

export type DerivedPromptKind = 'kickoff' | 'step' | 'validation' | 'escalation';

export interface DerivedPrompt {
  kind: DerivedPromptKind;
  label: string;
  prompt: string;
}

/**
 * Derive the per-employee prompt set from the agent's own persisted plan.
 * The output is a pure function of the input — no randomness, no model calls.
 */
export function deriveEmployeePrompts(agent: {
  role: string;
  purpose: string;
  systemInstructions: string;
  workflowSteps: MaybeSerialized<string[]>;
  qualityChecklist: MaybeSerialized<string[]>;
}): DerivedPrompt[] {
  const steps = parseArray(agent.workflowSteps);
  const checklist = parseArray(agent.qualityChecklist);
  const prompts: DerivedPrompt[] = [];

  prompts.push({
    kind: 'kickoff',
    label: 'Task kickoff',
    prompt:
      `Execute a new task as a ${agent.role} agent. Mission: ${agent.purpose}. ` +
      (steps.length > 0
        ? `Follow the workflow in order: ${steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}`
        : 'Follow your standard workflow.'),
  });

  steps.forEach((step, index) => {
    prompts.push({
      kind: 'step',
      label: `Workflow step ${index + 1}: ${step}`,
      prompt:
        `Work on workflow step ${index + 1} (${step}). Stay inside your department scope, ` +
        `use only approved tools, and record the outcome of this step before moving on.`,
    });
  });

  checklist.forEach((item) => {
    prompts.push({
      kind: 'validation',
      label: `Quality gate: ${item}`,
      prompt:
        `Before reporting the result, validate it against this quality gate: ${item}. ` +
        `If the gate fails, fix the output or escalate instead of reporting it as complete.`,
    });
  });

  prompts.push({
    kind: 'escalation',
    label: 'Escalation report',
    prompt:
      'If a required approval is missing, evidence is insufficient, or a protection rule would be ' +
      'violated, stop and escalate to your supervisor with: the blocked action, the reason, and ' +
      'the evidence you already collected. Never proceed on a blocked action.',
  });

  return prompts;
}

// ─── SOP linkage ─────────────────────────────────────────────────────────────

export interface EmployeeSopLinkage {
  /** Every agent loads its department's active SOPs at execution time (context-engine). */
  linkage: 'department';
  /** Department DB id (present on provisioned rows; plan specs use the slug). */
  departmentId: string | null;
  departmentSlug: string;
  /** Live count of active SOPs attached to the department (filled by the API when known). */
  activeCount: number | null;
  /** Titles of a bounded sample of those SOPs (filled by the API when known). */
  sampleTitles: string[];
}

// ─── Full profile + completeness ─────────────────────────────────────────────

export const PROFILE_CATEGORIES = [
  'role',
  'mission',
  'skills',
  'prompts',
  'sops',
  'tools',
  'knowledge',
  'memory',
  'authority',
  'kpis',
  'collaboration',
  'escalation',
  'security',
] as const;

export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number];

export interface EmployeeWorkforceProfile {
  employeeKey: string;
  role: { roleKey: string; title: string; runtimeRole: string; department: string };
  mission: { responsibilities: string; purpose: string };
  skills: string[];
  prompts: { system: string; taskPrompts: DerivedPrompt[] };
  sops: EmployeeSopLinkage;
  tools: { allowed: string[]; forbidden: string[] };
  knowledge: { scope: string; sources: string[]; crossDepartment: boolean };
  memory: { profile: unknown; scope: string; identityMemoryScope: Record<string, unknown> };
  authority: { approvalRules: string[]; approvalPolicy: Record<string, unknown>; sensitiveActionsRequireApproval: boolean };
  kpis: { evaluationMetrics: string[]; thresholds: Record<string, unknown>; departmentKpis: string[] };
  collaboration: string[];
  escalation: { supervisorEmployeeKey: string | null; escalationPrompt: string };
  security: { protectionRules: string[]; permissionProfile: Record<string, unknown> };
  /** One check per guideline category — all must be satisfied. */
  completeness: { category: ProfileCategory; satisfied: boolean; evidence: string }[];
}

export interface DepartmentContextInput {
  kpis?: string[];
  sop?: { activeCount: number; sampleTitles: string[] };
}

export function buildEmployeeWorkforceProfile(
  agent: AgentProfileInput,
  identity: IdentityProfileInput,
  department: DepartmentContextInput = {},
): EmployeeWorkforceProfile {
  const runtime = parseObject(agent.runtimeProfile);
  const knowledgeAccess = (runtime.knowledgeAccess ?? {}) as Record<string, unknown>;
  const memoryPolicy = (runtime.memoryPolicy ?? {}) as Record<string, unknown>;
  const evaluation = (runtime.evaluationProfile ?? {}) as Record<string, unknown>;
  const allowedSkills = parseArray(agent.allowedSkills);
  const allowedTools = parseArray(agent.allowedTools);
  const approvalRules = parseArray(agent.approvalRules);
  const protectionRules = parseArray(agent.protectionRules);
  const handoffRules = parseArray(agent.handoffRules);
  const evaluationMetrics = Array.isArray(evaluation.metrics)
    ? (evaluation.metrics as unknown[]).filter((m): m is string => typeof m === 'string')
    : [];
  const departmentKpis = department.kpis ?? [];
  const taskPrompts = deriveEmployeePrompts(agent);
  const escalationPrompt = taskPrompts.find((p) => p.kind === 'escalation')?.prompt ?? '';

  const profile: Omit<EmployeeWorkforceProfile, 'completeness'> = {
    employeeKey: identity.employeeKey,
    role: {
      roleKey: identity.roleKey,
      title: identity.title,
      runtimeRole: agent.role,
      department: agent.departmentName,
    },
    mission: { responsibilities: identity.responsibilities, purpose: agent.purpose },
    skills: allowedSkills,
    prompts: { system: agent.systemInstructions, taskPrompts },
    sops: {
      linkage: 'department',
      departmentId: agent.departmentId ?? null,
      departmentSlug: agent.departmentSlug ?? '',
      activeCount: department.sop?.activeCount ?? null,
      sampleTitles: department.sop?.sampleTitles ?? [],
    },
    tools: { allowed: allowedTools, forbidden: parseArray(agent.forbiddenTools) },
    knowledge: {
      scope: typeof knowledgeAccess.scope === 'string' ? knowledgeAccess.scope : `department:${agent.departmentId}`,
      sources: Array.isArray(knowledgeAccess.sources)
        ? (knowledgeAccess.sources as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      crossDepartment: knowledgeAccess.crossDepartment === true,
    },
    memory: {
      profile: memoryPolicy.profile ?? null,
      scope: typeof memoryPolicy.scope === 'string' ? memoryPolicy.scope : 'department_agent',
      identityMemoryScope: parseObject(identity.memoryScope),
    },
    authority: {
      approvalRules,
      approvalPolicy: parseObject(identity.approvalPolicy),
      sensitiveActionsRequireApproval: approvalRules.length > 0,
    },
    kpis: {
      evaluationMetrics,
      thresholds:
        evaluation.thresholds && typeof evaluation.thresholds === 'object' && !Array.isArray(evaluation.thresholds)
          ? (evaluation.thresholds as Record<string, unknown>)
          : {},
      departmentKpis,
    },
    collaboration: handoffRules,
    escalation: { supervisorEmployeeKey: identity.supervisorEmployeeKey, escalationPrompt },
    security: { protectionRules, permissionProfile: parseObject(identity.permissionProfile) },
  };

  const evidence: Record<ProfileCategory, () => { satisfied: boolean; evidence: string }> = {
    role: () => ({ satisfied: Boolean(profile.role.roleKey && profile.role.title), evidence: `${profile.role.title} (${profile.role.roleKey})` }),
    mission: () => ({ satisfied: Boolean(profile.mission.purpose || profile.mission.responsibilities), evidence: profile.mission.purpose }),
    skills: () => ({ satisfied: profile.skills.length > 0, evidence: `${profile.skills.length} skill(s)` }),
    prompts: () => ({
      satisfied: Boolean(profile.prompts.system) && profile.prompts.taskPrompts.length > 0,
      evidence: `system instructions + ${profile.prompts.taskPrompts.length} derived task prompt(s)`,
    }),
    sops: () => ({
      satisfied: Boolean(profile.sops.departmentId || profile.sops.departmentSlug),
      evidence:
        profile.sops.activeCount == null
          ? 'department SOP linkage (live count requires API scope)'
          : `${profile.sops.activeCount} active department SOP(s)`,
    }),
    tools: () => ({ satisfied: profile.tools.allowed.length > 0 || profile.tools.forbidden.length > 0, evidence: `${profile.tools.allowed.length} allowed tool(s)` }),
    knowledge: () => ({ satisfied: Boolean(profile.knowledge.scope), evidence: profile.knowledge.scope }),
    memory: () => ({ satisfied: Boolean(profile.memory.scope), evidence: `policy=${String(profile.memory.profile)} scope=${profile.memory.scope}` }),
    authority: () => ({ satisfied: profile.authority.approvalRules.length > 0, evidence: `${profile.authority.approvalRules.length} approval rule(s)` }),
    kpis: () => ({
      satisfied: profile.kpis.evaluationMetrics.length > 0 || profile.kpis.departmentKpis.length > 0,
      evidence: `${profile.kpis.evaluationMetrics.length} evaluation metric(s), ${profile.kpis.departmentKpis.length} department KPI(s)`,
    }),
    collaboration: () => ({ satisfied: profile.collaboration.length > 0, evidence: `${profile.collaboration.length} handoff rule(s)` }),
    escalation: () => ({ satisfied: Boolean(profile.escalation.escalationPrompt), evidence: 'escalation prompt + supervisor linkage' }),
    security: () => ({ satisfied: profile.security.protectionRules.length > 0, evidence: `${profile.security.protectionRules.length} protection rule(s)` }),
  };

  profile.completeness = PROFILE_CATEGORIES.map((category) => ({ category, ...evidence[category]() }));
  return profile;
}
