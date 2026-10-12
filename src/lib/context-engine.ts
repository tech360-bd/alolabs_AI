/**
 * ALO Labs AI-EOS — Unified Context Engine
 *
 * The BRAIN that makes every one of the 2,000 AI employees unique.
 * Every agent execution MUST go through this engine to receive its
 * identity, constitution, skills, knowledge, and operating context.
 *
 * This replaces the generic 'helpful AI assistant' prompt in the
 * execution engine with a rich, per-agent, constitutional system prompt.
 */

import { db } from '@/lib/db';

// ─── Public Types ───────────────────────────────────────────────────

export interface AgentContext {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentType: string;
  departmentName: string;
  departmentMission: string;
  purpose: string;
  constitutionRules: Array<{
    title: string;
    severity: string;
    description: string;
    actions: string[];
  }>;
  relevantSkills: Array<{
    name: string;
    description: string;
    purpose: string;
    inputs: string[];
    outputs: string[];
  }>;
  relevantPrompts: Array<{
    title: string;
    category: string;
    systemPrompt: string;
    variables: string[];
  }>;
  relevantSOPs: Array<{
    title: string;
    steps: string[];
    checklist: string[];
  }>;
  relevantKnowledge: Array<{
    title: string;
    type: string;
    content: string;
    confidence: number;
  }>;
  relevantMemory: Array<{
    type: string;
    content: string;
    createdAt: string;
  }>;
  allowedTools: string[];
  protectionRules: string[];
  approvalRules: string[];
  workflowSteps: string[];
}

export interface BuiltContext {
  systemPrompt: string;
  contextTokens: number;
  sources: {
    constitution: number;
    skills: number;
    prompts: number;
    sops: number;
    knowledge: number;
    memory: number;
  };
}

// ─── Internal helpers ───────────────────────────────────────────────

/** Safely parse a JSON string, returning a default on failure. */
function safeParseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function knowledgeBelongsToCompany(metadataJson: string, companyId: string): boolean {
  try {
    const metadata: unknown = JSON.parse(metadataJson)
    if (!isRecord(metadata)) return false
    const ownerCompanyId = metadata.companyId
    return ownerCompanyId === undefined || ownerCompanyId === companyId
  } catch {
    return false
  }
}

/** Rough token estimation: ~4 characters per token (GPT-style BPE average). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate a markdown section list to fit within a remaining character budget.
 * Removes items from the end of the list first (lower priority items).
 */
function truncateListItems(
  items: string[],
  maxChars: number,
): string[] {
  const result: string[] = [];
  let used = 0;
  for (const item of items) {
    const nextLen = item.length + 4; // account for "- " prefix + newline
    if (used + nextLen > maxChars) break;
    result.push(item);
    used += nextLen;
  }
  return result;
}

// ─── Main export: buildAgentContext ──────────────────────────────────

export async function buildAgentContext(params: {
  agentId: string;
  companyId: string;
  task: string;
  maxContextTokens?: number;
  language?: string;
}): Promise<BuiltContext> {
  const {
    agentId,
    companyId,
    task,
    maxContextTokens = 8000,
    language = 'english',
  } = params;

  const maxChars = maxContextTokens * 4;

  // ── 1. Load Agent with Department ─────────────────────────────────
  const agent = await db.agent.findFirst({
    where: { agentId, agentCompanyAccess: { some: { companyId } } },
    include: { department: true },
  });

  if (!agent) {
    throw new Error(
      `[ContextEngine] Agent not found: ${agentId}. ` +
      'Every execution requires a registered agent.',
    );
  }

  // ── 2. Load Constitution Rules ───────────────────────────────────
  const rawConstitutionRules = await db.constitutionalRule.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ departmentId: null }, { departmentId: agent.departmentId }] },
        { OR: [{ companyId: null }, { companyId }] },
      ],
    },
    orderBy: { severity: 'asc' },
    take: 20,
  });

  const constitutionRules = rawConstitutionRules.map((rule) => ({
    title: rule.title,
    severity: rule.severity,
    description: rule.description,
    actions: safeParseJson<string[]>(rule.actions, []),
  }));

  // ── 3. Load Skills ───────────────────────────────────────────────
  const skillSlugs = safeParseJson<string[]>(agent.allowedSkills, []);

  let rawSkills: Array<{
    name: string;
    description: string;
    purpose: string;
    inputs: string;
    outputs: string;
  }> = [];

  if (skillSlugs.length > 0) {
    rawSkills = await db.skill.findMany({
      where: {
        slug: { in: skillSlugs },
        OR: [
          { status: 'approved' },
          { status: 'private', skillCompanyAccess: { some: { companyId } } },
        ],
      },
      take: 15,
      select: {
        name: true,
        description: true,
        purpose: true,
        inputs: true,
        outputs: true,
      },
    });
  }

  const relevantSkills = rawSkills.map((s) => ({
    name: s.name,
    description: s.description,
    purpose: s.purpose,
    inputs: safeParseJson<string[]>(s.inputs, []),
    outputs: safeParseJson<string[]>(s.outputs, []),
  }));

  // ── 4. Load Prompt Templates ─────────────────────────────────────
  const rawPrompts = await db.promptTemplate.findMany({
    where: {
      isActive: true,
      isPublic: true,
      OR: [
        { departmentId: null },
        { departmentId: agent.departmentId },
        { agentTypeId: agent.type },
      ],
    },
    take: 5,
  });

  const relevantPrompts = rawPrompts.map((p) => ({
    title: p.title,
    category: p.category,
    systemPrompt: p.systemPrompt,
    variables: safeParseJson<string[]>(p.variables, []),
  }));

  // ── 5. Load SOPs ─────────────────────────────────────────────────
  const rawSOPs = await db.enterpriseSOP.findMany({
    where: {
      isActive: true,
      status: 'active',
      OR: [
        { departmentId: null },
        { departmentId: agent.departmentId },
      ],
    },
    take: 5,
  });

  const relevantSOPs = rawSOPs.map((sop) => ({
    title: sop.title,
    steps: safeParseJson<string[]>(sop.steps, []),
    checklist: safeParseJson<string[]>(sop.checklist, []),
  }));

  // ── 6. Load Knowledge ────────────────────────────────────────────
  const rawKnowledge = await db.knowledgeNode.findMany({
    where: {
      OR: [
        { departmentId: null },
        { departmentId: agent.departmentId },
      ],
    },
    orderBy: { confidence: 'desc' },
    take: 50,
  });

  const relevantKnowledge = rawKnowledge
    .filter((knowledge) => knowledgeBelongsToCompany(knowledge.metadata, companyId))
    .slice(0, 10)
    .map((k) => ({
    title: k.title,
    type: k.type,
    content: k.content,
    confidence: k.confidence,
  }));

  // ── 7. Load Memory ───────────────────────────────────────────────
  const [rawMemory, rawCompanyMemory] = await Promise.all([
    db.agentMemory.findMany({
      where: { agentId: agent.id, companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.companyMemory.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])

  const relevantMemory = [
    ...rawMemory.map((memory) => ({
      type: `agent:${memory.category}`,
      content: memory.content,
      createdAt: memory.createdAt.toISOString(),
    })),
    ...rawCompanyMemory.map((memory) => ({
      type: `company:${memory.category}`,
      content: memory.content,
      createdAt: memory.updatedAt.toISOString(),
    })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8)

  // ── Parse agent JSON fields ──────────────────────────────────────
  const allowedTools = safeParseJson<string[]>(agent.allowedTools, []);
  const protectionRules = safeParseJson<string[]>(agent.protectionRules, []);
  const approvalRules = safeParseJson<string[]>(agent.approvalRules, []);
  const workflowSteps = safeParseJson<string[]>(agent.workflowSteps, []);

  // ── 8. Assemble Full AgentContext ────────────────────────────────
  const agentContext: AgentContext = {
    agentId: agent.agentId,
    agentName: agent.name,
    agentRole: agent.role,
    agentType: agent.type,
    departmentName: agent.departmentName,
    departmentMission: agent.department?.description ?? '',
    purpose: agent.purpose,
    constitutionRules,
    relevantSkills,
    relevantPrompts,
    relevantSOPs,
    relevantKnowledge,
    relevantMemory,
    allowedTools,
    protectionRules,
    approvalRules,
    workflowSteps,
  };

  // ── 9. Build System Prompt ───────────────────────────────────────
  const systemPrompt = assembleSystemPrompt(agentContext, task, language, maxChars);

  // ── 10. Return ───────────────────────────────────────────────────
  const contextTokens = estimateTokens(systemPrompt);

  return {
    systemPrompt,
    contextTokens,
    sources: {
      constitution: constitutionRules.length,
      skills: relevantSkills.length,
      prompts: relevantPrompts.length,
      sops: relevantSOPs.length,
      knowledge: relevantKnowledge.length,
      memory: relevantMemory.length,
    },
  };
}

// ─── Prompt Assembly ─────────────────────────────────────────────────

/**
 * Assembles the full system prompt from agent context in priority order.
 * If the prompt exceeds maxChars, lower-priority sections are progressively
 * truncated: memory first, then knowledge, then SOP details.
 */
function assembleSystemPrompt(
  ctx: AgentContext,
  task: string,
  _language: string,
  maxChars: number,
): string {
  // Build each section independently so we can truncate if needed
  const sections: Array<{ priority: number; render: () => string }> = [
    // HIGHEST PRIORITY — identity and governance must never be cut
    { priority: 0, render: () => renderIdentitySection(ctx) },
    { priority: 1, render: () => renderConstitutionSection(ctx) },
    { priority: 2, render: () => renderDepartmentSection(ctx) },
    { priority: 3, render: () => renderSkillsSection(ctx) },
    { priority: 4, render: () => renderPromptsSection(ctx) },
    { priority: 5, render: () => renderSOPsSection(ctx, maxChars * 0.08) },
    { priority: 6, render: () => renderKnowledgeSection(ctx, maxChars * 0.06) },
    { priority: 7, render: () => renderMemorySection(ctx, maxChars * 0.05) },
    { priority: 8, render: () => renderToolsSection(ctx) },
    { priority: 9, render: () => renderProtectionSection(ctx) },
    { priority: 10, render: () => renderOutputRequirements(task) },
  ];

  // Render all sections
  const rendered = sections.map((s, i) => ({ index: i, priority: s.priority, content: s.render() }));

  // Calculate total length
  let totalLength = rendered.reduce((sum, s) => sum + s.content.length, 0);

  // If within budget, join and return
  if (totalLength <= maxChars) {
    return rendered.map((s) => s.content).join('\n\n');
  }

  // ── Truncation Strategy ──────────────────────────────────────────
  // Sections with priority >= 6 are truncated first (memory, knowledge, SOP details).
  // We progressively shrink their character budgets.

  const immutableSections = rendered.filter((s) => s.priority < 6);
  const immutableLength = immutableSections.reduce((sum, s) => sum + s.content.length, 0);
  const truncatableSections = rendered.filter((s) => s.priority >= 6);

  // Budget for truncatable sections
  let remainingBudget = Math.max(0, maxChars - immutableLength);

  // Reduce budget for lower-priority sections first
  // Priority 7 (memory) gets 20% of remaining, 6 (knowledge) 30%, 5 (SOP) 50%
  const budgets = new Map<number, number>([
    [5, Math.floor(remainingBudget * 0.50)],
    [6, Math.floor(remainingBudget * 0.30)],
    [7, Math.floor(remainingBudget * 0.20)],
  ]);

  // Re-render truncatable sections with reduced budgets
  const truncatedSections = truncatableSections.map((s) => {
    const budget = budgets.get(s.priority) ?? 500;
    switch (s.priority) {
      case 5: return renderSOPsSection(ctx, budget);
      case 6: return renderKnowledgeSection(ctx, budget);
      case 7: return renderMemorySection(ctx, budget);
      default: return s.content;
    }
  });

  // Build final prompt: immutable + truncated (in order)
  const finalSections: string[] = [];
  let used = 0;

  // First, all immutable sections
  for (const s of immutableSections) {
    finalSections.push(s.content);
    used += s.content.length;
  }

  // Then truncated sections in priority order
  for (const content of truncatedSections) {
    if (used + content.length > maxChars) break;
    finalSections.push(content);
    used += content.length;
  }

  // Re-add high-priority trailing sections (tools, protection, output)
  const trailingSections = rendered.filter((s) => s.priority >= 8);
  for (const s of trailingSections) {
    if (used + s.content.length > maxChars) break;
    finalSections.push(s.content);
    used += s.content.length;
  }

  return finalSections.join('\n\n');
}

// ─── Section Renderers ───────────────────────────────────────────────

function renderIdentitySection(ctx: AgentContext): string {
  const parts: string[] = [];
  parts.push('# AGENT IDENTITY');
  parts.push('');
  parts.push(`- **Name**: ${ctx.agentName}`);
  parts.push(`- **Role**: ${ctx.agentRole}`);
  parts.push(`- **Type**: ${ctx.agentType}`);
  parts.push(`- **Department**: ${ctx.departmentName}`);
  parts.push(`- **Agent ID**: ${ctx.agentId}`);
  parts.push('');
  parts.push('## Purpose');
  parts.push(ctx.purpose);
  return parts.join('\n');
}

function renderConstitutionSection(ctx: AgentContext): string {
  if (ctx.constitutionRules.length === 0) return '';

  const parts: string[] = [];
  parts.push('# GLOBAL CONSTITUTION');
  parts.push('');
  parts.push('These rules are ABSOLUTE and govern all your behavior. Severity order: critical > high > medium > low > informational.');
  parts.push('');

  for (const rule of ctx.constitutionRules) {
    parts.push(`## [${rule.severity.toUpperCase()}] ${rule.title}`);
    parts.push(rule.description);
    if (rule.actions.length > 0) {
      parts.push('');
      parts.push('**Required Actions:**');
      for (const action of rule.actions) {
        parts.push(`- ${action}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

function renderDepartmentSection(ctx: AgentContext): string {
  const parts: string[] = [];
  parts.push('# DEPARTMENT CONTEXT');
  parts.push('');
  parts.push(`**Department**: ${ctx.departmentName}`);
  if (ctx.departmentMission) {
    parts.push(`**Mission**: ${ctx.departmentMission}`);
  }
  return parts.join('\n');
}

function renderSkillsSection(ctx: AgentContext): string {
  if (ctx.relevantSkills.length === 0) return '';

  const parts: string[] = [];
  parts.push('# RELEVANT SKILLS');
  parts.push('');

  for (const skill of ctx.relevantSkills) {
    parts.push(`## ${skill.name}`);
    if (skill.purpose) parts.push(`**Purpose**: ${skill.purpose}`);
    if (skill.description) parts.push(skill.description);
    if (skill.inputs.length > 0) {
      parts.push(`**Inputs**: ${skill.inputs.join(', ')}`);
    }
    if (skill.outputs.length > 0) {
      parts.push(`**Outputs**: ${skill.outputs.join(', ')}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function renderPromptsSection(ctx: AgentContext): string {
  if (ctx.relevantPrompts.length === 0) return '';

  const parts: string[] = [];
  parts.push('# RELEVANT PROMPTS');
  parts.push('');

  for (const prompt of ctx.relevantPrompts) {
    parts.push(`## ${prompt.title} (${prompt.category})`);
    parts.push(prompt.systemPrompt);
    if (prompt.variables.length > 0) {
      parts.push(`**Variables**: ${prompt.variables.join(', ')}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function renderSOPsSection(ctx: AgentContext, maxChars: number): string {
  if (ctx.relevantSOPs.length === 0) return '';

  const parts: string[] = [];
  parts.push('# RELEVANT SOPs');
  parts.push('');

  for (const sop of ctx.relevantSOPs) {
    const section: string[] = [];
    section.push(`## ${sop.title}`);

    if (sop.steps.length > 0) {
      section.push('**Steps:**');
      const truncatedSteps = truncateListItems(
        sop.steps,
        maxChars * 0.5,
      );
      for (const step of truncatedSteps) {
        section.push(`1. ${step}`);
      }
    }

    if (sop.checklist.length > 0) {
      section.push('**Checklist:**');
      const truncatedChecklist = truncateListItems(
        sop.checklist,
        maxChars * 0.3,
      );
      for (const item of truncatedChecklist) {
        section.push(`- [ ] ${item}`);
      }
    }

    const sopText = section.join('\n');
    if (parts.join('\n').length + sopText.length + 4 > maxChars) break;
    parts.push(sopText);
    parts.push('');
  }

  return parts.join('\n');
}

function renderKnowledgeSection(ctx: AgentContext, maxChars: number): string {
  if (ctx.relevantKnowledge.length === 0) return '';

  const parts: string[] = [];
  parts.push('# RELEVANT KNOWLEDGE');
  parts.push('');

  for (const node of ctx.relevantKnowledge) {
    const entry = `## ${node.title} (${node.type}, confidence: ${(node.confidence * 100).toFixed(0)}%)\n${node.content}`;
    if (parts.join('\n').length + entry.length + 4 > maxChars) break;
    parts.push(entry);
    parts.push('');
  }

  return parts.join('\n');
}

function renderMemorySection(ctx: AgentContext, maxChars: number): string {
  if (ctx.relevantMemory.length === 0) return '';

  const parts: string[] = [];
  parts.push('# RELEVANT MEMORY');
  parts.push('');
  parts.push('Recent experiences and learnings from your past executions:');
  parts.push('');

  for (const mem of ctx.relevantMemory) {
    const entry = `- **[${mem.type}]** (${mem.createdAt}): ${mem.content}`;
    if (parts.join('\n').length + entry.length + 4 > maxChars) break;
    parts.push(entry);
  }

  return parts.join('\n');
}

function renderToolsSection(ctx: AgentContext): string {
  if (ctx.allowedTools.length === 0) return '';

  const parts: string[] = [];
  parts.push('# AUTHORIZED TOOLS');
  parts.push('');
  parts.push('You are authorized to use the following tools. Do NOT use any tools not listed here.');
  parts.push('');

  for (const tool of ctx.allowedTools) {
    parts.push(`- ${tool}`);
  }

  return parts.join('\n');
}

function renderProtectionSection(ctx: AgentContext): string {
  if (ctx.protectionRules.length === 0 && ctx.approvalRules.length === 0) {
    return '';
  }

  const parts: string[] = [];
  parts.push('# PROTECTION RULES');
  parts.push('');

  if (ctx.protectionRules.length > 0) {
    parts.push('**Safety & Protection:**');
    for (const rule of ctx.protectionRules) {
      parts.push(`- ${rule}`);
    }
    parts.push('');
  }

  if (ctx.approvalRules.length > 0) {
    parts.push('**Approval Requirements:**');
    for (const rule of ctx.approvalRules) {
      parts.push(`- ${rule}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function renderOutputRequirements(task: string): string {
  const parts: string[] = [];
  parts.push('# OUTPUT REQUIREMENTS');
  parts.push('');
  parts.push('1. **Structured**: Organize your response with clear sections, headers, and hierarchy.');
  parts.push('2. **Evidence-Based**: Cite specific rules, SOPs, or knowledge when making decisions.');
  parts.push('3. **Action-Oriented**: Provide concrete next steps, not just analysis.');
  parts.push('4. **Constitutional Compliance**: Every response must comply with all constitutional rules above.');
  parts.push('5. **Task Alignment**: Directly address the task at hand.');
  parts.push(`**Current Task**: ${task}`);

  return parts.join('\n');
}

// ─── Helper: getAgentIdentity ────────────────────────────────────────

/**
 * Lightweight identity lookup — used for routing, UI display, and
 * permission checks where the full context build is not needed.
 */
export async function getAgentIdentity(agentId: string): Promise<{
  agentId: string;
  name: string;
  role: string;
  type: string;
  departmentName: string;
  departmentId: string;
  purpose: string;
  status: string;
} | null> {
  try {
    const agent = await db.agent.findUnique({
      where: { agentId },
      select: {
        agentId: true,
        name: true,
        role: true,
        type: true,
        departmentName: true,
        departmentId: true,
        purpose: true,
        status: true,
      },
    });

    if (!agent) return null;

    return {
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role,
      type: agent.type,
      departmentName: agent.departmentName,
      departmentId: agent.departmentId,
      purpose: agent.purpose,
      status: agent.status,
    };
  } catch (error) {
    console.error(
      `[ContextEngine] Failed to load identity for ${agentId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
