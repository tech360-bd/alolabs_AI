import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// ============================================================
// STEP 1: Department → Category Mapping (all 100 departments)
// ============================================================
type Category = 'EXECUTIVE' | 'FINANCE' | 'HR' | 'LEGAL' | 'ENGINEERING' | 'AI_ML' | 'SECURITY' | 'MARKETING' | 'CRM_SALES' | 'DESIGN' | 'EDUCATION' | 'ADMIN';

const DEPT_CATEGORY_MAP: Record<string, Category> = {
  // EXECUTIVE (6)
  'Strategic Planning': 'EXECUTIVE',
  'Operations Management': 'EXECUTIVE',
  'Risk Management': 'EXECUTIVE',
  'Innovation Lab': 'EXECUTIVE',
  'Future Technologies': 'EXECUTIVE',
  'Business Intelligence': 'EXECUTIVE',
  'Project Management': 'EXECUTIVE',

  // FINANCE (11)
  'Financial Analysis': 'FINANCE',
  'Financial Reporting': 'FINANCE',
  'Cost Accounting': 'FINANCE',
  'Revenue Management': 'FINANCE',
  'Budget Planning': 'FINANCE',
  'Treasury Operations': 'FINANCE',
  'Tax Management': 'FINANCE',
  'Accounts Payable': 'FINANCE',
  'Accounts Receivable': 'FINANCE',
  'Benefits Management': 'FINANCE',
  'Payroll Administration': 'FINANCE',

  // HR (6)
  'Recruitment': 'HR',
  'Employee Onboarding': 'HR',
  'Employee Relations': 'HR',
  'Performance Management': 'HR',
  'Training & Development': 'HR',
  'Workplace Safety': 'HR',

  // LEGAL (7)
  'Legal Administration': 'LEGAL',
  'Compliance & Policies': 'LEGAL',
  'Compliance Monitoring': 'LEGAL',
  'Patent & IP Management': 'LEGAL',
  'Internal Audit': 'LEGAL',
  'Data Privacy': 'LEGAL',
  'Policy Enforcement': 'LEGAL',

  // ENGINEERING (9)
  'Frontend Development': 'ENGINEERING',
  'Backend Development': 'ENGINEERING',
  'Mobile Development': 'ENGINEERING',
  'Database Engineering': 'ENGINEERING',
  'DevOps & CI/CD': 'ENGINEERING',
  'System Architecture': 'ENGINEERING',
  'API Development': 'ENGINEERING',
  'QA Engineering': 'ENGINEERING',
  'Prototype Development': 'ENGINEERING',
  'Quality Assurance': 'ENGINEERING',

  // AI_ML (11)
  'LLM Operations': 'AI_ML',
  'Model Training': 'AI_ML',
  'Model Evaluation': 'AI_ML',
  'MLOps Infrastructure': 'AI_ML',
  'Computer Vision': 'AI_ML',
  'NLP Services': 'AI_ML',
  'AI Analytics': 'AI_ML',
  'AI Research': 'AI_ML',
  'AI Safety & Ethics': 'AI_ML',
  'Prompt Engineering': 'AI_ML',
  'Data Pipeline': 'AI_ML',

  // SECURITY (7)
  'Cybersecurity Operations': 'SECURITY',
  'Security Auditing': 'SECURITY',
  'Vulnerability Management': 'SECURITY',
  'Threat Intelligence': 'SECURITY',
  'Incident Response': 'SECURITY',
  'Identity Management': 'SECURITY',
  'Access Control': 'SECURITY',

  // MARKETING (15)
  'Brand Strategy': 'MARKETING',
  'Content Strategy': 'MARKETING',
  'Digital Advertising': 'MARKETING',
  'Email Marketing': 'MARKETING',
  'Social Media': 'MARKETING',
  'SEO Content': 'MARKETING',
  'Copywriting': 'MARKETING',
  'Blog & Article Writing': 'MARKETING',
  'Multimedia Publishing': 'MARKETING',
  'Event Marketing': 'MARKETING',
  'Growth Analytics': 'MARKETING',
  'Market Research': 'MARKETING',
  'Market Exploration': 'MARKETING',
  'Competitive Analysis': 'MARKETING',
  'Lead Generation': 'MARKETING',
  'Brand Communications': 'MARKETING',

  // CRM_SALES (4)
  'Customer Relations': 'CRM_SALES',
  'Customer Success': 'CRM_SALES',
  'Sales Operations': 'CRM_SALES',
  'Partnership Development': 'CRM_SALES',

  // DESIGN (4)
  'Graphic Design': 'DESIGN',
  'Video Production': 'DESIGN',
  'Audio Production': 'DESIGN',
  'User Experience Research': 'DESIGN',

  // EDUCATION (10)
  'Curriculum Development': 'EDUCATION',
  'Course Delivery': 'EDUCATION',
  'E-Learning Platform': 'EDUCATION',
  'Educational Research': 'EDUCATION',
  'Assessment & Grading': 'EDUCATION',
  'Student Enrollment': 'EDUCATION',
  'Student Support': 'EDUCATION',
  'Teacher Training': 'EDUCATION',
  'Learning Analytics': 'EDUCATION',
  'Certification Programs': 'EDUCATION',

  // ADMIN (8)
  'Office Administration': 'ADMIN',
  'Technical Documentation': 'ADMIN',
  'Vendor Management': 'ADMIN',
  'Supply Chain': 'ADMIN',
  'Open Source Contributions': 'ADMIN',
  'Technology Scouting': 'ADMIN',
  'Process Optimization': 'ADMIN',
  'Product Innovation': 'ADMIN',
};

// ============================================================
// STEP 2: Category-Specific Base Protocols
// ============================================================

interface WorkflowStep { stepNumber: number; action: string; agentRole: string; description: string; }
interface ProtectionRule { action: string; condition: string; reason: string; }
interface ApprovalRule { actionType: string; requiresApproval: boolean; approvalRole: string | null; reason: string; }
interface HandoffRule { trigger: string; targetDepartment: string; description: string; }
interface QualityItem { item: string; required: boolean; description: string; }
interface SelfImprovement { learningMethods: string[]; feedbackTriggers: string[]; improvementCycle: string; maxMemoryItems: number; confidenceDecay: number; minSamplesBeforePromotion: number; }
interface ProductivityRules { maxConcurrentTasks: number; priorityLevel: string; estimatedDurationMinutes: number; retryPolicy: { maxRetries: number; backoffMultiplier: number; retryableErrors: string[] }; timeoutSeconds: number; resourceLimits: { maxMemoryMB: number; maxCPU: number }; idleTimeoutSeconds: number; healthCheckIntervalSeconds: number; }

const BASE_ALLOWED_SKILLS: Record<Category, string[]> = {
  EXECUTIVE: ['strategic_analysis', 'decision_support', 'report_generation', 'data_visualization', 'meeting_summarization', 'risk_assessment'],
  FINANCE: ['financial_analysis', 'invoice_processing', 'budget_calculation', 'tax_computation', 'reconciliation', 'financial_reporting'],
  HR: ['resume_screening', 'interview_scheduling', 'onboarding_checklist', 'performance_review', 'training_recommendation', 'policy_lookup'],
  LEGAL: ['document_review', 'compliance_check', 'contract_analysis', 'ip_search', 'regulatory_lookup', 'audit_trail_review'],
  ENGINEERING: ['code_generation', 'code_review', 'test_generation', 'bug_detection', 'api_design', 'documentation_writing', 'deployment_check'],
  AI_ML: ['model_inference', 'prompt_engineering', 'data_preprocessing', 'model_evaluation', 'embedding_generation', 'token_counting'],
  SECURITY: ['vulnerability_scan', 'threat_detection', 'log_analysis', 'access_review', 'incident_triage', 'security_reporting'],
  MARKETING: ['content_writing', 'seo_optimization', 'social_posting', 'email_composition', 'market_research', 'analytics_review', 'lead_scoring'],
  CRM_SALES: ['lead_management', 'contact_enrichment', 'deal_tracking', 'follow_up_scheduling', 'customer_scoring', 'pipeline_analysis'],
  DESIGN: ['image_generation', 'video_editing', 'audio_processing', 'layout_design', 'brand_application', 'ux_analysis'],
  EDUCATION: ['course_creation', 'assessment_design', 'student_analysis', 'curriculum_mapping', 'learning_path_design', 'grading_assistance'],
  ADMIN: ['document_management', 'vendor_evaluation', 'process_mapping', 'inventory_check', 'scheduling', 'report_compilation'],
};

const BASE_FORBIDDEN_SKILLS: Record<Category, string[]> = {
  EXECUTIVE: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  FINANCE: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  HR: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  LEGAL: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  ENGINEERING: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  AI_ML: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access', 'unrestricted_web_scraping', 'model_weight_export'],
  SECURITY: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access', 'security_disable', 'audit_log_deletion'],
  MARKETING: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access', 'unapproved_public_publishing', 'bulk_whatsapp_unapproved'],
  CRM_SALES: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  DESIGN: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  EDUCATION: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
  ADMIN: ['shell_execution', 'database_deletion', 'credential_access', 'cross_company_data_access'],
};

const BASE_ALLOWED_TOOLS: Record<Category, string[]> = {
  EXECUTIVE: ['dashboard_read', 'report_generator', 'meeting_scheduler', 'data_query', 'notification_service', 'approval_system'],
  FINANCE: ['invoice_reader', 'calculator', 'currency_converter', 'tax_database', 'budget_tool', 'payment_processor_read', 'reconciliation_tool'],
  HR: ['applicant_tracker', 'calendar', 'email_sender_readonly', 'policy_database', 'training_platform', 'onboarding_workflow'],
  LEGAL: ['document_parser', 'contract_template', 'compliance_database', 'regulation_lookup', 'audit_logger', 'digital_signature'],
  ENGINEERING: ['code_editor', 'git_client_readonly', 'test_runner', 'ci_cd_pipeline', 'api_tester', 'database_query_readonly', 'deployment_staging', 'documentation_generator'],
  AI_ML: ['llm_interface', 'embedding_service', 'model_registry', 'token_counter', 'prompt_manager', 'evaluation_framework', 'data_loader'],
  SECURITY: ['scanner', 'log_aggregator', 'alert_system', 'firewall_manager_readonly', 'access_control_readonly', 'incident_tracker', 'forensics_tool'],
  MARKETING: ['cms_readonly', 'social_scheduler', 'email_platform_readonly', 'seo_analyzer', 'analytics_dashboard', 'content_calendar', 'a_b_tester'],
  CRM_SALES: ['crm_readwrite', 'email_platform_readonly', 'calendar', 'deal_pipeline', 'contact_database', 'scoring_engine'],
  DESIGN: ['image_editor', 'video_editor', 'audio_editor', 'layout_tool', 'brand_asset_library', 'prototype_tool'],
  EDUCATION: ['lms_readwrite', 'assessment_engine', 'gradebook', 'student_database_readonly', 'content_library', 'video_hosting'],
  ADMIN: ['file_manager', 'vendor_database', 'inventory_system', 'calendar', 'notification_service', 'report_builder'],
};

const BASE_FORBIDDEN_TOOLS: Record<Category, string[]> = {
  EXECUTIVE: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  FINANCE: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export', 'payment_execute_unapproved', 'tax_filing_direct'],
  HR: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  LEGAL: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  ENGINEERING: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export', 'git_force_push', 'production_database_write'],
  AI_ML: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  SECURITY: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export', 'firewall_disable', 'security_policy_delete'],
  MARKETING: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export', 'bulk_messaging_unapproved', 'public_api_publish'],
  CRM_SALES: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  DESIGN: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  EDUCATION: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
  ADMIN: ['shell_unrestricted', 'production_deploy_unapproved', 'database_drop', 'secret_reader', 'credential_export'],
};

// Workflow steps per category (base for "execution" role)
const BASE_WORKFLOW_STEPS: Record<Category, WorkflowStep[]> = {
  EXECUTIVE: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate strategic input data and confirm executive context' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify company access, user authorization level, and data scope' },
    { stepNumber: 3, action: 'gather_intelligence', agentRole: 'self', description: 'Aggregate relevant metrics, reports, and market intelligence' },
    { stepNumber: 4, action: 'execute_analysis', agentRole: 'self', description: 'Perform strategic analysis using permitted decision-support tools' },
    { stepNumber: 5, action: 'generate_output', agentRole: 'self', description: 'Produce executive summary, recommendation, or report' },
    { stepNumber: 6, action: 'quality_check', agentRole: 'qa', description: 'Verify accuracy, completeness, and alignment with strategic objectives' },
    { stepNumber: 7, action: 'log_and_cleanup', agentRole: 'self', description: 'Record metrics, save key insights to memory, release resources' },
  ],
  FINANCE: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate financial data, amounts, dates, and account references' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify financial data access authorization and compliance scope' },
    { stepNumber: 3, action: 'process_calculation', agentRole: 'self', description: 'Execute financial calculations, tax computations, or reconciliations' },
    { stepNumber: 4, action: 'cross_validate', agentRole: 'self', description: 'Cross-check results against historical data and financial benchmarks' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify numerical accuracy, compliance with accounting standards' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record financial metrics, audit trail, and release resources' },
  ],
  HR: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate HR data: employee IDs, request types, and policy context' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify HR data access and employee privacy compliance' },
    { stepNumber: 3, action: 'execute_hr_task', agentRole: 'self', description: 'Process HR operation: screening, onboarding, review, or scheduling' },
    { stepNumber: 4, action: 'policy_check', agentRole: 'self', description: 'Ensure action complies with HR policies and labor regulations' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify completeness, fairness, and documentation standards' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record HR metrics, update employee records, release resources' },
  ],
  LEGAL: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate legal documents, references, and jurisdiction context' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify legal data access and attorney-client privilege scope' },
    { stepNumber: 3, action: 'legal_analysis', agentRole: 'self', description: 'Perform document review, compliance check, or contract analysis' },
    { stepNumber: 4, action: 'regulatory_verify', agentRole: 'self', description: 'Cross-reference findings against current regulations and case law' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify legal accuracy, citation completeness, and risk flags' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record audit trail, maintain legal log, release resources' },
  ],
  ENGINEERING: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate requirements, code context, and technical specifications' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify repository access, environment permissions, and deployment scope' },
    { stepNumber: 3, action: 'execute_engineering_task', agentRole: 'self', description: 'Generate code, run tests, build artifacts, or review changes' },
    { stepNumber: 4, action: 'run_tests', agentRole: 'self', description: 'Execute automated tests and verify build integrity' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify code quality, test coverage, and architectural compliance' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record engineering metrics, update documentation, release resources' },
  ],
  AI_ML: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate model parameters, data inputs, and inference context' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify model access, data usage rights, and token budget' },
    { stepNumber: 3, action: 'execute_ai_task', agentRole: 'self', description: 'Run inference, training, evaluation, or data processing pipeline' },
    { stepNumber: 4, action: 'output_validation', agentRole: 'self', description: 'Validate AI output for safety, bias, and quality thresholds' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify model performance, output safety, and ethical compliance' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record ML metrics, update model registry, release GPU/memory' },
  ],
  SECURITY: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate scan targets, log sources, and security context' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify security tool access and scope authorization' },
    { stepNumber: 3, action: 'execute_security_task', agentRole: 'self', description: 'Run vulnerability scan, threat analysis, or incident triage' },
    { stepNumber: 4, action: 'assess_findings', agentRole: 'self', description: 'Evaluate severity, correlate with threat intelligence, prioritize' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify finding accuracy, false positive rate, and reporting standards' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record security events, update incident tracker, release resources' },
  ],
  MARKETING: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate campaign brief, target audience, and brand guidelines' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify publishing permissions, budget authorization, and brand access' },
    { stepNumber: 3, action: 'create_content', agentRole: 'self', description: 'Generate marketing content, copy, or campaign materials' },
    { stepNumber: 4, action: 'optimize_output', agentRole: 'self', description: 'Apply SEO optimization, A/B considerations, and audience targeting' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify brand consistency, tone alignment, and compliance with guidelines' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record marketing metrics, update content calendar, release resources' },
  ],
  CRM_SALES: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate customer data, deal context, and interaction history' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify CRM access, data sharing permissions, and privacy compliance' },
    { stepNumber: 3, action: 'execute_crm_task', agentRole: 'self', description: 'Process lead, update deal, schedule follow-up, or analyze pipeline' },
    { stepNumber: 4, action: 'enrich_data', agentRole: 'self', description: 'Enrich customer records with scoring, insights, and recommendations' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify data accuracy, CRM consistency, and communication quality' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record CRM metrics, update interaction logs, release resources' },
  ],
  DESIGN: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate design brief, brand assets, and output specifications' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify asset library access and brand usage permissions' },
    { stepNumber: 3, action: 'create_design', agentRole: 'self', description: 'Generate visual, video, audio, or UX design output' },
    { stepNumber: 4, action: 'review_brand_alignment', agentRole: 'self', description: 'Check design against brand guidelines and accessibility standards' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify design quality, resolution, and format compliance' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record design metrics, archive assets, release resources' },
  ],
  EDUCATION: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate course content, student data, and learning objectives' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify LMS access, student privacy compliance, and content rights' },
    { stepNumber: 3, action: 'execute_education_task', agentRole: 'self', description: 'Create content, grade assessments, or analyze student performance' },
    { stepNumber: 4, action: 'pedagogy_check', agentRole: 'self', description: 'Verify educational quality, learning outcome alignment, and fairness' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify content accuracy, grading consistency, and accessibility' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record education metrics, update gradebook, release resources' },
  ],
  ADMIN: [
    { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate administrative request, document context, and process scope' },
    { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify system access, data classification, and action authorization' },
    { stepNumber: 3, action: 'execute_admin_task', agentRole: 'self', description: 'Process document, manage vendor, update inventory, or compile report' },
    { stepNumber: 4, action: 'verify_output', agentRole: 'self', description: 'Confirm task completion, data accuracy, and process compliance' },
    { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify administrative accuracy, completeness, and compliance' },
    { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record admin metrics, update tracking systems, release resources' },
  ],
};

// Protection rules per category
const BASE_PROTECTION_RULES: Record<Category, ProtectionRule[]> = {
  EXECUTIVE: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Agents must never access another company data' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'All public content requires Super Admin approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose credentials, API keys, or secrets in output' },
    { action: 'allow_with_log', condition: 'internal_data_access', reason: 'Internal data access is logged for audit' },
    { action: 'require_approval', condition: 'strategic_decision_publish', reason: 'Strategic decisions require executive approval before sharing' },
  ],
  FINANCE: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Financial data must never cross company boundaries' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Financial reports require Super Admin approval for publication' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose financial credentials or account numbers' },
    { action: 'block', condition: 'direct_payment_execution', reason: 'Payments must go through approved payment processor' },
    { action: 'allow_with_log', condition: 'financial_data_read', reason: 'Financial data reads are logged for SOX compliance' },
    { action: 'require_approval', condition: 'data_deletion', reason: 'Financial data deletion requires manager approval and audit' },
  ],
  HR: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Employee data is strictly company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Employee information must never be published publicly' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose employee PII or credentials' },
    { action: 'block', condition: 'unauthorized_pii_access', reason: 'PII access requires explicit business justification' },
    { action: 'allow_with_log', condition: 'employee_record_read', reason: 'Employee record access logged for GDPR compliance' },
  ],
  LEGAL: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Legal data is strictly company-scoped and privileged' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Legal documents require approval before any external sharing' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose legal strategy or privileged information' },
    { action: 'block', condition: 'unauthorized_legal_advice', reason: 'Agents must not provide binding legal advice' },
    { action: 'allow_with_log', condition: 'regulatory_lookup', reason: 'Regulatory lookups logged for compliance audit trail' },
    { action: 'require_approval', condition: 'legal_opinion_publish', reason: 'Legal opinions require manager review before distribution' },
  ],
  ENGINEERING: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Source code and systems are company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Code publishing requires Super Admin approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose API keys, secrets, or credentials in code output' },
    { action: 'block', condition: 'production_deploy_unapproved', reason: 'Production deployments require explicit approval workflow' },
    { action: 'allow_with_log', condition: 'code_review_access', reason: 'Code review access logged for audit' },
    { action: 'require_approval', condition: 'database_schema_change', reason: 'Schema changes require manager approval' },
  ],
  AI_ML: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'ML models and training data are company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Model outputs published publicly require Super Admin approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose API keys, model weights, or training data' },
    { action: 'block', condition: 'biased_output_distribution', reason: 'Block outputs flagged for bias above threshold' },
    { action: 'allow_with_log', condition: 'model_inference', reason: 'All inference requests logged for monitoring' },
    { action: 'require_approval', condition: 'model_deployment', reason: 'Model deployment to production requires manager approval' },
  ],
  SECURITY: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Security findings and configs are company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Security reports require Super Admin approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose security credentials or vulnerability details externally' },
    { action: 'block', condition: 'security_tool_disable', reason: 'Security tools must never be disabled by agents' },
    { action: 'allow_with_log', condition: 'security_scan', reason: 'All security scans logged for compliance' },
    { action: 'require_approval', condition: 'firewall_rule_change', reason: 'Firewall changes require manager approval' },
    { action: 'require_approval', condition: 'access_policy_change', reason: 'Access policy changes require security manager approval' },
  ],
  MARKETING: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Brand assets and campaigns are company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'All public content requires Super Admin approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid ad APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose social media tokens or ad account credentials' },
    { action: 'block', condition: 'unapproved_brand_misuse', reason: 'Brand assets must follow brand guidelines strictly' },
    { action: 'allow_with_log', condition: 'campaign_draft_creation', reason: 'Campaign drafts logged for review audit trail' },
    { action: 'require_approval', condition: 'bulk_communication', reason: 'Bulk messaging requires manager approval to prevent abuse' },
  ],
  CRM_SALES: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Customer data is strictly company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Customer data must never be published publicly' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose customer contact info or deal terms' },
    { action: 'block', condition: 'unauthorized_discount', reason: 'Discounts beyond authorized limits require approval' },
    { action: 'allow_with_log', condition: 'crm_record_update', reason: 'CRM updates logged for sales audit trail' },
  ],
  DESIGN: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Design assets are company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Design assets published publicly require Super Admin approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid stock/sound APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose design system tokens or asset library credentials' },
    { action: 'block', condition: 'unlicensed_asset_usage', reason: 'Only licensed and approved assets may be used' },
    { action: 'allow_with_log', condition: 'brand_asset_access', reason: 'Brand asset access logged for audit' },
  ],
  EDUCATION: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Student data and course content are company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Course content published externally requires approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose student PII or assessment answers' },
    { action: 'block', condition: 'grade_manipulation', reason: 'Grade changes require documented justification and approval' },
    { action: 'allow_with_log', condition: 'student_record_read', reason: 'Student record access logged for FERPA compliance' },
  ],
  ADMIN: [
    { action: 'block', condition: 'cross_company_data_access', reason: 'Administrative data is company-scoped' },
    { action: 'block', condition: 'public_publishing_without_approval', reason: 'Admin documents published externally require approval' },
    { action: 'block', condition: 'paid_api_without_payment_guard', reason: 'Paid APIs must go through Payment Guard' },
    { action: 'block', condition: 'credential_exposure', reason: 'Never expose system credentials or admin tokens' },
    { action: 'allow_with_log', condition: 'internal_document_access', reason: 'Document access logged for admin audit trail' },
    { action: 'require_approval', condition: 'vendor_contract_sign', reason: 'Vendor contracts require manager approval' },
  ],
};

// Approval rules per category
const BASE_APPROVAL_RULES: Record<Category, ApprovalRule[]> = {
  EXECUTIVE: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Public executive communications require Super Admin approval' },
    { actionType: 'strategic_decision', requiresApproval: true, approvalRole: 'manager', reason: 'Strategic decisions require manager sign-off' },
    { actionType: 'financial_transaction', requiresApproval: true, approvalRole: 'manager', reason: 'Financial actions require manager approval' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Standard data export within permitted scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal report generation is auto-approved' },
  ],
  FINANCE: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Financial publications require Super Admin approval' },
    { actionType: 'financial_transaction', requiresApproval: true, approvalRole: 'manager', reason: 'All financial transactions require manager approval' },
    { actionType: 'payment_execution', requiresApproval: true, approvalRole: 'super_admin', reason: 'Payment execution requires Super Admin approval' },
    { actionType: 'tax_filing', requiresApproval: true, approvalRole: 'super_admin', reason: 'Tax filings require Super Admin and legal review' },
    { actionType: 'data_export', requiresApproval: true, approvalRole: 'manager', reason: 'Financial data export requires manager approval' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal financial reports are auto-approved' },
  ],
  HR: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Employee data must never be published publicly' },
    { actionType: 'hire_decision', requiresApproval: true, approvalRole: 'manager', reason: 'Hiring decisions require manager approval' },
    { actionType: 'salary_change', requiresApproval: true, approvalRole: 'manager', reason: 'Salary changes require manager and finance approval' },
    { actionType: 'termination_action', requiresApproval: true, approvalRole: 'super_admin', reason: 'Termination actions require Super Admin approval' },
    { actionType: 'data_export', requiresApproval: true, approvalRole: 'manager', reason: 'Employee data export requires manager approval' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal HR reports are auto-approved' },
  ],
  LEGAL: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Legal documents published externally require Super Admin approval' },
    { actionType: 'contract_sign', requiresApproval: true, approvalRole: 'super_admin', reason: 'Contract signing requires Super Admin approval' },
    { actionType: 'compliance_action', requiresApproval: true, approvalRole: 'manager', reason: 'Compliance actions require manager approval' },
    { actionType: 'legal_opinion', requiresApproval: true, approvalRole: 'manager', reason: 'Legal opinions require manager review' },
    { actionType: 'data_export', requiresApproval: true, approvalRole: 'manager', reason: 'Legal data export requires manager approval' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal legal reports are auto-approved' },
  ],
  ENGINEERING: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Code publication requires Super Admin approval' },
    { actionType: 'production_deploy', requiresApproval: true, approvalRole: 'super_admin', reason: 'Production deployment requires explicit approval' },
    { actionType: 'database_schema_change', requiresApproval: true, approvalRole: 'manager', reason: 'Schema changes require manager approval' },
    { actionType: 'api_change', requiresApproval: true, approvalRole: 'manager', reason: 'API changes require manager review' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Standard code/data export within scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal engineering reports are auto-approved' },
  ],
  AI_ML: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'AI model outputs published publicly require Super Admin approval' },
    { actionType: 'model_deployment', requiresApproval: true, approvalRole: 'manager', reason: 'Model deployment requires manager approval' },
    { actionType: 'training_job', requiresApproval: true, approvalRole: 'manager', reason: 'Expensive training jobs require manager approval' },
    { actionType: 'data_deletion', requiresApproval: true, approvalRole: 'manager', reason: 'Training data deletion requires manager approval' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Standard inference results within scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal ML metrics reports are auto-approved' },
  ],
  SECURITY: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Security reports require Super Admin approval' },
    { actionType: 'firewall_change', requiresApproval: true, approvalRole: 'super_admin', reason: 'Firewall changes require Super Admin approval' },
    { actionType: 'access_policy_change', requiresApproval: true, approvalRole: 'manager', reason: 'Access policy changes require security manager approval' },
    { actionType: 'incident_public_disclosure', requiresApproval: true, approvalRole: 'super_admin', reason: 'Public incident disclosure requires Super Admin and legal approval' },
    { actionType: 'data_export', requiresApproval: true, approvalRole: 'manager', reason: 'Security data export requires manager approval' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal security reports are auto-approved' },
  ],
  MARKETING: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Public marketing content must be approved by Super Admin' },
    { actionType: 'bulk_communication', requiresApproval: true, approvalRole: 'manager', reason: 'Bulk messaging requires approval to prevent abuse' },
    { actionType: 'paid_campaign_launch', requiresApproval: true, approvalRole: 'manager', reason: 'Paid campaigns require budget approval' },
    { actionType: 'brand_guideline_change', requiresApproval: true, approvalRole: 'super_admin', reason: 'Brand guideline changes require Super Admin approval' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Marketing analytics export within scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal marketing reports are auto-approved' },
  ],
  CRM_SALES: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Customer data must never be published publicly' },
    { actionType: 'contract_sign', requiresApproval: true, approvalRole: 'manager', reason: 'Sales contracts require manager approval' },
    { actionType: 'discount_approval', requiresApproval: true, approvalRole: 'manager', reason: 'Discounts beyond limits require manager approval' },
    { actionType: 'bulk_communication', requiresApproval: true, approvalRole: 'manager', reason: 'Bulk customer communication requires approval' },
    { actionType: 'data_export', requiresApproval: true, approvalRole: 'manager', reason: 'Customer data export requires manager approval' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal sales reports are auto-approved' },
  ],
  DESIGN: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Design assets published publicly require Super Admin approval' },
    { actionType: 'brand_asset_change', requiresApproval: true, approvalRole: 'manager', reason: 'Brand asset modifications require manager approval' },
    { actionType: 'paid_asset_purchase', requiresApproval: true, approvalRole: 'manager', reason: 'Stock asset purchases require budget approval' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Internal design file sharing within scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Design project reports are auto-approved' },
  ],
  EDUCATION: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Course content published externally requires approval' },
    { actionType: 'grade_change', requiresApproval: true, approvalRole: 'manager', reason: 'Grade modifications require documented justification and approval' },
    { actionType: 'certification_issue', requiresApproval: true, approvalRole: 'manager', reason: 'Certification issuance requires manager approval' },
    { actionType: 'student_data_export', requiresApproval: true, approvalRole: 'manager', reason: 'Student data export requires manager approval' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Internal education metrics within scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal education reports are auto-approved' },
  ],
  ADMIN: [
    { actionType: 'public_publish', requiresApproval: true, approvalRole: 'super_admin', reason: 'Admin documents published externally require approval' },
    { actionType: 'vendor_contract', requiresApproval: true, approvalRole: 'manager', reason: 'Vendor contracts require manager approval' },
    { actionType: 'budget_expenditure', requiresApproval: true, approvalRole: 'manager', reason: 'Budget expenditures require manager approval' },
    { actionType: 'data_export', requiresApproval: false, approvalRole: null, reason: 'Standard admin reports within scope' },
    { actionType: 'report_generation', requiresApproval: false, approvalRole: null, reason: 'Internal admin reports are auto-approved' },
  ],
};

// Handoff rules per category
const BASE_HANDOFF_RULES: Record<Category, HandoffRule[]> = {
  EXECUTIVE: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security violations to cybersecurity team' },
    { trigger: 'financial_irregularity', targetDepartment: 'Financial Analysis', description: 'Route financial anomalies to finance team' },
    { trigger: 'legal_risk_identified', targetDepartment: 'Legal Administration', description: 'Hand off legal risks to legal team' },
    { trigger: 'compliance_breach', targetDepartment: 'Compliance & Policies', description: 'Escalate compliance issues to compliance team' },
  ],
  FINANCE: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security violations to cybersecurity team' },
    { trigger: 'payment_required', targetDepartment: 'Treasury Operations', description: 'Route payment decisions to treasury team' },
    { trigger: 'legal_review_needed', targetDepartment: 'Legal Administration', description: 'Hand off to legal for compliance review' },
    { trigger: 'tax_question', targetDepartment: 'Tax Management', description: 'Route tax-related queries to tax specialists' },
  ],
  HR: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security violations to cybersecurity team' },
    { trigger: 'benefits_question', targetDepartment: 'Benefits Management', description: 'Route benefits queries to benefits team' },
    { trigger: 'payroll_issue', targetDepartment: 'Payroll Administration', description: 'Hand off payroll issues to payroll team' },
    { trigger: 'legal_review_needed', targetDepartment: 'Legal Administration', description: 'Escalate employment law questions to legal' },
  ],
  LEGAL: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security incidents to cybersecurity team' },
    { trigger: 'compliance_violation', targetDepartment: 'Compliance Monitoring', description: 'Route compliance violations for enforcement' },
    { trigger: 'data_breach_detected', targetDepartment: 'Data Privacy', description: 'Hand off data breaches to privacy team' },
    { trigger: 'ip_infringement', targetDepartment: 'Patent & IP Management', description: 'Route IP issues to IP management team' },
  ],
  ENGINEERING: [
    { trigger: 'security_vulnerability', targetDepartment: 'Cybersecurity Operations', description: 'Report vulnerabilities to security team' },
    { trigger: 'production_incident', targetDepartment: 'DevOps & CI/CD', description: 'Escalate production issues to DevOps' },
    { trigger: 'architecture_decision', targetDepartment: 'System Architecture', description: 'Route architectural decisions to architecture team' },
    { trigger: 'performance_issue', targetDepartment: 'QA Engineering', description: 'Hand off performance issues to QA for analysis' },
  ],
  AI_ML: [
    { trigger: 'security_vulnerability', targetDepartment: 'Cybersecurity Operations', description: 'Report AI security issues to cybersecurity team' },
    { trigger: 'model_safety_concern', targetDepartment: 'AI Safety & Ethics', description: 'Route safety concerns to AI ethics team' },
    { trigger: 'infrastructure_issue', targetDepartment: 'MLOps Infrastructure', description: 'Hand off infrastructure problems to MLOps' },
    { trigger: 'data_quality_issue', targetDepartment: 'Data Pipeline', description: 'Route data quality issues to data pipeline team' },
  ],
  SECURITY: [
    { trigger: 'incident_confirmed', targetDepartment: 'Incident Response', description: 'Escalate confirmed incidents to incident response' },
    { trigger: 'vulnerability_critical', targetDepartment: 'Vulnerability Management', description: 'Route critical vulnerabilities for patching' },
    { trigger: 'compliance_violation', targetDepartment: 'Compliance Monitoring', description: 'Hand off compliance violations to compliance team' },
    { trigger: 'data_breach', targetDepartment: 'Data Privacy', description: 'Route data breaches to privacy team immediately' },
  ],
  MARKETING: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security issues to cybersecurity team' },
    { trigger: 'brand_crisis', targetDepartment: 'Brand Strategy', description: 'Route brand crises to brand strategy team' },
    { trigger: 'legal_review_needed', targetDepartment: 'Legal Administration', description: 'Hand off content for legal review' },
    { trigger: 'lead_qualified', targetDepartment: 'Sales Operations', description: 'Route qualified leads to sales team' },
  ],
  CRM_SALES: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security issues to cybersecurity team' },
    { trigger: 'deal_closed_won', targetDepartment: 'Customer Success', description: 'Hand off won deals to customer success' },
    { trigger: 'contract_signing_needed', targetDepartment: 'Legal Administration', description: 'Route contracts to legal for review' },
    { trigger: 'payment_issue', targetDepartment: 'Financial Analysis', description: 'Hand off payment issues to finance team' },
  ],
  DESIGN: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security issues to cybersecurity team' },
    { trigger: 'brand_guideline_violation', targetDepartment: 'Brand Strategy', description: 'Route brand violations to brand strategy team' },
    { trigger: 'ux_research_needed', targetDepartment: 'User Experience Research', description: 'Hand off to UX research for validation' },
    { trigger: 'content_approval', targetDepartment: 'Content Strategy', description: 'Route design content for content strategy review' },
  ],
  EDUCATION: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security issues to cybersecurity team' },
    { trigger: 'content_quality_issue', targetDepartment: 'Curriculum Development', description: 'Route quality issues to curriculum team' },
    { trigger: 'student_support_escalation', targetDepartment: 'Student Support', description: 'Hand off student issues to support team' },
    { trigger: 'technical_platform_issue', targetDepartment: 'E-Learning Platform', description: 'Route LMS issues to platform team' },
  ],
  ADMIN: [
    { trigger: 'security_violation_detected', targetDepartment: 'Cybersecurity Operations', description: 'Escalate security issues to cybersecurity team' },
    { trigger: 'vendor_dispute', targetDepartment: 'Legal Administration', description: 'Hand off vendor disputes to legal' },
    { trigger: 'budget_overrun', targetDepartment: 'Budget Planning', description: 'Route budget overruns to finance team' },
    { trigger: 'supply_chain_disruption', targetDepartment: 'Supply Chain', description: 'Escalate supply issues to supply chain team' },
  ],
};

// Quality checklist per category
const BASE_QUALITY_CHECKLIST: Record<Category, QualityItem[]> = {
  EXECUTIVE: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify output conforms to expected strategic report schema' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company data in strategic output' },
    { item: 'action_within_permissions', required: true, description: 'Verify all analysis was within permitted scope' },
    { item: 'data_sources_cited', required: true, description: 'All data sources and metrics properly cited' },
    { item: 'recommendations_actionable', required: true, description: 'Strategic recommendations are specific and actionable' },
    { item: 'appropriate_language_tone', required: true, description: 'Output uses executive-appropriate professional tone' },
    { item: 'metrics_recorded', required: true, description: 'Usage metrics and timing were recorded' },
    { item: 'memory_updated', required: false, description: 'Relevant strategic insights saved to memory' },
  ],
  FINANCE: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify financial output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company financial data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all calculations within permitted scope' },
    { item: 'numerical_accuracy', required: true, description: 'All numbers verified for mathematical correctness' },
    { item: 'compliance_standards_met', required: true, description: 'Output complies with GAAP/IFRS as applicable' },
    { item: 'appropriate_language_tone', required: true, description: 'Financial terminology used correctly' },
    { item: 'audit_trail_complete', required: true, description: 'All calculations traceable to source data' },
    { item: 'metrics_recorded', required: true, description: 'Financial processing metrics recorded' },
  ],
  HR: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify HR output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company employee data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all HR actions within permitted scope' },
    { item: 'pii_protected', required: true, description: 'No PII exposed in output' },
    { item: 'policy_compliance', required: true, description: 'Actions comply with HR policies and labor law' },
    { item: 'fairness_check', required: true, description: 'Decisions are fair and non-discriminatory' },
    { item: 'appropriate_language_tone', required: true, description: 'Tone is professional and empathetic' },
    { item: 'metrics_recorded', required: true, description: 'HR processing metrics recorded' },
  ],
  LEGAL: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify legal output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company legal data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all legal analysis within permitted scope' },
    { item: 'citations_accurate', required: true, description: 'All legal citations and references verified' },
    { item: 'jurisdiction_correct', required: true, description: 'Analysis applies to correct jurisdiction' },
    { item: 'privilege_maintained', required: true, description: 'Attorney-client privilege maintained' },
    { item: 'appropriate_language_tone', required: true, description: 'Legal terminology used precisely' },
    { item: 'metrics_recorded', required: true, description: 'Legal processing metrics recorded' },
  ],
  ENGINEERING: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify code/output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company code or secrets' },
    { item: 'action_within_permissions', required: true, description: 'Verify all engineering actions within permitted scope' },
    { item: 'tests_passing', required: true, description: 'All relevant tests pass successfully' },
    { item: 'no_hardcoded_secrets', required: true, description: 'No API keys, passwords, or secrets in output' },
    { item: 'code_quality_standards', required: true, description: 'Code meets linting and style standards' },
    { item: 'appropriate_documentation', required: true, description: 'Generated code includes necessary documentation' },
    { item: 'metrics_recorded', required: true, description: 'Engineering metrics and timing recorded' },
  ],
  AI_ML: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify AI output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company data in AI output' },
    { item: 'action_within_permissions', required: true, description: 'Verify all AI operations within permitted scope' },
    { item: 'output_safety_check', required: true, description: 'AI output passes safety and bias checks' },
    { item: 'model_within_budget', required: true, description: 'Token/compute usage within budget limits' },
    { item: 'no_hallucination_flags', required: true, description: 'Output contains no detected hallucinations' },
    { item: 'appropriate_language_tone', required: true, description: 'Output tone matches intended use case' },
    { item: 'metrics_recorded', required: true, description: 'ML metrics (latency, tokens, accuracy) recorded' },
  ],
  SECURITY: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify security output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company security data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all security actions within permitted scope' },
    { item: 'findings_verified', required: true, description: 'Security findings corroborated with evidence' },
    { item: 'severity_correct', required: true, description: 'Severity ratings follow CVSS or equivalent standard' },
    { item: 'no_false_positive_leakage', required: true, description: 'False positive rate within acceptable threshold' },
    { item: 'appropriate_language_tone', required: true, description: 'Security findings use standard terminology' },
    { item: 'metrics_recorded', required: true, description: 'Security scan metrics and timing recorded' },
  ],
  MARKETING: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify marketing output conforms to brief format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company brand data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all marketing actions within permitted scope' },
    { item: 'brand_guideline_compliance', required: true, description: 'Content follows brand guidelines and tone' },
    { item: 'seo_optimized', required: true, description: 'Content optimized for target keywords where applicable' },
    { item: 'no_misleading_claims', required: true, description: 'No unsubstantiated or misleading marketing claims' },
    { item: 'appropriate_language_tone', required: true, description: 'Tone matches target audience and brand voice' },
    { item: 'metrics_recorded', required: true, description: 'Marketing content metrics recorded' },
  ],
  CRM_SALES: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify CRM output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company customer data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all CRM actions within permitted scope' },
    { item: 'customer_data_accurate', required: true, description: 'Customer data verified for accuracy' },
    { item: 'communication_appropriate', required: true, description: 'Communication tone professional and appropriate' },
    { item: 'privacy_compliance', required: true, description: 'Actions comply with data privacy regulations' },
    { item: 'appropriate_language_tone', required: true, description: 'Sales communication uses appropriate tone' },
    { item: 'metrics_recorded', required: true, description: 'CRM interaction metrics recorded' },
  ],
  DESIGN: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify design output meets format specifications' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company brand assets' },
    { item: 'action_within_permissions', required: true, description: 'Verify all design actions within permitted scope' },
    { item: 'brand_compliance', required: true, description: 'Design follows brand guidelines exactly' },
    { item: 'accessibility_check', required: true, description: 'Design meets accessibility standards (WCAG)' },
    { item: 'resolution_quality', required: true, description: 'Output meets required resolution and quality specs' },
    { item: 'appropriate_assets_licensed', required: true, description: 'All external assets properly licensed' },
    { item: 'metrics_recorded', required: true, description: 'Design production metrics recorded' },
  ],
  EDUCATION: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify education output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company student data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all education actions within permitted scope' },
    { item: 'content_accuracy', required: true, description: 'Educational content factually accurate' },
    { item: 'learning_objectives_met', required: true, description: 'Content aligns with stated learning objectives' },
    { item: 'grading_fairness', required: true, description: 'Grading criteria applied consistently' },
    { item: 'appropriate_language_tone', required: true, description: 'Content uses appropriate educational tone' },
    { item: 'metrics_recorded', required: true, description: 'Education processing metrics recorded' },
  ],
  ADMIN: [
    { item: 'output_matches_input_schema', required: true, description: 'Verify admin output conforms to expected format' },
    { item: 'no_company_data_leakage', required: true, description: 'Confirm no cross-company admin data' },
    { item: 'action_within_permissions', required: true, description: 'Verify all admin actions within permitted scope' },
    { item: 'data_accuracy', required: true, description: 'Administrative data verified for accuracy' },
    { item: 'process_compliance', required: true, description: 'Actions follow established admin processes' },
    { item: 'appropriate_language_tone', required: true, description: 'Communication is professional and clear' },
    { item: 'deadlines_respected', required: true, description: 'All tasks completed within defined SLAs' },
    { item: 'metrics_recorded', required: true, description: 'Admin processing metrics recorded' },
  ],
};

// ============================================================
// STEP 3: Role-Specific Variations
// ============================================================

type Role = 'manager' | 'planner' | 'execution' | 'qa' | 'report' | 'automation' | 'safety' | 'memory' | 'productivity' | 'owner_approval' | 'specialist';

// Role-specific workflow step modifications
function getWorkflowSteps(category: Category, role: Role): WorkflowStep[] {
  const base = [...BASE_WORKFLOW_STEPS[category]];

  if (role === 'manager') {
    // Insert coordination steps for managers
    return [
      { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate task request and assess resource requirements' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify authorization level and access scope for the task' },
      { stepNumber: 3, action: 'coordinate_team', agentRole: 'self', description: 'Assess team capacity and allocate subtasks to available agents' },
      { stepNumber: 4, action: 'monitor_progress', agentRole: 'self', description: 'Track subtask progress and handle escalations' },
      { stepNumber: 5, action: 'execute_primary_task', agentRole: 'self', description: 'Execute the primary assigned task using permitted skills and tools' },
      { stepNumber: 6, action: 'review_output', agentRole: 'self', description: 'Review and consolidate team outputs into cohesive deliverable' },
      { stepNumber: 7, action: 'quality_check', agentRole: 'qa', description: 'Verify final output quality against department standards' },
      { stepNumber: 8, action: 'log_and_cleanup', agentRole: 'self', description: 'Record metrics, update team status, release resources' },
    ];
  }

  if (role === 'planner') {
    return [
      { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate planning request and gather context' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify access to planning data and strategic resources' },
      { stepNumber: 3, action: 'analyze_requirements', agentRole: 'self', description: 'Analyze requirements and identify dependencies, risks, and constraints' },
      { stepNumber: 4, action: 'generate_plan', agentRole: 'self', description: 'Create detailed plan with milestones, resources, and timelines' },
      { stepNumber: 5, action: 'risk_assessment', agentRole: 'self', description: 'Evaluate plan for risks and create mitigation strategies' },
      { stepNumber: 6, action: 'quality_check', agentRole: 'qa', description: 'Verify plan completeness and feasibility' },
      { stepNumber: 7, action: 'log_and_cleanup', agentRole: 'self', description: 'Record planning metrics, archive plan, release resources' },
    ];
  }

  if (role === 'qa') {
    return [
      { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate test targets and quality criteria' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify testing access and scope authorization' },
      { stepNumber: 3, action: 'execute_validation', agentRole: 'self', description: 'Run validation checks, tests, or quality assessments' },
      { stepNumber: 4, action: 'defect_detection', agentRole: 'self', description: 'Identify and categorize defects, issues, or quality gaps' },
      { stepNumber: 5, action: 'generate_report', agentRole: 'self', description: 'Produce quality report with findings, severity, and recommendations' },
      { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record QA metrics, update quality dashboard, release resources' },
    ];
  }

  if (role === 'report') {
    return [
      { stepNumber: 1, action: 'validate_input', agentRole: 'self', description: 'Validate reporting request and data sources' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify data access for report generation' },
      { stepNumber: 3, action: 'gather_data', agentRole: 'self', description: 'Collect and aggregate data from permitted sources' },
      { stepNumber: 4, action: 'compile_report', agentRole: 'self', description: 'Generate formatted report with visualizations and summaries' },
      { stepNumber: 5, action: 'quality_check', agentRole: 'qa', description: 'Verify report accuracy, completeness, and format' },
      { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record report metrics, archive, release resources' },
    ];
  }

  if (role === 'automation') {
    return [
      { stepNumber: 1, action: 'validate_trigger', agentRole: 'self', description: 'Validate automation trigger and input conditions' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify automation scope and resource authorization' },
      { stepNumber: 3, action: 'execute_batch', agentRole: 'self', description: 'Process batch operations according to automation rules' },
      { stepNumber: 4, action: 'handle_exceptions', agentRole: 'self', description: 'Process exceptions and route failures for manual review' },
      { stepNumber: 5, action: 'log_and_cleanup', agentRole: 'self', description: 'Record automation metrics, update status, release resources' },
    ];
  }

  if (role === 'safety') {
    return [
      { stepNumber: 1, action: 'validate_request', agentRole: 'self', description: 'Validate the action request for safety review' },
      { stepNumber: 2, action: 'permission_check', agentRole: 'self', description: 'Check user permissions, company scope, and tool authorization' },
      { stepNumber: 3, action: 'risk_assessment', agentRole: 'self', description: 'Assess action for security, privacy, and compliance risks' },
      { stepNumber: 4, action: 'apply_rules', agentRole: 'self', description: 'Apply protection, approval, and handoff rules' },
      { stepNumber: 5, action: 'decision_output', agentRole: 'self', description: 'Output allow/block/escalate decision with reasoning' },
      { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record safety decision, update audit log, release resources' },
    ];
  }

  if (role === 'memory') {
    return [
      { stepNumber: 1, action: 'validate_request', agentRole: 'self', description: 'Validate memory operation request type' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify memory access authorization and scope' },
      { stepNumber: 3, action: 'execute_memory_op', agentRole: 'self', description: 'Perform memory store, retrieve, search, or prune operation' },
      { stepNumber: 4, action: 'validate_memory', agentRole: 'self', description: 'Verify memory content quality and relevance' },
      { stepNumber: 5, action: 'enforce_retention', agentRole: 'self', description: 'Apply retention policies and memory limits' },
      { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record memory metrics, update indexes, release resources' },
    ];
  }

  if (role === 'productivity') {
    return [
      { stepNumber: 1, action: 'validate_request', agentRole: 'self', description: 'Validate productivity metrics or optimization request' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify access to performance data and analytics' },
      { stepNumber: 3, action: 'collect_metrics', agentRole: 'self', description: 'Gather productivity, performance, and efficiency metrics' },
      { stepNumber: 4, action: 'analyze_patterns', agentRole: 'self', description: 'Identify bottlenecks, patterns, and optimization opportunities' },
      { stepNumber: 5, action: 'generate_insights', agentRole: 'self', description: 'Produce productivity insights and recommendations' },
      { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record analytics metrics, update dashboards, release resources' },
    ];
  }

  if (role === 'owner_approval') {
    return [
      { stepNumber: 1, action: 'validate_request', agentRole: 'self', description: 'Validate approval request and required documentation' },
      { stepNumber: 2, action: 'check_permissions', agentRole: 'safety', description: 'Verify approver authorization and request scope' },
      { stepNumber: 3, action: 'review_submission', agentRole: 'self', description: 'Review submitted content against approval criteria' },
      { stepNumber: 4, action: 'risk_evaluation', agentRole: 'self', description: 'Evaluate risks of approving or rejecting the request' },
      { stepNumber: 5, action: 'render_decision', agentRole: 'self', description: 'Issue approval, rejection, or request changes' },
      { stepNumber: 6, action: 'log_and_cleanup', agentRole: 'self', description: 'Record approval decision, notify requester, release resources' },
    ];
  }

  // specialist and execution use base
  return base;
}

// Role-specific productivity rules
function getProductivityRules(category: Category, role: Role): ProductivityRules {
  const base: ProductivityRules = {
    maxConcurrentTasks: 3,
    priorityLevel: 'medium',
    estimatedDurationMinutes: 15,
    retryPolicy: { maxRetries: 3, backoffMultiplier: 2, retryableErrors: ['timeout', 'rate_limit', 'temporary_failure'] },
    timeoutSeconds: 300,
    resourceLimits: { maxMemoryMB: 512, maxCPU: 0.5 },
    idleTimeoutSeconds: 60,
    healthCheckIntervalSeconds: 30,
  };

  switch (role) {
    case 'manager':
      return { ...base, maxConcurrentTasks: 5, priorityLevel: 'high', estimatedDurationMinutes: 30, timeoutSeconds: 600, resourceLimits: { maxMemoryMB: 1024, maxCPU: 0.75 }, idleTimeoutSeconds: 120 };
    case 'planner':
      return { ...base, maxConcurrentTasks: 2, priorityLevel: 'high', estimatedDurationMinutes: 45, timeoutSeconds: 600, resourceLimits: { maxMemoryMB: 768, maxCPU: 0.6 }, idleTimeoutSeconds: 90 };
    case 'execution':
      return base;
    case 'qa':
      return { ...base, maxConcurrentTasks: 4, priorityLevel: 'medium', estimatedDurationMinutes: 20, timeoutSeconds: 450, resourceLimits: { maxMemoryMB: 768, maxCPU: 0.6 } };
    case 'report':
      return { ...base, maxConcurrentTasks: 3, priorityLevel: 'low', estimatedDurationMinutes: 25, timeoutSeconds: 450, resourceLimits: { maxMemoryMB: 512, maxCPU: 0.4 }, idleTimeoutSeconds: 90 };
    case 'automation':
      return { ...base, maxConcurrentTasks: 10, priorityLevel: 'medium', estimatedDurationMinutes: 5, timeoutSeconds: 600, retryPolicy: { ...base.retryPolicy, maxRetries: 5 }, resourceLimits: { maxMemoryMB: 1024, maxCPU: 0.8 }, idleTimeoutSeconds: 30 };
    case 'safety':
      return { ...base, maxConcurrentTasks: 8, priorityLevel: 'critical', estimatedDurationMinutes: 5, timeoutSeconds: 60, retryPolicy: { maxRetries: 1, backoffMultiplier: 1, retryableErrors: ['timeout'] }, resourceLimits: { maxMemoryMB: 256, maxCPU: 0.3 }, idleTimeoutSeconds: 15, healthCheckIntervalSeconds: 10 };
    case 'memory':
      return { ...base, maxConcurrentTasks: 6, priorityLevel: 'high', estimatedDurationMinutes: 3, timeoutSeconds: 120, resourceLimits: { maxMemoryMB: 1024, maxCPU: 0.5 }, idleTimeoutSeconds: 30 };
    case 'productivity':
      return { ...base, maxConcurrentTasks: 2, priorityLevel: 'medium', estimatedDurationMinutes: 30, timeoutSeconds: 300, resourceLimits: { maxMemoryMB: 512, maxCPU: 0.4 }, idleTimeoutSeconds: 120 };
    case 'owner_approval':
      return { ...base, maxConcurrentTasks: 3, priorityLevel: 'critical', estimatedDurationMinutes: 10, timeoutSeconds: 300, resourceLimits: { maxMemoryMB: 256, maxCPU: 0.3 }, idleTimeoutSeconds: 60 };
    case 'specialist':
    default:
      return base;
  }
}

// Role-specific self-improvement config
function getSelfImprovement(role: Role): SelfImprovement {
  const base: SelfImprovement = {
    learningMethods: ['output_quality_tracking', 'error_pattern_analysis', 'user_feedback_integration', 'peer_comparison'],
    feedbackTriggers: ['task_failure', 'user_correction', 'quality_score_below_threshold', 'repeated_errors'],
    improvementCycle: 'daily',
    maxMemoryItems: 500,
    confidenceDecay: 0.95,
    minSamplesBeforePromotion: 100,
  };

  switch (role) {
    case 'manager':
      return { ...base, learningMethods: ['team_performance_tracking', 'decision_outcome_analysis', 'feedback_integration', 'strategy_refinement'], feedbackTriggers: ['task_failure', 'team_bottleneck', 'quality_score_below_threshold', 'escalation_rate_high'], improvementCycle: 'weekly', maxMemoryItems: 1000, minSamplesBeforePromotion: 200 };
    case 'qa':
      return { ...base, learningMethods: ['defect_pattern_analysis', 'false_positive_tracking', 'quality_trend_analysis', 'test_coverage_optimization'], feedbackTriggers: ['missed_defect', 'false_positive_rate_high', 'quality_score_below_threshold', 'regression_detected'], improvementCycle: 'daily', maxMemoryItems: 800, confidenceDecay: 0.98, minSamplesBeforePromotion: 150 };
    case 'automation':
      return { ...base, learningMethods: ['failure_rate_tracking', 'efficiency_optimization', 'trigger_accuracy_analysis', 'batch_performance_monitoring'], feedbackTriggers: ['batch_failure', 'trigger_miss', 'efficiency_degraded', 'exception_rate_high'], improvementCycle: 'daily', maxMemoryItems: 300, minSamplesBeforePromotion: 50 };
    case 'safety':
      return { ...base, learningMethods: ['violation_pattern_analysis', 'false_block_rate_tracking', 'threat_adaptation', 'compliance_rule_updates'], feedbackTriggers: ['security_bypass', 'false_positive_block', 'new_threat_pattern', 'compliance_change'], improvementCycle: 'daily', maxMemoryItems: 200, confidenceDecay: 0.99, minSamplesBeforePromotion: 50 };
    default:
      return base;
  }
}

// Role-specific skill/tool adjustments
function getRoleSkills(category: Category, role: Role): string[] {
  const base = [...BASE_ALLOWED_SKILLS[category]];

  if (role === 'manager') return [...base, 'team_coordination', 'resource_allocation', 'escalation_handling'];
  if (role === 'planner') return [...base, 'requirement_analysis', 'dependency_mapping', 'risk_modeling'];
  if (role === 'qa') return [...base, 'test_case_design', 'defect_categorization', 'quality_scoring'];
  if (role === 'report') return [...base, 'data_aggregation', 'visualization_creation', 'summary_writing'];
  if (role === 'automation') return [...base, 'trigger_detection', 'batch_processing', 'exception_handling'];
  if (role === 'safety') return ['permission_validation', 'risk_detection', 'rule_evaluation', 'audit_logging', 'access_control_check'];
  if (role === 'memory') return ['memory_store', 'memory_retrieve', 'memory_search', 'memory_prune', 'context_embedding'];
  if (role === 'productivity') return ['metrics_collection', 'performance_analysis', 'bottleneck_detection', 'optimization_recommendation'];
  if (role === 'owner_approval') return ['approval_evaluation', 'risk_assessment', 'compliance_verification', 'decision_rendering'];

  return base;
}

function getRoleTools(category: Category, role: Role): string[] {
  const base = [...BASE_ALLOWED_TOOLS[category]];

  if (role === 'manager') return [...base, 'team_dashboard', 'escalation_system', 'resource_tracker'];
  if (role === 'planner') return [...base, 'project_timeline', 'dependency_tracker', 'risk_register'];
  if (role === 'qa') return [...base, 'test_framework', 'defect_tracker', 'quality_dashboard'];
  if (role === 'report') return [...base.filter(t => !t.includes('write')), 'report_generator', 'chart_builder', 'data_exporter'];
  if (role === 'automation') return [...base, 'trigger_engine', 'batch_processor', 'scheduler'];
  if (role === 'safety') return ['permission_checker', 'rule_engine', 'audit_logger', 'alert_system'];
  if (role === 'memory') return ['memory_store', 'vector_search', 'context_manager', 'retention_policy_engine'];
  if (role === 'productivity') return ['metrics_dashboard', 'analytics_engine', 'alert_system'];
  if (role === 'owner_approval') return ['approval_workflow', 'notification_service', 'audit_logger'];

  return base;
}

// ============================================================
// STEP 4: Main Update Logic
// ============================================================

async function main() {
  const startTime = Date.now();
  console.log('=== Agent Protocol Population Script ===');
  console.log('Fetching all agents...');

  const allAgents = await db.agent.findMany({
    select: { id: true, agentId: true, name: true, departmentName: true, role: true },
    orderBy: { agentId: 'asc' },
  });

  console.log(`Found ${allAgents.length} agents`);

  // Validate all departments are mapped
  const unmappedDepts = new Set<string>();
  for (const agent of allAgents) {
    if (!DEPT_CATEGORY_MAP[agent.departmentName]) {
      unmappedDepts.add(agent.departmentName);
    }
  }
  if (unmappedDepts.size > 0) {
    console.error('ERROR: Unmapped departments:', [...unmappedDepts]);
    process.exit(1);
  }

  const BATCH_SIZE = 100;
  let updated = 0;

  for (let i = 0; i < allAgents.length; i += BATCH_SIZE) {
    const batch = allAgents.slice(i, i + BATCH_SIZE);
    const batchStart = Date.now();

    await Promise.all(
      batch.map(async (agent) => {
        const category = DEPT_CATEGORY_MAP[agent.departmentName]!;
        const role = agent.role as Role;

        const allowedSkills = getRoleSkills(category, role);
        const forbiddenSkills = BASE_FORBIDDEN_SKILLS[category];
        const allowedTools = getRoleTools(category, role);
        const forbiddenTools = BASE_FORBIDDEN_TOOLS[category];
        const workflowSteps = getWorkflowSteps(category, role);
        const protectionRules = BASE_PROTECTION_RULES[category];
        const approvalRules = BASE_APPROVAL_RULES[category];
        const handoffRules = BASE_HANDOFF_RULES[category];
        const qualityChecklist = BASE_QUALITY_CHECKLIST[category];
        const selfImprovement = getSelfImprovement(role);
        const productivityRules = getProductivityRules(category, role);

        await db.agent.update({
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
      })
    );

    updated += batch.length;
    const batchMs = Date.now() - batchStart;
    console.log(`Updated ${updated}/${allAgents.length} agents... (${batchMs}ms for this batch)`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Complete! Updated ${updated} agents in ${totalTime}s ===`);
}

main()
  .catch((e) => { console.error('FATAL:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());