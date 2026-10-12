import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const db = new PrismaClient();

// ─── 51 DEPARTMENTS ───────────────────────────────────────────────────────────

const departments = [
  'Command Center & Governance',
  'AI Engineering',
  'Memory & Knowledge Core',
  'CRM & Automation',
  'WhatsApp Business',
  'Digital Marketing Strategy',
  'Social Media',
  'Paid Ads Planning',
  'Content Writing',
  'SEO',
  'Website Design',
  'Website Development',
  'Software Development',
  'Avatar Video Studio',
  'Design & Creative',
  'Data & Analytics',
  'E-Commerce',
  'Customer Support',
  'Finance, Admin & Legal',
  'DevOps & Security',
  'Image AI Studio',
  'Study & Academic AI',
  'Video Production AI',
  'Song & Music AI',
  'Human Avatar & Voice AI',
  'Educational Agency Operations',
  'Student Consultancy & Visa',
  'University & Course Research',
  'LMS & Course Factory',
  'Exam & Assessment AI',
  'HR & Recruitment',
  'Employee Productivity',
  'Finance & Accounting',
  'Business Strategy',
  'Sales & Lead Generation',
  'Proposal & Contract Factory',
  'Project Management',
  'Operations Management',
  'Research & Intelligence',
  'Legal & Compliance',
  'Real Estate & Property Marketing',
  'Travel & Immigration Support',
  'Local Business Automation',
  'Agency Client Delivery',
  'AI Training & Knowledge',
  'Security Monitoring',
  'Server Automation',
  'Product Management',
  'Quality Assurance',
  'Executive CEO Control',
  'AI Website Builder, Web Clone & Scraper Agents',
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── AGENT NAME TEMPLATES PER DEPARTMENT ─────────────────────────────────────

const agentNameTemplates: Record<string, string[]> = {
  'Command Center & Governance': [
    'CC Governance Manager', 'CC Policy Planner', 'CC Rule Execution Agent', 'CC Compliance QA', 'CC Governance Reporter',
    'CC Auto-Enforcer', 'CC Safety Guardian', 'CC Memory Archivist', 'CC Productivity Optimizer', 'CC Owner Approval Gate',
    'CC Access Controller', 'CC Audit Trail Agent', 'CC Protocol Enforcer', 'CC Command Logger', 'CC Hierarchy Manager',
    'CC Policy Updater', 'CC Risk Assessor', 'CC Decision Recorder', 'CC Change Manager', 'CC Compliance Checker',
  ],
  'AI Engineering': [
    'AI Model Architect', 'AI Training Planner', 'AI Model Trainer', 'AI Model QA Tester', 'AI Performance Reporter',
    'AI Pipeline Automator', 'AI Safety Validator', 'AI Knowledge Curator', 'AI Productivity Engine', 'AI Deployment Approver',
    'AI Fine-Tune Specialist', 'AI Data Preparator', 'AI Eval Specialist', 'AI MLOps Specialist', 'AI Inference Optimizer',
    'AI Model Registry', 'AI Experiment Tracker', 'AI Hyperparameter Tuner', 'AI Feature Engineer', 'AI Integration Specialist',
  ],
  'Memory & Knowledge Core': [
    'Knowledge Base Manager', 'Memory Structure Planner', 'Memory Store Executor', 'Memory Integrity QA', 'Knowledge Insight Reporter',
    'Memory Sync Automator', 'Memory Safety Guard', 'Memory Recall Specialist', 'Knowledge Retrieval Optimizer', 'Knowledge Approval Gate',
    'Vector Store Specialist', 'Embedding Specialist', 'Context Window Manager', 'Semantic Search Agent', 'Knowledge Graph Builder',
    'Fact Check Agent', 'Knowledge Deduplicator', 'Memory Temperature Manager', 'Knowledge Taxonomist', 'Memory Eviction Agent',
  ],
  'CRM & Automation': [
    'CRM Pipeline Manager', 'CRM Strategy Planner', 'CRM Data Executor', 'CRM Quality Analyst', 'CRM Performance Reporter',
    'CRM Workflow Automator', 'CRM Data Safety Guard', 'CRM Memory Keeper', 'CRM Productivity Optimizer', 'CRM Campaign Approver',
    'Lead Scoring Specialist', 'Contact Enrichment Agent', 'Deal Tracking Specialist', 'CRM Integration Agent', 'Email Sequence Agent',
    'CRM Segmentation Agent', 'Follow-Up Agent', 'CRM Export Specialist', 'Pipeline Health Agent', 'CRM Notification Agent',
  ],
  'WhatsApp Business': [
    'WhatsApp Channel Manager', 'WhatsApp Campaign Planner', 'WhatsApp Message Executor', 'WhatsApp Compliance QA', 'WhatsApp Analytics Reporter',
    'WhatsApp Auto-Responder', 'WhatsApp Safety Filter', 'WhatsApp Chat Memory Agent', 'WhatsApp Productivity Optimizer', 'WhatsApp Approval Gate',
    'WhatsApp Template Specialist', 'WhatsApp Media Agent', 'WhatsApp Broadcast Agent', 'WhatsApp Flow Builder', 'WhatsApp CTA Specialist',
    'WhatsApp Opt-In Manager', 'WhatsApp Response Classifier', 'WhatsApp Queue Manager', 'WhatsApp Survey Agent', 'WhatsApp Feedback Agent',
  ],
  'Digital Marketing Strategy': [
    'Marketing Strategy Manager', 'Campaign Planning Agent', 'Campaign Execution Agent', 'Campaign QA Analyst', 'Marketing ROI Reporter',
    'Marketing Automation Agent', 'Brand Safety Guard', 'Market Memory Agent', 'Marketing Productivity Agent', 'Campaign Approval Gate',
    'Audience Researcher', 'Competitor Analyst', 'Channel Strategist', 'Budget Allocator', 'Marketing Calendar Agent',
    'Trend Spotter', 'Positioning Agent', 'Marketing Mix Modeler', 'Funnel Strategist', 'Growth Hacker Agent',
  ],
  'Social Media': [
    'Social Media Manager', 'Content Calendar Planner', 'Post Scheduling Executor', 'Social QA Reviewer', 'Social Analytics Reporter',
    'Social Automation Agent', 'Community Safety Moderator', 'Social Memory Archivist', 'Social Productivity Agent', 'Post Approval Gate',
    'Content Creator', 'Hashtag Strategist', 'Engagement Analyzer', 'Social Listener Agent', 'Influencer Researcher',
    'Platform Optimizer', 'Story Creator', 'Reel/TikTok Agent', 'Comment Responder', 'Social Crisis Agent',
  ],
  'Paid Ads Planning': [
    'Ads Campaign Manager', 'Ad Strategy Planner', 'Ad Creative Executor', 'Ad Performance QA', 'Ads ROI Reporter',
    'Ads Budget Automator', 'Ad Policy Safety Checker', 'Ad Memory Agent', 'Ads Productivity Optimizer', 'Ad Approval Gate',
    'Google Ads Specialist', 'Meta Ads Specialist', 'LinkedIn Ads Specialist', 'TikTok Ads Specialist', 'Retargeting Specialist',
    'A/B Test Agent', 'Keyword Bidder', 'Ad Copywriter', 'Ad Creative Designer', 'Conversion Tracker',
  ],
  'Content Writing': [
    'Content Writing Manager', 'Content Strategy Planner', 'Content Draft Writer', 'Content QA Editor', 'Content Performance Reporter',
    'Content Pipeline Automator', 'Content Safety Reviewer', 'Content Memory Agent', 'Writing Productivity Agent', 'Content Approval Gate',
    'Blog Writer', 'Article Writer', 'Whitepaper Writer', 'Case Study Writer', 'Email Copywriter',
    'Landing Page Writer', 'Social Copy Writer', 'Product Description Writer', 'Technical Writer', 'SEO Content Writer',
  ],
  'SEO': [
    'SEO Manager', 'SEO Strategy Planner', 'SEO Optimization Executor', 'SEO QA Analyst', 'SEO Ranking Reporter',
    'SEO Automation Agent', 'SEO Safety Checker', 'SEO Memory Agent', 'SEO Productivity Agent', 'SEO Approval Gate',
    'Keyword Researcher', 'On-Page SEO Specialist', 'Technical SEO Specialist', 'Link Building Specialist', 'Local SEO Specialist',
    'Schema Markup Agent', 'Site Audit Agent', 'SERP Tracker', 'Content SEO Optimizer', 'Backlink Analyzer',
  ],
  'Website Design': [
    'Design Team Manager', 'Design Planning Agent', 'Design Execution Agent', 'Design QA Reviewer', 'Design Analytics Reporter',
    'Design Automation Agent', 'Design Safety Validator', 'Design Memory Agent', 'Design Productivity Agent', 'Design Approval Gate',
    'UI Designer', 'UX Researcher', 'Wireframe Creator', 'Prototype Builder', 'Design System Specialist',
    'Color & Typography Agent', 'Icon Designer', 'Responsive Design Specialist', 'Accessibility Specialist', 'Design Handoff Agent',
  ],
  'Website Development': [
    'Web Dev Manager', 'Web Architecture Planner', 'Frontend Developer', 'Web QA Tester', 'Web Performance Reporter',
    'Web Build Automator', 'Web Security Scanner', 'Web Memory Agent', 'Web Dev Productivity Agent', 'Web Deployment Approver',
    'React Specialist', 'Next.js Specialist', 'CSS/Tailwind Specialist', 'Animation Specialist', 'API Integration Specialist',
    'Performance Optimizer', 'Cross-Browser Tester', 'Responsive Dev Specialist', 'PWA Developer', 'Web Accessibility Dev',
  ],
  'Software Development': [
    'Software Dev Manager', 'Software Architect Planner', 'Code Developer', 'Code QA Tester', 'Code Quality Reporter',
    'CI/CD Automator', 'Code Safety Analyzer', 'Code Knowledge Agent', 'Dev Productivity Agent', 'Code Review Approver',
    'Backend Developer', 'API Developer', 'Database Specialist', 'Algorithm Specialist', 'Refactoring Agent',
    'Code Documenter', 'Dependency Manager', 'Unit Test Writer', 'Integration Tester', 'Performance Profiler',
  ],
  'Avatar Video Studio': [
    'Avatar Studio Manager', 'Avatar Production Planner', 'Avatar Video Creator', 'Avatar QA Reviewer', 'Avatar Analytics Reporter',
    'Avatar Render Automator', 'Avatar Safety Checker', 'Avatar Memory Agent', 'Avatar Productivity Agent', 'Avatar Approval Gate',
    'Script-to-Avatar Agent', 'Lip Sync Specialist', 'Avatar Customizer', 'Background Designer', 'Voice Match Agent',
    'Avatar Expression Agent', 'Multi-Language Avatar', 'Avatar Template Agent', 'Avatar Scene Director', 'Avatar Export Agent',
  ],
  'Design & Creative': [
    'Creative Director', 'Creative Brief Planner', 'Design Creator', 'Creative QA Reviewer', 'Creative Analytics Reporter',
    'Creative Workflow Automator', 'Brand Consistency Guard', 'Creative Asset Memory', 'Creative Productivity Agent', 'Creative Approval Gate',
    'Logo Designer', 'Brand Identity Specialist', 'Print Designer', 'Motion Graphics Artist', 'Illustration Agent',
    'Photo Editor', 'Infographic Designer', 'Packaging Designer', 'Presentation Designer', 'Creative Asset Manager',
  ],
  'Data & Analytics': [
    'Analytics Manager', 'Data Strategy Planner', 'Data Processing Agent', 'Data QA Analyst', 'Analytics Reporter',
    'Data Pipeline Automator', 'Data Safety Guard', 'Data Memory Agent', 'Data Productivity Agent', 'Data Access Approver',
    'Data Analyst', 'BI Dashboard Builder', 'ETL Specialist', 'Data Warehouse Specialist', 'Statistical Analyst',
    'Data Visualization Agent', 'Anomaly Detector', 'Predictive Modeler', 'Data Governance Agent', 'Data Catalog Agent',
  ],
  'E-Commerce': [
    'E-Commerce Manager', 'Store Strategy Planner', 'Store Operations Executor', 'E-Commerce QA Tester', 'Sales Analytics Reporter',
    'E-Commerce Automator', 'Payment Safety Guard', 'Product Catalog Memory', 'E-Commerce Productivity Agent', 'Product Listing Approver',
    'Product Listing Specialist', 'Pricing Strategist', 'Inventory Manager', 'Order Fulfillment Agent', 'Return/Refund Handler',
    'Cart Abandonment Agent', 'Upsell/Cross-Sell Agent', 'Review Manager', 'Shipping Optimizer', 'Marketplace Integrator',
  ],
  'Customer Support': [
    'Support Manager', 'Support Strategy Planner', 'Support Ticket Executor', 'Support QA Reviewer', 'Support Analytics Reporter',
    'Support Workflow Automator', 'Support Safety Guard', 'Support Knowledge Agent', 'Support Productivity Agent', 'Escalation Approver',
    'Tier 1 Support Agent', 'Tier 2 Support Agent', 'Live Chat Agent', 'Email Support Agent', 'Phone Support Agent',
    'Knowledge Base Writer', 'Ticket Classifier', 'SLA Monitor', 'Customer Feedback Agent', 'Support Training Agent',
  ],
  'Finance, Admin & Legal': [
    'Finance Admin Manager', 'Budget Planning Agent', 'Invoice Processing Agent', 'Finance QA Reviewer', 'Financial Reporter',
    'Finance Workflow Automator', 'Financial Safety Guard', 'Finance Memory Agent', 'Finance Productivity Agent', 'Payment Approver',
    'Accountant Agent', 'Payroll Specialist', 'Tax Specialist', 'Expense Tracker', 'Legal Document Reviewer',
    'Compliance Checker', 'Contract Manager', 'Audit Assistant', 'Financial Planner', 'Risk Analyst',
  ],
  'DevOps & Security': [
    'DevOps Manager', 'Infrastructure Planner', 'Deployment Executor', 'DevOps QA Tester', 'System Health Reporter',
    'DevOps Automator', 'Security Guard Agent', 'Infrastructure Memory Agent', 'DevOps Productivity Agent', 'Deployment Approver',
    'Cloud Architect', 'Container Specialist', 'Monitoring Specialist', 'Incident Responder', 'Backup & Recovery Agent',
    'IaC Specialist', 'Secret Manager', 'Network Security Agent', 'Patch Manager', 'Log Analyzer',
  ],
  'Image AI Studio': [
    'Image Studio Manager', 'Image Production Planner', 'AI Image Generator', 'Image QA Reviewer', 'Image Analytics Reporter',
    'Image Pipeline Automator', 'Image Safety Filter', 'Image Memory Agent', 'Image Productivity Agent', 'Image Approval Gate',
    'Text-to-Image Agent', 'Image-to-Image Agent', 'Image Upscaler', 'Background Remover', 'Style Transfer Agent',
    'Image Editor', 'Batch Image Agent', 'Image Compressor', 'Thumbnail Creator', 'Brand Image Generator',
  ],
  'Study & Academic AI': [
    'Academic AI Manager', 'Study Plan Planner', 'Content Generation Agent', 'Academic QA Reviewer', 'Student Progress Reporter',
    'Academic Workflow Automator', 'Academic Integrity Guard', 'Academic Memory Agent', 'Study Productivity Agent', 'Content Approval Gate',
    'Tutor Agent', 'Quiz Generator', 'Study Guide Creator', 'Flashcard Maker', 'Essay Reviewer',
    'Citation Agent', 'Plagiarism Checker', 'Summarization Agent', 'Note-Taking Agent', 'Exam Prep Agent',
  ],
  'Video Production AI': [
    'Video Production Manager', 'Video Planning Agent', 'AI Video Generator', 'Video QA Reviewer', 'Video Analytics Reporter',
    'Video Pipeline Automator', 'Video Content Safety', 'Video Memory Agent', 'Video Productivity Agent', 'Video Approval Gate',
    'Script Writer', 'Video Editor', 'Subtitle Generator', 'Thumbnail Designer', 'Transcript Agent',
    'Scene Generator', 'Video Compressor', 'Format Converter', 'Social Clip Maker', 'Video SEO Agent',
  ],
  'Song & Music AI': [
    'Music Studio Manager', 'Music Planning Agent', 'AI Music Generator', 'Music QA Reviewer', 'Music Analytics Reporter',
    'Music Pipeline Automator', 'Copyright Safety Guard', 'Music Memory Agent', 'Music Productivity Agent', 'Music Approval Gate',
    'Lyric Writer', 'Beat Producer', 'Melody Composer', 'Sound Engineer', 'Genre Specialist',
    'Jingle Creator', 'Podcast Music Agent', 'Sound Effect Generator', 'Music Mixer', 'Audio Mastering Agent',
  ],
  'Human Avatar & Voice AI': [
    'Avatar Voice Manager', 'Voice Production Planner', 'Voice Cloning Agent', 'Voice QA Reviewer', 'Voice Analytics Reporter',
    'Voice Pipeline Automator', 'Voice Ethics Guard', 'Voice Memory Agent', 'Voice Productivity Agent', 'Voice Approval Gate',
    'TTS Specialist', 'Voice Customizer', 'Accent Trainer', 'Emotion Voice Agent', 'Multi-Language Voice Agent',
    'Voice Authenticator', 'Audio Cleaner', 'Voice Style Transfer', 'Dubbing Agent', 'Voice Over Agent',
  ],
  'Educational Agency Operations': [
    'Education Ops Manager', 'Education Strategy Planner', 'Education Ops Executor', 'Education QA Reviewer', 'Education Reporter',
    'Education Automator', 'Education Safety Guard', 'Education Memory Agent', 'Education Productivity Agent', 'Education Approver',
    'Course Coordinator', 'Student Onboarding Agent', 'Faculty Manager', 'Schedule Optimizer', 'Facility Manager',
    'Accreditation Agent', 'Partner Liaison', 'Curriculum Reviewer', 'Student Retention Agent', 'Education CRM Agent',
  ],
  'Student Consultancy & Visa': [
    'Visa Consultancy Manager', 'Visa Processing Planner', 'Visa Application Executor', 'Visa QA Reviewer', 'Visa Success Reporter',
    'Visa Pipeline Automator', 'Visa Compliance Guard', 'Visa Memory Agent', 'Visa Productivity Agent', 'Visa Approval Gate',
    'Document Checker', 'University Matcher', 'Visa Interview Prepper', 'Scholarship Finder', 'Country Specialist',
    'Application Tracker', 'Deadline Monitor', 'Financial Aid Agent', 'Pre-Departure Agent', 'Post-Arrival Agent',
  ],
  'University & Course Research': [
    'University Research Manager', 'Research Planning Agent', 'Data Collection Agent', 'Research QA Reviewer', 'Research Reporter',
    'Research Automator', 'Research Ethics Guard', 'Research Memory Agent', 'Research Productivity Agent', 'Research Approver',
    'University Evaluator', 'Course Matcher', 'Ranking Analyst', 'Tuition Comparer', 'Admission Analyst',
    'Program Researcher', 'Faculty Researcher', 'Alumni Tracker', 'Scholarship Researcher', 'Career Outcome Analyst',
  ],
  'LMS & Course Factory': [
    'LMS Manager', 'Course Production Planner', 'Course Builder Agent', 'Course QA Reviewer', 'Course Analytics Reporter',
    'LMS Automator', 'LMS Safety Guard', 'Course Memory Agent', 'LMS Productivity Agent', 'Course Approval Gate',
    'LMS Administrator', 'Course Designer', 'Content Uploader', 'Quiz Builder', 'Certificate Generator',
    'Progress Tracker', 'Enrollment Manager', 'Discussion Moderator', 'Assignment Grader', 'Course Catalog Agent',
  ],
  'Exam & Assessment AI': [
    'Exam Manager', 'Exam Planning Agent', 'Exam Generator', 'Exam QA Reviewer', 'Exam Analytics Reporter',
    'Exam Automator', 'Exam Integrity Guard', 'Exam Memory Agent', 'Exam Productivity Agent', 'Exam Approval Gate',
    'Question Bank Curator', 'Exam Paper Generator', 'Auto Grader', 'Proctoring Agent', 'Feedback Generator',
    'Difficulty Balancer', 'Adaptive Test Agent', 'Cheating Detector', 'Exam Scheduler', 'Result Publisher',
  ],
  'HR & Recruitment': [
    'HR Manager', 'Recruitment Planner', 'Hiring Process Executor', 'HR QA Reviewer', 'HR Analytics Reporter',
    'HR Workflow Automator', 'HR Compliance Guard', 'HR Memory Agent', 'HR Productivity Agent', 'Hiring Approver',
    'Job Description Writer', 'Resume Screener', 'Interview Scheduler', 'Candidate Evaluator', 'Offer Manager',
    'Onboarding Agent', 'Benefits Administrator', 'Employee Relations Agent', 'Training Coordinator', 'Exit Manager',
  ],
  'Employee Productivity': [
    'Productivity Manager', 'Productivity Planner', 'Task Execution Agent', 'Productivity QA Reviewer', 'Productivity Reporter',
    'Productivity Automator', 'Workplace Safety Guard', 'Productivity Memory Agent', 'Productivity Optimizer', 'Productivity Approver',
    'Time Tracker', 'Goal Setter', 'Performance Reviewer', 'Meeting Scheduler', 'Workflow Optimizer',
    'Focus Agent', 'Break Reminder', 'Skill Gap Analyzer', 'Wellness Agent', 'Productivity Coach',
  ],
  'Finance & Accounting': [
    'Finance Manager', 'Financial Planning Agent', 'Accounting Executor', 'Financial QA Reviewer', 'Financial Reporter',
    'Finance Automator', 'Finance Safety Guard', 'Finance Memory Agent', 'Finance Productivity Agent', 'Financial Approver',
    'Bookkeeper', 'Accounts Payable Agent', 'Accounts Receivable Agent', 'Reconciliation Specialist', 'Tax Preparer',
    'Cash Flow Analyst', 'Budget Analyst', 'Financial Modeler', 'Audit Trail Agent', 'Compliance Reporter',
  ],
  'Business Strategy': [
    'Strategy Manager', 'Strategy Planning Agent', 'Strategy Execution Agent', 'Strategy QA Reviewer', 'Strategy Reporter',
    'Strategy Automator', 'Strategy Risk Guard', 'Strategy Memory Agent', 'Strategy Productivity Agent', 'Strategy Approver',
    'Market Analyst', 'SWOT Analyst', 'Competitive Intelligence Agent', 'Business Model Agent', 'Innovation Agent',
    'Partnership Agent', 'Expansion Planner', 'Pivot Analyst', 'OKR Planner', 'Board Report Agent',
  ],
  'Sales & Lead Generation': [
    'Sales Manager', 'Lead Gen Planner', 'Outreach Executor', 'Sales QA Reviewer', 'Sales Analytics Reporter',
    'Sales Pipeline Automator', 'Sales Safety Guard', 'Sales Memory Agent', 'Sales Productivity Agent', 'Deal Approver',
    'Lead Researcher', 'Cold Outreach Agent', 'Demo Scheduler', 'Proposal Writer', 'Negotiation Coach',
    'CRM Updater', 'Sales Forecast Agent', 'Win/Loss Analyst', 'Referral Agent', 'Account Manager',
  ],
  'Proposal & Contract Factory': [
    'Proposal Factory Manager', 'Proposal Planning Agent', 'Proposal Writer Agent', 'Proposal QA Reviewer', 'Proposal Analytics Reporter',
    'Proposal Automator', 'Contract Safety Guard', 'Template Memory Agent', 'Proposal Productivity Agent', 'Contract Approver',
    'Proposal Template Agent', 'Custom Proposal Writer', 'Pricing Table Agent', 'Terms & Conditions Agent', 'Digital Signature Agent',
    'Contract Generator', 'Amendment Handler', 'Renewal Agent', 'Contract Analyzer', 'Compliance Checker',
  ],
  'Project Management': [
    'PM Manager', 'Project Planning Agent', 'Task Execution Agent', 'Project QA Reviewer', 'Project Status Reporter',
    'PM Workflow Automator', 'Project Risk Guard', 'Project Memory Agent', 'PM Productivity Agent', 'Milestone Approver',
    'Gantt Chart Agent', 'Resource Allocator', 'Risk Manager', 'Sprint Planner', 'Scope Manager',
    'Stakeholder Communicator', 'Change Request Handler', 'Time Tracker', 'KPI Monitor', 'Project Archiver',
  ],
  'Operations Management': [
    'Ops Manager', 'Ops Planning Agent', 'Ops Execution Agent', 'Ops QA Reviewer', 'Ops Analytics Reporter',
    'Ops Automator', 'Ops Safety Guard', 'Ops Memory Agent', 'Ops Productivity Agent', 'Ops Approver',
    'Process Optimizer', 'Inventory Manager', 'Supply Chain Agent', 'Vendor Manager', 'Quality Controller',
    'SOP Writer', 'Capacity Planner', 'Incident Manager', 'SLA Manager', 'Continuous Improvement Agent',
  ],
  'Research & Intelligence': [
    'Research Manager', 'Research Planning Agent', 'Data Collection Agent', 'Research QA Reviewer', 'Intelligence Reporter',
    'Research Automator', 'Research Ethics Guard', 'Research Memory Agent', 'Research Productivity Agent', 'Research Approver',
    'Primary Researcher', 'Secondary Researcher', 'Data Miner', 'Trend Analyst', 'Patent Researcher',
    'Survey Designer', 'Interview Agent', 'Literature Reviewer', 'Citation Networker', 'Insight Synthesizer',
  ],
  'Legal & Compliance': [
    'Legal Manager', 'Legal Research Planner', 'Legal Document Agent', 'Legal QA Reviewer', 'Compliance Reporter',
    'Legal Automator', 'Legal Safety Guard', 'Legal Memory Agent', 'Legal Productivity Agent', 'Legal Approver',
    'Contract Reviewer', 'IP Specialist', 'Regulatory Analyst', 'Privacy Compliance Agent', 'Dispute Resolver',
    'Legal Researcher', 'Policy Drafter', 'Due Diligence Agent', 'Risk Assessor', 'Legal Translator',
  ],
  'Real Estate & Property Marketing': [
    'Real Estate Manager', 'Property Marketing Planner', 'Listing Executor Agent', 'Property QA Reviewer', 'Property Analytics Reporter',
    'Real Estate Automator', 'Listing Safety Guard', 'Property Memory Agent', 'Real Estate Productivity Agent', 'Listing Approver',
    'Listing Writer', 'Property Photographer', 'Virtual Tour Creator', 'Price Estimator', 'Market Comparer',
    'Lead Qualifier', 'Showing Scheduler', 'Negotiation Assistant', 'Document Preparer', 'Neighborhood Analyst',
  ],
  'Travel & Immigration Support': [
    'Travel Manager', 'Travel Planning Agent', 'Booking Executor Agent', 'Travel QA Reviewer', 'Travel Analytics Reporter',
    'Travel Automator', 'Travel Safety Guard', 'Travel Memory Agent', 'Travel Productivity Agent', 'Travel Approver',
    'Flight Search Agent', 'Hotel Booking Agent', 'Itinerary Planner', 'Visa Assistance Agent', 'Travel Insurance Agent',
    'Expense Tracker', 'Travel Policy Checker', 'Emergency Support Agent', 'Currency Converter', 'Travel Reviewer',
  ],
  'Local Business Automation': [
    'Local Biz Manager', 'Local Marketing Planner', 'Local Ops Executor', 'Local Biz QA Reviewer', 'Local Analytics Reporter',
    'Local Biz Automator', 'Local Safety Guard', 'Local Biz Memory Agent', 'Local Productivity Agent', 'Local Approver',
    'GMB Manager', 'Local SEO Agent', 'Review Manager', 'Local Ad Specialist', 'Appointment Scheduler',
    'Loyalty Program Agent', 'Local Event Promoter', 'Neighborhood Targeter', 'Local Influencer Agent', 'Reputation Manager',
  ],
  'Agency Client Delivery': [
    'Delivery Manager', 'Client Onboarding Planner', 'Project Delivery Agent', 'Delivery QA Reviewer', 'Client Analytics Reporter',
    'Delivery Automator', 'Delivery Safety Guard', 'Client Memory Agent', 'Delivery Productivity Agent', 'Delivery Approver',
    'Account Manager', 'Client Communicator', 'Scope Manager', 'Timeline Tracker', 'Resource Allocator',
    'Quality Gate Agent', 'Client Feedback Agent', 'Revision Handler', 'Final Delivery Agent', 'Client Retention Agent',
  ],
  'AI Training & Knowledge': [
    'AI Training Manager', 'Training Curriculum Planner', 'Training Content Agent', 'Training QA Reviewer', 'Training Analytics Reporter',
    'Training Automator', 'Training Safety Guard', 'Training Memory Agent', 'Training Productivity Agent', 'Training Approver',
    'Course Creator', 'Assessment Designer', 'Certification Agent', 'Mentor Matching Agent', 'Skill Gap Analyzer',
    'Training Scheduler', 'Progress Tracker', 'Knowledge Sharer', 'Feedback Collector', 'Training Archive Agent',
  ],
  'Security Monitoring': [
    'Security Manager', 'Security Planning Agent', 'Security Scanner Agent', 'Security QA Reviewer', 'Security Incident Reporter',
    'Security Automator', 'Threat Detection Guard', 'Security Memory Agent', 'Security Productivity Agent', 'Security Approver',
    'Vulnerability Scanner', 'Intrusion Detector', 'Log Analyzer', 'Incident Responder', 'Threat Hunter',
    'Firewall Manager', 'Access Reviewer', 'Security Patcher', 'Compliance Auditor', 'Forensic Analyst',
  ],
  'Server Automation': [
    'Server Manager', 'Server Planning Agent', 'Server Config Agent', 'Server QA Reviewer', 'Server Health Reporter',
    'Server Automator', 'Server Safety Guard', 'Server Memory Agent', 'Server Productivity Agent', 'Server Change Approver',
    'Provisioning Agent', 'Config Manager', 'Health Monitor', 'Auto-Scaler', 'Load Balancer',
    'Backup Agent', 'Recovery Agent', 'Patch Manager', 'Capacity Planner', 'Server Cost Optimizer',
  ],
  'Product Management': [
    'Product Manager Lead', 'Product Planning Agent', 'Product Development Agent', 'Product QA Reviewer', 'Product Analytics Reporter',
    'Product Automator', 'Product Safety Guard', 'Product Memory Agent', 'Product Productivity Agent', 'Product Approver',
    'Roadmap Planner', 'Feature Prioritizer', 'User Story Writer', 'PRD Creator', 'A/B Test Planner',
    'User Research Agent', 'Competitor Analyst', 'Pricing Strategist', 'Launch Planner', 'Feedback Triager',
  ],
  'Quality Assurance': [
    'QA Manager', 'QA Planning Agent', 'Test Execution Agent', 'QA Review Gate', 'QA Analytics Reporter',
    'QA Automator', 'QA Safety Guard', 'QA Memory Agent', 'QA Productivity Agent', 'QA Approver',
    'Test Case Writer', 'Automation Engineer', 'Performance Tester', 'Security Tester', 'Regression Specialist',
    'Bug Tracker', 'Test Data Manager', 'Environment Manager', 'Exploratory Tester', 'QA Documentation Agent',
  ],
  'Executive CEO Control': [
    'CEO Dashboard Manager', 'Executive Planning Agent', 'Executive Command Executor', 'Executive QA Reviewer', 'Executive Reporter',
    'Executive Automator', 'Executive Safety Guard', 'Executive Memory Agent', 'Executive Productivity Agent', 'CEO Approval Gate',
    'Company Overview Agent', 'Department Health Monitor', 'Revenue Tracker', 'KPI Dashboard Agent', 'Strategic Initiative Tracker',
    'Board Briefing Agent', 'Crisis Management Agent', 'Decision Support Agent', 'Executive Scheduler', 'Company Vision Agent',
  ],
  'AI Website Builder, Web Clone & Scraper Agents': [
    'Web Builder Manager', 'Website Planning Agent', 'AI Web Builder', 'Web Clone QA Reviewer', 'Scraping Analytics Reporter',
    'Web Build Automator', 'Web Safety Guard', 'Web Build Memory Agent', 'Web Build Productivity Agent', 'Web Build Approver',
    'AI Website Generator', 'Web Clone Specialist', 'Web Scraper Agent', 'Content Extractor', 'Template Builder',
    'Site Migrator', 'Link Checker', 'Screenshot Agent', 'SEO Analyzer Agent', 'Web Performance Agent',
  ],
};

// ─── AGENT ROLES ──────────────────────────────────────────────────────────────

const agentRoles = [
  'manager', 'planner', 'execution', 'qa', 'report',
  'automation', 'safety', 'memory', 'productivity', 'owner_approval',
  'specialist', 'specialist', 'specialist', 'specialist', 'specialist',
  'specialist', 'specialist', 'specialist', 'specialist', 'specialist',
];

// ─── WORKFLOWS ────────────────────────────────────────────────────────────────

const workflows = [
  { name: 'Agent Build Workflow', slug: 'agent-build-workflow', description: 'End-to-end process for building a new AI agent with planning, execution, QA, and approval steps.', triggers: ['build agent', 'create agent', 'new agent', 'deploy agent'] },
  { name: 'Skill Build Workflow', slug: 'skill-build-workflow', description: 'Process for creating, validating, and deploying new AI skills.', triggers: ['build skill', 'create skill', 'new skill', 'write skill'] },
  { name: 'Workflow Build Workflow', slug: 'workflow-build-workflow', description: 'Meta-workflow for creating new automated workflows.', triggers: ['build workflow', 'create workflow', 'new workflow', 'design workflow'] },
  { name: 'Command Execution Pipeline', slug: 'command-execution-pipeline', description: 'Standard pipeline for processing and executing commands from the command center.', triggers: ['execute', 'run', 'process command', 'handle command'] },
  { name: 'Content Production Pipeline', slug: 'content-production-pipeline', description: 'End-to-end content creation from brief to final output with QA.', triggers: ['write content', 'create content', 'blog post', 'article'] },
  { name: 'SEO Optimization Workflow', slug: 'seo-optimization-workflow', description: 'Complete SEO audit and optimization process.', triggers: ['seo audit', 'optimize seo', 'keyword research', 'rank higher'] },
  { name: 'Social Media Campaign', slug: 'social-media-campaign', description: 'Plan, create, and publish social media campaigns.', triggers: ['social campaign', 'post schedule', 'social media plan'] },
  { name: 'Paid Ads Launch', slug: 'paid-ads-launch', description: 'Create and launch paid advertising campaigns.', triggers: ['launch ads', 'create ad campaign', 'paid ads', 'google ads'] },
  { name: 'Email Campaign Workflow', slug: 'email-campaign-workflow', description: 'Design and execute email marketing campaigns.', triggers: ['email campaign', 'send email', 'newsletter', 'email blast'] },
  { name: 'Lead Generation Pipeline', slug: 'lead-generation-pipeline', description: 'Generate, qualify, and nurture leads.', triggers: ['generate leads', 'find leads', 'lead gen', 'prospect'] },
  { name: 'Customer Onboarding', slug: 'customer-onboarding', description: 'Onboard new customers with automated workflows.', triggers: ['onboard', 'new customer', 'customer setup', 'welcome'] },
  { name: 'Support Ticket Resolution', slug: 'support-ticket-resolution', description: 'Resolve customer support tickets end-to-end.', triggers: ['support ticket', 'help request', 'customer issue', 'resolve ticket'] },
  { name: 'Deployment Pipeline', slug: 'deployment-pipeline', description: 'Deploy applications and websites to production.', triggers: ['deploy', 'release', 'go live', 'publish'] },
  { name: 'Security Scan Workflow', slug: 'security-scan-workflow', description: 'Run security scans and handle vulnerabilities.', triggers: ['security scan', 'vulnerability check', 'pen test', 'security audit'] },
  { name: 'Data Backup & Recovery', slug: 'data-backup-recovery', description: 'Automated backup and disaster recovery process.', triggers: ['backup', 'restore', 'disaster recovery', 'data backup'] },
  { name: 'Proposal Generation', slug: 'proposal-generation', description: 'Generate professional business proposals.', triggers: ['create proposal', 'write proposal', 'business proposal', 'send proposal'] },
  { name: 'Contract Generation', slug: 'contract-generation', description: 'Generate and manage contracts.', triggers: ['create contract', 'draft contract', 'new contract', 'agreement'] },
  { name: 'Report Generation', slug: 'report-generation', description: 'Generate various business reports.', triggers: ['generate report', 'create report', 'monthly report', 'analytics report'] },
  { name: 'Employee Onboarding', slug: 'employee-onboarding', description: 'Onboard new employees with automated setup.', triggers: ['onboard employee', 'new hire', 'employee setup', 'join team'] },
  { name: 'Recruitment Pipeline', slug: 'recruitment-pipeline', description: 'Full recruitment cycle from job posting to hiring.', triggers: ['hire', 'recruit', 'job posting', 'candidate'] },
  { name: 'Financial Close Process', slug: 'financial-close-process', description: 'Monthly/quarterly financial close workflow.', triggers: ['financial close', 'month end', 'quarter end', 'close books'] },
  { name: 'Invoice Processing', slug: 'invoice-processing', description: 'Process and manage invoices.', triggers: ['process invoice', 'pay invoice', 'create invoice', 'bill'] },
  { name: 'E-Commerce Product Listing', slug: 'ecommerce-product-listing', description: 'Create and manage product listings.', triggers: ['add product', 'list product', 'product listing', 'catalog'] },
  { name: 'Order Fulfillment', slug: 'order-fulfillment', description: 'Process and fulfill customer orders.', triggers: ['fulfill order', 'ship order', 'process order', 'order status'] },
  { name: 'Website Clone Workflow', slug: 'website-clone-workflow', description: 'Clone and replicate websites.', triggers: ['clone website', 'replicate site', 'copy website', 'website clone'] },
  { name: 'Web Scraping Pipeline', slug: 'web-scraping-pipeline', description: 'Scrape and extract data from websites.', triggers: ['scrape', 'extract data', 'crawl', 'web scraping'] },
  { name: 'Video Production Pipeline', slug: 'video-production-pipeline', description: 'Create AI-generated videos from script to final output.', triggers: ['create video', 'make video', 'video production', 'generate video'] },
  { name: 'Avatar Video Creation', slug: 'avatar-video-creation', description: 'Create videos using AI avatars.', triggers: ['avatar video', 'talking head', 'presenter video', 'ai avatar'] },
  { name: 'Image Generation Pipeline', slug: 'image-generation-pipeline', description: 'Generate and process AI images.', triggers: ['generate image', 'create image', 'ai image', 'make picture'] },
  { name: 'Music Creation Pipeline', slug: 'music-creation-pipeline', description: 'Generate AI music and audio.', triggers: ['create music', 'generate music', 'make song', 'compose'] },
  { name: 'Course Creation Workflow', slug: 'course-creation-workflow', description: 'Build and publish online courses.', triggers: ['create course', 'build course', 'new course', 'course design'] },
  { name: 'Exam Generation Workflow', slug: 'exam-generation-workflow', description: 'Generate and manage exams and assessments.', triggers: ['create exam', 'generate test', 'make quiz', 'assessment'] },
  { name: 'Visa Application Workflow', slug: 'visa-application-workflow', description: 'Process visa applications end-to-end.', triggers: ['visa application', 'apply visa', 'visa process', 'immigration'] },
  { name: 'Research Pipeline', slug: 'research-pipeline', description: 'Conduct systematic research on any topic.', triggers: ['research', 'study', 'investigate', 'analyze topic'] },
  { name: 'Legal Document Review', slug: 'legal-document-review', description: 'Review and process legal documents.', triggers: ['legal review', 'review contract', 'legal check', 'compliance'] },
  { name: 'Real Estate Listing', slug: 'real-estate-listing', description: 'Create and manage real estate property listings.', triggers: ['property listing', 'real estate', 'rental listing', 'house for sale'] },
  { name: 'Travel Booking Workflow', slug: 'travel-booking-workflow', description: 'Book and manage travel arrangements.', triggers: ['book travel', 'flight booking', 'hotel booking', 'travel plan'] },
  { name: 'Server Provisioning', slug: 'server-provisioning', description: 'Provision and configure new servers.', triggers: ['provision server', 'new server', 'setup server', 'create instance'] },
  { name: 'Quality Assurance Pipeline', slug: 'quality-assurance-pipeline', description: 'Run comprehensive QA testing.', triggers: ['qa test', 'quality check', 'test product', 'run tests'] },
  { name: 'CEO Dashboard Briefing', slug: 'ceo-dashboard-briefing', description: 'Generate executive briefing for CEO dashboard.', triggers: ['executive briefing', 'ceo report', 'company status', 'dashboard update'] },
];

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────

const resources = ['agents', 'skills', 'workflows', 'tasks', 'approvals', 'departments', 'settings', 'commands', 'outputs', 'memory', 'users'];
const actions = ['read', 'write', 'execute', 'delete', 'admin'];

// ─── SEED FUNCTION ────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  console.log('🧹 Clearing existing data...');
  await db.agentMemory.deleteMany();
  await db.taskStep.deleteMany();
  await db.output.deleteMany();
  await db.task.deleteMany();
  await db.agentVersion.deleteMany();
  await db.agentPermission.deleteMany();
  await db.agent.deleteMany();
  await db.department.deleteMany();
  await db.skillValidationLog.deleteMany();
  await db.skillPermission.deleteMany();
  await db.skillVersion.deleteMany();
  await db.skill.deleteMany();
  await db.workflowStep.deleteMany();
  await db.workflow.deleteMany();
  await db.command.deleteMany();
  await db.approval.deleteMany();
  await db.auditLog.deleteMany();
  await db.rolePermission.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
  await db.settings.deleteMany();
  await db.user.deleteMany();
  console.log('✅ Cleared existing data');

  // ─── 1. Create Super Admin User ──────────────────────────────────────────
  console.log('👤 Creating super admin...');
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const superAdmin = await db.user.create({
    data: {
      email: 'admin@command.center',
      passwordHash,
      name: 'Super Admin',
      role: 'super_admin',
      isActive: true,
    },
  });
  console.log(`✅ Super admin created: ${superAdmin.email}`);

  // ─── 2. Create Roles ────────────────────────────────────────────────────
  console.log('🔑 Creating roles...');
  const roleData = [
    { name: 'super_admin', description: 'Full system access with all permissions' },
    { name: 'admin', description: 'Administrative access, no user management' },
    { name: 'manager', description: 'Department-level management' },
    { name: 'operator', description: 'Can read and execute agents and workflows' },
    { name: 'viewer', description: 'Read-only access' },
  ];

  const createdRoles: Record<string, string> = {};
  for (const r of roleData) {
    const role = await db.role.create({ data: r });
    createdRoles[r.name] = role.id;
  }
  console.log(`✅ Created ${roleData.length} roles`);

  // ─── 3. Create Permissions ──────────────────────────────────────────────
  console.log('🔐 Creating permissions...');
  const allPermissions: { id: string; name: string; resource: string; action: string }[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      const perm = await db.permission.create({
        data: { name: `${resource}:${action}`, resource, action },
      });
      allPermissions.push(perm);
    }
  }
  console.log(`✅ Created ${allPermissions.length} permissions`);

  // ─── 4. Create Role Permissions ─────────────────────────────────────────
  console.log('🔗 Creating role-permission mappings...');

  // super_admin: all permissions
  for (const perm of allPermissions) {
    await db.rolePermission.create({
      data: { roleId: createdRoles['super_admin'], permissionId: perm.id },
    });
  }

  // admin: all except user:write, user:delete, user:admin
  for (const perm of allPermissions) {
    if (perm.resource === 'users' && ['write', 'delete', 'admin'].includes(perm.action)) continue;
    await db.rolePermission.create({
      data: { roleId: createdRoles['admin'], permissionId: perm.id },
    });
  }

  // manager: read+write on agents, skills, workflows, tasks, memory, outputs, commands, approvals, departments
  const managerResources = ['agents', 'skills', 'workflows', 'tasks', 'memory', 'outputs', 'commands', 'approvals', 'departments'];
  for (const perm of allPermissions) {
    if (managerResources.includes(perm.resource) && ['read', 'write'].includes(perm.action)) {
      await db.rolePermission.create({
        data: { roleId: createdRoles['manager'], permissionId: perm.id },
      });
    }
    // Also read on settings
    if (perm.resource === 'settings' && perm.action === 'read') {
      await db.rolePermission.create({
        data: { roleId: createdRoles['manager'], permissionId: perm.id },
      });
    }
  }

  // operator: read+execute on agents, skills, workflows, tasks, commands, outputs, memory, approvals, departments
  const operatorResources = ['agents', 'skills', 'workflows', 'tasks', 'commands', 'outputs', 'memory', 'approvals', 'departments'];
  for (const perm of allPermissions) {
    if (operatorResources.includes(perm.resource) && ['read', 'execute'].includes(perm.action)) {
      await db.rolePermission.create({
        data: { roleId: createdRoles['operator'], permissionId: perm.id },
      });
    }
  }

  // viewer: read only on everything except users
  for (const perm of allPermissions) {
    if (perm.action === 'read' && perm.resource !== 'users') {
      await db.rolePermission.create({
        data: { roleId: createdRoles['viewer'], permissionId: perm.id },
      });
    }
  }

  console.log('✅ Created role-permission mappings');

  // ─── 5. Create Departments ──────────────────────────────────────────────
  console.log('🏢 Creating departments...');
  const departmentMap: Record<string, string> = {};
  for (let i = 0; i < departments.length; i++) {
    const name = departments[i];
    const slug = slugify(name);
    const dept = await db.department.create({
      data: {
        name,
        slug,
        description: `${name} department with 20 specialized AI agents.`,
        agentCount: 20,
        sortOrder: i,
        status: 'active',
      },
    });
    departmentMap[name] = dept.id;
  }
  console.log(`✅ Created ${departments.length} departments`);

  // ─── 6. Create Agents ───────────────────────────────────────────────────
  console.log('🤖 Creating agents...');
  let agentCount = 0;
  for (let d = 0; d < departments.length; d++) {
    const deptName = departments[d];
    const deptId = departmentMap[deptName];
    const templates = agentNameTemplates[deptName] || [];

    for (let a = 0; a < 20; a++) {
      agentCount++;
      const agentId = `AGENT-${String(agentCount).padStart(4, '0')}`;
      const name = templates[a] || `${deptName} Agent ${a + 1}`;
      const slug = slugify(`${name}-${agentCount}`);
      const role = agentRoles[a] || 'specialist';
      const purpose = `${name} in ${deptName} - handles ${role} responsibilities.`;

      await db.agent.create({
        data: {
          agentId,
          name,
          slug,
          departmentId: deptId,
          departmentName: deptName,
          purpose,
          role,
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
          status: 'active',
          version: 1,
        },
      });
    }
  }
  console.log(`✅ Created ${agentCount} agents`);

  // ─── 7. Create Workflows ────────────────────────────────────────────────
  console.log('⚙️ Creating workflows...');
  for (const wf of workflows) {
    await db.workflow.create({
      data: {
        name: wf.name,
        slug: wf.slug,
        description: wf.description,
        triggers: JSON.stringify(wf.triggers),
        stepConfigs: '[]',
        status: 'active',
      },
    });
  }
  console.log(`✅ Created ${workflows.length} workflows`);

  // ─── 8. Create Settings ─────────────────────────────────────────────────
  console.log('⚙️ Creating settings...');
  await db.settings.createMany({
    data: [
      { key: 'LOCAL_FIRST', value: 'true', type: 'boolean' },
      { key: 'PRIVATE_AI_AGENTS', value: 'true', type: 'boolean' },
      { key: 'PAID_AI_API_ALLOWED', value: 'false', type: 'boolean' },
    ],
  });
  console.log('✅ Created 3 default settings');

  console.log('\n🎉 Seed completed successfully!');
  console.log(`   - 1 Super Admin user`);
  console.log(`   - ${roleData.length} Roles`);
  console.log(`   - ${allPermissions.length} Permissions`);
  console.log(`   - ${departments.length} Departments`);
  console.log(`   - ${agentCount} Agents`);
  console.log(`   - ${workflows.length} Workflows`);
  console.log(`   - 3 Settings`);
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());