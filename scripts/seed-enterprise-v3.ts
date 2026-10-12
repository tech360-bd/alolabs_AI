/**
 * Enterprise Seed Script v3 — Enhanced
 *
 * Seeds the AI-EOS database with realistic enterprise data derived from the master
 * specification (enterprise-spec.ts). Covers all major entities: Departments,
 * Constitutional Rules, Agents, SOPs, Skills, Prompt Templates, Knowledge Graph,
 * Events, Engine Records, and Data Lake Entries.
 *
 * Usage: bun run scripts/seed-enterprise-v3.ts
 */

import { CONSTITUTION, DEPARTMENTS, DIVISIONS, EVENTS, CHAPTERS } from '../src/lib/enterprise-spec'
import { db } from '../src/lib/db'

// ─── UTILITIES ───────────────────────────────────────────────────────────────────

const startTime = Date.now()

function elapsed(): string {
  const ms = Date.now() - startTime
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}

function padNum(n: number, width: number = 3): string {
  return String(n).padStart(width, '0')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

// ─── SEEDING THRESHOLDS ──────────────────────────────────────────────────────────

const THRESHOLDS = {
  departments: 100,
  constitutionalRules: 500,
  agents: 2000,
  sops: 500,
  skills: 10000,
  promptTemplates: 50000,
  knowledgeNodes: 2500,
  knowledgeEdges: 5000,
  enterpriseEvents: 200,
  engineRecords: 5000,
  dataLakeEntries: 10000,
} as const

// ─── AGENT GENERATION DATA ───────────────────────────────────────────────────────

const AGENT_ROLES = [
  { role: 'manager', type: 'autonomous', title: 'Director Agent', purpose: 'Oversees departmental operations and coordinates cross-functional initiatives' },
  { role: 'specialist', type: 'specialized', title: 'Senior Specialist Agent', purpose: 'Handles complex domain-specific tasks requiring deep expertise' },
  { role: 'planner', type: 'workflow', title: 'Strategic Planning Agent', purpose: 'Develops and maintains departmental strategic plans and roadmaps' },
  { role: 'execution', type: 'autonomous', title: 'Execution Agent', purpose: 'Executes operational tasks and ensures timely delivery of work items' },
  { role: 'qa', type: 'specialized', title: 'Quality Assurance Agent', purpose: 'Ensures quality standards are met across all departmental outputs' },
  { role: 'automation', type: 'workflow', title: 'Automation Agent', purpose: 'Identifies and implements automation opportunities within the department' },
  { role: 'report', type: 'conversational', title: 'Reporting Agent', purpose: 'Generates reports and provides data-driven insights to stakeholders' },
  { role: 'safety', type: 'specialized', title: 'Safety & Compliance Agent', purpose: 'Monitors and enforces safety and compliance standards' },
  { role: 'memory', type: 'specialized', title: 'Knowledge Management Agent', purpose: 'Manages departmental knowledge base and institutional memory' },
  { role: 'productivity', type: 'autonomous', title: 'Productivity Agent', purpose: 'Optimizes workflows and improves departmental productivity metrics' },
]

const AGENT_ROLE_VARIANTS = [
  { role: 'specialist', type: 'specialized', title: 'Data Analyst Agent', purpose: 'Analyzes data and provides actionable insights for decision-making' },
  { role: 'specialist', type: 'specialized', title: 'Research Agent', purpose: 'Conducts research and synthesizes information from multiple sources' },
  { role: 'specialist', type: 'specialized', title: 'Communication Agent', purpose: 'Manages internal and external communications with consistency' },
  { role: 'execution', type: 'autonomous', title: 'Task Coordinator Agent', purpose: 'Coordinates task assignments and tracks progress across teams' },
  { role: 'execution', type: 'workflow', title: 'Process Automation Agent', purpose: 'Automates repetitive processes to improve efficiency' },
  { role: 'planner', type: 'workflow', title: 'Resource Planning Agent', purpose: 'Plans and allocates resources for departmental initiatives' },
  { role: 'qa', type: 'specialized', title: 'Testing Agent', purpose: 'Designs and executes test plans for departmental deliverables' },
  { role: 'automation', type: 'workflow', title: 'Integration Agent', purpose: 'Manages integrations with external systems and services' },
  { role: 'report', type: 'conversational', title: 'Dashboard Agent', purpose: 'Maintains and updates departmental dashboards and metrics' },
  { role: 'safety', type: 'specialized', title: 'Risk Assessment Agent', purpose: 'Identifies and assesses risks in departmental operations' },
]

// ─── SOP CATEGORIES AND DATA ─────────────────────────────────────────────────────

const SOP_CATEGORIES = ['onboarding', 'operations', 'security', 'incident', 'deployment', 'compliance', 'communication', 'quality'] as const

const SOP_TEMPLATES: Record<string, { title: string; steps: string[]; checklist: string[] }> = {
  onboarding: {
    title: 'New Agent Onboarding Procedure',
    steps: [
      'Verify agent credentials and authorization level',
      'Assign department and role within organizational structure',
      'Configure agent access permissions according to least-privilege principle',
      'Load department-specific knowledge base and context',
      'Run calibration tests against baseline performance metrics',
      'Enable monitoring and logging for all agent interactions',
      'Assign mentor agent for first 30-day period',
      'Schedule performance review checkpoints at 7, 14, and 30 days',
    ],
    checklist: ['Credentials verified', 'Role assigned', 'Permissions configured', 'Knowledge base loaded', 'Calibration complete', 'Monitoring enabled', 'Mentor assigned', 'Review scheduled'],
  },
  operations: {
    title: 'Daily Operations Execution Protocol',
    steps: [
      'Review overnight system alerts and pending tasks',
      'Prioritize tasks based on urgency and business impact',
      'Execute high-priority tasks within SLA thresholds',
      'Update task status and log completion details',
      'Flag any blockers or dependencies for escalation',
      'Generate end-of-day summary report',
      'Archive completed work items and update metrics',
    ],
    checklist: ['Alerts reviewed', 'Tasks prioritized', 'High-priority executed', 'Status updated', 'Blockers flagged', 'Summary generated', 'Items archived'],
  },
  security: {
    title: 'Security Compliance Verification Procedure',
    steps: [
      'Audit current access control lists against policy requirements',
      'Verify encryption standards for data in transit and at rest',
      'Check for unauthorized configuration changes',
      'Review security incident logs for anomalous patterns',
      'Validate compliance with data handling policies',
      'Generate security posture report with risk scores',
      'Escalate critical findings to Security Operations Center',
    ],
    checklist: ['ACLs audited', 'Encryption verified', 'Changes reviewed', 'Logs analyzed', 'Data compliance validated', 'Report generated', 'Critical findings escalated'],
  },
  incident: {
    title: 'Incident Response and Remediation Protocol',
    steps: [
      'Detect and classify incident severity level',
      'Alert relevant stakeholders per escalation matrix',
      'Initiate containment procedures to limit impact',
      'Gather forensic data and preserve evidence chain',
      'Execute remediation plan based on incident type',
      'Verify service restoration and conduct post-incident testing',
      'Conduct root cause analysis and document findings',
      'Update incident playbook and preventive measures',
    ],
    checklist: ['Incident classified', 'Stakeholders alerted', 'Containment initiated', 'Evidence preserved', 'Remediation executed', 'Service verified', 'RCA completed', 'Playbook updated'],
  },
  deployment: {
    title: 'Production Deployment Procedure',
    steps: [
      'Verify all pre-deployment checklist items are complete',
      'Run automated test suite and confirm all tests pass',
      'Stage deployment artifacts in designated environment',
      'Execute deployment with rollback plan in place',
      'Monitor system health indicators for first 30 minutes',
      'Validate key user workflows are functioning correctly',
      'Sign off deployment and notify stakeholders of completion',
    ],
    checklist: ['Pre-deploy checks passed', 'Tests passing', 'Artifacts staged', 'Deployment executed', 'Health monitored', 'Workflows validated', 'Sign-off complete'],
  },
  compliance: {
    title: 'Regulatory Compliance Audit Procedure',
    steps: [
      'Identify applicable regulatory requirements for audit period',
      'Gather evidence of compliance for each requirement',
      'Map evidence to regulatory controls and frameworks',
      'Identify gaps between current state and requirements',
      'Document remediation plans for identified gaps',
      'Submit audit package to compliance review board',
      'Implement approved remediation actions within timeline',
    ],
    checklist: ['Requirements identified', 'Evidence gathered', 'Controls mapped', 'Gaps identified', 'Remediation planned', 'Audit submitted', 'Actions implemented'],
  },
  communication: {
    title: 'Cross-Departmental Communication Protocol',
    steps: [
      'Draft communication with clear purpose and expected outcome',
      'Verify audience segmentation and appropriate channel selection',
      'Route through departmental communication gatekeeper for review',
      'Obtain necessary approvals per communication matrix',
      'Distribute communication through approved channels',
      'Track delivery confirmation and read receipts',
      'Collect feedback and log in communication registry',
    ],
    checklist: ['Purpose defined', 'Audience verified', 'Gatekeeper review', 'Approvals obtained', 'Distributed', 'Delivery confirmed', 'Feedback collected'],
  },
  quality: {
    title: 'Quality Assurance Review Procedure',
    steps: [
      'Define quality criteria based on deliverable specifications',
      'Execute quality checklist against deliverable artifacts',
      'Identify deviations from quality standards',
      'Classify findings by severity and impact level',
      'Generate quality report with detailed findings',
      'Route findings to responsible parties for remediation',
      'Verify remediation completion and close quality tickets',
    ],
    checklist: ['Criteria defined', 'Checklist executed', 'Deviations identified', 'Findings classified', 'Report generated', 'Remediation routed', 'Verification complete'],
  },
}

// ─── SKILL CATEGORIES ────────────────────────────────────────────────────────────

const SKILL_CATEGORIES = [
  'Data',
  'Communication',
  'Reasoning',
  'Process',
  'Decision',
  'Learning',
  'Quality',
  'Security',
  'Integration',
  'Domain',
] as const

const SKILL_NAMES_BY_CATEGORY: Record<string, string[]> = {
  Data: [
    'Data Ingestion', 'Data Validation', 'Data Transformation', 'Data Aggregation',
    'Data Visualization', 'Data Cleansing', 'Data Extraction', 'Data Profiling',
    'Data Indexing', 'Data Compression',
  ],
  Communication: [
    'Internal Messaging', 'Report Generation', 'Stakeholder Briefing', 'Alert Notification',
    'Cross-Team Sync', 'Executive Summary', 'Status Reporting', 'Meeting Facilitation',
    'Documentation Writing', 'Knowledge Sharing',
  ],
  Reasoning: [
    'Logical Analysis', 'Pattern Recognition', 'Anomaly Detection', 'Root Cause Analysis',
    'Trend Forecasting', 'Hypothesis Testing', 'Causal Inference', 'Scenario Modeling',
    'Risk Assessment', 'Impact Analysis',
  ],
  Process: [
    'Workflow Orchestration', 'Task Scheduling', 'Resource Allocation', 'Pipeline Management',
    'Queue Processing', 'Batch Execution', 'State Machine Control', 'Dependency Resolution',
    'Parallel Processing', 'Sequential Execution',
  ],
  Decision: [
    'Multi-Criteria Evaluation', 'Consensus Building', 'Priority Ranking', 'Trade-off Analysis',
    'Cost-Benefit Analysis', 'Impact Scoring', 'Decision Logging', 'Approval Routing',
    'Escalation Handling', 'Conflict Resolution',
  ],
  Learning: [
    'Knowledge Acquisition', 'Skill Development', 'Pattern Learning', 'Feedback Integration',
    'Model Training', 'Experience Replay', 'Transfer Learning', 'Adaptation',
    'Memory Consolidation', 'Concept Mapping',
  ],
  Quality: [
    'Quality Inspection', 'Standards Verification', 'Compliance Checking', 'Performance Benchmarking',
    'Defect Detection', 'Regression Testing', 'Acceptance Testing', 'Code Review',
    'Documentation Audit', 'Process Audit',
  ],
  Security: [
    'Access Control', 'Threat Detection', 'Encryption Management', 'Authentication Verification',
    'Audit Logging', 'Vulnerability Scanning', 'Incident Response', 'Policy Enforcement',
    'Data Classification', 'Permission Management',
  ],
  Integration: [
    'API Integration', 'Service Mesh Management', 'Data Pipeline Connection', 'Event Bus Handling',
    'Webhook Management', 'Third-Party API Gateway', 'Microservice Orchestration', 'Service Discovery',
    'Protocol Translation', 'Message Queue Management',
  ],
  Domain: [
    'Industry Analysis', 'Regulatory Compliance', 'Market Research', 'Financial Modeling',
    'Supply Chain Management', 'Customer Analytics', 'Operational Analytics', 'Strategic Planning',
    'Competitive Intelligence', 'Risk Management',
  ],
}

// ─── PROMPT TEMPLATE CATEGORIES ──────────────────────────────────────────────────

const PROMPT_CATEGORIES = [
  'role_init', 'task_intake', 'task_execution', 'review_quality', 'communication',
  'decision_support', 'error_recovery', 'learning', 'planning', 'audit_compliance',
  'emergency', 'collaboration', 'reporting', 'innovation', 'domain_specific',
] as const

const PROMPT_SYSTEM_TEMPLATES: Record<string, string> = {
  role_init: `You are an AI agent in the {department} department of an enterprise organization. Your role is {role}. You operate within a governed multi-agent system and must follow all constitutional rules, departmental SOPs, and quality standards. Always verify task alignment with department mission before execution.`,
  task_intake: `You are a task intake processor for the {department} department. Analyze incoming requests, classify by type and priority, validate against departmental capabilities, and route appropriately. Maintain detailed audit trails for all task processing decisions. Apply constitutional rule {rule} as guidance.`,
  task_execution: `You are a task execution agent in {department}. Execute assigned tasks efficiently while maintaining quality standards. Follow the applicable SOP steps, document all actions taken, and report completion status. Handle exceptions by escalating per the departmental escalation matrix.`,
  review_quality: `You are a quality review agent for {department}. Evaluate completed work against defined quality criteria, identify deviations, classify findings by severity, and generate actionable remediation recommendations. Apply consistent evaluation standards across all reviews.`,
  communication: `You are a communication agent for {department}. Draft clear, concise communications for internal and external stakeholders. Follow organizational communication standards, maintain appropriate tone, and ensure message accuracy before distribution.`,
  decision_support: `You are a decision support agent for {department}. Gather relevant data, analyze options against defined criteria, present trade-offs clearly, and document decision rationale. Support consensus-building while maintaining objectivity and avoiding cognitive biases.`,
  error_recovery: `You are an error recovery agent for {department}. Diagnose errors, determine root cause, execute remediation procedures, verify fixes, and implement preventive measures. Follow incident response protocols and escalate when necessary.`,
  learning: `You are a self-improvement agent for {department}. Analyze performance data, identify improvement opportunities, implement learning strategies, and measure outcomes. Maintain a continuous improvement mindset while respecting safety and compliance boundaries.`,
  planning: `You are a strategic planning agent for {department}. Develop comprehensive plans considering resources, constraints, and dependencies. Create actionable roadmaps with clear milestones, KPIs, and risk mitigation strategies.`,
  audit_compliance: `You are a compliance audit agent for {department}. Verify adherence to constitutional rules, departmental policies, and regulatory requirements. Generate audit reports with evidence-based findings and remediation recommendations.`,
  emergency: `You are an emergency response agent for {department}. Execute emergency protocols with urgency and precision. Prioritize containment, communication, and recovery. Maintain calm, documented decision-making under pressure.`,
  collaboration: `You are a collaboration facilitator for {department}. Coordinate multi-agent workflows, manage handoffs, resolve conflicts, and ensure alignment across teams. Optimize collaboration efficiency while maintaining clear accountability.`,
  reporting: `You are a reporting agent for {department}. Compile data from multiple sources, generate accurate reports, and present insights in a clear, actionable format. Maintain reporting consistency and timeliness per organizational standards.`,
  innovation: `You are an innovation agent for {department}. Identify improvement opportunities, evaluate emerging technologies and methodologies, and propose innovations that align with departmental objectives and enterprise strategy.`,
  domain_specific: `You are a domain expert agent for {department}. Apply deep domain knowledge to solve complex problems, provide expert guidance, and mentor other agents. Stay current with domain developments and share knowledge proactively.`,
}

// ─── KNOWLEDGE NODE TYPES ───────────────────────────────────────────────────────

const KNOWLEDGE_NODE_TYPES = ['concept', 'entity', 'process', 'rule', 'skill', 'tool', 'document', 'person', 'department'] as const

const KNOWLEDGE_NODE_TITLES: Record<string, string[]> = {
  concept: ['Service Architecture', 'Data Flow Model', 'Business Process Model', 'Integration Pattern', 'Compliance Framework', 'Security Model', 'Performance Metric', 'Risk Factor', 'Capability Matrix', 'Maturity Level', 'Operating Model', 'Value Chain', 'Stakeholder Map', 'Decision Framework', 'Feedback Loop', 'Governance Structure', 'Quality Standard', 'Automation Level', 'Scalability Model', 'Resilience Pattern'],
  entity: ['Customer Profile', 'Vendor Record', 'Product Catalog', 'Service Registry', 'Employee Record', 'Contract', 'Policy Document', 'Asset Inventory', 'Compliance Certificate', 'Audit Finding', 'Risk Register', 'KPI Target', 'SLA Definition', 'Incident Record', 'Change Request', 'Project Charter', 'Budget Allocation', 'Work Order', 'Ticket Record', 'Knowledge Article'],
  process: ['Onboarding Workflow', 'Approval Chain', 'Incident Response', 'Deployment Pipeline', 'Change Management', 'Review Cycle', 'Reporting Workflow', 'Audit Process', 'Training Program', 'Capacity Planning', 'Demand Forecasting', 'Resource Allocation', 'Performance Review', 'Compliance Check', 'Data Validation', 'Backup Procedure', 'Recovery Plan', 'Monitoring Routine', 'Alert Routing', 'Escalation Path'],
  rule: ['Data Retention Policy', 'Access Control Rule', 'Encryption Standard', 'Approval Threshold', 'SLA Requirement', 'Compliance Mandate', 'Quality Gate', 'Security Protocol', 'Operational Constraint', 'Budget Limit', 'Naming Convention', 'Code Standard', 'Documentation Requirement', 'Communication Protocol', 'Escalation Rule'],
  skill: ['Data Analysis', 'Report Writing', 'Process Automation', 'Quality Inspection', 'Risk Assessment', 'Communication', 'Strategic Planning', 'Problem Solving', 'Decision Making', 'Knowledge Management'],
  tool: ['Monitoring Dashboard', 'Analytics Platform', 'CI/CD Pipeline', 'Ticket System', 'Document Repository', 'Communication Platform', 'Scheduling Tool', 'Code Editor', 'Testing Framework', 'Deployment Tool'],
  document: ['Department Charter', 'Operating Manual', 'Training Guide', 'API Reference', 'Architecture Document', 'Security Policy', 'Disaster Recovery Plan', 'Vendor Agreement', 'Performance Report', 'Strategic Plan'],
  person: ['Department VP', 'Team Lead', 'Senior Architect', 'Product Owner', 'Scrum Master', 'Security Officer', 'Compliance Manager', 'Data Steward', 'Operations Lead', 'Innovation Lead'],
  department: ['Engineering Division', 'Product Division', 'Operations Division', 'Sales Division', 'Marketing Division', 'Finance Division', 'HR Division', 'Legal Division', 'Security Division', 'Innovation Division'],
}

const EDGE_RELATION_TYPES = ['depends_on', 'part_of', 'related_to', 'implements', 'requires', 'produces', 'governs'] as const

// ─── ENGINE TYPES ───────────────────────────────────────────────────────────────

const ENGINE_TYPES = ['memory', 'planning', 'reflection', 'self_healing', 'self_optimization', 'evaluation', 'governance', 'security'] as const
const ENGINE_ACTIONS: Record<string, string[]> = {
  memory: ['store', 'retrieve', 'consolidate', 'prune', 'index', 'search'],
  planning: ['create_plan', 'update_plan', 'evaluate_plan', 'optimize_plan', 'allocate_resources', 'schedule_tasks'],
  reflection: ['self_assess', 'identify_improvements', 'benchmark', 'analyze_performance', 'review_outcomes', 'learn_from_errors'],
  self_healing: ['detect_anomaly', 'diagnose_issue', 'apply_fix', 'verify_recovery', 'prevent_recurrence', 'rollback'],
  self_optimization: ['optimize_workflow', 'reduce_latency', 'improve_accuracy', 'tune_parameters', 'balance_load', 'cache_strategy'],
  evaluation: ['score_output', 'compare_results', 'validate_quality', 'measure_performance', 'assess_risk', 'rank_options'],
  governance: ['check_compliance', 'enforce_policy', 'audit_action', 'verify_authorization', 'log_decision', 'escalate_violation'],
  security: ['scan_threats', 'verify_access', 'encrypt_data', 'detect_intrusion', 'audit_permissions', 'validate_input'],
}

const DATA_LAKE_SOURCES = ['agent_logs', 'system_metrics', 'interactions', 'knowledge', 'compliance'] as const
const DATA_LAKE_FORMATS = ['json', 'csv', 'parquet', 'text', 'binary'] as const

// ─── MAIN SEED FUNCTION ─────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Enterprise Seed Script v3 — Starting')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Enterprise Spec: ${CONSTITUTION.length} rules, ${DEPARTMENTS.length} departments, ${EVENTS.length} events, ${DIVISIONS.length} divisions`)
  console.log('')

  let deptMap = new Map<string, string>() // dept name -> db id
  let deptSlugToId = new Map<string, string>()

  // ────────────────────────────────────────────────────────────────────────────
  // 1. DEPARTMENTS (100 from spec)
  // ────────────────────────────────────────────────────────────────────────────
  const existingDepts = await db.department.count()
  const allDbDepts = await db.department.findMany({ select: { id: true, name: true, slug: true }, orderBy: { sortOrder: 'asc' } })

  if (existingDepts >= THRESHOLDS.departments) {
    console.log(`[SKIP] Departments: ${existingDepts} already exist (≥${THRESHOLDS.departments})`)
  } else {
    console.log(`[SEED] Departments: seeding ${DEPARTMENTS.length} departments...`)
    let created = 0
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      const spec = DEPARTMENTS[i]
      const slug = slugify(spec.name)
      const existing = allDbDepts.find(d => d.slug === slug)
      if (existing) {
        deptMap.set(spec.name, existing.id)
        deptSlugToId.set(slug, existing.id)
        continue
      }
      try {
        const dept = await db.department.create({
          data: {
            name: spec.name,
            slug,
            description: spec.mission,
            agentCount: 20,
            sortOrder: i,
            status: 'active',
          },
        })
        deptMap.set(spec.name, dept.id)
        deptSlugToId.set(slug, dept.id)
        created++
      } catch (e: any) {
        // If unique constraint, fetch existing
        const existing2 = await db.department.findFirst({ where: { name: spec.name } })
        if (existing2) { deptMap.set(spec.name, existing2.id); deptSlugToId.set(existing2.slug, existing2.id) }
      }
    }
    console.log(`  ✓ Departments: ${created} created, ${deptMap.size} total [${elapsed()}]`)
  }

  // Build deptMap: map each spec department to a DB department (by index or name match)
  // This ensures downstream seeding can find a departmentId for every spec department
  if (deptMap.size < DEPARTMENTS.length) {
    console.log(`  Mapping ${DEPARTMENTS.length} spec departments to ${allDbDepts.length} DB departments...`)
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      const spec = DEPARTMENTS[i]
      // Try exact name match first
      if (deptMap.has(spec.name)) continue
      // Find by slug match
      const slugMatch = allDbDepts.find(d => d.slug === slugify(spec.name))
      if (slugMatch) {
        deptMap.set(spec.name, slugMatch.id)
        deptSlugToId.set(slugMatch.slug, slugMatch.id)
        continue
      }
      // Fall back to index-based mapping (spec[i] -> db[i])
      if (i < allDbDepts.length) {
        deptMap.set(spec.name, allDbDepts[i].id)
        deptSlugToId.set(allDbDepts[i].slug, allDbDepts[i].id)
      }
    }
    console.log(`  deptMap now has ${deptMap.size} entries [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. CONSTITUTIONAL RULES (500 from spec)
  // ────────────────────────────────────────────────────────────────────────────
  const existingRules = await db.constitutionalRule.count()
  if (existingRules >= THRESHOLDS.constitutionalRules) {
    console.log(`[SKIP] Constitutional Rules: ${existingRules} already exist (≥${THRESHOLDS.constitutionalRules})`)
  } else {
    console.log(`[SEED] Constitutional Rules: seeding ${CONSTITUTION.length} rules...`)
    let created = 0
    const deptNames = DEPARTMENTS.map(d => d.name)
    for (let i = 0; i < CONSTITUTION.length; i++) {
      const rule = CONSTITUTION[i]
      const existing = await db.constitutionalRule.findUnique({ where: { ruleId: rule.ruleId } })
      if (existing) continue
      // Link first 5 rules per department (50 rules linked total for first 10 depts)
      const deptIdx = Math.floor(i / 5) % DEPARTMENTS.length
      const linkedDeptName = DEPARTMENTS[deptIdx]?.name
      const linkedDeptId = linkedDeptName ? deptMap.get(linkedDeptName) || null : null
      const conditions = [
        `Agent must be operating within ${rule.chapter} context`,
        `Task must align with enterprise mission`,
        `Prior authorization obtained if required`,
      ]
      const actions = [
        `Verify compliance with ${rule.title}`,
        `Log verification result to governance audit trail`,
        `Escalate violation per ${rule.priority} protocol`,
      ]
      try {
        await db.constitutionalRule.create({
          data: {
            ruleId: rule.ruleId,
            title: rule.title,
            category: rule.prismaCategory,
            severity: rule.prismaSeverity,
            description: rule.statement,
            conditions: JSON.stringify(conditions),
            actions: JSON.stringify(actions),
            departmentId: linkedDeptId,
            isActive: true,
            version: 1,
          },
        })
        created++
      } catch (e: any) {
        // skip on duplicate
      }
    }
    console.log(`  ✓ Constitutional Rules: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. AGENTS (~20 per department = 2000)
  // ────────────────────────────────────────────────────────────────────────────
  const existingAgents = await db.agent.count()
  if (existingAgents >= THRESHOLDS.agents) {
    console.log(`[SKIP] Agents: ${existingAgents} already exist (≥${THRESHOLDS.agents})`)
  } else {
    console.log(`[SEED] Agents: seeding ~20 per department across ${DEPARTMENTS.length} departments...`)
    let created = 0
    let agentCounter = 1

    for (const spec of DEPARTMENTS) {
      const deptId = deptMap.get(spec.name)
      if (!deptId) continue

      // 10 base roles + 10 variant roles = 20 per dept
      const allRoles = [...AGENT_ROLES, ...AGENT_ROLE_VARIANTS]

      for (const roleDef of allRoles) {
        const agentNum = padNum(agentCounter, 4)
        const agentIdStr = `AGENT-${agentNum}`
        const name = `${spec.name} ${roleDef.title}`
        const slug = slugify(name)
        const existing = await db.agent.findUnique({ where: { agentId: agentIdStr } })
        if (existing) { agentCounter++; continue }

        const allowedSkills = JSON.stringify(pickN(SKILL_CATEGORIES as unknown as string[], 3))
        const allowedTools = JSON.stringify(['search', 'calculator', 'file_manager', 'scheduler', 'reporter'].slice(0, randInt(2, 4)))
        const forbiddenTools = JSON.stringify(pickN(['terminal', 'database_write', 'admin_panel', 'email_send'], randInt(0, 2)))

        try {
          await db.agent.create({
            data: {
              agentId: agentIdStr,
              name,
              slug,
              departmentId: deptId,
              departmentName: spec.name,
              purpose: roleDef.purpose,
              type: roleDef.type,
              role: roleDef.role,
              allowedSkills,
              forbiddenSkills: '[]',
              allowedTools,
              forbiddenTools,
              inputSchema: JSON.stringify({ type: 'object', properties: { task: { type: 'string' }, context: { type: 'string' } } }),
              outputSchema: JSON.stringify({ type: 'object', properties: { result: { type: 'string' }, status: { type: 'string' } } }),
              workflowSteps: JSON.stringify(['intake', 'process', 'validate', 'output']),
              protectionRules: JSON.stringify(['No data exfiltration', 'No unauthorized access', 'Maintain audit log']),
              approvalRules: JSON.stringify(['Escalate decisions above threshold', 'Log all approval decisions']),
              handoffRules: JSON.stringify(['Transfer context on handoff', 'Confirm receipt on handoff']),
              qualityChecklist: JSON.stringify(['Verify output accuracy', 'Check completeness', 'Validate against requirements']),
              selfImprovement: JSON.stringify({ enabled: true, cycleDays: 30, targets: ['accuracy', 'speed', 'compliance'] }),
              productivityRules: JSON.stringify({ maxTasksPerCycle: 10, minQualityScore: 0.85, breakInterval: 50 }),
              status: 'active',
              version: 1,
            },
          })
          created++
        } catch (e: any) {
          // skip on duplicate
        }
        agentCounter++
      }
    }
    console.log(`  ✓ Agents: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. SOPs (~5 per department = 500)
  // ────────────────────────────────────────────────────────────────────────────
  const existingSops = await db.enterpriseSOP.count()
  if (existingSops >= THRESHOLDS.sops) {
    console.log(`[SKIP] SOPs: ${existingSops} already exist (≥${THRESHOLDS.sops})`)
  } else {
    console.log(`[SEED] SOPs: seeding ~5 per department across ${DEPARTMENTS.length} departments...`)
    console.log(`  deptMap has ${deptMap.size} entries, first 3: ${Array.from(deptMap.keys()).slice(0, 3).join(', ')}`)
    let created = 0
    let sopCounter = 1
    let skipped = 0
    let errors = 0

    for (const spec of DEPARTMENTS) {
      const deptId = deptMap.get(spec.name)
      if (!deptId) { skipped++; continue }

      // Pick 5 categories per department (rotating through the 8 categories)
      const categories = pickN(SOP_CATEGORIES as unknown as string[], 5)

      for (const cat of categories) {
        const template = SOP_TEMPLATES[cat]
        if (!template) continue
        const sopIdStr = `SOP-${padNum(sopCounter, 4)}`
        const title = `${spec.name} — ${template.title}`
        const existing = await db.enterpriseSOP.findUnique({ where: { sopId: sopIdStr } })
        if (existing) { sopCounter++; continue }

        const stepsJson = template.steps.map((s, i) => ({
          step: i + 1,
          action: s,
          owner: cat === 'security' || cat === 'compliance' ? 'compliance_officer' : 'department_agent',
          estimatedMinutes: randInt(2, 15),
        }))
        const checklistJson = template.checklist.map((c, i) => ({
          item: i + 1,
          description: c,
          required: true,
        }))

        try {
          await db.enterpriseSOP.create({
            data: {
              sopId: sopIdStr,
              title,
              category: cat,
              departmentId: deptId,
              ownerRole: cat === 'security' || cat === 'compliance' ? 'compliance_officer' : 'manager',
              priority: cat === 'security' || cat === 'incident' ? 'high' : 'medium',
              description: `Standard operating procedure for ${cat.replace('_', ' ')} in ${spec.name}. Defines the step-by-step process, quality gates, and responsible parties.`,
              steps: JSON.stringify(stepsJson),
              checklist: JSON.stringify(checklistJson),
              estimatedTime: `${randInt(15, 120)} min`,
              version: 1,
              status: 'active',
              isActive: true,
            },
          })
          created++
        } catch (e: any) {
          errors++
          if (errors <= 3) console.error(`  SOP create error: ${e.message || e}`)
        }
        sopCounter++
      }
    }
    console.log(`  ✓ SOPs: ${created} created, ${skipped} skipped (no dept), ${errors} errors [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. SKILLS (~100 per department = 10000)
  // ────────────────────────────────────────────────────────────────────────────
  const existingSkills = await db.skill.count()
  if (existingSkills >= THRESHOLDS.skills) {
    console.log(`[SKIP] Skills: ${existingSkills} already exist (≥${THRESHOLDS.skills})`)
  } else {
    console.log(`[SEED] Skills: seeding ~100 per department across ${DEPARTMENTS.length} departments...`)
    let created = 0
    let skillCounter = 1
    let skipped = 0
    let errors = 0

    for (const spec of DEPARTMENTS) {
      const deptId = deptMap.get(spec.name)
      if (!deptId) { skipped++; continue }

      // 10 categories × 10 skills each = 100 per department
      for (const cat of SKILL_CATEGORIES) {
        const skillNames = SKILL_NAMES_BY_CATEGORY[cat] || []
        for (const skillBaseName of skillNames) {
          const name = `${spec.name} — ${skillBaseName}`
          const slug = slugify(name) + `-${skillCounter}`
          const existing = await db.skill.findFirst({ where: { slug } })
          if (existing) { skillCounter++; continue }

          const difficulty = pick(['beginner', 'intermediate', 'advanced', 'expert'] as const)
          const riskLevel = difficulty === 'expert' ? 'high' : difficulty === 'advanced' ? 'medium' : 'low'

          try {
            await db.skill.create({
              data: {
                name,
                slug,
                category: cat,
                categorySlug: slugify(cat),
                title: skillBaseName,
                description: `${skillBaseName} capability for ${spec.name}. Provides ${cat.toLowerCase()}-level functionality aligned with departmental objectives and enterprise standards.`,
                version: '1.0.0',
                status: 'approved',
                riskLevel,
                requiresApproval: riskLevel === 'high',
                runtime: 'builtin',
                allowedTools: JSON.stringify(['search', 'file_manager']),
                forbiddenTools: '[]',
                inputs: JSON.stringify([{ name: 'input_data', type: 'string', description: 'Input data for processing' }]),
                outputs: JSON.stringify([{ name: 'result', type: 'string', description: 'Processing result' }]),
                purpose: `Enable ${skillBaseName.toLowerCase()} operations within ${spec.name}`,
                validationRules: JSON.stringify({ requiredFields: ['input_data'], maxLength: 10000 }),
                securityRules: JSON.stringify({ dataClassification: 'internal', auditLogging: true }),
                costPolicy: JSON.stringify({ maxTokensPerRun: 5000, dailyQuota: 100 }),
                requiredPermissions: '[]',
                safetyRules: JSON.stringify([`No unauthorized data access`, `Maintain audit trail`]),
                content: `# ${skillBaseName}\n\n${skillBaseName} skill for ${spec.name}.\n\n## Purpose\nEnable ${skillBaseName.toLowerCase()} operations within the department.\n\n## Usage\nThis skill is invoked by agents when ${skillBaseName.toLowerCase()} tasks are required.`,
              },
            })
            created++
          } catch (e: any) {
            errors++
            if (errors <= 3) console.error(`  Skill create error: ${e.message || e}`)
          }
          skillCounter++
        }
      }
    }
    console.log(`  ✓ Skills: ${created} created, ${skipped} skipped (no dept), ${errors} errors [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 6. PROMPT TEMPLATES (~500 per department = 50000)
  // ────────────────────────────────────────────────────────────────────────────
  const existingPrompts = await db.promptTemplate.count()
  if (existingPrompts >= THRESHOLDS.promptTemplates) {
    console.log(`[SKIP] Prompt Templates: ${existingPrompts} already exist (≥${THRESHOLDS.promptTemplates})`)
  } else {
    console.log(`[SEED] Prompt Templates: seeding ~500 per department across ${DEPARTMENTS.length} departments...`)
    let created = 0
    let promptCounter = 1

    for (const spec of DEPARTMENTS) {
      const deptId = deptMap.get(spec.name)
      if (!deptId) continue

      // 15 categories × ~33-34 variants each = ~500 per department
      const batchSize: { templateId: string; title: string; category: string; subcategory: string; departmentId: string; description: string; systemPrompt: string; userTemplate: string; variables: string; outputFormat: string; temperature: number; maxTokens: number; tags: string }[] = []

      for (const cat of PROMPT_CATEGORIES) {
        const variantsPerCat = 34 // 15 × 34 = 510 ≈ 500
        const systemBase = PROMPT_SYSTEM_TEMPLATES[cat] || ''

        for (let v = 0; v < variantsPerCat; v++) {
          const templateIdStr = `PROMPT-${padNum(promptCounter, 5)}`
          const variantName = `${cat.replace('_', ' ')} variant ${v + 1}`
          const title = `${spec.name} — ${variantName}`

          const systemPrompt = systemBase
            .replace(/\{department\}/g, spec.name)
            .replace(/\{role\}/g, cat.replace('_', ' '))
            .replace(/\{rule\}/g, `CONST-${padNum(randInt(1, 500), 3)}`)

          const userTemplate = `Please process the following task for the ${spec.name} department:\n\n{task_description}\n\nContext: {context}\nPriority: {priority}\n\nFollow the ${cat.replace('_', ' ')} protocol and report results with full traceability.`

          const variables = JSON.stringify([
            { name: 'task_description', type: 'string', required: true, description: 'Description of the task to be processed' },
            { name: 'context', type: 'string', required: false, description: 'Additional context for the task' },
            { name: 'priority', type: 'string', required: true, description: 'Task priority level' },
          ])

          const tags = JSON.stringify([cat, spec.code, spec.type, `v${v + 1}`])

          const outputFormat = pick(['text', 'json', 'markdown', 'structured'])

          batchSize.push({
            templateId: templateIdStr,
            title,
            category: cat,
            subcategory: `${cat}_${spec.code}`,
            departmentId: deptId,
            description: `${variantName} prompt template for ${spec.name}. Used for ${cat.replace('_', ' ')} scenarios.`,
            systemPrompt,
            userTemplate,
            variables,
            outputFormat,
            temperature: cat === 'innovation' || cat === 'domain_specific' ? 0.8 : 0.5,
            maxTokens: cat === 'reporting' || cat === 'domain_specific' ? 4096 : 2048,
            tags,
          })
          promptCounter++
        }
      }

      // Insert in batches of 500
      const batches = chunk(batchSize, 500)
      for (const batch of batches) {
        try {
          await db.promptTemplate.createMany({
            data: batch.map(b => ({
              templateId: b.templateId,
              title: b.title,
              category: b.category,
              subcategory: b.subcategory,
              departmentId: b.departmentId,
              description: b.description,
              systemPrompt: b.systemPrompt,
              userTemplate: b.userTemplate,
              variables: b.variables,
              outputFormat: b.outputFormat,
              temperature: b.temperature,
              maxTokens: b.maxTokens,
              version: 1,
              isPublic: true,
              usageCount: randInt(0, 100),
              rating: randFloat(3.0, 5.0),
              tags: b.tags,
              isActive: true,
            })),
          })
          created += batch.length
        } catch (e: any) {
          // If batch fails, try one by one
          for (const item of batch) {
            try {
              await db.promptTemplate.create({
                data: {
                  templateId: item.templateId,
                  title: item.title,
                  category: item.category,
                  subcategory: item.subcategory,
                  departmentId: item.departmentId,
                  description: item.description,
                  systemPrompt: item.systemPrompt,
                  userTemplate: item.userTemplate,
                  variables: item.variables,
                  outputFormat: item.outputFormat,
                  temperature: item.temperature,
                  maxTokens: item.maxTokens,
                  version: 1,
                  isPublic: true,
                  usageCount: randInt(0, 100),
                  rating: randFloat(3.0, 5.0),
                  tags: item.tags,
                  isActive: true,
                },
              })
              created++
            } catch {
              // skip duplicates
            }
          }
        }
        if (batches.indexOf(batch) % 5 === 0 || batches.indexOf(batch) === batches.length - 1) {
          console.log(`    Progress: ${created} prompts created for ${spec.name}...`)
        }
      }
    }
    console.log(`  ✓ Prompt Templates: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 7. KNOWLEDGE NODES (~25 per department = 2500)
  // ────────────────────────────────────────────────────────────────────────────
  const existingNodes = await db.knowledgeNode.count()
  if (existingNodes >= THRESHOLDS.knowledgeNodes) {
    console.log(`[SKIP] Knowledge Nodes: ${existingNodes} already exist (≥${THRESHOLDS.knowledgeNodes})`)
  } else {
    console.log(`[SEED] Knowledge Nodes: seeding ~25 per department across ${DEPARTMENTS.length} departments...`)
    let created = 0
    let nodeCounter = 1

    // First, collect all node IDs for edge creation later
    const nodeIdList: string[] = []

    for (const spec of DEPARTMENTS) {
      const deptId = deptMap.get(spec.name)
      if (!deptId) continue

      // 25 nodes: mix of types
      for (let i = 0; i < 25; i++) {
        const nodeType = KNOWLEDGE_NODE_TYPES[i % KNOWLEDGE_NODE_TYPES.length]
        const titlesForType = KNOWLEDGE_NODE_TITLES[nodeType] || []
        const baseTitle = titlesForType[i % titlesForType.length] || `${nodeType} Node ${i + 1}`
        const name = `${spec.name} — ${baseTitle}`
        const slug = slugify(name) + `-${nodeCounter}`
        const nodeIdStr = `KNODE-${padNum(nodeCounter, 5)}`

        const existing = await db.knowledgeNode.findUnique({ where: { nodeId: nodeIdStr } })
        if (existing) {
          nodeIdList.push(existing.id)
          nodeCounter++
          continue
        }

        try {
          const node = await db.knowledgeNode.create({
            data: {
              nodeId: nodeIdStr,
              title: name,
              type: nodeType,
              domain: spec.code.toLowerCase(),
              departmentId: deptId,
              content: `${baseTitle} knowledge node for ${spec.name}. Contains structured information about ${baseTitle.toLowerCase()} relevant to the department's operations and objectives.`,
              metadata: JSON.stringify({
                source: 'internal',
                department: spec.name,
                type: nodeType,
                keywords: [baseTitle.toLowerCase(), spec.code.toLowerCase()],
                createdFor: `seed-v3`,
              }),
              confidence: randFloat(0.7, 1.0),
              source: 'internal',
              version: 1,
            },
          })
          nodeIdList.push(node.id)
          created++
        } catch (e: any) {
          // skip on duplicate
        }
        nodeCounter++
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. KNOWLEDGE EDGES (connecting nodes, ~5000)
    // ──────────────────────────────────────────────────────────────────────────
    const existingEdges = await db.knowledgeEdge.count()
    if (existingEdges >= THRESHOLDS.knowledgeEdges) {
      console.log(`[SKIP] Knowledge Edges: ${existingEdges} already exist (≥${THRESHOLDS.knowledgeEdges})`)
    } else {
      console.log(`[SEED] Knowledge Edges: creating ${THRESHOLDS.knowledgeEdges} edges...`)
      let edgeCreated = 0
      const edgeBatch: { edgeId: string; fromNodeId: string; toNodeId: string; relationType: string; weight: number; metadata: string }[] = []

      for (let i = 0; i < THRESHOLDS.knowledgeEdges && nodeIdList.length >= 2; i++) {
        const fromIdx = randInt(0, nodeIdList.length - 1)
        let toIdx = randInt(0, nodeIdList.length - 1)
        while (toIdx === fromIdx) toIdx = randInt(0, nodeIdList.length - 1)

        edgeBatch.push({
          edgeId: `KEDGE-${padNum(i + 1, 5)}`,
          fromNodeId: nodeIdList[fromIdx],
          toNodeId: nodeIdList[toIdx],
          relationType: pick(EDGE_RELATION_TYPES as unknown as string[]),
          weight: randFloat(0.1, 1.0),
          metadata: JSON.stringify({ source: 'seed-v3', confidence: randFloat(0.6, 1.0) }),
        })
      }

      // Insert in batches of 500
      const edgeBatches = chunk(edgeBatch, 500)
      for (const batch of edgeBatches) {
        try {
          await db.knowledgeEdge.createMany({
            data: batch,
          })
          edgeCreated += batch.length
        } catch (e: any) {
          // Try one by one on failure
          for (const edge of batch) {
            try {
              await db.knowledgeEdge.create({ data: edge })
              edgeCreated++
            } catch {
              // skip
            }
          }
        }
      }
      console.log(`  ✓ Knowledge Edges: ${edgeCreated} created [${elapsed()}]`)
    }

    console.log(`  ✓ Knowledge Nodes: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 9. ENTERPRISE EVENTS (200 from spec)
  // ────────────────────────────────────────────────────────────────────────────
  const existingEvents = await db.enterpriseEvent.count()
  if (existingEvents >= THRESHOLDS.enterpriseEvents) {
    console.log(`[SKIP] Enterprise Events: ${existingEvents} already exist (≥${THRESHOLDS.enterpriseEvents})`)
  } else {
    console.log(`[SEED] Enterprise Events: seeding ${EVENTS.length} events from spec...`)
    let created = 0

    for (const spec of EVENTS) {
      const eventType = `${spec.category}.${spec.name.split(' ')[0].toLowerCase()}`
      const severityMap: Record<string, string> = { P0: 'critical', P1: 'warning', P2: 'info', P3: 'info', P4: 'debug' }
      const severity = severityMap[spec.priority] || 'info'

      const payload = JSON.stringify({
        eventId: spec.eventId,
        name: spec.name,
        category: spec.category,
        priority: spec.priority,
        trigger: spec.trigger,
        actionRequired: spec.actionRequired,
        sla: spec.sla,
        publisher: spec.publisher,
        subscribers: spec.subscribers,
      })

      const deptId = spec.publisher ? deptMap.get(DEPARTMENTS.find(d => d.deptId === spec.publisher)?.name || '') || null : null

      try {
        await db.enterpriseEvent.create({
          data: {
            eventType,
            source: spec.publisher || 'system',
            severity,
            payload,
            departmentId: deptId,
            processed: Math.random() > 0.5,
          },
        })
        created++
      } catch (e: any) {
        // skip
      }
    }
    console.log(`  ✓ Enterprise Events: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 10. ENGINE RECORDS (5000 across 8 engine types)
  // ────────────────────────────────────────────────────────────────────────────
  const existingEngines = await db.engineRecord.count()
  if (existingEngines >= THRESHOLDS.engineRecords) {
    console.log(`[SKIP] Engine Records: ${existingEngines} already exist (≥${THRESHOLDS.engineRecords})`)
  } else {
    console.log(`[SEED] Engine Records: seeding ${THRESHOLDS.engineRecords} across ${ENGINE_TYPES.length} engine types...`)
    let created = 0
    const engineBatch: { engineType: string; action: string; status: string; input: string; output: string; departmentId: string; duration: number; score: number; metadata: string }[] = []

    const deptIds = Array.from(deptMap.values())
    if (deptIds.length === 0) {
      // Fetch all dept IDs if map is empty
      const allDepts = await db.department.findMany({ select: { id: true } })
      allDepts.forEach(d => deptIds.push(d.id))
    }

    for (const engineType of ENGINE_TYPES) {
      const actions = ENGINE_ACTIONS[engineType] || []
      const recordsPerEngine = Math.ceil(THRESHOLDS.engineRecords / ENGINE_TYPES.length)

      for (let i = 0; i < recordsPerEngine; i++) {
        const action = pick(actions.length > 0 ? actions : ['process'])
        const status = pick(['completed', 'completed', 'completed', 'completed', 'failed']) // 80% success
        const deptId = pick(deptIds.length > 0 ? deptIds : ['__none__'])

        const input = JSON.stringify({
          action,
          engineType,
          timestamp: new Date(Date.now() - randInt(0, 7 * 24 * 60 * 60 * 1000)).toISOString(),
          params: { iterations: randInt(1, 10), threshold: randFloat(0.5, 1.0) },
        })

        const output = status === 'completed'
          ? JSON.stringify({ result: 'success', dataPoints: randInt(10, 1000), insights: randInt(1, 20) })
          : JSON.stringify({ result: 'failed', error: pick(['timeout', 'invalid_input', 'resource_exhausted', 'permission_denied']) })

        engineBatch.push({
          engineType,
          action,
          status,
          input,
          output,
          departmentId: deptId,
          duration: randInt(10, 30000),
          score: status === 'completed' ? randFloat(0.6, 1.0) : null as any,
          metadata: JSON.stringify({ source: 'seed-v3', batch: Math.floor(i / 500) }),
        })
      }
    }

    // Insert in batches of 500
    const engineBatches = chunk(engineBatch, 500)
    for (const batch of engineBatches) {
      try {
        await db.engineRecord.createMany({
          data: batch.map(b => ({
            engineType: b.engineType,
            action: b.action,
            status: b.status,
            input: b.input,
            output: b.output,
            departmentId: b.departmentId,
            duration: b.duration,
            score: b.score,
            metadata: b.metadata,
          })),
        })
        created += batch.length
      } catch (e: any) {
        // Try one by one
        for (const record of batch) {
          try {
            await db.engineRecord.create({
              data: {
                engineType: record.engineType,
                action: record.action,
                status: record.status,
                input: record.input,
                output: record.output,
                departmentId: record.departmentId,
                duration: record.duration,
                score: record.score,
                metadata: record.metadata,
              },
            })
            created++
          } catch {
            // skip
          }
        }
      }
    }
    console.log(`  ✓ Engine Records: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 11. DATA LAKE ENTRIES (10000 across 5 source types)
  // ────────────────────────────────────────────────────────────────────────────
  const existingDL = await db.dataLakeEntry.count()
  if (existingDL >= THRESHOLDS.dataLakeEntries) {
    console.log(`[SKIP] Data Lake Entries: ${existingDL} already exist (≥${THRESHOLDS.dataLakeEntries})`)
  } else {
    console.log(`[SEED] Data Lake Entries: seeding ${THRESHOLDS.dataLakeEntries} across ${DATA_LAKE_SOURCES.length} source types...`)
    let created = 0
    const dlBatch: { source: string; category: string; format: string; data: string; size: number; departmentId: string; tags: string; retention: string }[] = []

    const deptIds = Array.from(deptMap.values())
    if (deptIds.length === 0) {
      const allDepts = await db.department.findMany({ select: { id: true } })
      allDepts.forEach(d => deptIds.push(d.id))
    }

    for (const source of DATA_LAKE_SOURCES) {
      const recordsPerSource = Math.ceil(THRESHOLDS.dataLakeEntries / DATA_LAKE_SOURCES.length)

      for (let i = 0; i < recordsPerSource; i++) {
        const format = pick(DATA_LAKE_FORMATS as unknown as string[])
        const category = pick(['raw', 'processed', 'enriched', 'aggregated', 'archived'])
        const deptId = pick(deptIds.length > 0 ? deptIds : ['__none__'])

        const dataTemplates: Record<string, object> = {
          agent_logs: { agentId: `AGENT-${padNum(randInt(1, 2000), 4)}`, action: pick(['task_complete', 'error', 'handoff', 'decision']), duration: randInt(100, 5000) },
          system_metrics: { metric: pick(['cpu', 'memory', 'latency', 'throughput', 'error_rate']), value: randFloat(0, 100), unit: pick(['%', 'ms', 'req/s', 'MB']) },
          interactions: { type: pick(['user_query', 'agent_response', 'system_alert', 'approval_request']), status: pick(['success', 'pending', 'failed']) },
          knowledge: { nodeType: pick(KNOWLEDGE_NODE_TYPES as unknown as string[]), operation: pick(['create', 'update', 'query', 'delete']), confidence: randFloat(0.5, 1.0) },
          compliance: { ruleId: `CONST-${padNum(randInt(1, 500), 3)}`, status: pick(['pass', 'fail', 'warning']), severity: pick(['critical', 'high', 'medium', 'low']) },
        }

        const data = JSON.stringify(dataTemplates[source] || { source, record: i })
        const size = randInt(50, 50000)

        dlBatch.push({
          source,
          category,
          format,
          data,
          size,
          departmentId: deptId,
          tags: JSON.stringify([source, category, format]),
          retention: pick(['30d', '90d', '180d', '365d', '730d']),
        })
      }
    }

    // Insert in batches of 500
    const dlBatches = chunk(dlBatch, 500)
    for (const batch of dlBatches) {
      try {
        await db.dataLakeEntry.createMany({
          data: batch,
        })
        created += batch.length
      } catch (e: any) {
        // Try one by one
        for (const entry of batch) {
          try {
            await db.dataLakeEntry.create({ data: entry })
            created++
          } catch {
            // skip
          }
        }
      }
    }
    console.log(`  ✓ Data Lake Entries: ${created} created [${elapsed()}]`)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────────────────────────────────────
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  SEEDING COMPLETE — FINAL COUNTS')
  console.log('═══════════════════════════════════════════════════════════════')

  const finalCounts = await Promise.all([
    db.department.count(),
    db.constitutionalRule.count(),
    db.agent.count(),
    db.enterpriseSOP.count(),
    db.skill.count(),
    db.promptTemplate.count(),
    db.knowledgeNode.count(),
    db.knowledgeEdge.count(),
    db.enterpriseEvent.count(),
    db.engineRecord.count(),
    db.dataLakeEntry.count(),
  ])

  const entities = [
    'Departments',
    'Constitutional Rules',
    'Agents',
    'SOPs',
    'Skills',
    'Prompt Templates',
    'Knowledge Nodes',
    'Knowledge Edges',
    'Enterprise Events',
    'Engine Records',
    'Data Lake Entries',
  ]

  const thresholds = Object.values(THRESHOLDS)
  let totalEntities = 0
  for (let i = 0; i < entities.length; i++) {
    const count = finalCounts[i]
    const threshold = thresholds[i]
    totalEntities += count
    const status = count >= threshold ? '✓' : '⚠'
    console.log(`  ${status} ${entities[i].padEnd(22)} ${String(count).padStart(7)} / ${threshold}`)
  }

  console.log('───────────────────────────────────────────────────────────────')
  console.log(`  Total entities: ${totalEntities.toLocaleString()}`)
  console.log(`  Total time: ${elapsed()}`)
  console.log('═══════════════════════════════════════════════════════════════')

  await db.$disconnect()
}

// ─── EXECUTE ───────────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error('Seed script failed:', e)
  process.exit(1)
})
