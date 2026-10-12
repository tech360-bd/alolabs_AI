/**
 * Role catalog — the 20 agent role templates every department receives.
 *
 * Each department gets the same 20 roles (10 base roles + 10 specialist
 * variants), so 100 departments x 20 roles = 2,000 primary agents. Roles map
 * onto the `role` vocabulary accepted by the existing AgentFactory
 * (manager, planner, execution, qa, report, automation, safety, memory,
 * productivity, specialist).
 */

export type AgentRoleKey =
  | 'director'
  | 'senior-specialist'
  | 'strategic-planner'
  | 'execution'
  | 'quality-assurance'
  | 'automation'
  | 'reporting'
  | 'safety-compliance'
  | 'knowledge-management'
  | 'productivity'
  | 'data-analyst'
  | 'research'
  | 'communication'
  | 'task-coordinator'
  | 'process-automation'
  | 'resource-planner'
  | 'testing'
  | 'integration'
  | 'dashboard'
  | 'risk-assessment';

/** Allowed values of `Agent.role` (mirrors AgentFactory validRoles). */
export const AGENT_ROLE_VALUES = [
  'manager', 'planner', 'execution', 'qa', 'report',
  'automation', 'safety', 'memory', 'productivity', 'specialist',
] as const;
export type AgentRole = (typeof AGENT_ROLE_VALUES)[number];

/** Model policies accepted by AgentFactory and the model routing policy. */
export type ModelPolicy = 'fast' | 'balanced' | 'reasoning' | 'coding' | 'vision';

/**
 * Tool categories. An agent's approved tools are the intersection of its
 * department's registry tools with the categories below, so a role can never
 * be granted a tool its department does not own.
 */
export type ToolCategory = 'all' | 'core' | 'read' | 'reporting' | 'research' | 'communication' | 'automation';

export const TOOL_CATEGORY_MEMBERS: Record<Exclude<ToolCategory, 'all'>, readonly string[]> = {
  core: ['analytics', 'document_generation', 'calendar', 'email'],
  read: ['analytics', 'database'],
  reporting: ['analytics', 'document_generation'],
  research: ['browser', 'analytics'],
  communication: ['email', 'whatsapp', 'crm', 'calendar'],
  automation: ['database', 'crm', 'calendar', 'email'],
};

export interface AgentRoleTemplate {
  key: AgentRoleKey;
  /** Value stored in Agent.role. */
  role: AgentRole;
  /** Value stored in Agent.type. */
  type: 'autonomous' | 'workflow' | 'specialized' | 'conversational';
  title: string;
  purpose: string;
  modelPolicy: ModelPolicy;
  memoryProfile: 'short' | 'standard' | 'long';
  skills: readonly string[];
  toolCategory: ToolCategory;
  /** Quality metrics the evaluation profile measures for this role. */
  evaluationMetrics: readonly string[];
}

const COMMON_METRICS = ['task_success_rate', 'citation_coverage', 'policy_violations', 'latency_p95_ms'] as const;

/** Ordered: index 0 is the department director (orchestrator). */
export const ROLE_CATALOG: readonly AgentRoleTemplate[] = [
  {
    key: 'director', role: 'manager', type: 'autonomous', title: 'Director Agent',
    purpose: 'Orchestrates the department: decomposes requests, assigns work to department agents and reports status.',
    modelPolicy: 'reasoning', memoryProfile: 'long',
    skills: ['task-planning', 'delegation', 'executive-reporting', 'decision-support'],
    toolCategory: 'all', evaluationMetrics: [...COMMON_METRICS, 'delegation_accuracy'],
  },
  {
    key: 'senior-specialist', role: 'specialist', type: 'specialized', title: 'Senior Specialist Agent',
    purpose: 'Handles complex domain tasks that need deep department expertise.',
    modelPolicy: 'balanced', memoryProfile: 'standard',
    skills: ['domain-analysis', 'fact-verification', 'source-verification'],
    toolCategory: 'core', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'strategic-planner', role: 'planner', type: 'workflow', title: 'Strategic Planning Agent',
    purpose: 'Maintains departmental plans, roadmaps and milestone dependencies.',
    modelPolicy: 'reasoning', memoryProfile: 'standard',
    skills: ['strategic-planning', 'roadmap-planning', 'risk-assessment'],
    toolCategory: 'core', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'execution', role: 'execution', type: 'autonomous', title: 'Execution Agent',
    purpose: 'Executes operational work items and tracks them to completion.',
    modelPolicy: 'fast', memoryProfile: 'short',
    skills: ['task-execution', 'work-item-tracking', 'status-reporting'],
    toolCategory: 'all', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'quality-assurance', role: 'qa', type: 'specialized', title: 'Quality Assurance Agent',
    purpose: 'Reviews departmental outputs against the quality checklist before release.',
    modelPolicy: 'reasoning', memoryProfile: 'standard',
    skills: ['quality-review', 'output-validation', 'checklist-verification'],
    toolCategory: 'read', evaluationMetrics: [...COMMON_METRICS, 'defect_escape_rate'],
  },
  {
    key: 'automation', role: 'automation', type: 'workflow', title: 'Automation Agent',
    purpose: 'Identifies and implements workflow automations for the department.',
    modelPolicy: 'coding', memoryProfile: 'standard',
    skills: ['workflow-automation', 'process-mapping', 'automation-testing'],
    toolCategory: 'automation', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'reporting', role: 'report', type: 'conversational', title: 'Reporting Agent',
    purpose: 'Produces reports and data-backed insights for stakeholders.',
    modelPolicy: 'balanced', memoryProfile: 'standard',
    skills: ['report-writing', 'summarization', 'kpi-reporting'],
    toolCategory: 'reporting', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'safety-compliance', role: 'safety', type: 'specialized', title: 'Safety & Compliance Agent',
    purpose: 'Checks departmental work against compliance, data-protection and safety policies.',
    modelPolicy: 'reasoning', memoryProfile: 'standard',
    skills: ['compliance-review', 'policy-enforcement', 'data-protection-review'],
    toolCategory: 'read', evaluationMetrics: [...COMMON_METRICS, 'compliance_findings_recall'],
  },
  {
    key: 'knowledge-management', role: 'memory', type: 'specialized', title: 'Knowledge Management Agent',
    purpose: 'Curates the department knowledge base and keeps retrieval sources current.',
    modelPolicy: 'fast', memoryProfile: 'long',
    skills: ['knowledge-curation', 'source-indexing', 'retrieval-evaluation'],
    toolCategory: 'read', evaluationMetrics: [...COMMON_METRICS, 'retrieval_recall_at_5'],
  },
  {
    key: 'productivity', role: 'productivity', type: 'autonomous', title: 'Productivity Agent',
    purpose: 'Finds workflow bottlenecks and proposes productivity improvements.',
    modelPolicy: 'fast', memoryProfile: 'short',
    skills: ['workflow-optimization', 'productivity-analysis', 'bottleneck-detection'],
    toolCategory: 'core', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'data-analyst', role: 'specialist', type: 'specialized', title: 'Data Analyst Agent',
    purpose: 'Analyzes departmental data and produces decision-ready insights.',
    modelPolicy: 'balanced', memoryProfile: 'standard',
    skills: ['data-analysis', 'data-cleaning', 'visualization-brief'],
    toolCategory: 'reporting', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'research', role: 'specialist', type: 'specialized', title: 'Research Agent',
    purpose: 'Researches topics from multiple sources and synthesizes cited findings.',
    modelPolicy: 'balanced', memoryProfile: 'standard',
    skills: ['web-research', 'fact-verification', 'source-verification'],
    toolCategory: 'research', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'communication', role: 'specialist', type: 'specialized', title: 'Communication Agent',
    purpose: 'Drafts internal and external communications. Sending requires human approval.',
    modelPolicy: 'balanced', memoryProfile: 'standard',
    skills: ['communication-drafting', 'tone-review', 'summarization'],
    toolCategory: 'communication', evaluationMetrics: [...COMMON_METRICS, 'approval_required_rate'],
  },
  {
    key: 'task-coordinator', role: 'execution', type: 'autonomous', title: 'Task Coordinator Agent',
    purpose: 'Coordinates task hand-offs across department agents and tracks deadlines.',
    modelPolicy: 'fast', memoryProfile: 'short',
    skills: ['task-coordination', 'handoff-management', 'deadline-tracking'],
    toolCategory: 'all', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'process-automation', role: 'execution', type: 'workflow', title: 'Process Automation Agent',
    purpose: 'Runs repetitive departmental processes and escalates exceptions.',
    modelPolicy: 'fast', memoryProfile: 'short',
    skills: ['process-automation', 'workflow-execution', 'exception-handling'],
    toolCategory: 'automation', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'resource-planner', role: 'planner', type: 'workflow', title: 'Resource Planning Agent',
    purpose: 'Forecasts capacity and allocates departmental resources and budget.',
    modelPolicy: 'reasoning', memoryProfile: 'standard',
    skills: ['resource-planning', 'capacity-forecasting', 'budget-tracking'],
    toolCategory: 'core', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'testing', role: 'qa', type: 'specialized', title: 'Testing Agent',
    purpose: 'Designs and executes test plans for departmental deliverables and software.',
    modelPolicy: 'coding', memoryProfile: 'standard',
    skills: ['test-design', 'test-execution', 'defect-reporting'],
    toolCategory: 'read', evaluationMetrics: [...COMMON_METRICS, 'defect_escape_rate'],
  },
  {
    key: 'integration', role: 'automation', type: 'workflow', title: 'Integration Agent',
    purpose: 'Maps and maintains integrations with external systems and webhooks.',
    modelPolicy: 'coding', memoryProfile: 'standard',
    skills: ['integration-mapping', 'api-contract-review', 'webhook-handling'],
    toolCategory: 'automation', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'dashboard', role: 'report', type: 'conversational', title: 'Dashboard Agent',
    purpose: 'Maintains departmental dashboards and metric definitions.',
    modelPolicy: 'balanced', memoryProfile: 'standard',
    skills: ['dashboard-maintenance', 'metric-definition', 'kpi-reporting'],
    toolCategory: 'reporting', evaluationMetrics: COMMON_METRICS,
  },
  {
    key: 'risk-assessment', role: 'safety', type: 'specialized', title: 'Risk Assessment Agent',
    purpose: 'Identifies, scores and tracks operational and compliance risks.',
    modelPolicy: 'reasoning', memoryProfile: 'standard',
    skills: ['risk-assessment', 'risk-register-maintenance', 'incident-triage'],
    toolCategory: 'read', evaluationMetrics: [...COMMON_METRICS, 'compliance_findings_recall'],
  },
];

/** Actions that always require human approval, whatever the role. */
export const SENSITIVE_ACTIONS = [
  'external_send',
  'payment',
  'delete_record',
  'publish_content',
  'grant_access',
  'change_permissions',
] as const;

/** Tools no agent may ever hold. */
export const GLOBALLY_FORBIDDEN_TOOLS = ['terminal', 'admin_panel', 'raw_sql_write', 'payment_execute'] as const;
