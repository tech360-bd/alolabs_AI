const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

// Department category templates - each has 20 agent archetypes
const CATEGORIES = {
  crm: {
    domain: 'customer relationship management and sales pipeline optimization',
    skills: ['lead_scoring', 'pipeline_analysis', 'customer_360', 'email_automation', 'forecasting', 'segmentation'],
    tools: ['crm_database', 'email_sender', 'analytics_dashboard', 'calendar', 'notification'],
    agents: ['Lead Scoring', 'Pipeline Analysis', 'Customer Segmentation', 'Deal Tracking', 'Contact Enrichment', 'Email Campaign', 'Follow-up Scheduler', 'Data Cleansing', 'Sales Forecasting', 'Lifetime Value Calc', 'Churn Prediction', 'NPS Analyzer', 'Account Mapping', 'Sales Coach', 'Meeting Scheduler', 'Quote Generator', 'Contract Analyzer', 'Competitor Intel', 'Territory Planner', 'Win/Loss Analyzer']
  },
  marketing: {
    domain: 'digital marketing strategy, campaign management and brand growth',
    skills: ['campaign_strategy', 'audience_research', 'content_planning', 'budget_optimization', 'ab_testing', 'analytics'],
    tools: ['ad_platforms', 'analytics_dashboard', 'social_media', 'email_platform', 'cms'],
    agents: ['Campaign Strategist', 'Audience Researcher', 'Content Calendar', 'Budget Optimizer', 'A/B Test Analyst', 'Channel Performer', 'Brand Monitor', 'Influencer Finder', 'Ad Copy Writer', 'Landing Page Opt', 'Conversion Analyst', 'Trend Analyzer', 'Competitor Ad Intel', 'Creative Brief Gen', 'ROI Calculator', 'Social Listener', 'Email Strategist', 'Funnel Optimizer', 'Attribution Modeler', 'Brand Voice Analyzer']
  },
  seo: {
    domain: 'search engine optimization, keyword research and organic visibility',
    skills: ['keyword_research', 'on_page_seo', 'technical_seo', 'backlink_analysis', 'content_optimization', 'rank_tracking'],
    tools: ['search_console', 'analytics', 'keyword_tool', 'site_auditor', 'backlink_checker'],
    agents: ['Keyword Researcher', 'On-Page Optimizer', 'Technical SEO Audit', 'Backlink Analyzer', 'Content Gap Finder', 'SERP Monitor', 'Rank Tracker', 'Schema Markup Gen', 'Core Vitals Check', 'SEO Reporter', 'Local SEO Opt', 'Image SEO Agent', 'Video SEO Agent', 'International SEO', 'Mobile SEO Check', 'Content Brief Gen', 'Link Builder', 'Penalty Recovery', 'SEO Auditor', 'Site Architect']
  },
  content: {
    domain: 'content creation, copywriting and editorial management',
    skills: ['blog_writing', 'copywriting', 'editing', 'seo_writing', 'content_strategy', 'tone_analysis'],
    tools: ['cms', 'grammar_checker', 'plagiarism_detector', 'seo_tool', 'image_editor'],
    agents: ['Blog Writer', 'Social Copywriter', 'Newsletter Writer', 'Product Desc Writer', 'Whitepaper Writer', 'Case Study Writer', 'Press Release', 'Ad Copy Writer', 'SEO Content Writer', 'Technical Writer', 'Storyteller Agent', 'Tone Adjuster', 'Content Planner', 'Headline Generator', 'Proofreader', 'Content Repurposer', 'Brand Voice Writer', 'Long-form Writer', 'Short-form Writer', 'Content Editor']
  },
  sales: {
    domain: 'sales operations, lead generation and revenue growth',
    skills: ['lead_qualification', 'outreach', 'negotiation', 'pipeline_mgmt', 'forecasting', 'coaching'],
    tools: ['crm', 'email', 'calendar', 'voip', 'document_signer'],
    agents: ['Lead Qualifier', 'Cold Outreach', 'Pitch Writer', 'Objection Handler', 'Demo Scheduler', 'Proposal Writer', 'Pricing Strategist', 'Pipeline Manager', 'Lead Nurturer', 'Territory Manager', 'Sales Coach', 'Competitor Analyst', 'Account Executive', 'Sales Analyst', 'Follow-up Agent', 'Upsell/Cross-sell', 'Contract Negotiator', 'Sales Forecaster', 'Referral Manager', 'Win-back Agent']
  },
  support: {
    domain: 'customer support, ticket management and service quality',
    skills: ['ticket_classification', 'response_writing', 'escalation', 'knowledge_base', 'sentiment_analysis', 'troubleshooting'],
    tools: ['ticket_system', 'knowledge_base', 'chat', 'email', 'phone_system'],
    agents: ['Ticket Classifier', 'Response Writer', 'Escalation Handler', 'KB Writer', 'CSAT Analyzer', 'Chat Responder', 'FAQ Generator', 'Resolution Tracker', 'Feedback Analyzer', 'Queue Manager', 'Onboarding Guide', 'Troubleshooter', 'Sentiment Analyzer', 'SLA Monitor', 'Multi-lang Support', 'Call Summarizer', 'Proactive Support', 'Feedback Looper', 'Self-Service Guide', 'VIP Support']
  },
  hr: {
    domain: 'human resources, recruitment and talent management',
    skills: ['resume_screening', 'interview', 'onboarding', 'performance_review', 'compliance', 'engagement'],
    tools: ['ats', 'calendar', 'email', 'survey_tool', 'hris'],
    agents: ['Resume Screener', 'JD Writer', 'Interview Scheduler', 'Candidate Matcher', 'Onboarding Agent', 'Performance Reviewer', 'Training Coordinator', 'Benefits Advisor', 'Policy Writer', 'Engagement Analyzer', 'Culture Analyzer', 'Exit Interviewer', 'Compliance Checker', 'Salary Researcher', 'Talent Pipeline', 'Reference Checker', 'HR Analytics', 'Safety Monitor', 'D&I Agent', 'Recruitment Marketer']
  },
  finance: {
    domain: 'financial operations, accounting and fiscal management',
    skills: ['invoicing', 'expense_tracking', 'reporting', 'tax_calculation', 'budgeting', 'forecasting'],
    tools: ['accounting_software', 'banking_api', 'spreadsheet', 'payroll_system', 'tax_software'],
    agents: ['Invoice Processor', 'Expense Tracker', 'Financial Reporter', 'Tax Calculator', 'Budget Analyst', 'Cash Flow Manager', 'AP Agent', 'AR Agent', 'Financial Forecaster', 'Audit Trail Monitor', 'Revenue Recognizer', 'Cost Allocator', 'Profitability Analyzer', 'Compliance Reporter', 'Payroll Processor', 'Currency Converter', 'Investment Tracker', 'Risk Analyzer', 'Budget vs Actual', 'Financial Planner']
  },
  devops: {
    domain: 'DevOps, infrastructure automation and security operations',
    skills: ['cicd', 'monitoring', 'incident_response', 'security_scanning', 'infrastructure', 'configuration'],
    tools: ['kubernetes', 'docker', 'terraform', 'monitoring_stack', 'ci_cd_pipeline'],
    agents: ['CI/CD Manager', 'Deployment Agent', 'Server Monitor', 'Incident Responder', 'Vulnerability Scanner', 'Log Analyzer', 'Infra Provisioner', 'Config Manager', 'Backup Coordinator', 'Security Auditor', 'Access Controller', 'Performance Monitor', 'Alert Manager', 'Container Orchestrator', 'Secret Manager', 'Network Monitor', 'Compliance Checker', 'Change Manager', 'Runbook Agent', 'Disaster Recovery']
  },
  data: {
    domain: 'data engineering, analytics and business intelligence',
    skills: ['data_collection', 'etl', 'visualization', 'statistical_analysis', 'anomaly_detection', 'data_quality'],
    tools: ['data_warehouse', 'bi_tool', 'python', 'sql', 'notebook'],
    agents: ['Data Collector', 'Data Cleaner', 'ETL Pipeline', 'Dashboard Builder', 'Report Generator', 'Trend Analyzer', 'Anomaly Detector', 'Predictive Modeler', 'Data Validator', 'Query Optimizer', 'Data Cataloger', 'Privacy Checker', 'Lineage Tracker', 'Metric Calculator', 'A/B Test Analyzer', 'Cohort Analyzer', 'Funnel Analyst', 'Segmentation Agent', 'Statistical Analyst', 'Quality Monitor']
  },
  engineering: {
    domain: 'software engineering, code quality and development operations',
    skills: ['code_review', 'testing', 'documentation', 'api_design', 'refactoring', 'security_scan'],
    tools: ['git', 'ide', 'ci_cd', 'testing_framework', 'documentation_tool'],
    agents: ['Code Reviewer', 'Bug Triage', 'Test Writer', 'Doc Writer', 'API Designer', 'Refactoring Agent', 'Dep Checker', 'Perf Optimizer', 'Security Scanner', 'Code Formatter', 'Sprint Planner', 'Tech Debt Tracker', 'Architecture Advisor', 'Code Migrator', 'Build Manager', 'Release Manager', 'Dev Env Setup', 'Pair Programmer', 'Quality Gate', 'Requirements Analyst']
  },
  project: {
    domain: 'project management, resource planning and delivery tracking',
    skills: ['task_management', 'sprint_planning', 'resource_allocation', 'risk_management', 'reporting', 'stakeholder_comm'],
    tools: ['project_tool', 'calendar', 'document', 'whiteboard', 'communication'],
    agents: ['Task Creator', 'Sprint Planner', 'Resource Allocator', 'Risk Manager', 'Timeline Tracker', 'Status Reporter', 'Scope Manager', 'Stakeholder Comm', 'Meeting Notes', 'Priority Sorter', 'Dependency Tracker', 'Milestone Tracker', 'Budget Tracker', 'Capacity Planner', 'Retrospective Agent', 'Backlog Groomer', 'Estimation Agent', 'Critical Path Agent', 'Change Request Handler', 'Health Checker']
  },
  ecommerce: {
    domain: 'e-commerce operations, product management and online sales',
    skills: ['catalog_mgmt', 'pricing', 'inventory', 'order_processing', 'recommendation', 'fraud_detection'],
    tools: ['ecommerce_platform', 'payment_gateway', 'shipping_api', 'analytics', 'cms'],
    agents: ['Catalog Manager', 'Price Optimizer', 'Inventory Manager', 'Order Processor', 'Shipping Calculator', 'Returns Handler', 'Review Analyzer', 'Cross-sell Agent', 'Cart Recovery', 'Recommender', 'Marketplace Mgr', 'Fraud Detector', 'Promotions Mgr', 'Category Manager', 'Image Agent', 'Size/fit Advisor', 'Wish List Mgr', 'Gift Guide Gen', 'Bundle Creator', 'Loyalty Program']
  },
  design: {
    domain: 'design, creative workflow and brand visual identity',
    skills: ['branding', 'ui_design', 'ux_research', 'typography', 'color_theory', 'accessibility'],
    tools: ['design_tool', 'prototyping_tool', 'asset_manager', 'handoff_tool', 'feedback_tool'],
    agents: ['Brand Identity', 'Color Palette Gen', 'Typography Advisor', 'Layout Designer', 'Image Prompt Writer', 'UX Researcher', 'Wireframe Analyzer', 'Design System Mgr', 'Asset Organizer', 'Creative Brief', 'Mood Board Creator', 'Icon Designer', 'Illustration Agent', 'Animation Planner', 'Print Checker', 'Accessibility Check', 'Design Reviewer', 'Prototype Tester', 'Style Guide Mgr', 'Visual Hierarchy']
  },
  social: {
    domain: 'social media management, community engagement and content distribution',
    skills: ['scheduling', 'engagement', 'hashtag_research', 'trend_analysis', 'analytics', 'community_mgmt'],
    tools: ['social_platforms', 'analytics', 'scheduler', 'listening_tool', 'content_tool'],
    agents: ['Content Scheduler', 'Engagement Analyzer', 'Hashtag Researcher', 'Trend Spotter', 'Community Manager', 'Influencer Tracker', 'Social Listener', 'Content Mix Opt', 'Story Planner', 'Reels/Shorts Agent', 'Social Ad Manager', 'Profile Optimizer', 'Competitor Monitor', 'Viral Predictor', 'Social CRM Agent', 'Comment Responder', 'Analytics Reporter', 'Algorithm Tracker', 'Cross-poster', 'Brand Voice Agent']
  },
  whatsapp: {
    domain: 'WhatsApp Business API, conversational commerce and customer engagement',
    skills: ['template_mgmt', 'chatbot_design', 'broadcast', 'segmentation', 'compliance', 'analytics'],
    tools: ['whatsapp_api', 'media_library', 'analytics', 'crm_integration', 'notification'],
    agents: ['Template Manager', 'Chatbot Designer', 'Quick Reply Creator', 'Broadcast Manager', 'Contact Segmenter', 'Auto-Responder', 'Media Message Agent', 'Interactive Msg Design', 'Catalog Manager', 'Order Notifier', 'Appointment Reminder', 'Feedback Collector', 'Campaign Tracker', 'Compliance Checker', 'Multi-agent Router', 'Response Analyzer', 'Conversation Analyzer', 'Template Approval', 'WhatsApp Analytics', 'Journey Mapper']
  },
  legal: {
    domain: 'legal operations, compliance management and regulatory adherence',
    skills: ['contract_review', 'policy_drafting', 'compliance_check', 'regulatory_tracking', 'risk_assessment', 'privacy'],
    tools: ['document_management', 'legal_research', 'contract_template', 'compliance_tool', 'audit_trail'],
    agents: ['Contract Reviewer', 'Policy Drafter', 'Compliance Checker', 'Regulatory Tracker', 'Risk Assessor', 'Privacy Officer', 'IP Protection', 'Litigation Support', 'Due Diligence', 'Terms Generator', 'NDA Manager', 'GDPR Checker', 'HIPAA Checker', 'SOC2 Auditor', 'Evidence Organizer', 'Legal Researcher', 'Doc Retention', 'Third-party Risk', 'Compliance Training', 'Regulatory Filing']
  },
  research: {
    domain: 'research, intelligence gathering and knowledge discovery',
    skills: ['market_research', 'competitor_analysis', 'technology_scanning', 'academic_research', 'trend_analysis', 'data_mining'],
    tools: ['search_engine', 'academic_db', 'patent_db', 'analytics', 'knowledge_graph'],
    agents: ['Market Researcher', 'Competitor Analyst', 'Tech Scanner', 'Patent Researcher', 'Paper Summarizer', 'Industry Trend Anal', 'SWOT Analyzer', 'PESTLE Analyzer', 'Porter Five Forces', 'Benchmark Analyst', 'Innovation Tracker', 'Patent Landscape', 'Tech Roadmap', 'Customer Insight', 'Trend Predictor', 'Data Miner', 'Literature Reviewer', 'Survey Analyzer', 'Focus Group Anal', 'Insight Synthesizer']
  },
  operations: {
    domain: 'operations management, process optimization and service delivery',
    skills: ['process_optimization', 'workflow_design', 'capacity_planning', 'vendor_mgmt', 'quality_mgmt', 'continuous_improvement'],
    tools: ['workflow_engine', 'monitoring', 'ticket_system', 'analytics', 'reporting'],
    agents: ['Process Optimizer', 'Workflow Designer', 'Capacity Planner', 'Vendor Manager', 'SLA Monitor', 'Incident Manager', 'Change Manager', 'Quality Manager', 'Inventory Optimizer', 'Supply Chain Agent', 'Cost Optimizer', 'Resource Planner', 'Scheduling Agent', 'KPI Dashboard', 'Op Risk Manager', 'Continuous Improve', 'Service Desk', 'Asset Manager', 'Facilities Mgr', 'Procurement Agent']
  },
  ai: {
    domain: 'artificial intelligence engineering, model training and AI operations',
    skills: ['model_training', 'fine_tuning', 'prompt_engineering', 'evaluation', 'mlops', 'inference'],
    tools: ['ml_framework', 'gpu_cluster', 'vector_db', 'model_registry', 'monitoring'],
    agents: ['Model Trainer', 'Fine-tuning Agent', 'Prompt Engineer', 'Model Evaluator', 'Data Pipeline Agent', 'Feature Engineer', 'MLOps Agent', 'Registry Manager', 'A/B Test Agent', 'Model Monitor', 'Inference Optimizer', 'Token Budget Agent', 'RAG Pipeline Agent', 'Embedding Agent', 'Vector DB Manager', 'Model Security', 'Bias Detector', 'Explainability Agent', 'Versioning Agent', 'GPU Optimizer']
  },
  security: {
    domain: 'cybersecurity, access control and threat protection',
    skills: ['vulnerability_scanning', 'access_control', 'threat_detection', 'compliance', 'encryption', 'monitoring'],
    tools: ['siem', 'firewall', 'ids', 'scanner', 'key_management'],
    agents: ['Vulnerability Scanner', 'Access Controller', 'Threat Detector', 'Security Auditor', 'Penetration Tester', 'Incident Responder', 'Log Forensics', 'Compliance Enforcer', 'Secret Manager', 'Network Guardian', 'Endpoint Protector', 'Policy Enforcer', 'Risk Assessor', 'Security Reporter', 'Threat Intel Agent', 'Patch Manager', 'Crypto Auditor', 'Identity Manager', 'Session Guard', 'Security Alert Mgr']
  },
  governance: {
    domain: 'organizational governance, command control and executive oversight',
    skills: ['command_routing', 'approval_workflow', 'policy_enforcement', 'audit', 'compliance', 'reporting'],
    tools: ['approval_system', 'audit_trail', 'dashboard', 'notification', 'policy_engine'],
    agents: ['Command Router', 'Workflow Matcher', 'Task Planner', 'Policy Enforcer', 'Approval Manager', 'Audit Controller', 'Risk Governor', 'Compliance Officer', 'Resource Director', 'Performance Monitor', 'Strategic Advisor', 'Exception Handler', 'Priority Manager', 'Escalation Manager', 'Decision Logger', 'KPI Tracker', 'Change Approver', 'Access Governor', 'Data Controller', 'Executive Reporter']
  },
  education: {
    domain: 'educational operations, learning management and student services',
    skills: ['course_design', 'assessment', 'student_tracking', 'tutoring', 'curriculum', 'certification'],
    tools: ['lms', 'video_platform', 'assessment_tool', 'communication', 'analytics'],
    agents: ['Course Designer', 'Assessment Creator', 'Student Tracker', 'AI Tutor', 'Curriculum Planner', 'Certification Mgr', 'Enrollment Agent', 'Grade Analyzer', 'Attendance Tracker', 'Study Material Gen', 'Discussion Facilitator', 'Plagiarism Checker', 'Learning Path Gen', 'Feedback Collector', 'Alumni Tracker', 'Scholarship Advisor', 'Visa Advisor', 'University Researcher', 'Course Recommender', 'Academic Advisor']
  },
  platform: {
    domain: 'platform operations, API management and service integration',
    skills: ['api_management', 'integration', 'monitoring', 'authentication', 'rate_limiting', 'versioning'],
    tools: ['api_gateway', 'monitoring', 'load_balancer', 'cdn', 'cache'],
    agents: ['API Gateway Mgr', 'Key Manager', 'Rate Limiter', 'Webhook Manager', 'Notification Router', 'Subscription Mgr', 'Tenant Router', 'Access Matrix Mgr', 'Integration Hub', 'Service Registry', 'Health Monitor', 'Config Manager', 'Log Aggregator', 'Metric Collector', 'Alert Router', 'Deployment Mgr', 'Backup Coordinator', 'Recovery Agent', 'Compliance Checker', 'Platform Analyst']
  },
  media: {
    domain: 'media production, video creation and content generation',
    skills: ['video_production', 'image_generation', 'audio_production', 'editing', 'scripting', 'publishing'],
    tools: ['video_editor', 'image_generator', 'audio_tool', 'media_library', 'publishing_platform'],
    agents: ['Video Producer', 'Image Generator', 'Audio Producer', 'Script Writer', 'Editor Agent', 'Thumbnail Creator', 'Transcript Generator', 'Subtitle Agent', 'Voice Synthesizer', 'Avatar Creator', 'Music Generator', 'Sound Effect Agent', 'Color Grader', 'Motion Graphics', 'Screen Recorder', 'Live Stream Mgr', 'Podcast Agent', 'Animation Agent', 'Media Publisher', 'Content Distributor']
  },
  integration: {
    domain: 'third-party integration, data synchronization and API connectivity',
    skills: ['api_integration', 'data_sync', 'authentication', 'webhook', 'batch_processing', 'error_handling'],
    tools: ['rest_client', 'graphql_client', 'webhook_receiver', 'queue', 'cache'],
    agents: ['Google Workspace Mgr', 'Meta Business Mgr', 'API Connector', 'Data Sync Agent', 'Auth Manager', 'Webhook Handler', 'Batch Processor', 'Error Handler', 'Rate Limiter', 'Schema Mapper', 'Field Transformer', 'Duplicate Resolver', 'Conflict Resolver', 'Sync Scheduler', 'Connection Tester', 'API Monitor', 'Log Sync Agent', 'Permission Manager', 'Integration Tester', 'Health Checker']
  },
  talent: {
    domain: 'talent acquisition, workforce planning and employee development',
    skills: ['sourcing', 'screening', 'interviewing', 'onboarding', 'development', 'retention'],
    tools: ['ats', 'assessment_tool', 'calendar', 'email', 'hris'],
    agents: ['Talent Sourcer', 'Job Matcher', 'Interview Agent', 'Offer Manager', 'Onboarding Guide', 'Skill Assessor', 'Career Path Advisor', 'Mentor Matcher', 'Training Planner', 'Certification Tracker', 'Performance Coach', 'Goal Setter', 'Feedback Collector', 'Engagement Booster', 'Culture Ambassador', 'Exit Analyzer', 'Alumni Networker', 'Employer Brander', 'Diversity Tracker', 'Workforce Planner']
  }
};

// Map department slugs to categories
function matchCategory(slug) {
  const s = slug.toLowerCase();
  if (s.includes('crm') || s.includes('web-crm') || s.includes('connector')) return 'crm';
  if (s.includes('marketing') || s.includes('paid-ads') || s.includes('real-estate') || s.includes('local-business')) return 'marketing';
  if (s.includes('seo') || s.includes('seo-challenge')) return 'seo';
  if (s.includes('content-writing') || s.includes('content') && !s.includes('media')) return 'content';
  if (s.includes('sales') || s.includes('lead-generation')) return 'sales';
  if (s.includes('customer-support') || s.includes('emergency')) return 'support';
  if (s.includes('hr') || s.includes('recruitment') || s.includes('employee-productivity')) return 'hr';
  if (s.includes('finance') || s.includes('accounting') || s.includes('payment')) return 'finance';
  if (s.includes('devops') || s.includes('server-automation') || s.includes('agent-runtime')) return 'devops';
  if (s.includes('data') && (s.includes('analytics') || s.includes('import') || s.includes('tracking'))) return 'data';
  if (s.includes('software') || s.includes('engineering') && !s.includes('ai') || s.includes('github')) return 'engineering';
  if (s.includes('project') || s.includes('client-project') || s.includes('agency-client') || s.includes('tech360') || s.includes('delivery')) return 'project';
  if (s.includes('e-commerce') || s.includes('ecommerce')) return 'ecommerce';
  if (s.includes('design') || s.includes('website-design') || s.includes('media-studio') || s.includes('brand-management') || s.includes('alaminn')) return 'design';
  if (s.includes('social') || s.includes('meta-business')) return 'social';
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('legal') || s.includes('compliance') || s.includes('consent')) return 'legal';
  if (s.includes('research') || s.includes('intelligence') || s.includes('university') || s.includes('study') || s.includes('academic') || s.includes('rag') || s.includes('memory')) return 'research';
  if (s.includes('operations') || s.includes('workflow') || s.includes('queue') || s.includes('runner') || s.includes('skill-runner')) return 'operations';
  if (s.includes('ai-engineering') || s.includes('ai-training') || s.includes('ai-website') || s.includes('image-ai') || s.includes('video-production') || s.includes('avatar') || s.includes('song') || s.includes('voice') || s.includes('model-hub') || s.includes('model-registry') || s.includes('gpu')) return 'ai';
  if (s.includes('security') || s.includes('protection') || s.includes('rbac') || s.includes('access') || s.includes('tenant-data')) return 'security';
  if (s.includes('command') || s.includes('governance') || s.includes('approval') || s.includes('super-admin') || s.includes('executive') || s.includes('ceo')) return 'governance';
  if (s.includes('education') || s.includes('lms') || s.includes('exam') || s.includes('student') || s.includes('english') || s.includes('icla') || s.includes('alo-education')) return 'education';
  if (s.includes('api') || s.includes('webhook') || s.includes('notification') || s.includes('subscription') || s.includes('white-label') || s.includes('company-api') || s.includes('multi-company')) return 'platform';
  if (s.includes('media') || s.includes('video') || s.includes('image') && !s.includes('ai')) return 'media';
  if (s.includes('integration') || s.includes('google-workspace')) return 'integration';
  if (s.includes('domain') || s.includes('ssl') || s.includes('website-development')) return 'engineering';
  if (s.includes('training') || s.includes('evaluation') || s.includes('self-improvement')) return 'ai';
  if (s.includes('business-strategy') || s.includes('proposal') || s.includes('sister-company') || s.includes('brand') || s.includes('future-sister')) return 'governance';
  if (s.includes('audit') || s.includes('backup') || s.includes('disaster')) return 'devops';
  if (s.includes('travel') || s.includes('immigration') || s.includes('visa')) return 'education';
  if (s.includes('calendar') || s.includes('appointment')) return 'operations';
  if (s.includes('email-inbox')) return 'operations';
  if (s.includes('observatory') || s.includes('token-budget') || s.includes('usage')) return 'data';
  if (s.includes('incident')) return 'support';
  if (s.includes('document') || s.includes('output')) return 'content';
  if (s.includes('sister-company') || s.includes('onboarding')) return 'governance';
  if (s.includes('infra')) return 'devops';
  if (s.includes('job-monitor') || s.includes('worker')) return 'devops';
  if (s.includes('funnels') || s.includes('sms')) return 'marketing';
  if (s.includes('meetings') || s.includes('tickets')) return 'operations';
  if (s.includes('mediaLibrary')) return 'media';
  return 'operations'; // default fallback
}

const TYPES = ['conversational', 'autonomous', 'workflow', 'specialized'];
const ROLES = ['manager', 'planner', 'execution', 'qa', 'report', 'automation', 'safety', 'memory', 'productivity', 'specialist'];

async function main() {
  console.log('Starting agent profile update...');
  const departments = await db.department.findMany({ include: { agents: { orderBy: { createdAt: 'asc' } } } });
  console.log('Found ' + departments.length + ' departments');
  
  let totalUpdated = 0;
  let errors = 0;
  
  for (const dept of departments) {
    const cat = matchCategory(dept.slug);
    const template = CATEGORIES[cat] || CATEGORIES.operations;
    
    for (let i = 0; i < dept.agents.length; i++) {
      const agent = dept.agents[i];
      const agentTemplate = template.agents[i] || ('Agent ' + (i + 1));
      const type = TYPES[i % 4];
      const role = ROLES[i % 10];
      
      const purpose = 'Specialized ' + agentTemplate + ' for ' + dept.name + '. Operates within ' + template.domain + ' domain, leveraging ' + template.skills.slice(0, 3).join(', ') + ' capabilities to deliver high-quality, consistent results. Designed to autonomously handle complex ' + agentTemplate.toLowerCase() + ' tasks while maintaining quality standards and learning from each interaction to improve over time.';
      
      const skills = JSON.stringify(template.skills.slice(0, 3 + (i % 3)));
      const tools = JSON.stringify(template.tools.slice(0, 2 + (i % 3)));
      const inputSchema = JSON.stringify({ type: 'object', properties: { query: { type: 'string', description: 'The task or query for ' + agentTemplate.toLowerCase() }, context: { type: 'string', description: 'Additional context or parameters' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } }, required: ['query'] });
      const outputSchema = JSON.stringify({ type: 'object', properties: { result: { type: 'string', description: 'The primary output or response' }, confidence: { type: 'number', description: 'Confidence score 0-1' }, metadata: { type: 'object', properties: { agentId: { type: 'string' }, timestamp: { type: 'string' }, processingTime: { type: 'number' } } } } });
      const workflowSteps = JSON.stringify(['Analyze and validate input', 'Retrieve relevant knowledge from knowledge base', 'Process using ' + template.skills[i % template.skills.length] + ' capability', 'Apply quality checks and validation', 'Generate structured output']);
      const qualityChecklist = JSON.stringify(['Input validation passed', 'Knowledge base consulted', 'Output matches domain standards', 'No sensitive data exposed', 'Response time within SLA']);
      const selfImprovement = JSON.stringify({ goals: ['Improve accuracy to >95%', 'Reduce response time by 20%', 'Expand knowledge coverage'], metrics: ['success_rate', 'user_satisfaction', 'response_time', 'knowledge_reuse_rate'], learningFocus: template.skills[i % template.skills.length] });
      const productivityRules = JSON.stringify(['Max 30s response time for standard queries', 'Escalate to human when confidence < 0.6', 'Log all decisions for audit trail', 'Batch similar requests for efficiency', 'Prioritize urgent tasks automatically']);
      
      try {
        await db.agent.update({
          where: { id: agent.id },
          data: {
            name: agentTemplate + ' Agent',
            type: type,
            role: role,
            purpose: purpose,
            allowedSkills: skills,
            allowedTools: tools,
            inputSchema: inputSchema,
            outputSchema: outputSchema,
            workflowSteps: workflowSteps,
            qualityChecklist: qualityChecklist,
            selfImprovement: selfImprovement,
            productivityRules: productivityRules,
          }
        });
        totalUpdated++;
        if (totalUpdated % 200 === 0) console.log('Updated ' + totalUpdated + ' agents...');
      } catch (err) {
        console.error('Error updating agent ' + agent.id + ': ' + err.message);
        errors++;
      }
    }
  }
  
  console.log('\n=== COMPLETE ===');
  console.log('Total updated: ' + totalUpdated);
  console.log('Errors: ' + errors);
  
  // Verify
  const sample = await db.agent.findMany({ take: 5, select: { name: true, type: true, role: true, departmentName: true, purpose: true } });
  console.log('\nSample agents:');
  sample.forEach(a => console.log('- ' + a.name + ' (' + a.type + '/' + a.role + ') in ' + a.departmentName));
  
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
