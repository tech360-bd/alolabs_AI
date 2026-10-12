import { db } from '../src/lib/db'
import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcrypt'

// ─── Role cycle for 20 agents per department ─────────────────────────────────
const ROLES = [
  'manager', 'planner', 'execution', 'qa', 'report',
  'automation', 'safety', 'memory', 'productivity', 'owner_approval',
  'specialist', 'specialist', 'specialist', 'specialist', 'specialist',
  'specialist', 'specialist', 'specialist', 'specialist', 'specialist',
] as const

const ROLE_TITLES: Record<string, string> = {
  manager: 'Manager',
  planner: 'Planner',
  execution: 'Executor',
  qa: 'QA Analyst',
  report: 'Reporter',
  automation: 'Automation Agent',
  safety: 'Safety Monitor',
  memory: 'Memory Manager',
  productivity: 'Productivity Optimizer',
  owner_approval: 'Approval Gate',
  specialist: 'Specialist',
}

const PURPOSE_TEMPLATES: Record<string, string> = {
  manager: 'Oversees and coordinates all {dept} operations, ensuring alignment with organizational goals.',
  planner: 'Plans and strategizes {dept} workflows, defining priorities and resource allocation.',
  execution: 'Executes {dept} tasks and assignments with precision and efficiency.',
  qa: 'Performs quality assurance reviews for all {dept} outputs and deliverables.',
  report: 'Generates comprehensive reports and analytics for {dept} performance tracking.',
  automation: 'Automates repetitive {dept} processes to improve throughput and reduce errors.',
  safety: 'Monitors safety, compliance, and risk factors within {dept} operations.',
  memory: 'Manages knowledge base and institutional memory for {dept} continuity.',
  productivity: 'Optimizes productivity metrics and identifies bottlenecks in {dept}.',
  owner_approval: 'Provides owner-level approval gates and final sign-off for {dept} decisions.',
  specialist: 'Handles specialized {dept} tasks requiring deep domain expertise.',
}

// ─── Department definitions: 10 groups × 10 = 100 ───────────────────────────
interface DeptDef {
  name: string
  slug: string
  shortName: string
  description: string
}

const DEPARTMENTS: DeptDef[] = [
  // Group 1: AI & ML Operations (1-10)
  { name: 'LLM Operations', slug: 'llm-operations', shortName: 'LLM Ops', description: 'Manages large language model deployments, monitoring, and scaling across production environments.' },
  { name: 'Model Training', slug: 'model-training', shortName: 'Model Training', description: 'Handles model training pipelines, hyperparameter tuning, and experiment tracking.' },
  { name: 'Prompt Engineering', slug: 'prompt-engineering', shortName: 'Prompt Eng', description: 'Designs, tests, and optimizes prompts for AI model interactions and outputs.' },
  { name: 'AI Safety & Ethics', slug: 'ai-safety-ethics', shortName: 'AI Safety', description: 'Ensures AI systems operate safely, ethically, and within established guardrails.' },
  { name: 'Data Pipeline', slug: 'data-pipeline', shortName: 'Data Pipeline', description: 'Builds and maintains data ingestion, transformation, and delivery pipelines.' },
  { name: 'Model Evaluation', slug: 'model-evaluation', shortName: 'Model Eval', description: 'Conducts rigorous model evaluation, benchmarking, and performance analysis.' },
  { name: 'MLOps Infrastructure', slug: 'mlops-infrastructure', shortName: 'MLOps Infra', description: 'Manages ML infrastructure including serving, scaling, and monitoring systems.' },
  { name: 'NLP Services', slug: 'nlp-services', shortName: 'NLP Services', description: 'Provides natural language processing capabilities including tokenization, sentiment, and entity extraction.' },
  { name: 'Computer Vision', slug: 'computer-vision', shortName: 'Computer Vision', description: 'Develops and deploys computer vision models for image and video analysis.' },
  { name: 'AI Analytics', slug: 'ai-analytics', shortName: 'AI Analytics', description: 'Analyzes AI system performance, usage patterns, and ROI metrics.' },

  // Group 2: Content & Media Production (11-20)
  { name: 'Content Strategy', slug: 'content-strategy', shortName: 'Content Strategy', description: 'Develops overarching content strategies aligned with business objectives and audience needs.' },
  { name: 'Copywriting', slug: 'copywriting', shortName: 'Copywriting', description: 'Produces persuasive and engaging copy for marketing, advertising, and communications.' },
  { name: 'Social Media', slug: 'social-media', shortName: 'Social Media', description: 'Manages social media content creation, scheduling, and community engagement.' },
  { name: 'Video Production', slug: 'video-production', shortName: 'Video Prod', description: 'Handles end-to-end video production from scripting to post-production and delivery.' },
  { name: 'Graphic Design', slug: 'graphic-design', shortName: 'Graphic Design', description: 'Creates visual assets, brand materials, and design systems for digital and print media.' },
  { name: 'Audio Production', slug: 'audio-production', shortName: 'Audio Prod', description: 'Produces and edits audio content including podcasts, music, and voice-overs.' },
  { name: 'Blog & Article Writing', slug: 'blog-article-writing', shortName: 'Blog Writing', description: 'Writes long-form blog posts, articles, and thought leadership content.' },
  { name: 'SEO Content', slug: 'seo-content', shortName: 'SEO Content', description: 'Creates SEO-optimized content to improve search rankings and organic traffic.' },
  { name: 'Multimedia Publishing', slug: 'multimedia-publishing', shortName: 'Multimedia', description: 'Manages publishing workflows for multimedia content across multiple platforms.' },
  { name: 'Brand Communications', slug: 'brand-communications', shortName: 'Brand Comms', description: 'Maintains brand voice and consistency across all communications and channels.' },

  // Group 3: Business & Operations (21-30)
  { name: 'Business Intelligence', slug: 'business-intelligence', shortName: 'Business Intel', description: 'Transforms raw data into actionable business insights and strategic recommendations.' },
  { name: 'Operations Management', slug: 'operations-management', shortName: 'Operations Mgmt', description: 'Oversees day-to-day operational processes, resource allocation, and efficiency improvement.' },
  { name: 'Project Management', slug: 'project-management', shortName: 'Project Mgmt', description: 'Plans, executes, and closes projects on time, within scope and budget.' },
  { name: 'Supply Chain', slug: 'supply-chain', shortName: 'Supply Chain', description: 'Manages end-to-end supply chain operations including procurement and logistics.' },
  { name: 'Customer Success', slug: 'customer-success', shortName: 'Customer Success', description: 'Ensures customer satisfaction, retention, and maximizes lifetime value.' },
  { name: 'Vendor Management', slug: 'vendor-management', shortName: 'Vendor Mgmt', description: 'Manages vendor relationships, contracts, and performance evaluations.' },
  { name: 'Process Optimization', slug: 'process-optimization', shortName: 'Process Opt', description: 'Identifies and implements process improvements to increase efficiency and reduce costs.' },
  { name: 'Quality Assurance', slug: 'quality-assurance', shortName: 'QA', description: 'Ensures products and services meet quality standards through systematic testing.' },
  { name: 'Risk Management', slug: 'risk-management', shortName: 'Risk Mgmt', description: 'Identifies, assesses, and mitigates business risks across all operational areas.' },
  { name: 'Strategic Planning', slug: 'strategic-planning', shortName: 'Strategic Plan', description: 'Develops and executes long-term strategic plans aligned with company vision.' },

  // Group 4: Education & Training (31-40)
  { name: 'Curriculum Development', slug: 'curriculum-development', shortName: 'Curriculum Dev', description: 'Designs and develops educational curricula, syllabi, and learning frameworks.' },
  { name: 'Student Enrollment', slug: 'student-enrollment', shortName: 'Enrollment', description: 'Manages student enrollment processes, admissions, and registration workflows.' },
  { name: 'Course Delivery', slug: 'course-delivery', shortName: 'Course Delivery', description: 'Coordinates and delivers course content through various teaching modalities.' },
  { name: 'Assessment & Grading', slug: 'assessment-grading', shortName: 'Assessment', description: 'Designs assessments, manages grading systems, and tracks student performance.' },
  { name: 'Learning Analytics', slug: 'learning-analytics', shortName: 'Learning Analytics', description: 'Analyzes learning data to improve educational outcomes and personalize instruction.' },
  { name: 'Teacher Training', slug: 'teacher-training', shortName: 'Teacher Training', description: 'Provides professional development and training programs for educators.' },
  { name: 'E-Learning Platform', slug: 'e-learning-platform', shortName: 'E-Learning', description: 'Manages and maintains the e-learning platform, tools, and integrations.' },
  { name: 'Student Support', slug: 'student-support', shortName: 'Student Support', description: 'Provides academic support, counseling, and guidance services to students.' },
  { name: 'Certification Programs', slug: 'certification-programs', shortName: 'Certification', description: 'Administers professional certification programs and credential management.' },
  { name: 'Educational Research', slug: 'educational-research', shortName: 'Ed Research', description: 'Conducts research on educational methods, technologies, and learning outcomes.' },

  // Group 5: Development & Engineering (41-50)
  { name: 'Frontend Development', slug: 'frontend-development', shortName: 'Frontend Dev', description: 'Builds responsive, accessible user interfaces using modern web technologies.' },
  { name: 'Backend Development', slug: 'backend-development', shortName: 'Backend Dev', description: 'Develops server-side applications, APIs, and microservices architecture.' },
  { name: 'DevOps & CI/CD', slug: 'devops-cicd', shortName: 'DevOps', description: 'Manages continuous integration, delivery pipelines, and infrastructure as code.' },
  { name: 'Mobile Development', slug: 'mobile-development', shortName: 'Mobile Dev', description: 'Develops native and cross-platform mobile applications for iOS and Android.' },
  { name: 'Database Engineering', slug: 'database-engineering', shortName: 'Database Eng', description: 'Designs, optimizes, and maintains database systems and data architectures.' },
  { name: 'API Development', slug: 'api-development', shortName: 'API Dev', description: 'Designs and develops RESTful and GraphQL APIs for internal and external consumers.' },
  { name: 'System Architecture', slug: 'system-architecture', shortName: 'Sys Arch', description: 'Designs scalable, resilient system architectures and technical strategies.' },
  { name: 'QA Engineering', slug: 'qa-engineering', shortName: 'QA Eng', description: 'Implements automated testing frameworks and quality engineering practices.' },
  { name: 'Technical Documentation', slug: 'technical-documentation', shortName: 'Tech Docs', description: 'Creates and maintains comprehensive technical documentation and API references.' },
  { name: 'Open Source Contributions', slug: 'open-source-contributions', shortName: 'Open Source', description: 'Manages open source contributions, community engagement, and library maintenance.' },

  // Group 6: Sales & Marketing (51-60)
  { name: 'Lead Generation', slug: 'lead-generation', shortName: 'Lead Gen', description: 'Generates and qualifies leads through inbound and outbound marketing channels.' },
  { name: 'Email Marketing', slug: 'email-marketing', shortName: 'Email Mktg', description: 'Designs, executes, and optimizes email marketing campaigns and automations.' },
  { name: 'Digital Advertising', slug: 'digital-advertising', shortName: 'Digital Ads', description: 'Manages paid digital advertising across search, social, and display networks.' },
  { name: 'Brand Strategy', slug: 'brand-strategy', shortName: 'Brand Strategy', description: 'Develops and maintains brand positioning, identity, and go-to-market strategies.' },
  { name: 'Market Research', slug: 'market-research', shortName: 'Market Research', description: 'Conducts market analysis, competitive intelligence, and consumer research.' },
  { name: 'Sales Operations', slug: 'sales-operations', shortName: 'Sales Ops', description: 'Optimizes sales processes, CRM management, and revenue operations.' },
  { name: 'Customer Relations', slug: 'customer-relations', shortName: 'Customer Rel', description: 'Builds and maintains strong customer relationships through proactive engagement.' },
  { name: 'Event Marketing', slug: 'event-marketing', shortName: 'Event Mktg', description: 'Plans and executes marketing events, webinars, and conference participation.' },
  { name: 'Partnership Development', slug: 'partnership-development', shortName: 'Partnerships', description: 'Identifies, negotiates, and manages strategic business partnerships.' },
  { name: 'Growth Analytics', slug: 'growth-analytics', shortName: 'Growth Analytics', description: 'Analyzes growth metrics, cohort data, and funnel performance for optimization.' },

  // Group 7: HR & Administration (61-70)
  { name: 'Recruitment', slug: 'recruitment', shortName: 'Recruitment', description: 'Manages the full recruitment lifecycle from job posting to candidate onboarding.' },
  { name: 'Employee Onboarding', slug: 'employee-onboarding', shortName: 'Onboarding', description: 'Coordinates new hire onboarding, orientation, and first-90-day integration.' },
  { name: 'Performance Management', slug: 'performance-management', shortName: 'Perf Mgmt', description: 'Administers performance review cycles, goal setting, and feedback processes.' },
  { name: 'Payroll Administration', slug: 'payroll-administration', shortName: 'Payroll', description: 'Processes payroll, manages compensation, and ensures regulatory compliance.' },
  { name: 'Benefits Management', slug: 'benefits-management', shortName: 'Benefits', description: 'Administers employee benefits programs including health, retirement, and perks.' },
  { name: 'Training & Development', slug: 'training-development', shortName: 'Training Dev', description: 'Designs and delivers employee training programs and professional development.' },
  { name: 'Employee Relations', slug: 'employee-relations', shortName: 'Employee Rel', description: 'Manages employee relations, conflict resolution, and workplace culture.' },
  { name: 'Compliance & Policies', slug: 'compliance-policies', shortName: 'Compliance', description: 'Ensures organizational compliance with labor laws and internal policies.' },
  { name: 'Office Administration', slug: 'office-administration', shortName: 'Office Admin', description: 'Manages office operations, facilities, and administrative support services.' },
  { name: 'Workplace Safety', slug: 'workplace-safety', shortName: 'Workplace Safety', description: 'Implements workplace safety programs, emergency procedures, and OSHA compliance.' },

  // Group 8: Finance & Accounting (71-80)
  { name: 'Accounts Receivable', slug: 'accounts-receivable', shortName: 'Accts Recv', description: 'Manages invoicing, payment collection, and accounts receivable aging.' },
  { name: 'Accounts Payable', slug: 'accounts-payable', shortName: 'Accts Pay', description: 'Processes vendor invoices, manages payment schedules, and AP reporting.' },
  { name: 'Financial Reporting', slug: 'financial-reporting', shortName: 'Fin Reporting', description: 'Prepares financial statements, management reports, and regulatory filings.' },
  { name: 'Budget Planning', slug: 'budget-planning', shortName: 'Budget Plan', description: 'Develops annual budgets, forecasts, and variance analysis reports.' },
  { name: 'Tax Management', slug: 'tax-management', shortName: 'Tax Mgmt', description: 'Manages tax compliance, planning, and filing across jurisdictions.' },
  { name: 'Internal Audit', slug: 'internal-audit', shortName: 'Internal Audit', description: 'Conducts internal audits, risk assessments, and control evaluations.' },
  { name: 'Treasury Operations', slug: 'treasury-operations', shortName: 'Treasury Ops', description: 'Manages cash flow, banking relationships, and investment activities.' },
  { name: 'Cost Accounting', slug: 'cost-accounting', shortName: 'Cost Acctg', description: 'Tracks and analyzes costs, margins, and profitability across products and services.' },
  { name: 'Financial Analysis', slug: 'financial-analysis', shortName: 'Fin Analysis', description: 'Performs financial modeling, scenario analysis, and investment evaluation.' },
  { name: 'Revenue Management', slug: 'revenue-management', shortName: 'Revenue Mgmt', description: 'Optimizes pricing strategies, revenue recognition, and monetization models.' },

  // Group 9: Security & Compliance (81-90)
  { name: 'Cybersecurity Operations', slug: 'cybersecurity-operations', shortName: 'Cybersecurity', description: 'Operates security monitoring, threat detection, and incident response capabilities.' },
  { name: 'Access Control', slug: 'access-control', shortName: 'Access Ctrl', description: 'Manages user access, permissions, and identity verification systems.' },
  { name: 'Data Privacy', slug: 'data-privacy', shortName: 'Data Privacy', description: 'Ensures data privacy compliance with GDPR, CCPA, and other regulations.' },
  { name: 'Compliance Monitoring', slug: 'compliance-monitoring', shortName: 'Compliance Mon', description: 'Continuously monitors regulatory compliance across all business operations.' },
  { name: 'Incident Response', slug: 'incident-response', shortName: 'Incident Resp', description: 'Manages security incident detection, containment, and recovery procedures.' },
  { name: 'Security Auditing', slug: 'security-auditing', shortName: 'Security Audit', description: 'Conducts security audits, penetration testing, and vulnerability assessments.' },
  { name: 'Identity Management', slug: 'identity-management', shortName: 'Identity Mgmt', description: 'Manages identity lifecycle, SSO, MFA, and directory services.' },
  { name: 'Vulnerability Management', slug: 'vulnerability-management', shortName: 'Vuln Mgmt', description: 'Identifies, tracks, and remediates security vulnerabilities across systems.' },
  { name: 'Policy Enforcement', slug: 'policy-enforcement', shortName: 'Policy Enforce', description: 'Enforces security policies, standards, and best practices across the organization.' },
  { name: 'Threat Intelligence', slug: 'threat-intelligence', shortName: 'Threat Intel', description: 'Gathers and analyzes threat intelligence to proactively defend against attacks.' },

  // Group 10: Research & Innovation (91-100)
  { name: 'AI Research', slug: 'ai-research', shortName: 'AI Research', description: 'Conducts fundamental and applied AI research to advance capabilities.' },
  { name: 'Product Innovation', slug: 'product-innovation', shortName: 'Product Innov', description: 'Identifies and develops innovative product concepts and features.' },
  { name: 'Market Exploration', slug: 'market-exploration', shortName: 'Market Explore', description: 'Explores new market opportunities, emerging trends, and expansion strategies.' },
  { name: 'Technology Scouting', slug: 'technology-scouting', shortName: 'Tech Scouting', description: 'Scouts and evaluates emerging technologies for strategic adoption.' },
  { name: 'Prototype Development', slug: 'prototype-development', shortName: 'Prototype Dev', description: 'Builds rapid prototypes and proof-of-concepts for new ideas.' },
  { name: 'User Experience Research', slug: 'ux-research', shortName: 'UX Research', description: 'Conducts user research, usability testing, and experience design studies.' },
  { name: 'Competitive Analysis', slug: 'competitive-analysis', shortName: 'Competitive Anal', description: 'Analyzes competitors, market positioning, and strategic advantages.' },
  { name: 'Patent & IP Management', slug: 'patent-ip-management', shortName: 'Patent & IP', description: 'Manages intellectual property portfolio, patents, and licensing.' },
  { name: 'Innovation Lab', slug: 'innovation-lab', shortName: 'Innovation Lab', description: 'Operates the innovation lab for experimental projects and rapid iteration.' },
  { name: 'Future Technologies', slug: 'future-technologies', shortName: 'Future Tech', description: 'Researches and evaluates future technology trends and their potential impact.' },
]

// ─── Skill categories: 100 categories, 20 skills each ───────────────────────
interface SkillCatDef {
  category: string
  categorySlug: string
  title: string
}

const SKILL_CATEGORIES: SkillCatDef[] = [
  // Group 1: AI & ML (1-10)
  { category: 'LLM Operations', categorySlug: 'llm-operations', title: 'LLM Operations Skills' },
  { category: 'Model Training', categorySlug: 'model-training', title: 'Model Training Skills' },
  { category: 'Prompt Engineering', categorySlug: 'prompt-engineering', title: 'Prompt Engineering Skills' },
  { category: 'AI Safety', categorySlug: 'ai-safety', title: 'AI Safety Skills' },
  { category: 'Data Processing', categorySlug: 'data-processing', title: 'Data Processing Skills' },
  { category: 'Model Evaluation', categorySlug: 'model-evaluation', title: 'Model Evaluation Skills' },
  { category: 'MLOps', categorySlug: 'mlops', title: 'MLOps Skills' },
  { category: 'NLP', categorySlug: 'nlp', title: 'NLP Skills' },
  { category: 'Computer Vision', categorySlug: 'computer-vision', title: 'Computer Vision Skills' },
  { category: 'AI Analytics', categorySlug: 'ai-analytics', title: 'AI Analytics Skills' },
  // Group 2: Content & Media (11-20)
  { category: 'Content Strategy', categorySlug: 'content-strategy', title: 'Content Strategy Skills' },
  { category: 'Copywriting', categorySlug: 'copywriting', title: 'Copywriting Skills' },
  { category: 'Social Media', categorySlug: 'social-media-skills', title: 'Social Media Skills' },
  { category: 'Video Production', categorySlug: 'video-production', title: 'Video Production Skills' },
  { category: 'Graphic Design', categorySlug: 'graphic-design', title: 'Graphic Design Skills' },
  { category: 'Audio Production', categorySlug: 'audio-production', title: 'Audio Production Skills' },
  { category: 'Blog Writing', categorySlug: 'blog-writing', title: 'Blog Writing Skills' },
  { category: 'SEO', categorySlug: 'seo', title: 'SEO Skills' },
  { category: 'Multimedia', categorySlug: 'multimedia', title: 'Multimedia Skills' },
  { category: 'Brand Communications', categorySlug: 'brand-communications', title: 'Brand Communications Skills' },
  // Group 3: Business & Operations (21-30)
  { category: 'Business Intelligence', categorySlug: 'business-intelligence', title: 'Business Intelligence Skills' },
  { category: 'Operations', categorySlug: 'operations', title: 'Operations Skills' },
  { category: 'Project Management', categorySlug: 'project-management', title: 'Project Management Skills' },
  { category: 'Supply Chain', categorySlug: 'supply-chain', title: 'Supply Chain Skills' },
  { category: 'Customer Success', categorySlug: 'customer-success', title: 'Customer Success Skills' },
  { category: 'Vendor Management', categorySlug: 'vendor-management', title: 'Vendor Management Skills' },
  { category: 'Process Optimization', categorySlug: 'process-optimization', title: 'Process Optimization Skills' },
  { category: 'Quality Assurance', categorySlug: 'quality-assurance-skills', title: 'Quality Assurance Skills' },
  { category: 'Risk Management', categorySlug: 'risk-management', title: 'Risk Management Skills' },
  { category: 'Strategic Planning', categorySlug: 'strategic-planning', title: 'Strategic Planning Skills' },
  // Group 4: Education & Training (31-40)
  { category: 'Curriculum Development', categorySlug: 'curriculum-development', title: 'Curriculum Development Skills' },
  { category: 'Student Enrollment', categorySlug: 'student-enrollment', title: 'Student Enrollment Skills' },
  { category: 'Course Delivery', categorySlug: 'course-delivery', title: 'Course Delivery Skills' },
  { category: 'Assessment', categorySlug: 'assessment', title: 'Assessment Skills' },
  { category: 'Learning Analytics', categorySlug: 'learning-analytics', title: 'Learning Analytics Skills' },
  { category: 'Teacher Training', categorySlug: 'teacher-training', title: 'Teacher Training Skills' },
  { category: 'E-Learning', categorySlug: 'e-learning', title: 'E-Learning Skills' },
  { category: 'Student Support', categorySlug: 'student-support', title: 'Student Support Skills' },
  { category: 'Certification', categorySlug: 'certification', title: 'Certification Skills' },
  { category: 'Educational Research', categorySlug: 'educational-research', title: 'Educational Research Skills' },
  // Group 5: Development & Engineering (41-50)
  { category: 'Frontend Development', categorySlug: 'frontend-development', title: 'Frontend Development Skills' },
  { category: 'Backend Development', categorySlug: 'backend-development', title: 'Backend Development Skills' },
  { category: 'DevOps', categorySlug: 'devops', title: 'DevOps Skills' },
  { category: 'Mobile Development', categorySlug: 'mobile-development', title: 'Mobile Development Skills' },
  { category: 'Database Engineering', categorySlug: 'database-engineering', title: 'Database Engineering Skills' },
  { category: 'API Development', categorySlug: 'api-development', title: 'API Development Skills' },
  { category: 'System Architecture', categorySlug: 'system-architecture', title: 'System Architecture Skills' },
  { category: 'QA Engineering', categorySlug: 'qa-engineering', title: 'QA Engineering Skills' },
  { category: 'Technical Documentation', categorySlug: 'technical-documentation', title: 'Technical Documentation Skills' },
  { category: 'Open Source', categorySlug: 'open-source', title: 'Open Source Skills' },
  // Group 6: Sales & Marketing (51-60)
  { category: 'Lead Generation', categorySlug: 'lead-generation', title: 'Lead Generation Skills' },
  { category: 'Email Marketing', categorySlug: 'email-marketing', title: 'Email Marketing Skills' },
  { category: 'Digital Advertising', categorySlug: 'digital-advertising', title: 'Digital Advertising Skills' },
  { category: 'Brand Strategy', categorySlug: 'brand-strategy', title: 'Brand Strategy Skills' },
  { category: 'Market Research', categorySlug: 'market-research', title: 'Market Research Skills' },
  { category: 'Sales Operations', categorySlug: 'sales-operations', title: 'Sales Operations Skills' },
  { category: 'Customer Relations', categorySlug: 'customer-relations', title: 'Customer Relations Skills' },
  { category: 'Event Marketing', categorySlug: 'event-marketing', title: 'Event Marketing Skills' },
  { category: 'Partnership Development', categorySlug: 'partnership-development', title: 'Partnership Development Skills' },
  { category: 'Growth Analytics', categorySlug: 'growth-analytics', title: 'Growth Analytics Skills' },
  // Group 7: HR & Administration (61-70)
  { category: 'Recruitment', categorySlug: 'recruitment', title: 'Recruitment Skills' },
  { category: 'Employee Onboarding', categorySlug: 'employee-onboarding', title: 'Employee Onboarding Skills' },
  { category: 'Performance Management', categorySlug: 'performance-management', title: 'Performance Management Skills' },
  { category: 'Payroll', categorySlug: 'payroll', title: 'Payroll Skills' },
  { category: 'Benefits', categorySlug: 'benefits', title: 'Benefits Skills' },
  { category: 'Training & Development', categorySlug: 'training-development', title: 'Training & Development Skills' },
  { category: 'Employee Relations', categorySlug: 'employee-relations', title: 'Employee Relations Skills' },
  { category: 'HR Compliance', categorySlug: 'hr-compliance', title: 'HR Compliance Skills' },
  { category: 'Office Administration', categorySlug: 'office-administration', title: 'Office Administration Skills' },
  { category: 'Workplace Safety', categorySlug: 'workplace-safety', title: 'Workplace Safety Skills' },
  // Group 8: Finance & Accounting (71-80)
  { category: 'Accounts Receivable', categorySlug: 'accounts-receivable', title: 'Accounts Receivable Skills' },
  { category: 'Accounts Payable', categorySlug: 'accounts-payable', title: 'Accounts Payable Skills' },
  { category: 'Financial Reporting', categorySlug: 'financial-reporting', title: 'Financial Reporting Skills' },
  { category: 'Budget Planning', categorySlug: 'budget-planning', title: 'Budget Planning Skills' },
  { category: 'Tax Management', categorySlug: 'tax-management', title: 'Tax Management Skills' },
  { category: 'Internal Audit', categorySlug: 'internal-audit', title: 'Internal Audit Skills' },
  { category: 'Treasury', categorySlug: 'treasury', title: 'Treasury Skills' },
  { category: 'Cost Accounting', categorySlug: 'cost-accounting', title: 'Cost Accounting Skills' },
  { category: 'Financial Analysis', categorySlug: 'financial-analysis', title: 'Financial Analysis Skills' },
  { category: 'Revenue Management', categorySlug: 'revenue-management', title: 'Revenue Management Skills' },
  // Group 9: Security & Compliance (81-90)
  { category: 'Cybersecurity', categorySlug: 'cybersecurity', title: 'Cybersecurity Skills' },
  { category: 'Access Control', categorySlug: 'access-control', title: 'Access Control Skills' },
  { category: 'Data Privacy', categorySlug: 'data-privacy', title: 'Data Privacy Skills' },
  { category: 'Compliance Monitoring', categorySlug: 'compliance-monitoring', title: 'Compliance Monitoring Skills' },
  { category: 'Incident Response', categorySlug: 'incident-response', title: 'Incident Response Skills' },
  { category: 'Security Auditing', categorySlug: 'security-auditing', title: 'Security Auditing Skills' },
  { category: 'Identity Management', categorySlug: 'identity-management', title: 'Identity Management Skills' },
  { category: 'Vulnerability Management', categorySlug: 'vulnerability-management', title: 'Vulnerability Management Skills' },
  { category: 'Policy Enforcement', categorySlug: 'policy-enforcement', title: 'Policy Enforcement Skills' },
  { category: 'Threat Intelligence', categorySlug: 'threat-intelligence', title: 'Threat Intelligence Skills' },
  // Group 10: Research & Innovation (91-100)
  { category: 'AI Research', categorySlug: 'ai-research', title: 'AI Research Skills' },
  { category: 'Product Innovation', categorySlug: 'product-innovation', title: 'Product Innovation Skills' },
  { category: 'Market Exploration', categorySlug: 'market-exploration', title: 'Market Exploration Skills' },
  { category: 'Technology Scouting', categorySlug: 'technology-scouting', title: 'Technology Scouting Skills' },
  { category: 'Prototype Development', categorySlug: 'prototype-development', title: 'Prototype Development Skills' },
  { category: 'UX Research', categorySlug: 'ux-research', title: 'UX Research Skills' },
  { category: 'Competitive Analysis', categorySlug: 'competitive-analysis', title: 'Competitive Analysis Skills' },
  { category: 'Patent & IP', categorySlug: 'patent-ip', title: 'Patent & IP Skills' },
  { category: 'Innovation Lab', categorySlug: 'innovation-lab', title: 'Innovation Lab Skills' },
  { category: 'Future Technologies', categorySlug: 'future-technologies', title: 'Future Technologies Skills' },
]

const SKILL_TYPE_SUFFIXES = [
  'Analysis', 'Processing', 'Extraction', 'Validation', 'Generation',
  'Automation', 'Integration', 'Monitoring', 'Optimization', 'Configuration',
  'Troubleshooting', 'Documentation', 'Migration', 'Scheduling', 'Reporting',
  'Testing', 'Deployment', 'Review', 'Cleanup', 'Enhancement',
]

const RISK_LEVELS = ['low', 'medium', 'high']

// ─── Workflow definitions: 63 workflows ──────────────────────────────────────
interface WorkflowDef {
  name: string
  slug: string
  description: string
  triggers: string[]
  stepConfigs: object[]
  deptIndex: number // 0-based department index
}

const WORKFLOWS: WorkflowDef[] = [
  // Group 1: AI & ML (7 workflows, dept 0-6)
  { name: 'LLM Model Deployment Pipeline', slug: 'llm-deployment-pipeline', description: 'End-to-end pipeline for deploying LLM models to production.', triggers: ['deploy model', 'llm deploy', 'model release', 'production deploy'], stepConfigs: [{ step: 1, action: 'validate_model', agentRole: 'qa' }, { step: 2, action: 'safety_check', agentRole: 'safety' }, { step: 3, action: 'deploy', agentRole: 'execution' }, { step: 4, action: 'monitor', agentRole: 'automation' }], deptIndex: 0 },
  { name: 'Prompt Template Management', slug: 'prompt-template-mgmt', description: 'Create, test, and manage prompt templates.', triggers: ['create prompt', 'prompt template', 'test prompt', 'prompt version'], stepConfigs: [{ step: 1, action: 'draft_prompt', agentRole: 'specialist' }, { step: 2, action: 'test_prompt', agentRole: 'qa' }, { step: 3, action: 'approve', agentRole: 'owner_approval' }], deptIndex: 2 },
  { name: 'Model Performance Evaluation', slug: 'model-perf-evaluation', description: 'Evaluate model performance across benchmark datasets.', triggers: ['evaluate model', 'benchmark', 'model performance', 'accuracy test'], stepConfigs: [{ step: 1, action: 'load_dataset', agentRole: 'specialist' }, { step: 2, action: 'run_benchmarks', agentRole: 'execution' }, { step: 3, action: 'generate_report', agentRole: 'report' }], deptIndex: 5 },
  { name: 'AI Safety Review Process', slug: 'ai-safety-review', description: 'Review AI outputs for safety, bias, and compliance.', triggers: ['safety review', 'ai safety', 'bias check', 'content filter'], stepConfigs: [{ step: 1, action: 'scan_output', agentRole: 'safety' }, { step: 2, action: 'flag_issues', agentRole: 'qa' }, { step: 3, action: 'remediate', agentRole: 'specialist' }], deptIndex: 3 },
  { name: 'Data Pipeline Orchestration', slug: 'data-pipeline-orchestration', description: 'Orchestrate data pipelines for model training and inference.', triggers: ['data pipeline', 'etl', 'data flow', 'ingestion'], stepConfigs: [{ step: 1, action: 'configure_source', agentRole: 'specialist' }, { step: 2, action: 'transform_data', agentRole: 'execution' }, { step: 3, action: 'validate_output', agentRole: 'qa' }], deptIndex: 4 },
  { name: 'NLP Text Processing Workflow', slug: 'nlp-text-processing', description: 'Process and analyze text using NLP techniques.', triggers: ['nlp process', 'text analysis', 'sentiment', 'entity extraction'], stepConfigs: [{ step: 1, action: 'preprocess', agentRole: 'execution' }, { step: 2, action: 'analyze', agentRole: 'specialist' }, { step: 3, action: 'format_results', agentRole: 'report' }], deptIndex: 7 },
  { name: 'AI Model Retraining Cycle', slug: 'ai-model-retraining', description: 'Schedule and execute model retraining cycles.', triggers: ['retrain model', 'model update', 'fine-tune', 'retrain cycle'], stepConfigs: [{ step: 1, action: 'collect_data', agentRole: 'specialist' }, { step: 2, action: 'train_model', agentRole: 'execution' }, { step: 3, action: 'evaluate', agentRole: 'qa' }, { step: 4, action: 'deploy', agentRole: 'automation' }], deptIndex: 1 },

  // Group 2: Content & Media (7 workflows, dept 10-16)
  { name: 'Content Creation Pipeline', slug: 'content-creation-pipeline', description: 'End-to-end content creation from ideation to publication.', triggers: ['create content', 'new content', 'content piece', 'draft article'], stepConfigs: [{ step: 1, action: 'ideate', agentRole: 'planner' }, { step: 2, action: 'draft', agentRole: 'execution' }, { step: 3, action: 'review', agentRole: 'qa' }, { step: 4, action: 'publish', agentRole: 'automation' }], deptIndex: 10 },
  { name: 'Social Media Publishing Workflow', slug: 'social-media-publishing', description: 'Create and publish social media content across platforms.', triggers: ['social post', 'publish social', 'schedule post', 'social media'], stepConfigs: [{ step: 1, action: 'create_post', agentRole: 'execution' }, { step: 2, action: 'schedule', agentRole: 'automation' }, { step: 3, action: 'monitor_engagement', agentRole: 'report' }], deptIndex: 12 },
  { name: 'Video Production Pipeline', slug: 'video-production-pipeline', description: 'Full video production workflow from concept to delivery.', triggers: ['create video', 'video production', 'edit video', 'video render'], stepConfigs: [{ step: 1, action: 'script', agentRole: 'planner' }, { step: 2, action: 'produce', agentRole: 'execution' }, { step: 3, action: 'edit', agentRole: 'specialist' }, { step: 4, action: 'review', agentRole: 'qa' }], deptIndex: 13 },
  { name: 'SEO Content Optimization', slug: 'seo-content-optimization', description: 'Optimize content for search engine rankings.', triggers: ['seo optimize', 'keyword research', 'content seo', 'rank content'], stepConfigs: [{ step: 1, action: 'keyword_research', agentRole: 'specialist' }, { step: 2, action: 'optimize_content', agentRole: 'execution' }, { step: 3, action: 'validate', agentRole: 'qa' }], deptIndex: 17 },
  { name: 'Brand Asset Management', slug: 'brand-asset-management', description: 'Manage and organize brand assets and design files.', triggers: ['brand asset', 'design file', 'logo update', 'brand kit'], stepConfigs: [{ step: 1, action: 'create_asset', agentRole: 'execution' }, { step: 2, action: 'review_brand', agentRole: 'qa' }, { step: 3, action: 'catalog', agentRole: 'automation' }], deptIndex: 14 },
  { name: 'Multimedia Publishing Workflow', slug: 'multimedia-publishing', description: 'Publish multimedia content across distribution channels.', triggers: ['publish multimedia', 'distribute content', 'media publish', 'content distribute'], stepConfigs: [{ step: 1, action: 'prepare_assets', agentRole: 'execution' }, { step: 2, action: 'format_for_platform', agentRole: 'specialist' }, { step: 3, action: 'distribute', agentRole: 'automation' }], deptIndex: 18 },
  { name: 'Content Review & Approval', slug: 'content-review-approval', description: 'Multi-stage content review and approval process.', triggers: ['review content', 'approve content', 'content approval', 'editorial review'], stepConfigs: [{ step: 1, action: 'submit_for_review', agentRole: 'execution' }, { step: 2, action: 'editorial_review', agentRole: 'qa' }, { step: 3, action: 'final_approval', agentRole: 'owner_approval' }], deptIndex: 19 },

  // Group 3: Business & Operations (7 workflows, dept 20-26)
  { name: 'Business Intelligence Report', slug: 'bi-report-workflow', description: 'Generate comprehensive BI reports from data sources.', triggers: ['bi report', 'business report', 'analytics report', 'data dashboard'], stepConfigs: [{ step: 1, action: 'collect_data', agentRole: 'specialist' }, { step: 2, action: 'analyze', agentRole: 'execution' }, { step: 3, action: 'generate_report', agentRole: 'report' }], deptIndex: 20 },
  { name: 'Project Lifecycle Management', slug: 'project-lifecycle', description: 'Manage projects from initiation through closure.', triggers: ['new project', 'project start', 'project close', 'project update'], stepConfigs: [{ step: 1, action: 'plan_project', agentRole: 'planner' }, { step: 2, action: 'execute', agentRole: 'execution' }, { step: 3, action: 'monitor', agentRole: 'report' }, { step: 4, action: 'close', agentRole: 'manager' }], deptIndex: 22 },
  { name: 'Supply Chain Optimization', slug: 'supply-chain-optimization', description: 'Optimize supply chain operations and logistics.', triggers: ['supply chain', 'logistics', 'inventory', 'procurement'], stepConfigs: [{ step: 1, action: 'analyze_supply', agentRole: 'specialist' }, { step: 2, action: 'optimize', agentRole: 'execution' }, { step: 3, action: 'report', agentRole: 'report' }], deptIndex: 23 },
  { name: 'Customer Onboarding Process', slug: 'customer-onboarding-process', description: 'Streamlined customer onboarding and activation.', triggers: ['onboard customer', 'new customer', 'customer setup', 'activate account'], stepConfigs: [{ step: 1, action: 'create_account', agentRole: 'execution' }, { step: 2, action: 'configure', agentRole: 'specialist' }, { step: 3, action: 'welcome', agentRole: 'automation' }], deptIndex: 24 },
  { name: 'Vendor Evaluation Workflow', slug: 'vendor-evaluation', description: 'Evaluate and score vendor proposals and performance.', triggers: ['evaluate vendor', 'vendor score', 'vendor review', 'supplier assess'], stepConfigs: [{ step: 1, action: 'collect_proposals', agentRole: 'specialist' }, { step: 2, action: 'score', agentRole: 'execution' }, { step: 3, action: 'recommend', agentRole: 'planner' }], deptIndex: 25 },
  { name: 'Risk Assessment Process', slug: 'risk-assessment-process', description: 'Systematic risk identification and assessment.', triggers: ['risk assess', 'risk analysis', 'identify risk', 'risk report'], stepConfigs: [{ step: 1, action: 'identify_risks', agentRole: 'specialist' }, { step: 2, action: 'assess_impact', agentRole: 'execution' }, { step: 3, action: 'mitigation_plan', agentRole: 'planner' }], deptIndex: 28 },
  { name: 'Strategic Planning Cycle', slug: 'strategic-planning-cycle', description: 'Annual strategic planning and goal setting process.', triggers: ['strategic plan', 'annual plan', 'goal setting', 'strategy review'], stepConfigs: [{ step: 1, action: 'analyze_landscape', agentRole: 'specialist' }, { step: 2, action: 'define_goals', agentRole: 'planner' }, { step: 3, action: 'create_roadmap', agentRole: 'manager' }, { step: 4, action: 'approve', agentRole: 'owner_approval' }], deptIndex: 29 },

  // Group 4: Education & Training (7 workflows, dept 30-36)
  { name: 'Course Creation Pipeline', slug: 'course-creation-pipeline', description: 'Create new courses from concept to launch.', triggers: ['create course', 'new course', 'course design', 'course build'], stepConfigs: [{ step: 1, action: 'design_curriculum', agentRole: 'planner' }, { step: 2, action: 'create_content', agentRole: 'execution' }, { step: 3, action: 'review', agentRole: 'qa' }, { step: 4, action: 'launch', agentRole: 'manager' }], deptIndex: 30 },
  { name: 'Student Enrollment Workflow', slug: 'student-enrollment-workflow', description: 'Process student enrollment from application to registration.', triggers: ['enroll student', 'new enrollment', 'student register', 'admission'], stepConfigs: [{ step: 1, action: 'process_application', agentRole: 'execution' }, { step: 2, action: 'verify', agentRole: 'qa' }, { step: 3, action: 'register', agentRole: 'automation' }], deptIndex: 31 },
  { name: 'Assessment & Grading Cycle', slug: 'assessment-grading-cycle', description: 'Create assessments, collect submissions, and grade.', triggers: ['create assessment', 'grade exam', 'assessment cycle', 'student grade'], stepConfigs: [{ step: 1, action: 'create_assessment', agentRole: 'planner' }, { step: 2, action: 'collect_submissions', agentRole: 'automation' }, { step: 3, action: 'grade', agentRole: 'execution' }, { step: 4, action: 'publish_results', agentRole: 'report' }], deptIndex: 33 },
  { name: 'Learning Analytics Report', slug: 'learning-analytics-report', description: 'Generate learning analytics and student performance reports.', triggers: ['learning report', 'student analytics', 'performance report', 'learning metrics'], stepConfigs: [{ step: 1, action: 'collect_data', agentRole: 'specialist' }, { step: 2, action: 'analyze', agentRole: 'execution' }, { step: 3, action: 'generate_report', agentRole: 'report' }], deptIndex: 34 },
  { name: 'Teacher Onboarding Process', slug: 'teacher-onboarding-process', description: 'Onboard new teachers and set up their profiles.', triggers: ['onboard teacher', 'new teacher', 'teacher setup', 'instructor onboarding'], stepConfigs: [{ step: 1, action: 'create_profile', agentRole: 'execution' }, { step: 2, action: 'assign_courses', agentRole: 'planner' }, { step: 3, action: 'training', agentRole: 'specialist' }], deptIndex: 35 },
  { name: 'Certification Management', slug: 'certification-management', description: 'Manage certification programs and credential issuance.', triggers: ['issue certificate', 'certification', 'credential', 'cert management'], stepConfigs: [{ step: 1, action: 'verify_requirements', agentRole: 'qa' }, { step: 2, action: 'issue_credential', agentRole: 'execution' }, { step: 3, action: 'notify', agentRole: 'automation' }], deptIndex: 38 },
  { name: 'E-Learning Content Update', slug: 'elearning-content-update', description: 'Update and refresh e-learning platform content.', triggers: ['update course', 'refresh content', 'elearning update', 'course revision'], stepConfigs: [{ step: 1, action: 'review_current', agentRole: 'report' }, { step: 2, action: 'update_content', agentRole: 'execution' }, { step: 3, action: 'publish_update', agentRole: 'automation' }], deptIndex: 36 },

  // Group 5: Development & Engineering (7 workflows, dept 40-46)
  { name: 'Feature Development Pipeline', slug: 'feature-dev-pipeline', description: 'Full feature development from spec to deployment.', triggers: ['new feature', 'feature request', 'develop feature', 'implement feature'], stepConfigs: [{ step: 1, action: 'spec', agentRole: 'planner' }, { step: 2, action: 'implement', agentRole: 'execution' }, { step: 3, action: 'code_review', agentRole: 'qa' }, { step: 4, action: 'deploy', agentRole: 'automation' }], deptIndex: 40 },
  { name: 'Code Review & Merge', slug: 'code-review-merge', description: 'Systematic code review and merge process.', triggers: ['code review', 'pull request', 'merge code', 'review pr'], stepConfigs: [{ step: 1, action: 'automated_checks', agentRole: 'automation' }, { step: 2, action: 'peer_review', agentRole: 'qa' }, { step: 3, action: 'merge', agentRole: 'manager' }], deptIndex: 40 },
  { name: 'CI/CD Deployment Pipeline', slug: 'cicd-deployment-pipeline', description: 'Continuous integration and deployment workflow.', triggers: ['deploy', 'ci cd', 'build deploy', 'release'], stepConfigs: [{ step: 1, action: 'build', agentRole: 'automation' }, { step: 2, action: 'test', agentRole: 'qa' }, { step: 3, action: 'deploy_staging', agentRole: 'execution' }, { step: 4, action: 'deploy_production', agentRole: 'manager' }], deptIndex: 42 },
  { name: 'Bug Fix Workflow', slug: 'bug-fix-workflow', description: 'Track and resolve bugs through the full lifecycle.', triggers: ['fix bug', 'bug report', 'resolve issue', 'patch'], stepConfigs: [{ step: 1, action: 'triage', agentRole: 'manager' }, { step: 2, action: 'fix', agentRole: 'execution' }, { step: 3, action: 'verify', agentRole: 'qa' }, { step: 4, action: 'close', agentRole: 'automation' }], deptIndex: 40 },
  { name: 'Database Migration Process', slug: 'db-migration-process', description: 'Plan and execute database schema migrations.', triggers: ['db migrate', 'schema change', 'database migration', 'migration'], stepConfigs: [{ step: 1, action: 'plan_migration', agentRole: 'planner' }, { step: 2, action: 'create_migration', agentRole: 'execution' }, { step: 3, action: 'test', agentRole: 'qa' }, { step: 4, action: 'apply', agentRole: 'automation' }], deptIndex: 44 },
  { name: 'API Version Management', slug: 'api-version-management', description: 'Manage API versioning and deprecation.', triggers: ['api version', 'deprecate api', 'version api', 'api changelog'], stepConfigs: [{ step: 1, action: 'plan_version', agentRole: 'planner' }, { step: 2, action: 'implement', agentRole: 'execution' }, { step: 3, action: 'document', agentRole: 'specialist' }], deptIndex: 45 },
  { name: 'Release Management', slug: 'release-management', description: 'Manage software releases and versioning.', triggers: ['release', 'version release', 'tag release', 'ship'], stepConfigs: [{ step: 1, action: 'prepare_release', agentRole: 'planner' }, { step: 2, action: 'qa_gate', agentRole: 'qa' }, { step: 3, action: 'release', agentRole: 'manager' }, { step: 4, action: 'announce', agentRole: 'automation' }], deptIndex: 42 },

  // Group 6: Sales & Marketing (6 workflows, dept 50-55)
  { name: 'Lead Qualification Pipeline', slug: 'lead-qualification-pipeline', description: 'Score and qualify incoming leads.', triggers: ['qualify lead', 'new lead', 'score lead', 'lead qualification'], stepConfigs: [{ step: 1, action: 'enrich_lead', agentRole: 'specialist' }, { step: 2, action: 'score', agentRole: 'execution' }, { step: 3, action: 'route', agentRole: 'automation' }], deptIndex: 50 },
  { name: 'Email Campaign Workflow', slug: 'email-campaign-workflow', description: 'Design and execute email marketing campaigns.', triggers: ['email campaign', 'send email', 'newsletter', 'email blast'], stepConfigs: [{ step: 1, action: 'design_email', agentRole: 'execution' }, { step: 2, action: 'test', agentRole: 'qa' }, { step: 3, action: 'send', agentRole: 'automation' }, { step: 4, action: 'track', agentRole: 'report' }], deptIndex: 51 },
  { name: 'Ad Campaign Management', slug: 'ad-campaign-management', description: 'Manage paid advertising campaigns across platforms.', triggers: ['ad campaign', 'create ad', 'ad manage', 'paid ads'], stepConfigs: [{ step: 1, action: 'create_campaign', agentRole: 'planner' }, { step: 2, action: 'set_targeting', agentRole: 'specialist' }, { step: 3, action: 'monitor', agentRole: 'report' }], deptIndex: 52 },
  { name: 'Customer Feedback Loop', slug: 'customer-feedback-loop', description: 'Collect and process customer feedback.', triggers: ['customer feedback', 'survey', 'feedback', 'review collection'], stepConfigs: [{ step: 1, action: 'collect', agentRole: 'automation' }, { step: 2, action: 'analyze', agentRole: 'specialist' }, { step: 3, action: 'action_items', agentRole: 'planner' }], deptIndex: 56 },
  { name: 'Event Planning Workflow', slug: 'event-planning-workflow', description: 'Plan and execute marketing events.', triggers: ['plan event', 'organize event', 'event setup', 'marketing event'], stepConfigs: [{ step: 1, action: 'plan', agentRole: 'planner' }, { step: 2, action: 'prepare', agentRole: 'execution' }, { step: 3, action: 'execute', agentRole: 'manager' }], deptIndex: 57 },
  { name: 'Partnership Onboarding', slug: 'partnership-onboarding', description: 'Onboard new strategic partners.', triggers: ['new partner', 'partner onboarding', 'partnership setup', 'partner integrate'], stepConfigs: [{ step: 1, action: 'evaluate', agentRole: 'specialist' }, { step: 2, action: 'onboard', agentRole: 'execution' }, { step: 3, action: 'activate', agentRole: 'automation' }], deptIndex: 58 },

  // Group 7: HR & Administration (6 workflows, dept 60-65)
  { name: 'Recruitment Pipeline', slug: 'recruitment-pipeline', description: 'Full recruitment lifecycle from job posting to hiring.', triggers: ['new job', 'hire', 'recruit', 'job posting'], stepConfigs: [{ step: 1, action: 'create_jd', agentRole: 'planner' }, { step: 2, action: 'source', agentRole: 'execution' }, { step: 3, action: 'interview', agentRole: 'specialist' }, { step: 4, action: 'offer', agentRole: 'manager' }], deptIndex: 60 },
  { name: 'Employee Onboarding', slug: 'employee-onboarding-workflow', description: 'Onboard new employees with all required steps.', triggers: ['onboard employee', 'new hire', 'employee setup', 'join company'], stepConfigs: [{ step: 1, action: 'create_accounts', agentRole: 'execution' }, { step: 2, action: 'assign_equipment', agentRole: 'specialist' }, { step: 3, action: 'training', agentRole: 'automation' }], deptIndex: 61 },
  { name: 'Performance Review Cycle', slug: 'performance-review-cycle', description: 'Conduct periodic performance reviews.', triggers: ['performance review', 'employee review', 'appraisal', 'evaluation cycle'], stepConfigs: [{ step: 1, action: 'self_assessment', agentRole: 'automation' }, { step: 2, action: 'manager_review', agentRole: 'manager' }, { step: 3, action: 'calibrate', agentRole: 'planner' }, { step: 4, action: 'deliver_feedback', agentRole: 'execution' }], deptIndex: 62 },
  { name: 'Payroll Processing', slug: 'payroll-processing', description: 'Monthly payroll processing and distribution.', triggers: ['run payroll', 'process payroll', 'salary', 'payroll cycle'], stepConfigs: [{ step: 1, action: 'collect_data', agentRole: 'specialist' }, { step: 2, action: 'calculate', agentRole: 'execution' }, { step: 3, action: 'approve', agentRole: 'owner_approval' }, { step: 4, action: 'distribute', agentRole: 'automation' }], deptIndex: 63 },
  { name: 'Training Program Management', slug: 'training-program-management', description: 'Manage employee training programs and schedules.', triggers: ['training program', 'employee training', 'skill development', 'workshop'], stepConfigs: [{ step: 1, action: 'plan_program', agentRole: 'planner' }, { step: 2, action: 'schedule', agentRole: 'automation' }, { step: 3, action: 'track_completion', agentRole: 'report' }], deptIndex: 65 },
  { name: 'Policy Update Workflow', slug: 'policy-update-workflow', description: 'Create and distribute policy updates.', triggers: ['update policy', 'new policy', 'policy change', 'policy review'], stepConfigs: [{ step: 1, action: 'draft_policy', agentRole: 'specialist' }, { step: 2, action: 'review', agentRole: 'qa' }, { step: 3, action: 'approve', agentRole: 'owner_approval' }, { step: 4, action: 'distribute', agentRole: 'automation' }], deptIndex: 67 },

  // Group 8: Finance & Accounting (6 workflows, dept 70-75)
  { name: 'Invoice Processing', slug: 'invoice-processing', description: 'Process incoming and outgoing invoices.', triggers: ['process invoice', 'new invoice', 'pay invoice', 'invoice'], stepConfigs: [{ step: 1, action: 'receive', agentRole: 'automation' }, { step: 2, action: 'validate', agentRole: 'qa' }, { step: 3, action: 'approve', agentRole: 'manager' }, { step: 4, action: 'pay', agentRole: 'execution' }], deptIndex: 70 },
  { name: 'Budget Approval Workflow', slug: 'budget-approval-workflow', description: 'Review and approve budget requests.', triggers: ['budget request', 'approve budget', 'budget review', 'funding request'], stepConfigs: [{ step: 1, action: 'submit_request', agentRole: 'execution' }, { step: 2, action: 'review', agentRole: 'specialist' }, { step: 3, action: 'approve', agentRole: 'owner_approval' }], deptIndex: 73 },
  { name: 'Financial Close Process', slug: 'financial-close-process', description: 'Monthly and quarterly financial close procedures.', triggers: ['financial close', 'month end', 'quarter close', 'close books'], stepConfigs: [{ step: 1, action: 'reconcile', agentRole: 'execution' }, { step: 2, action: 'adjustments', agentRole: 'specialist' }, { step: 3, action: 'close', agentRole: 'manager' }], deptIndex: 72 },
  { name: 'Tax Filing Preparation', slug: 'tax-filing-preparation', description: 'Prepare and review tax filings.', triggers: ['tax filing', 'tax prepare', 'tax return', 'tax compliance'], stepConfigs: [{ step: 1, action: 'collect_documents', agentRole: 'execution' }, { step: 2, action: 'prepare_filing', agentRole: 'specialist' }, { step: 3, action: 'review', agentRole: 'qa' }, { step: 4, action: 'file', agentRole: 'manager' }], deptIndex: 74 },
  { name: 'Internal Audit Cycle', slug: 'internal-audit-cycle', description: 'Conduct internal audit cycles.', triggers: ['internal audit', 'audit cycle', 'compliance audit', 'audit check'], stepConfigs: [{ step: 1, action: 'plan_audit', agentRole: 'planner' }, { step: 2, action: 'execute', agentRole: 'execution' }, { step: 3, action: 'report', agentRole: 'report' }], deptIndex: 75 },
  { name: 'Revenue Recognition', slug: 'revenue-recognition', description: 'Process and recognize revenue according to standards.', triggers: ['recognize revenue', 'revenue entry', 'book revenue', 'revenue close'], stepConfigs: [{ step: 1, action: 'identify', agentRole: 'specialist' }, { step: 2, action: 'calculate', agentRole: 'execution' }, { step: 3, action: 'record', agentRole: 'automation' }], deptIndex: 79 },

  // Group 9: Security & Compliance (5 workflows, dept 80-84)
  { name: 'Security Incident Response', slug: 'security-incident-response', description: 'Respond to security incidents systematically.', triggers: ['security incident', 'breach', 'security alert', 'incident response'], stepConfigs: [{ step: 1, action: 'detect', agentRole: 'automation' }, { step: 2, action: 'contain', agentRole: 'execution' }, { step: 3, action: 'eradicate', agentRole: 'specialist' }, { step: 4, action: 'report', agentRole: 'manager' }], deptIndex: 80 },
  { name: 'Access Review Cycle', slug: 'access-review-cycle', description: 'Periodic review of user access and permissions.', triggers: ['access review', 'permission audit', 'access check', 'permission review'], stepConfigs: [{ step: 1, action: 'collect_access', agentRole: 'specialist' }, { step: 2, action: 'review', agentRole: 'qa' }, { step: 3, action: 'revoke', agentRole: 'execution' }], deptIndex: 81 },
  { name: 'Compliance Audit Workflow', slug: 'compliance-audit-workflow', description: 'Conduct compliance audits and remediation.', triggers: ['compliance audit', 'regulatory audit', 'compliance check', 'audit'], stepConfigs: [{ step: 1, action: 'scope', agentRole: 'planner' }, { step: 2, action: 'assess', agentRole: 'execution' }, { step: 3, action: 'remediate', agentRole: 'specialist' }], deptIndex: 83 },
  { name: 'Vulnerability Assessment', slug: 'vulnerability-assessment', description: 'Assess and remediate system vulnerabilities.', triggers: ['vulnerability scan', 'security scan', 'pen test', 'vuln assess'], stepConfigs: [{ step: 1, action: 'scan', agentRole: 'automation' }, { step: 2, action: 'analyze', agentRole: 'specialist' }, { step: 3, action: 'remediate', agentRole: 'execution' }, { step: 4, action: 'verify', agentRole: 'qa' }], deptIndex: 87 },
  { name: 'Data Privacy Review', slug: 'data-privacy-review', description: 'Review data handling for privacy compliance.', triggers: ['privacy review', 'data privacy', 'gdpr check', 'privacy audit'], stepConfigs: [{ step: 1, action: 'inventory_data', agentRole: 'specialist' }, { step: 2, action: 'assess_risk', agentRole: 'execution' }, { step: 3, action: 'remediate', agentRole: 'specialist' }], deptIndex: 82 },

  // Group 10: Research & Innovation (5 workflows, dept 90-94)
  { name: 'Research Paper Pipeline', slug: 'research-paper-pipeline', description: 'End-to-end research paper creation and publication.', triggers: ['research paper', 'write paper', 'paper submission', 'publication'], stepConfigs: [{ step: 1, action: 'literature_review', agentRole: 'specialist' }, { step: 2, action: 'research', agentRole: 'execution' }, { step: 3, action: 'write', agentRole: 'specialist' }, { step: 4, action: 'review', agentRole: 'qa' }], deptIndex: 90 },
  { name: 'Innovation Proposal Review', slug: 'innovation-proposal-review', description: 'Review and evaluate innovation proposals.', triggers: ['innovation proposal', 'new idea', 'propose innovation', 'idea submission'], stepConfigs: [{ step: 1, action: 'submit', agentRole: 'execution' }, { step: 2, action: 'evaluate', agentRole: 'specialist' }, { step: 3, action: 'decide', agentRole: 'manager' }], deptIndex: 91 },
  { name: 'Technology Evaluation', slug: 'technology-evaluation', description: 'Evaluate new technologies for adoption.', triggers: ['eval tech', 'technology assessment', 'tech eval', 'evaluate tool'], stepConfigs: [{ step: 1, action: 'research', agentRole: 'specialist' }, { step: 2, action: 'prototype', agentRole: 'execution' }, { step: 3, action: 'recommend', agentRole: 'planner' }], deptIndex: 93 },
  { name: 'Prototype Development Cycle', slug: 'prototype-dev-cycle', description: 'Build and test prototypes for new concepts.', triggers: ['build prototype', 'poc', 'proof of concept', 'prototype'], stepConfigs: [{ step: 1, action: 'design', agentRole: 'planner' }, { step: 2, action: 'build', agentRole: 'execution' }, { step: 3, action: 'test', agentRole: 'qa' }, { step: 4, action: 'iterate', agentRole: 'specialist' }], deptIndex: 94 },
  { name: 'Patent Filing Process', slug: 'patent-filing-process', description: 'Prepare and file patent applications.', triggers: ['file patent', 'patent application', 'ip protect', 'patent'], stepConfigs: [{ step: 1, action: 'disclosure', agentRole: 'specialist' }, { step: 2, action: 'prior_art_search', agentRole: 'execution' }, { step: 3, action: 'draft_application', agentRole: 'specialist' }, { step: 4, action: 'file', agentRole: 'manager' }], deptIndex: 97 },
]

// ─── Company definitions ─────────────────────────────────────────────────────
const COMPANIES = [
  { name: 'ALO Labs', slug: 'alo-labs', domain: 'hub.alolabs.net', webCrmConnected: true, paidApiAllowed: true, smsAllowed: true, whatsappBulkAllowed: true, publicPublishAllowed: true, monthlyUsageLimit: 100000, status: 'active' },
  { name: 'ALO Education', slug: 'alo-education', domain: 'aloeducation.com', webCrmConnected: true, paidApiAllowed: false, monthlyUsageLimit: 50000, status: 'active' },
  { name: 'English AI', slug: 'english-ai', domain: 'english.aloeducation.com', webCrmConnected: true, paidApiAllowed: false, monthlyUsageLimit: 30000, status: 'active' },
  { name: 'ICLA Global Academy', slug: 'icla-global', domain: 'iclaglobal.com', webCrmConnected: true, paidApiAllowed: false, monthlyUsageLimit: 25000, status: 'active' },
  { name: 'TECH360', slug: 'tech360', domain: 'tech360.com', webCrmConnected: true, paidApiAllowed: false, monthlyUsageLimit: 40000, status: 'active' },
  { name: 'Alaminn.info', slug: 'alaminn-info', domain: 'alamin.info', webCrmConnected: false, paidApiAllowed: false, monthlyUsageLimit: 10000, status: 'active' },
  { name: 'Future Expansion A', slug: 'future-a', domain: null, webCrmConnected: false, paidApiAllowed: false, monthlyUsageLimit: 0, status: 'inactive' },
  { name: 'Client Workspaces', slug: 'client-workspaces', domain: null, webCrmConnected: false, paidApiAllowed: false, monthlyUsageLimit: 0, status: 'inactive' },
]

// Company → department index mapping (0-based)
const COMPANY_DEPT_MAP: Record<string, number[]> = {
  'alo-labs': Array.from({ length: 100 }, (_, i) => i), // all departments
  'alo-education': [...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 10 }, (_, i) => i + 10), ...Array.from({ length: 10 }, (_, i) => i + 30)], // AI, Content, Education
  'english-ai': [7, ...Array.from({ length: 5 }, (_, i) => i + 10), ...Array.from({ length: 10 }, (_, i) => i + 30)], // NLP, Content(5), Education(10)
  'icla-global': [...Array.from({ length: 10 }, (_, i) => i + 10), ...Array.from({ length: 10 }, (_, i) => i + 30), ...Array.from({ length: 10 }, (_, i) => i + 60)], // Content, Education, HR
  'tech360': [...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 10 }, (_, i) => i + 40), ...Array.from({ length: 10 }, (_, i) => i + 80)], // AI, Dev, Security
  'alaminn-info': [...Array.from({ length: 10 }, (_, i) => i + 20), ...Array.from({ length: 5 }, (_, i) => i + 10)], // Business, Content(5)
}

// ─── Helper functions ────────────────────────────────────────────────────────
function padId(n: number): string {
  return String(n).padStart(4, '0')
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── Main seed function ──────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Starting Seed v2 — ALO Labs Agent Hub')
  const startTime = Date.now()

  // ─── STEP 1: Clear existing data (reverse dependency order) ────────────────
  console.log('\n🗑️  Clearing existing data...')
  const tablesToClear = [
    'TaskStep', 'Output', 'Task', 'Command',
    'WorkflowStep', 'AgentVersion', 'AgentPermission', 'AgentMemory', 'AgentRun',
    'SkillVersion', 'SkillPermission', 'SkillValidationLog', 'SkillRun',
    'WorkflowRun',
    'WebhookConfig',
    'UsageLog', 'CompanyUser', 'CompanyApiKey', 'CompanyPermission',
    'DepartmentMemory',
    'LearningReport', 'ProductivityReport', 'BlockedAction', 'PaymentGuardLog', 'ProtectionLog',
    'SOPUpdate', 'WorkflowImprovementRequest', 'AutomationSuggestion',
    'AgentBuildRequest', 'SkillBuildRequest', 'WorkflowBuildRequest', 'ToolApprovalRequest',
    'CapabilityRequest',
    'DomainDeployment', 'ProjectUpload', 'File',
    'CompanyMemory',
    'Approval', 'AuditLog',
    'Agent',
    'Skill',
    'Workflow',
    'Department',
    'Company',
    'User',
    'RolePermission', 'Role', 'Permission',
    'Settings', 'HealthCheck', 'ErrorLog', 'ServerLog', 'DeploymentLog',
  ]

  for (const table of tablesToClear) {
    await (db as any)[table].deleteMany()
  }
  console.log('   ✅ All tables cleared')

  // ─── STEP 2: Create Companies ──────────────────────────────────────────────
  console.log('\n🏢 Creating Companies...')
  const companies = await Promise.all(
    COMPANIES.map(c =>
      db.company.create({
        data: {
          name: c.name,
          slug: c.slug,
          domain: c.domain,
          status: c.status,
          webCrmConnected: c.webCrmConnected,
          paidApiAllowed: c.paidApiAllowed,
          smsAllowed: c.smsAllowed ?? false,
          whatsappBulkAllowed: c.whatsappBulkAllowed ?? false,
          publicPublishAllowed: c.publicPublishAllowed ?? false,
          monthlyUsageLimit: c.monthlyUsageLimit,
        },
      })
    )
  )
  const companyMap = new Map(companies.map(c => [c.slug, c]))
  console.log(`   ✅ ${companies.length} companies created`)

  // ─── STEP 3: Create Departments ────────────────────────────────────────────
  console.log('\n🏗️  Creating Departments...')
  const departments = await db.department.createMany({
    data: DEPARTMENTS.map((d, i) => ({
      name: d.name,
      slug: d.slug,
      description: d.description,
      sortOrder: i + 1,
      agentCount: 20,
      status: 'active',
    })),
  })

  // Fetch all departments with their IDs for agent creation
  const allDepts = await db.department.findMany({ orderBy: { sortOrder: 'asc' } })
  const deptMap = new Map(allDepts.map(d => [d.slug, d]))
  const deptByIndex = allDepts // ordered by sortOrder = index 0-99
  console.log(`   ✅ ${departments.count} departments created`)

  // ─── STEP 4: Create 2000 Agents ───────────────────────────────────────────
  console.log('\n🤖 Creating 2000 Agents...')
  const BATCH_SIZE = 500
  let agentGlobalIndex = 0

  for (let batchStart = 0; batchStart < 2000; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, 2000)
    const agentBatch: Array<{
      agentId: string; name: string; slug: string; departmentId: string;
      departmentName: string; purpose: string; role: string; status: string;
      allowedSkills: string; forbiddenSkills: string; allowedTools: string;
      forbiddenTools: string; inputSchema: string; outputSchema: string;
      workflowSteps: string; protectionRules: string; approvalRules: string;
      handoffRules: string; qualityChecklist: string; selfImprovement: string;
      productivityRules: string; version: number;
    }> = []

    for (let i = batchStart; i < batchEnd; i++) {
      const deptIdx = Math.floor(i / 20)
      const roleIdx = i % 20
      const dept = deptByIndex[deptIdx]
      const deptDef = DEPARTMENTS[deptIdx]
      const role = ROLES[roleIdx]

      const agentNum = padId(i + 1)
      const agentId = `AGENT-${agentNum}`

      let roleTitle: string
      if (role === 'specialist') {
        const specNum = roleIdx - 10 + 1
        roleTitle = `Specialist ${specNum}`
      } else {
        roleTitle = ROLE_TITLES[role]
      }

      const name = `${deptDef.shortName} ${roleTitle}`
      const slug = `${deptDef.slug}-${role === 'specialist' ? `specialist-${roleIdx - 9}` : role}`
      const purpose = PURPOSE_TEMPLATES[role].replace('{dept}', deptDef.name)

      agentBatch.push({
        agentId,
        name,
        slug,
        departmentId: dept.id,
        departmentName: dept.name,
        purpose,
        role,
        status: 'configured',
        allowedSkills: '[]',
        forbiddenSkills: '[]',
        allowedTools: '[]',
        forbiddenTools: '[]',
        inputSchema: '{}',
        outputSchema: '{}',
        workflowSteps: '[]',
        protectionRules: '[]',
        approvalRules: '[]',
        handoffRules: '[]',
        qualityChecklist: '[]',
        selfImprovement: '{}',
        productivityRules: '{}',
        version: 1,
      })
    }

    await db.agent.createMany({ data: agentBatch })
    agentGlobalIndex += agentBatch.length
    console.log(`   ⏳ ${agentGlobalIndex}/2000 agents created...`)
  }
  console.log(`   ✅ 2000 agents created (AGENT-0001 to AGENT-2000)`)

  // ─── STEP 5: Create 2000 Skills ───────────────────────────────────────────
  console.log('\n🛠️  Creating 2000 Skills...')
  const skillBatch: Array<{
    name: string; slug: string; category: string; categorySlug: string;
    title: string; status: string; riskLevel: string; requiresApproval: boolean;
    purpose: string; content: string;
  }> = []

  let skillCounter = 0
  for (let catIdx = 0; catIdx < SKILL_CATEGORIES.length; catIdx++) {
    const cat = SKILL_CATEGORIES[catIdx]
    for (let sIdx = 0; sIdx < 20; sIdx++) {
      skillCounter++
      const suffix = SKILL_TYPE_SUFFIXES[sIdx]
      const name = `${cat.category} ${suffix}`
      const slug = `${cat.categorySlug}-${suffix.toLowerCase()}`
      const riskLevel = RISK_LEVELS[sIdx % 3]

      skillBatch.push({
        name,
        slug,
        category: cat.category,
        categorySlug: cat.categorySlug,
        title: `${cat.title}: ${suffix}`,
        status: 'private',
        riskLevel,
        requiresApproval: true,
        purpose: `Performs ${suffix.toLowerCase()} operations within the ${cat.category} domain.`,
        content: '',
      })
    }
  }

  for (let i = 0; i < skillBatch.length; i += BATCH_SIZE) {
    const batch = skillBatch.slice(i, i + BATCH_SIZE)
    await db.skill.createMany({ data: batch })
    console.log(`   ⏳ ${Math.min(i + BATCH_SIZE, skillBatch.length)}/2000 skills created...`)
  }
  console.log(`   ✅ ${skillBatch.length} skills created (${SKILL_CATEGORIES.length} categories × 20)`)

  // ─── STEP 6: Create 63 Workflows ──────────────────────────────────────────
  console.log('\n🔄 Creating 63 Workflows...')
  const createdWorkflows = await Promise.all(
    WORKFLOWS.map(w => {
      const dept = deptByIndex[w.deptIndex]
      return db.workflow.create({
        data: {
          name: w.name,
          slug: w.slug,
          description: w.description,
          triggers: JSON.stringify(w.triggers),
          stepConfigs: JSON.stringify(w.stepConfigs),
          departmentId: dept.id,
          status: 'active',
        },
      })
    })
  )
  console.log(`   ✅ ${createdWorkflows.length} workflows created`)

  // ─── STEP 7: Create API Keys for active companies ─────────────────────────
  console.log('\n🔑 Creating API Keys...')
  const generatedKeys: Array<{ company: string; type: string; key: string }> = []
  const activeCompanies = companies.filter(c => c.status === 'active')

  for (const company of activeCompanies) {
    const testKeyValue = `alo_test_${company.slug}_${randomBytes(16).toString('hex')}`
    const liveKeyValue = `alo_live_${company.slug}_${randomBytes(16).toString('hex')}`

    generatedKeys.push({ company: company.slug, type: 'test', key: testKeyValue })
    generatedKeys.push({ company: company.slug, type: 'live', key: liveKeyValue })

    const testHash = createHash('sha256').update(testKeyValue).digest('hex')
    const liveHash = createHash('sha256').update(liveKeyValue).digest('hex')

    await db.companyApiKey.createMany({
      data: [
        {
          companyId: company.id,
          keyHash: testHash,
          keyPrefix: `alo_test_${company.slug}_`,
          keySuffix: '',
          name: `${company.name} Test Key`,
          keyType: 'test',
          scopes: JSON.stringify(['agents:list', 'workflows:list', 'usage:read']),
          rateLimit: 500,
          isActive: true,
        },
        {
          companyId: company.id,
          keyHash: liveHash,
          keyPrefix: `alo_live_${company.slug}_`,
          keySuffix: '',
          name: `${company.name} Live Key`,
          keyType: 'live',
          scopes: JSON.stringify(['agents:list', 'agents:run', 'workflows:list', 'workflows:run', 'usage:read']),
          rateLimit: 1000,
          isActive: true,
        },
      ],
    })
  }

  console.log(`   ✅ ${generatedKeys.length} API keys created`)
  console.log('\n   ┌─ Generated API Keys (SAVE THESE) ──────────────────────────────────┐')
  for (const gk of generatedKeys) {
    console.log(`   │ ${gk.company} [${gk.type}]: ${gk.key}`)
  }
  console.log('   └──────────────────────────────────────────────────────────────────┘')

  // ─── STEP 8: Create Company Permissions ────────────────────────────────────
  console.log('\n🔐 Creating Company Permissions...')
  let totalPermissions = 0

  for (const company of companies) {
    const deptIndices = COMPANY_DEPT_MAP[company.slug]
    if (!deptIndices) continue

    const perms = deptIndices.map(di => ({
      companyId: company.id,
      departmentId: deptByIndex[di].id,
      accessLevel: company.slug === 'alo-labs' ? 'admin' : 'read',
    }))

    await db.companyPermission.createMany({ data: perms })
    totalPermissions += perms.length
  }
  console.log(`   ✅ ${totalPermissions} company permissions created`)

  // ─── STEP 9: Create Super Admin User ───────────────────────────────────────
  console.log('\n👤 Creating Super Admin User...')
  const passwordHash = await bcrypt.hash('Admin@123', 12)
  const superAdmin = await db.user.create({
    data: {
      email: 'admin@alolabs.net',
      passwordHash,
      name: 'Al Aminn',
      role: 'super_admin',
      isActive: true,
    },
  })

  // Link super admin to ALO Labs
  const aloLabs = companyMap.get('alo-labs')!
  await db.companyUser.create({
    data: {
      companyId: aloLabs.id,
      userId: superAdmin.id,
      role: 'super_admin',
    },
  })
  console.log('   ✅ Super admin created: admin@alolabs.net (password: Admin@123)')

  // ─── STEP 10: Sample Data ──────────────────────────────────────────────────

  // 10a. 50 AuditLog entries
  console.log('\n📋 Creating sample AuditLog entries...')
  const auditActions = ['create', 'update', 'delete', 'login', 'approve', 'reject', 'deploy', 'configure']
  const auditResources = ['agent', 'workflow', 'skill', 'department', 'company', 'user', 'setting', 'api_key']
  const auditLogs = Array.from({ length: 50 }, (_, i) => ({
    userId: superAdmin.id,
    action: auditActions[i % auditActions.length],
    resource: auditResources[i % auditResources.length],
    details: JSON.stringify({ index: i, description: `Sample audit entry ${i + 1}` }),
    ipAddress: `192.168.1.${(i % 254) + 1}`,
    createdAt: new Date(Date.now() - (50 - i) * 3600000),
  }))
  await db.auditLog.createMany({ data: auditLogs })
  console.log(`   ✅ 50 audit log entries created`)

  // 10b. 20 UsageLog entries
  console.log('\n📊 Creating sample UsageLog entries...')
  const usageCompanies = companies.filter(c => c.status === 'active')
  const usageLogs = Array.from({ length: 20 }, (_, i) => {
    const comp = usageCompanies[i % usageCompanies.length]
    return {
      companyId: comp.id,
      companyName: comp.name,
      userId: superAdmin.id,
      userName: superAdmin.name,
      agentId: `AGENT-${padId((i * 100) + 1)}`,
      agentName: `Sample Agent ${i + 1}`,
      tokensOrLocalUsed: Math.floor(Math.random() * 5000) + 500,
      paidApiUsed: false,
      externalCostRisk: 'none',
      approvalRequired: false,
      status: i % 5 === 0 ? 'failed' : 'completed',
      startedAt: new Date(Date.now() - (20 - i) * 7200000),
      completedAt: new Date(Date.now() - (20 - i) * 7200000 + 1800000),
    }
  })
  await db.usageLog.createMany({ data: usageLogs })
  console.log(`   ✅ 20 usage log entries created`)

  // 10c. 10 Approval entries
  console.log('\n✅ Creating sample Approval entries...')
  const approvalTypes = ['agent_build', 'skill_build', 'workflow_build', 'tool_approval', 'paid_api', 'deployment', 'dns_change', 'public_publish', 'bulk_whatsapp', 'new_agent']
  const approvalStatuses = ['pending', 'pending', 'pending', 'approved', 'approved', 'approved', 'approved', 'rejected', 'rejected', 'approved']
  const approvals = approvalTypes.map((type, i) => ({
    type,
    title: `Sample ${type.replace(/_/g, ' ')} request #${i + 1}`,
    description: `This is a sample approval request for ${type.replace(/_/g, ' ')} functionality.`,
    requestJson: JSON.stringify({ sample: true, index: i }),
    status: approvalStatuses[i],
    requestedBy: superAdmin.id,
    reviewedBy: approvalStatuses[i] !== 'pending' ? superAdmin.id : null,
    reviewedAt: approvalStatuses[i] !== 'pending' ? new Date(Date.now() - (10 - i) * 86400000) : null,
    responseNote: approvalStatuses[i] === 'approved' ? 'Approved by admin' : approvalStatuses[i] === 'rejected' ? 'Needs revision' : null,
  }))
  await db.approval.createMany({ data: approvals })
  console.log(`   ✅ 10 approval entries created`)

  // 10d. 5 ProtectionLog entries
  console.log('\n🛡️  Creating sample ProtectionLog entries...')
  const protectionLogs = [
    { actionType: 'external_api_call', blocked: true, reason: 'Paid API not allowed for this company', agentId: 'AGENT-0015' },
    { actionType: 'file_delete', blocked: true, reason: 'File deletion requires owner approval', agentId: 'AGENT-0042' },
    { actionType: 'shell_command', blocked: true, reason: 'Shell commands are restricted to safety-approved agents only', agentId: 'AGENT-0088' },
    { actionType: 'public_publish', blocked: true, reason: 'Public publishing not enabled for this company', agentId: 'AGENT-0123' },
    { actionType: 'bulk_whatsapp', blocked: true, reason: 'WhatsApp bulk messaging not allowed for this company', agentId: 'AGENT-0200' },
  ]
  await db.protectionLog.createMany({
    data: protectionLogs.map((p, i) => ({
      ...p,
      createdAt: new Date(Date.now() - (5 - i) * 86400000),
    })),
  })
  console.log(`   ✅ 5 protection log entries created`)

  // 10e. 3 PaymentGuardLog entries
  console.log('\n💳 Creating sample PaymentGuardLog entries...')
  const paymentLogs = [
    { apiName: 'OpenAI GPT-4o', blocked: true, replacementUsed: true, replacementName: 'Local LLM (Ollama)', reason: 'Paid API not allowed' },
    { apiName: 'Anthropic Claude', blocked: true, replacementUsed: false, replacementName: null, reason: 'No local alternative available' },
    { apiName: 'Midjourney API', blocked: true, replacementUsed: true, replacementName: 'Stable Diffusion Local', reason: 'Paid API not allowed' },
  ]
  await db.paymentGuardLog.createMany({
    data: paymentLogs.map((p, i) => ({
      ...p,
      createdAt: new Date(Date.now() - (3 - i) * 172800000),
    })),
  })
  console.log(`   ✅ 3 payment guard log entries created`)

  // 10f. 20 WebhookConfig entries
  console.log('\n🔗 Creating sample WebhookConfig entries...')
  const webhookEvents = [
    ['agent.created', 'agent.updated'],
    ['workflow.completed', 'workflow.failed'],
    ['task.completed', 'task.failed'],
    ['approval.requested', 'approval.approved', 'approval.rejected'],
    ['usage.threshold_reached'],
    ['agent.error', 'skill.error'],
    ['deployment.success', 'deployment.failed'],
    ['company.usage_report'],
  ]
  const webhookConfigs: Array<{ companyId: string; name: string; url: string; events: string }> = []

  for (let i = 0; i < 20; i++) {
    const comp = activeCompanies[i % activeCompanies.length]
    const eventSet = webhookEvents[i % webhookEvents.length]
    webhookConfigs.push({
      companyId: comp.id,
      name: `${comp.name} Webhook ${i + 1}`,
      url: `https://hooks.example.com/${comp.slug}/webhook-${i + 1}`,
      events: JSON.stringify(eventSet),
    })
  }
  await db.webhookConfig.createMany({ data: webhookConfigs })
  console.log(`   ✅ 20 webhook configs created`)

  // ─── VALIDATION SUMMARY ────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('📊 VALIDATION SUMMARY')
  console.log('═'.repeat(70))

  const totalDepts = await db.department.count()
  const totalAgents = await db.agent.count()
  const totalSkills = await db.skill.count()
  const totalWorkflows = await db.workflow.count()
  const totalCompanies = await db.company.count()
  const totalApiKeys = await db.companyApiKey.count()
  const totalPerms = await db.companyPermission.count()

  console.log(`  Companies created:          ${totalCompanies}`)
  console.log(`  Departments created:        ${totalDepts}`)
  console.log(`  Agents created:             ${totalAgents}`)
  console.log(`  Skills created:             ${totalSkills}`)
  console.log(`  Workflows created:          ${totalWorkflows}`)
  console.log(`  API Keys created:           ${totalApiKeys}`)
  console.log(`  Company Permissions:        ${totalPerms}`)

  // Agent ID range verification
  console.log('\n  🔍 Agent ID Range Verification:')
  const firstAgent = await db.agent.findFirst({ where: { agentId: 'AGENT-0001' } })
  const lastAgent = await db.agent.findFirst({ where: { agentId: 'AGENT-2000' } })
  console.log(`     AGENT-0001 exists:  ${firstAgent ? '✅' : '❌ MISSING'}`)
  console.log(`     AGENT-2000 exists:  ${lastAgent ? '✅' : '❌ MISSING'}`)

  // Check for gaps - sample every 100th agent
  const gapChecks = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
  let gapsFound = 0
  for (const checkId of gapChecks) {
    const agent = await db.agent.findFirst({ where: { agentId: `AGENT-${padId(checkId)}` } })
    if (!agent) {
      console.log(`     AGENT-${padId(checkId)}:  ❌ MISSING`)
      gapsFound++
    }
  }
  if (gapsFound === 0) {
    console.log(`     Spot check (every 100th): ✅ No gaps detected`)
  }

  // Department agent count verification
  console.log('\n  🔍 Department Agent Count Verification:')
  const deptAgentCounts = await db.agent.groupBy({
    by: ['departmentId'],
    _count: { id: true },
  })
  const counts = deptAgentCounts.map(d => d._count.id)
  const allTwenty = counts.every(c => c === 20)
  console.log(`     All departments have 20 agents: ${allTwenty ? '✅' : '❌'}`)
  if (!allTwenty) {
    const badCounts = counts.filter(c => c !== 20)
    console.log(`     ⚠️  Departments with incorrect counts: ${badCounts.length}`)
  }

  // Sample data counts
  const auditCount = await db.auditLog.count()
  const usageCount = await db.usageLog.count()
  const approvalCount = await db.approval.count()
  const protectionCount = await db.protectionLog.count()
  const paymentCount = await db.paymentGuardLog.count()
  const webhookCount = await db.webhookConfig.count()
  console.log('\n  📋 Sample Data:')
  console.log(`     AuditLog entries:       ${auditCount}`)
  console.log(`     UsageLog entries:       ${usageCount}`)
  console.log(`     Approval entries:       ${approvalCount}`)
  console.log(`     ProtectionLog entries:  ${protectionCount}`)
  console.log(`     PaymentGuardLog entries:${paymentCount}`)
  console.log(`     WebhookConfig entries:  ${webhookCount}`)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log('\n' + '═'.repeat(70))
  console.log(`✅ Seed v2 completed in ${elapsed}s`)
  console.log('═'.repeat(70))
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())