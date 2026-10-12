/**
 * seed-agent-protocols-v2.ts
 *
 * Comprehensive protocol seeder for ALO Labs Agent Hub.
 * Generates realistic protocol data for all 2,000 agents based on their
 * department category and role, using the v2 schema format.
 *
 * Schema format:
 *   workflowSteps:    { step, action, description }[]
 *   protectionRules:  { rule, level, action, description }[]
 *   approvalRules:    { trigger, requiresApproval, approver }[]
 *   handoffRules:     { condition, handoffTo, reason }[]
 *   qualityChecklist: string[]
 *   selfImprovement:  { enabled, reviewCycle, metrics[], learningSources[] }
 *   productivityRules:{ maxConcurrentTasks, timeoutMinutes, priorityLevels[], autoRetry, retryLimit }
 *
 * Idempotent: safe to run multiple times.
 * Uses batch $executeRaw for efficiency with proper SQLite parameterization.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ============================================================
// TYPES
// ============================================================

type Category =
  | 'EXECUTIVE' | 'FINANCE' | 'HR' | 'LEGAL' | 'ENGINEERING'
  | 'AI_ML' | 'SECURITY' | 'MARKETING' | 'CRM_SALES'
  | 'DESIGN' | 'EDUCATION' | 'ADMIN';

type Role =
  | 'manager' | 'planner' | 'execution' | 'qa' | 'report'
  | 'automation' | 'safety' | 'memory' | 'productivity'
  | 'owner_approval' | 'specialist';

interface WorkflowStep { step: number; action: string; description: string; }
interface ProtectionRule { rule: string; level: 'critical' | 'high' | 'medium' | 'low'; action: string; description: string; }
interface ApprovalRule { trigger: string; requiresApproval: boolean; approver: string; }
interface HandoffRule { condition: string; handoffTo: string; reason: string; }
interface SelfImprovement { enabled: boolean; reviewCycle: string; metrics: string[]; learningSources: string[]; }
interface ProductivityRules { maxConcurrentTasks: number; timeoutMinutes: number; priorityLevels: string[]; autoRetry: boolean; retryLimit: number; }

// ============================================================
// DEPARTMENT → CATEGORY MAPPING (all 100 departments)
// ============================================================

const DEPT_CATEGORY_MAP: Record<string, Category> = {
  // EXECUTIVE (7)
  'Strategic Planning': 'EXECUTIVE', 'Operations Management': 'EXECUTIVE',
  'Risk Management': 'EXECUTIVE', 'Innovation Lab': 'EXECUTIVE',
  'Future Technologies': 'EXECUTIVE', 'Business Intelligence': 'EXECUTIVE',
  'Project Management': 'EXECUTIVE',
  // FINANCE (11)
  'Financial Analysis': 'FINANCE', 'Financial Reporting': 'FINANCE',
  'Cost Accounting': 'FINANCE', 'Revenue Management': 'FINANCE',
  'Budget Planning': 'FINANCE', 'Treasury Operations': 'FINANCE',
  'Tax Management': 'FINANCE', 'Accounts Payable': 'FINANCE',
  'Accounts Receivable': 'FINANCE', 'Benefits Management': 'FINANCE',
  'Payroll Administration': 'FINANCE',
  // HR (6)
  'Recruitment': 'HR', 'Employee Onboarding': 'HR',
  'Employee Relations': 'HR', 'Performance Management': 'HR',
  'Training & Development': 'HR', 'Workplace Safety': 'HR',
  // LEGAL (7)
  'Legal Administration': 'LEGAL', 'Compliance & Policies': 'LEGAL',
  'Compliance Monitoring': 'LEGAL', 'Patent & IP Management': 'LEGAL',
  'Internal Audit': 'LEGAL', 'Data Privacy': 'LEGAL',
  'Policy Enforcement': 'LEGAL',
  // ENGINEERING (10)
  'Frontend Development': 'ENGINEERING', 'Backend Development': 'ENGINEERING',
  'Mobile Development': 'ENGINEERING', 'Database Engineering': 'ENGINEERING',
  'DevOps & CI/CD': 'ENGINEERING', 'System Architecture': 'ENGINEERING',
  'API Development': 'ENGINEERING', 'QA Engineering': 'ENGINEERING',
  'Prototype Development': 'ENGINEERING', 'Quality Assurance': 'ENGINEERING',
  // AI_ML (11)
  'LLM Operations': 'AI_ML', 'Model Training': 'AI_ML',
  'Model Evaluation': 'AI_ML', 'MLOps Infrastructure': 'AI_ML',
  'Computer Vision': 'AI_ML', 'NLP Services': 'AI_ML',
  'AI Analytics': 'AI_ML', 'AI Research': 'AI_ML',
  'AI Safety & Ethics': 'AI_ML', 'Prompt Engineering': 'AI_ML',
  'Data Pipeline': 'AI_ML',
  // SECURITY (7)
  'Cybersecurity Operations': 'SECURITY', 'Security Auditing': 'SECURITY',
  'Vulnerability Management': 'SECURITY', 'Threat Intelligence': 'SECURITY',
  'Incident Response': 'SECURITY', 'Identity Management': 'SECURITY',
  'Access Control': 'SECURITY',
  // MARKETING (16)
  'Brand Strategy': 'MARKETING', 'Content Strategy': 'MARKETING',
  'Digital Advertising': 'MARKETING', 'Email Marketing': 'MARKETING',
  'Social Media': 'MARKETING', 'SEO Content': 'MARKETING',
  'Copywriting': 'MARKETING', 'Blog & Article Writing': 'MARKETING',
  'Multimedia Publishing': 'MARKETING', 'Event Marketing': 'MARKETING',
  'Growth Analytics': 'MARKETING', 'Market Research': 'MARKETING',
  'Market Exploration': 'MARKETING', 'Competitive Analysis': 'MARKETING',
  'Lead Generation': 'MARKETING', 'Brand Communications': 'MARKETING',
  // CRM_SALES (4)
  'Customer Relations': 'CRM_SALES', 'Customer Success': 'CRM_SALES',
  'Sales Operations': 'CRM_SALES', 'Partnership Development': 'CRM_SALES',
  // DESIGN (4)
  'Graphic Design': 'DESIGN', 'Video Production': 'DESIGN',
  'Audio Production': 'DESIGN', 'User Experience Research': 'DESIGN',
  // EDUCATION (10)
  'Curriculum Development': 'EDUCATION', 'Course Delivery': 'EDUCATION',
  'E-Learning Platform': 'EDUCATION', 'Educational Research': 'EDUCATION',
  'Assessment & Grading': 'EDUCATION', 'Student Enrollment': 'EDUCATION',
  'Student Support': 'EDUCATION', 'Teacher Training': 'EDUCATION',
  'Learning Analytics': 'EDUCATION', 'Certification Programs': 'EDUCATION',
  // ADMIN (8)
  'Office Administration': 'ADMIN', 'Technical Documentation': 'ADMIN',
  'Vendor Management': 'ADMIN', 'Supply Chain': 'ADMIN',
  'Open Source Contributions': 'ADMIN', 'Technology Scouting': 'ADMIN',
  'Process Optimization': 'ADMIN', 'Product Innovation': 'ADMIN',
};

// ============================================================
// SKILL POOLS BY CATEGORY
// ============================================================

const SKILLS_BY_CATEGORY: Record<Category, string[]> = {
  EXECUTIVE: ['strategic_analysis', 'decision_support', 'report_generation', 'data_visualization', 'meeting_summarization', 'risk_assessment', 'stakeholder_communication', 'kpi_tracking', 'resource_allocation'],
  FINANCE: ['financial_modeling', 'invoice_processing', 'budget_calculation', 'tax_computation', 'reconciliation', 'financial_reporting', 'forecasting', 'compliance_check', 'audit_trail_review'],
  HR: ['resume_screening', 'interview_scheduling', 'onboarding_management', 'performance_review', 'training_recommendation', 'policy_lookup', 'employee_engagement', 'compensation_analysis'],
  LEGAL: ['document_review', 'compliance_check', 'contract_analysis', 'ip_search', 'regulatory_lookup', 'audit_trail_review', 'risk_assessment', 'policy_drafting'],
  ENGINEERING: ['code_generation', 'code_review', 'test_generation', 'bug_detection', 'api_design', 'documentation_writing', 'deployment_check', 'refactoring', 'architecture_review'],
  AI_ML: ['model_inference', 'prompt_engineering', 'data_preprocessing', 'model_evaluation', 'embedding_generation', 'token_counting', 'feature_engineering', 'hyperparameter_tuning'],
  SECURITY: ['vulnerability_scan', 'threat_detection', 'log_analysis', 'access_review', 'incident_triage', 'security_reporting', 'penetration_testing', 'forensic_analysis'],
  MARKETING: ['content_writing', 'seo_optimization', 'social_posting', 'email_composition', 'market_research', 'analytics_review', 'lead_scoring', 'brand_consistency_check', 'audience_segmentation'],
  CRM_SALES: ['lead_management', 'contact_enrichment', 'deal_tracking', 'follow_up_scheduling', 'customer_scoring', 'pipeline_analysis', 'churn_prediction', 'upsell_recommendation'],
  DESIGN: ['image_generation', 'video_editing', 'audio_processing', 'layout_design', 'brand_application', 'ux_analysis', 'color_theory', 'typography_selection'],
  EDUCATION: ['course_creation', 'assessment_design', 'student_analysis', 'curriculum_mapping', 'learning_path_design', 'grading_assistance', 'content_adaptation', 'engagement_tracking'],
  ADMIN: ['document_management', 'vendor_evaluation', 'process_mapping', 'inventory_check', 'scheduling', 'report_compilation', 'cost_tracking', 'compliance_monitoring'],
};

const FORBIDDEN_SKILLS_BY_CATEGORY: Record<Category, string[]> = {
  EXECUTIVE: ['database_deletion', 'credential_access', 'cross_tenant_access'],
  FINANCE: ['database_deletion', 'credential_access', 'unrestricted_export'],
  HR: ['database_deletion', 'credential_access', 'salary_override'],
  LEGAL: ['database_deletion', 'credential_access', 'contract_auto_sign'],
  ENGINEERING: ['database_deletion', 'production_deploy_unapproved', 'credential_access'],
  AI_ML: ['database_deletion', 'credential_access', 'model_weight_export'],
  SECURITY: ['database_deletion', 'security_disable', 'credential_access'],
  MARKETING: ['database_deletion', 'bulk_messaging_unapproved', 'credential_access'],
  CRM_SALES: ['database_deletion', 'credential_access', 'pricing_override'],
  DESIGN: ['database_deletion', 'credential_access', 'brand_asset_delete'],
  EDUCATION: ['database_deletion', 'credential_access', 'grade_override'],
  ADMIN: ['database_deletion', 'credential_access', 'payment_authorize'],
};

// ============================================================
// TOOL POOLS BY CATEGORY
// ============================================================

const TOOLS_BY_CATEGORY: Record<Category, string[]> = {
  EXECUTIVE: ['dashboard_reader', 'report_generator', 'meeting_scheduler', 'data_query', 'notification_service', 'web_search'],
  FINANCE: ['calculator', 'spreadsheet_reader', 'financial_model', 'invoice_processor', 'tax_database', 'budget_tool'],
  HR: ['applicant_tracker', 'calendar', 'email_sender', 'policy_database', 'training_platform', 'onboarding_workflow'],
  LEGAL: ['document_parser', 'contract_template', 'compliance_database', 'regulation_lookup', 'audit_logger', 'digital_signature'],
  ENGINEERING: ['code_executor', 'git_client', 'database_query', 'api_tester', 'ci_cd_pipeline', 'deployment_staging'],
  AI_ML: ['llm_interface', 'embedding_service', 'model_registry', 'token_counter', 'prompt_manager', 'data_loader'],
  SECURITY: ['network_scanner', 'log_analyzer', 'vulnerability_scanner', 'alert_system', 'firewall_reader', 'incident_tracker'],
  MARKETING: ['web_search', 'image_generator', 'text_editor', 'seo_analyzer', 'analytics_dashboard', 'content_calendar'],
  CRM_SALES: ['crm_client', 'email_sender', 'calendar', 'contact_database', 'scoring_engine', 'pipeline_tracker'],
  DESIGN: ['image_editor', 'video_editor', 'audio_editor', 'layout_tool', 'brand_asset_library', 'prototype_tool'],
  EDUCATION: ['lms_client', 'assessment_engine', 'gradebook', 'student_database', 'content_library', 'video_hosting'],
  ADMIN: ['file_manager', 'vendor_database', 'inventory_system', 'calendar', 'notification_service', 'report_builder'],
};

const FORBIDDEN_TOOLS_BY_CATEGORY: Record<Category, string[]> = {
  EXECUTIVE: ['shell_unrestricted', 'database_drop', 'secret_reader'],
  FINANCE: ['shell_unrestricted', 'database_drop', 'payment_execute_unapproved'],
  HR: ['shell_unrestricted', 'database_drop', 'secret_reader'],
  LEGAL: ['shell_unrestricted', 'database_drop', 'digital_signature_override'],
  ENGINEERING: ['shell_unrestricted', 'database_drop', 'production_deploy_direct'],
  AI_ML: ['shell_unrestricted', 'database_drop', 'model_registry_delete'],
  SECURITY: ['shell_unrestricted', 'database_drop', 'firewall_disable'],
  MARKETING: ['shell_unrestricted', 'database_drop', 'bulk_messaging_unapproved'],
  CRM_SALES: ['shell_unrestricted', 'database_drop', 'secret_reader'],
  DESIGN: ['shell_unrestricted', 'database_drop', 'secret_reader'],
  EDUCATION: ['shell_unrestricted', 'database_drop', 'grade_override_tool'],
  ADMIN: ['shell_unrestricted', 'database_drop', 'secret_reader'],
};

// ============================================================
// WORKFLOW STEPS TEMPLATES PER ROLE
// ============================================================

const WORKFLOW_BY_ROLE: Record<string, WorkflowStep[]> = {
  manager: [
    { step: 1, action: 'receive_task_request', description: 'Accept incoming task and validate scope against department objectives' },
    { step: 2, action: 'assess_resources', description: 'Evaluate team capacity, skill availability, and timeline constraints' },
    { step: 3, action: 'assign_subtasks', description: 'Distribute work items to appropriate team members based on expertise' },
    { step: 4, action: 'monitor_progress', description: 'Track execution progress and handle escalations or blockers' },
    { step: 5, action: 'consolidate_and_review', description: 'Review all outputs and ensure cohesive final deliverable' },
    { step: 6, action: 'deliver_and_report', description: 'Submit final deliverable and generate performance report' },
  ],
  planner: [
    { step: 1, action: 'analyze_requirements', description: 'Decompose the task into actionable steps with dependencies' },
    { step: 2, action: 'map_dependencies', description: 'Identify prerequisite tasks and sequence them logically' },
    { step: 3, action: 'estimate_resources', description: 'Calculate time, skill, and tool requirements for each step' },
    { step: 4, action: 'create_plan', description: 'Produce a structured execution plan with milestones' },
    { step: 5, action: 'validate_plan', description: 'Cross-check plan against constraints and get stakeholder buy-in' },
  ],
  execution: [
    { step: 1, action: 'validate_input', description: 'Confirm task parameters, data sources, and expected outputs' },
    { step: 2, action: 'execute_primary_work', description: 'Perform the core task using permitted skills and tools' },
    { step: 3, action: 'self_quality_check', description: 'Verify output against quality criteria before submission' },
    { step: 4, action: 'submit_output', description: 'Deliver completed work to the requesting agent or system' },
  ],
  qa: [
    { step: 1, action: 'receive_artifact', description: 'Accept the deliverable for quality review' },
    { step: 2, action: 'check_completeness', description: 'Verify all required components are present and correct' },
    { step: 3, action: 'validate_accuracy', description: 'Cross-check data accuracy and logical consistency' },
    { step: 4, action: 'assess_quality', description: 'Score against department quality standards and benchmarks' },
    { step: 5, action: 'report_findings', description: 'Document defects, suggestions, and final quality verdict' },
  ],
  report: [
    { step: 1, action: 'gather_data', description: 'Collect metrics, outputs, and performance data from relevant sources' },
    { step: 2, action: 'analyze_trends', description: 'Identify patterns, anomalies, and key insights in the data' },
    { step: 3, action: 'create_visualizations', description: 'Generate charts, graphs, and summary tables' },
    { step: 4, action: 'compile_report', description: 'Assemble findings into a structured, readable report' },
    { step: 5, action: 'distribute_report', description: 'Send report to stakeholders and archive for future reference' },
  ],
  automation: [
    { step: 1, action: 'identify_automation_target', description: 'Detect repetitive or rule-based tasks suitable for automation' },
    { step: 2, action: 'design_workflow', description: 'Create an automated workflow with triggers, steps, and error handling' },
    { step: 3, action: 'implement_and_test', description: 'Build the automation and validate it in a staging environment' },
    { step: 4, action: 'deploy_and_monitor', description: 'Release to production and monitor for failures or drift' },
  ],
  safety: [
    { step: 1, action: 'scan_request', description: 'Analyze incoming task for safety risks and policy violations' },
    { step: 2, action: 'check_permissions', description: 'Verify the requesting agent has authorization for the requested action' },
    { step: 3, action: 'assess_data_sensitivity', description: 'Classify data involved and apply appropriate protection level' },
    { step: 4, action: 'approve_or_block', description: 'Either greenlight the task or block with a detailed reason' },
  ],
  memory: [
    { step: 1, action: 'classify_information', description: 'Categorize incoming data by type, relevance, and retention policy' },
    { step: 2, action: 'store_in_memory', description: 'Write validated information to the appropriate memory tier' },
    { step: 3, action: 'index_and_link', description: 'Create search indices and link related memory entries' },
    { step: 4, action: 'prune_stale_data', description: 'Remove outdated or low-confidence entries per retention rules' },
  ],
  productivity: [
    { step: 1, action: 'measure_current_state', description: 'Collect baseline productivity metrics for the team' },
    { step: 2, action: 'identify_bottlenecks', description: 'Detect inefficiencies, delays, or resource underutilization' },
    { step: 3, action: 'recommend_improvements', description: 'Suggest process changes, tool upgrades, or workflow adjustments' },
    { step: 4, action: 'track_improvement', description: 'Monitor adopted changes and measure productivity gains' },
  ],
  owner_approval: [
    { step: 1, action: 'receive_approval_request', description: 'Accept incoming approval request with full context' },
    { step: 2, action: 'evaluate_risk', description: 'Assess risk level, compliance impact, and business implications' },
    { step: 3, action: 'make_decision', description: 'Approve, reject, or request modifications with documented rationale' },
    { step: 4, action: 'notify_requester', description: 'Communicate decision and any conditions to the requesting agent' },
  ],
  specialist: [
    { step: 1, action: 'analyze_task', description: 'Understand the specialized task requirements and constraints' },
    { step: 2, action: 'apply_expertise', description: 'Leverage domain-specific knowledge and tools to perform the task' },
    { step: 3, action: 'validate_output', description: 'Ensure output meets domain-specific quality standards' },
    { step: 4, action: 'deliver_result', description: 'Submit completed work with supporting documentation' },
  ],
};

// ============================================================
// PROTECTION RULES PER CATEGORY
// ============================================================

const PROTECTION_RULES_BY_CATEGORY: Record<Category, ProtectionRule[]> = {
  EXECUTIVE: [
    { rule: 'No cross-tenant data access', level: 'critical', action: 'block', description: 'Block any attempt to access data from other companies or tenants' },
    { rule: 'Executive data confidentiality', level: 'high', action: 'block', description: 'Never expose strategic plans or financial projections to unauthorized agents' },
    { rule: 'Approval for external communication', level: 'medium', action: 'require_approval', description: 'All outbound communications must be approved by manager' },
    { rule: 'Session timeout enforcement', level: 'medium', action: 'auto_logout', description: 'Terminate idle sessions after the configured timeout period' },
  ],
  FINANCE: [
    { rule: 'Financial data integrity', level: 'critical', action: 'block', description: 'Never modify financial records without dual authorization' },
    { rule: 'Payment execution guard', level: 'critical', action: 'block', description: 'Block all payment executions unless explicitly authorized' },
    { rule: 'Tax filing protection', level: 'high', action: 'require_approval', description: 'Tax filings require manager review before submission' },
    { rule: 'Sensitive PII handling', level: 'high', action: 'encrypt', description: 'Encrypt all personally identifiable financial information' },
  ],
  HR: [
    { rule: 'Employee data privacy', level: 'critical', action: 'block', description: 'Never expose employee personal data to unauthorized agents' },
    { rule: 'Salary information guard', level: 'critical', action: 'block', description: 'Salary and compensation data is restricted to authorized roles only' },
    { rule: 'Recruitment bias prevention', level: 'high', action: 'audit', description: 'Log all screening decisions for bias audit review' },
    { rule: 'Onboarding data retention', level: 'medium', action: 'auto_purge', description: 'Purge temporary onboarding documents after 90 days' },
  ],
  LEGAL: [
    { rule: 'Attorney-client privilege', level: 'critical', action: 'block', description: 'Never disclose legally privileged communications' },
    { rule: 'Contract auto-sign prevention', level: 'critical', action: 'block', description: 'Contracts must never be signed without human review' },
    { rule: 'Regulatory compliance check', level: 'high', action: 'require_approval', description: 'All legal actions require compliance validation' },
    { rule: 'Document version control', level: 'medium', action: 'version_lock', description: 'Lock legal documents after final approval to prevent unauthorized edits' },
  ],
  ENGINEERING: [
    { rule: 'No direct production deployments', level: 'critical', action: 'block', description: 'Production deployments must go through CI/CD pipeline with approvals' },
    { rule: 'Database write protection', level: 'critical', action: 'block', description: 'Direct database writes to production are blocked; use migration tools' },
    { rule: 'Secret exposure prevention', level: 'critical', action: 'block', description: 'Never log, output, or transmit API keys, passwords, or tokens' },
    { rule: 'Code review requirement', level: 'high', action: 'require_approval', description: 'All code changes require peer review before merge' },
  ],
  AI_ML: [
    { rule: 'Model output safety', level: 'critical', action: 'block', description: 'Block AI outputs flagged for harmful, biased, or confidential content' },
    { rule: 'Training data integrity', level: 'high', action: 'audit', description: 'Log all training data access for compliance auditing' },
    { rule: 'Compute budget enforcement', level: 'medium', action: 'throttle', description: 'Throttle requests when approaching compute budget limits' },
    { rule: 'Model weight export block', level: 'high', action: 'block', description: 'Prevent unauthorized export of model weights or artifacts' },
  ],
  SECURITY: [
    { rule: 'No security tool disable', level: 'critical', action: 'block', description: 'Never disable firewalls, monitors, or security controls' },
    { rule: 'Audit log immutability', level: 'critical', action: 'block', description: 'Audit logs cannot be deleted or modified by any agent' },
    { rule: 'Incident escalation protocol', level: 'high', action: 'auto_escalate', description: 'Automatically escalate critical incidents to security manager' },
    { rule: 'Vulnerability disclosure control', level: 'high', action: 'require_approval', description: 'Vulnerability reports require approval before external sharing' },
  ],
  MARKETING: [
    { rule: 'Brand guideline compliance', level: 'high', action: 'block', description: 'All outbound content must comply with brand guidelines' },
    { rule: 'Bulk messaging prevention', level: 'high', action: 'require_approval', description: 'Bulk messaging campaigns require manager approval' },
    { rule: 'Public publishing guard', level: 'medium', action: 'require_approval', description: 'Content published publicly must be reviewed first' },
    { rule: 'Competitive data handling', level: 'medium', action: 'audit', description: 'Log all access to competitive intelligence data' },
  ],
  CRM_SALES: [
    { rule: 'Customer data access control', level: 'critical', action: 'block', description: 'Customer PII is restricted to assigned accounts only' },
    { rule: 'Pricing authority limit', level: 'high', action: 'require_approval', description: 'Discounts above threshold require sales manager approval' },
    { rule: 'Deal deletion prevention', level: 'high', action: 'block', description: 'Active deals cannot be deleted; only archived with reason' },
    { rule: 'Communication frequency cap', level: 'medium', action: 'throttle', description: 'Limit outbound communications per customer to prevent spam' },
  ],
  DESIGN: [
    { rule: 'Brand asset integrity', level: 'high', action: 'block', description: 'Official brand assets cannot be modified without approval' },
    { rule: 'Copyright compliance', level: 'high', action: 'block', description: 'Never use unlicensed images, fonts, or media in deliverables' },
    { rule: 'Output format validation', level: 'medium', action: 'validate', description: 'Verify all design exports meet required specifications' },
  ],
  EDUCATION: [
    { rule: 'Student data privacy (FERPA)', level: 'critical', action: 'block', description: 'Student records are protected and access is logged' },
    { rule: 'Grade integrity', level: 'critical', action: 'block', description: 'Grades cannot be modified after finalization without approval' },
    { rule: 'Content accuracy review', level: 'high', action: 'require_approval', description: 'Course content changes require subject matter review' },
    { rule: 'Assessment fairness check', level: 'medium', action: 'audit', description: 'Log all assessment scoring for bias and fairness review' },
  ],
  ADMIN: [
    { rule: 'Vendor contract protection', level: 'high', action: 'block', description: 'Vendor contracts cannot be modified without legal review' },
    { rule: 'Purchase order approval', level: 'high', action: 'require_approval', description: 'Purchase orders above threshold require finance approval' },
    { rule: 'Inventory access control', level: 'medium', action: 'audit', description: 'All inventory modifications are logged for audit trail' },
  ],
};

// ============================================================
// APPROVAL RULES PER CATEGORY
// ============================================================

const APPROVAL_RULES_BY_CATEGORY: Record<Category, { trigger: string; requiresApproval: boolean; approver: string }[]> = {
  EXECUTIVE: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'owner_approval' },
    { trigger: 'strategic_decision_execution', requiresApproval: true, approver: 'owner_approval' },
    { trigger: 'cross_department_coordination', requiresApproval: false, approver: 'manager' },
  ],
  FINANCE: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'financial_transaction', requiresApproval: true, approver: 'manager' },
    { trigger: 'report_publication', requiresApproval: true, approver: 'manager' },
  ],
  HR: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'candidate_rejection', requiresApproval: true, approver: 'manager' },
    { trigger: 'policy_update', requiresApproval: true, approver: 'manager' },
  ],
  LEGAL: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'owner_approval' },
    { trigger: 'contract_modification', requiresApproval: true, approver: 'owner_approval' },
    { trigger: 'compliance_violation_response', requiresApproval: true, approver: 'manager' },
  ],
  ENGINEERING: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'production_deploy', requiresApproval: true, approver: 'manager' },
    { trigger: 'database_schema_change', requiresApproval: true, approver: 'manager' },
  ],
  AI_ML: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'model_deployment', requiresApproval: true, approver: 'manager' },
    { trigger: 'training_job_launch', requiresApproval: true, approver: 'manager' },
  ],
  SECURITY: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'owner_approval' },
    { trigger: 'security_policy_change', requiresApproval: true, approver: 'owner_approval' },
    { trigger: 'incident_public_disclosure', requiresApproval: true, approver: 'manager' },
  ],
  MARKETING: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'public_content_publish', requiresApproval: true, approver: 'manager' },
    { trigger: 'campaign_budget_exceed', requiresApproval: true, approver: 'manager' },
  ],
  CRM_SALES: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'deal_discount_above_threshold', requiresApproval: true, approver: 'manager' },
    { trigger: 'customer_data_export', requiresApproval: true, approver: 'manager' },
  ],
  DESIGN: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'brand_asset_modification', requiresApproval: true, approver: 'manager' },
    { trigger: 'final_delivery', requiresApproval: false, approver: 'qa' },
  ],
  EDUCATION: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'curriculum_change', requiresApproval: true, approver: 'manager' },
    { trigger: 'grade_finalization', requiresApproval: true, approver: 'manager' },
  ],
  ADMIN: [
    { trigger: 'external_data_sharing', requiresApproval: true, approver: 'manager' },
    { trigger: 'vendor_contract_signing', requiresApproval: true, approver: 'manager' },
    { trigger: 'purchase_order_create', requiresApproval: true, approver: 'manager' },
  ],
};

// ============================================================
// HANDOFF RULES PER CATEGORY
// ============================================================

const HANDOFF_RULES_BY_CATEGORY: Record<Category, { condition: string; handoffTo: string; reason: string }[]> = {
  EXECUTIVE: [
    { condition: 'requires_technical_implementation', handoffTo: 'Engineering Department', reason: 'Technical tasks should be handled by the engineering team' },
    { condition: 'financial_impact_detected', handoffTo: 'Finance Department', reason: 'Financial implications require finance team review' },
  ],
  FINANCE: [
    { condition: 'compliance_violation_found', handoffTo: 'Legal Department', reason: 'Potential compliance issues need legal review' },
    { condition: 'budget_exceeded', handoffTo: 'Operations Management', reason: 'Budget overruns require executive attention' },
  ],
  HR: [
    { condition: 'legal_employment_issue', handoffTo: 'Legal Department', reason: 'Employment law issues need legal counsel' },
    { condition: 'payroll_discrepancy', handoffTo: 'Finance Department', reason: 'Payroll issues require finance team investigation' },
  ],
  LEGAL: [
    { condition: 'security_breach_detected', handoffTo: 'Security Department', reason: 'Legal response to security incidents requires security team input' },
    { condition: 'regulatory_filing_needed', handoffTo: 'Compliance Department', reason: 'Regulatory filings are handled by compliance specialists' },
  ],
  ENGINEERING: [
    { condition: 'security_vulnerability_found', handoffTo: 'Security Department', reason: 'Security vulnerabilities require security team assessment' },
    { condition: 'production_incident', handoffTo: 'DevOps Team', reason: 'Production issues require DevOps escalation' },
  ],
  AI_ML: [
    { condition: 'model_safety_concern', handoffTo: 'AI Safety & Ethics', reason: 'Safety concerns must be reviewed by the ethics team' },
    { condition: 'infrastructure_failure', handoffTo: 'MLOps Infrastructure', reason: 'Infrastructure issues require MLOps team intervention' },
  ],
  SECURITY: [
    { condition: 'data_breach_confirmed', handoffTo: 'Legal Department', reason: 'Data breaches require legal and compliance response' },
    { condition: 'vulnerability_in_application', handoffTo: 'Engineering Department', reason: 'Application vulnerabilities need engineering remediation' },
  ],
  MARKETING: [
    { condition: 'brand_crisis_detected', handoffTo: 'Executive Team', reason: 'Brand crises require executive-level response' },
    { condition: 'content_needs_design', handoffTo: 'Design Department', reason: 'Visual content creation requires design team support' },
  ],
  CRM_SALES: [
    { condition: 'deal_requires_legal_review', handoffTo: 'Legal Department', reason: 'Contract terms need legal validation' },
    { condition: 'customer_technical_issue', handoffTo: 'Engineering Department', reason: 'Technical support issues need engineering assistance' },
  ],
  DESIGN: [
    { condition: 'brand_guideline_change', handoffTo: 'Brand Strategy', reason: 'Brand guideline updates need strategy team approval' },
    { condition: 'content_creation_needed', handoffTo: 'Content Writing', reason: 'Text content requires writing team input' },
  ],
  EDUCATION: [
    { condition: 'technical_platform_issue', handoffTo: 'Engineering Department', reason: 'LMS or platform issues need engineering support' },
    { condition: 'content_accuracy_dispute', handoffTo: 'Subject Matter Expert', reason: 'Academic disputes require expert resolution' },
  ],
  ADMIN: [
    { condition: 'vendor_dispute', handoffTo: 'Legal Department', reason: 'Vendor disputes may require legal intervention' },
    { condition: 'budget_impact', handoffTo: 'Finance Department', reason: 'Cost implications need finance team review' },
  ],
};

// ============================================================
// QUALITY CHECKLIST ITEMS PER CATEGORY
// ============================================================

const QUALITY_ITEMS_BY_CATEGORY: Record<Category, string[]> = {
  EXECUTIVE: ['Strategic recommendations are backed by data', 'Report format is appropriate for executive audience', 'Key metrics and KPIs are accurately represented'],
  FINANCE: ['All financial figures are cross-verified', 'Currency and formatting are correct', 'Tax and compliance requirements are met'],
  HR: ['Candidate evaluation criteria are consistently applied', 'Employee data handling complies with privacy regulations', 'Communication tone is professional and inclusive'],
  LEGAL: ['Legal references and citations are accurate', 'Contract terms are consistent with company policy', 'Compliance requirements are fully addressed'],
  ENGINEERING: ['Code follows project style and conventions', 'No hardcoded secrets or credentials present', 'Error handling covers edge cases'],
  AI_ML: ['AI output passes bias and safety checks', 'Token and compute usage is within budget', 'Model confidence score meets threshold'],
  SECURITY: ['No security tools or controls were disabled', 'Incident classification follows severity framework', 'Audit trail is complete and accurate'],
  MARKETING: ['Content adheres to brand voice and guidelines', 'SEO keywords are naturally integrated', 'Call-to-action is clear and appropriate'],
  CRM_SALES: ['Customer data accuracy is verified', 'Follow-up actions are clearly defined', 'Deal stage and probability are realistic'],
  DESIGN: ['Design meets brand specifications', 'File format and resolution are correct', 'Accessibility standards are met'],
  EDUCATION: ['Content is accurate and up-to-date', 'Learning objectives are clearly defined', 'Assessment criteria are fair and unbiased'],
  ADMIN: ['Document follows company template format', 'Vendor information is verified and current', 'Process timeline is realistic and achievable'],
};

const BASE_QUALITY_ITEMS = [
  'Output matches the requested input and purpose',
  'No sensitive or confidential data exposed in output',
  'Action performed is within agent permitted scope',
];

// ============================================================
// SELF-IMPROVEMENT METRICS & SOURCES PER CATEGORY
// ============================================================

const SELF_IMPROVEMENT_BY_CATEGORY: Record<Category, { metrics: string[]; learningSources: string[] }> = {
  EXECUTIVE: { metrics: ['decision_accuracy', 'response_time', 'stakeholder_satisfaction', 'report_quality_score'], learningSources: ['decision_outcome_feedback', 'stakeholder_reviews', 'industry_benchmarks'] },
  FINANCE: { metrics: ['calculation_accuracy', 'compliance_rate', 'processing_time', 'error_rate'], learningSources: ['audit_findings', 'regulatory_updates', 'process_error_logs'] },
  HR: { metrics: ['screening_consistency', 'time_to_hire', 'employee_satisfaction', 'onboarding_completion_rate'], learningSources: ['candidate_feedback', 'hiring_outcomes', 'retention_metrics'] },
  LEGAL: { metrics: ['compliance_accuracy', 'review_turnaround_time', 'risk_detection_rate', 'contract_error_rate'], learningSources: ['case_outcomes', 'regulatory_changes', 'compliance_audit_results'] },
  ENGINEERING: { metrics: ['code_quality_score', 'bug_detection_rate', 'review_turnaround', 'deployment_success_rate'], learningSources: ['bug_reports', 'code_review_feedback', 'deployment_metrics'] },
  AI_ML: { metrics: ['inference_accuracy', 'latency_p99', 'bias_score', 'token_efficiency'], learningSources: ['model_performance_logs', 'user_feedback', 'drift_detection_alerts'] },
  SECURITY: { metrics: ['threat_detection_rate', 'false_positive_rate', 'response_time', 'coverage_score'], learningSources: ['incident_reports', 'pentest_findings', 'threat_intelligence_feeds'] },
  MARKETING: { metrics: ['engagement_rate', 'content_quality_score', 'conversion_contribution', 'brand_consistency'], learningSources: ['campaign_performance', 'audience_feedback', 'ab_test_results'] },
  CRM_SALES: { metrics: ['lead_conversion_rate', 'response_time', 'customer_satisfaction', 'pipeline_accuracy'], learningSources: ['deal_outcomes', 'customer_feedback', 'win_loss_analysis'] },
  DESIGN: { metrics: ['design_quality_score', 'revision_count', 'brand_compliance', 'delivery_time'], learningSources: ['stakeholder_feedback', 'usage_analytics', 'brand_audit_results'] },
  EDUCATION: { metrics: ['content_accuracy', 'student_engagement', 'assessment_fairness', 'completion_rate'], learningSources: ['student_outcomes', 'peer_reviews', 'curriculum_effectiveness_data'] },
  ADMIN: { metrics: ['task_completion_rate', 'process_efficiency', 'vendor_satisfaction', 'cost_savings'], learningSources: ['process_metrics', 'vendor_performance', 'cost_analysis_reports'] },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Deterministic integer hash from string */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Deterministic pick n items from array using seed string */
function deterministicPick<T>(arr: T[], seed: string, min: number, max: number): T[] {
  const h = hashStr(seed);
  const count = Math.min(min + (h % (max - min + 1)), arr.length);
  const selected: T[] = [];
  let idx = h;
  const seen = new Set<number>();
  while (selected.length < count) {
    const candidate = idx % arr.length;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      selected.push(arr[candidate]);
    }
    idx = (idx * 31 + 7) % 100003;
  }
  return selected;
}

function getCategory(deptName: string): Category {
  return DEPT_CATEGORY_MAP[deptName] || 'ADMIN';
}

function generateWorkflowSteps(role: Role): WorkflowStep[] {
  return WORKFLOW_BY_ROLE[role] || WORKFLOW_BY_ROLE.specialist;
}

function generateProtectionRules(category: Category, role: Role): ProtectionRule[] {
  const base = PROTECTION_RULES_BY_CATEGORY[category] || PROTECTION_RULES_BY_CATEGORY.ADMIN;
  if (role === 'safety' || role === 'manager') return base;
  // Other roles get 2-4 rules deterministically
  const h = hashStr(category + role);
  const count = 2 + (h % 3);
  return base.slice(0, Math.min(count, base.length));
}

function generateApprovalRules(category: Category, role: Role): ApprovalRule[] {
  const base = APPROVAL_RULES_BY_CATEGORY[category] || APPROVAL_RULES_BY_CATEGORY.ADMIN;
  if (role === 'manager' || role === 'owner_approval') {
    // Managers and owner_approval skip the "external_data_sharing" generic rule
    return base.filter(r => r.trigger !== 'external_data_sharing').slice(0, 2);
  }
  return base.slice(0, 3);
}

function generateHandoffRules(category: Category): HandoffRule[] {
  return HANDOFF_RULES_BY_CATEGORY[category] || HANDOFF_RULES_BY_CATEGORY.ADMIN;
}

function generateQualityChecklist(category: Category): string[] {
  const catItems = QUALITY_ITEMS_BY_CATEGORY[category] || QUALITY_ITEMS_BY_CATEGORY.ADMIN;
  return [...BASE_QUALITY_ITEMS, ...catItems].slice(0, 5);
}

function generateSelfImprovement(category: Category, role: Role): SelfImprovement {
  const cfg = SELF_IMPROVEMENT_BY_CATEGORY[category] || SELF_IMPROVEMENT_BY_CATEGORY.ADMIN;
  return {
    enabled: true,
    reviewCycle: (role === 'manager' || role === 'owner_approval') ? 'monthly' : 'weekly',
    metrics: cfg.metrics.slice(0, 3),
    learningSources: cfg.learningSources.slice(0, 2),
  };
}

function generateProductivityRules(role: Role): ProductivityRules {
  const concurrency: Record<string, number> = {
    manager: 5, planner: 3, execution: 3, qa: 4, report: 4,
    automation: 2, safety: 6, memory: 5, productivity: 3,
    owner_approval: 3, specialist: 2,
  };
  const timeout: Record<string, number> = {
    manager: 60, planner: 45, execution: 30, qa: 45, report: 60,
    automation: 120, safety: 15, memory: 20, productivity: 60,
    owner_approval: 30, specialist: 30,
  };
  return {
    maxConcurrentTasks: concurrency[role] || 3,
    timeoutMinutes: timeout[role] || 30,
    priorityLevels: ['critical', 'high', 'medium', 'low'],
    autoRetry: role !== 'safety' && role !== 'owner_approval',
    retryLimit: role === 'automation' ? 5 : 3,
  };
}

// ============================================================
// MAIN SEED LOGIC
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   ALO Labs Agent Hub — Protocol Seeder V2          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Fetch all agents
  const agents = await db.agent.findMany({
    select: { id: true, name: true, departmentName: true, role: true },
    orderBy: { id: 'asc' },
  });

  const total = agents.length;
  console.log(`Total agents to process: ${total}`);
  console.log('');

  let updatedCount = 0;
  let errorCount = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = agents.slice(i, Math.min(i + BATCH_SIZE, total));

    try {
      await db.$transaction(
        batch.map((agent) => {
          const category = getCategory(agent.departmentName);
          const role = agent.role as Role;
          const seed = agent.id;

          const allowedSkills = deterministicPick(SKILLS_BY_CATEGORY[category], seed + '_aS', 3, 8);
          const forbiddenSkills = deterministicPick(FORBIDDEN_SKILLS_BY_CATEGORY[category], seed + '_fS', 1, 3);
          const allowedTools = deterministicPick(TOOLS_BY_CATEGORY[category], seed + '_aT', 3, 6);
          const forbiddenTools = deterministicPick(FORBIDDEN_TOOLS_BY_CATEGORY[category], seed + '_fT', 1, 3);
          const workflowSteps = generateWorkflowSteps(role);
          const protectionRules = generateProtectionRules(category, role);
          const approvalRules = generateApprovalRules(category, role);
          const handoffRules = generateHandoffRules(category);
          const qualityChecklist = generateQualityChecklist(category);
          const selfImprovement = generateSelfImprovement(category, role);
          const productivityRules = generateProductivityRules(role);

          return db.agent.update({
            where: { id: agent.id },
            data: {
              allowedSkills: JSON.stringify(allowedSkills),
              forbiddenSkills: JSON.stringify(forbiddenSkills),
              allowedTools: JSON.stringify(allowedTools),
              forbiddenTools: JSON.stringify(forbiddenTools),
              workflowSteps: JSON.stringify(workflowSteps),
              protectionRules: JSON.stringify(protectionRules),
              approvalRules: JSON.stringify(approvalRules),
              handoffRules: JSON.stringify(handoffRules),
              qualityChecklist: JSON.stringify(qualityChecklist),
              selfImprovement: JSON.stringify(selfImprovement),
              productivityRules: JSON.stringify(productivityRules),
            },
          });
        }),
        { timeout: 120000 }
      );

      updatedCount += batch.length;
    } catch (error) {
      errorCount += batch.length;
      console.error(`  ✗ Error in batch starting at index ${i}:`, error);
    }

    // Progress log every 100 agents
    const processed = Math.min(i + BATCH_SIZE, total);
    if (processed % 100 === 0 || processed === total) {
      const pct = ((processed / total) * 100).toFixed(1);
      console.log(
        `  ✓ ${String(processed).padStart(5)}/${total} agents processed (${pct}%) — ` +
        `${updatedCount} updated, ${errorCount} errors`
      );
    }
  }

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Agents updated:    ${updatedCount}`);
  console.log(`  Errors:            ${errorCount}`);
  console.log(`  Finished at:       ${new Date().toISOString()}`);
  console.log('══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });