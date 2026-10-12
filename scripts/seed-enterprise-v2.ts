import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ─── UTILITIES ───────────────────────────────────────────────────────────────

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

const BATCH_SMALL = 100
const BATCH_MEDIUM = 500

// ─── A. CONSTITUTIONAL RULES DATA ─────────────────────────────────────────────

const ruleCategories = [
  { name: 'governance', prefix: 'GOV' },
  { name: 'security', prefix: 'SEC' },
  { name: 'compliance', prefix: 'CMP' },
  { name: 'operations', prefix: 'OPS' },
  { name: 'ethics', prefix: 'ETH' },
  { name: 'data', prefix: 'DAT' },
  { name: 'ai', prefix: 'AI' },
  { name: 'hr', prefix: 'HR' },
  { name: 'finance', prefix: 'FIN' },
  { name: 'legal', prefix: 'LEG' },
] as const

const severities: ('critical' | 'high' | 'medium' | 'low' | 'informational')[] = [
  'critical', 'high', 'medium', 'low', 'informational',
]

// ─── 50 realistic rule titles per category ─────────────────────────────────────

const ruleTitlesByCategory: Record<string, string[]> = {
  governance: [
    'All AI agents must log every decision with reasoning chain',
    'Agent policy changes require governance board approval',
    'Multi-agent workflows must have a designated orchestrator',
    'All agent actions must be traceable to a governing policy',
    'Agent delegation chains must not exceed three levels',
    'Governance audit trails must be retained for seven years',
    'Agent configuration changes must be logged with timestamps',
    'Cross-departmental agent collaboration requires joint approval',
    'Agent autonomy levels must be reviewed quarterly',
    'All agent shutdown procedures must follow governance protocol',
    'Governance overrides require dual-approval from senior administrators',
    'Agent role assignments must be documented in the governance registry',
    'Policy exception requests must include risk assessment',
    'Agent behavior drift must trigger automatic governance review',
    'New agent deployment requires governance impact assessment',
    'Governance metrics must be reported to the board monthly',
    'Agent capability boundaries must be explicitly defined in policy',
    'Governance council must review all agent architecture changes',
    'Agent access rights must follow the principle of least privilege',
    'Governance framework must be updated with each platform release',
    'Agent decision authority limits must be enforced programmatically',
    'Governance compliance must be verified before major deployments',
    'All agent-to-agent handoffs must follow the governance transfer protocol',
    'Governance documentation must be versioned and immutable',
    'Agent performance benchmarks must align with governance KPIs',
    'Governance incident response plan must be tested quarterly',
    'Agent operational boundaries must be reviewed by governance committee',
    'Governance policies must be accessible to all authorized personnel',
    'Agent cost allocation must be approved through governance budget process',
    'Governance risk register must include all agent-related risks',
    'Agent interoperability standards must be governed centrally',
    'Governance change management must follow ITIL framework',
    'Agent telemetry data must be reported to governance dashboard',
    'Governance approval workflow must not exceed 48 hours for urgent requests',
    'Agent decommissioning must follow governance retirement procedure',
    'Governance liaison must be assigned to each department',
    'Agent feedback loops must incorporate governance review checkpoints',
    'Governance maturity model assessment must be conducted annually',
    'Agent SLA definitions must be approved by governance board',
    'Governance escalation matrix must be maintained for all agent types',
    'Agent configuration audit must occur every 30 days',
    'Governance training must be mandatory for all agent administrators',
    'Agent output quality must meet governance-defined thresholds',
    'Governance communication protocol must be followed for all incidents',
    'Agent capability requests must go through governance intake process',
    'Governance policy version control must use semantic versioning',
    'Agent runtime environment must comply with governance standards',
    'Governance effectiveness metrics must be tracked and reported quarterly',
  ],
  security: [
    'API endpoints must validate JWT tokens with less than 5 minute expiry',
    'All agent communications must use TLS 1.3 encryption',
    'Agent authentication must use multi-factor verification',
    'Security vulnerabilities in agent code must be patched within 24 hours',
    'All data transmitted between agents must be encrypted end-to-end',
    'Agent API keys must be rotated every 90 days',
    'Security headers must be present on all agent-facing endpoints',
    'Agent access logs must be monitored for anomalous patterns in real-time',
    'All agent secrets must be stored in a vault with zero plaintext exposure',
    'Network segmentation must isolate agent workloads by sensitivity level',
    'Agent input validation must prevent injection attacks',
    'Security incidents involving agents must be reported within one hour',
    'Agent containers must be scanned for vulnerabilities before deployment',
    'All agent file uploads must be scanned by antivirus before processing',
    'Agent session timeouts must not exceed 30 minutes of inactivity',
    'Rate limiting must be enforced on all agent API endpoints',
    'Agent dependencies must be audited for known CVEs monthly',
    'Security penetration testing must be performed on agent systems quarterly',
    'Agent database queries must use parameterized statements exclusively',
    'All agent-to-service connections must use mutual TLS',
    'Agent error messages must not expose internal system details',
    'Security baseline configurations must be applied to all new agents',
    'Agent code signing must be enforced for all deployments',
    'Privilege escalation events must trigger immediate security alerts',
    'Agent logging must include IP address, user agent, and request ID',
    'Cross-origin requests to agent APIs must be explicitly allowed',
    'Agent background tasks must run under minimal privilege accounts',
    'Security awareness training must be completed by all agent operators',
    'Agent webhook endpoints must validate request signatures',
    'All agent data at rest must be encrypted using AES-256',
    'Security exceptions must be time-limited and require CISO approval',
    'Agent outbound network connections must be whitelisted',
    'Security monitoring must cover all agent runtime environments',
    'Agent password policies must enforce complexity and rotation requirements',
    'All agent deployments must pass static application security testing',
    'Security incident response runbooks must be maintained for each agent type',
    'Agent configuration files must not contain hardcoded credentials',
    'Intrusion detection systems must monitor all agent network traffic',
    'Agent file system access must be restricted to required directories only',
    'Security review must be completed before any agent goes to production',
    'Agent service accounts must be audited quarterly and disabled when unused',
    'All third-party integrations must undergo security assessment',
    'Agent request payloads must be size-limited to prevent DoS attacks',
    'Security posture reports must be generated weekly for agent infrastructure',
    'Agent memory and cache must be cleared on session termination',
    'Content security policy headers must be configured for all agent interfaces',
    'Agent backup data must be encrypted and stored in geographically separate locations',
    'Security baseline compliance must be verified on every agent deployment',
  ],
  compliance: [
    'Data retention policies must be reviewed quarterly',
    'All agent interactions must comply with GDPR data processing principles',
    'Compliance audits must be conducted on a semi-annual basis',
    'Agent data processing activities must be documented in the ROPA register',
    'Privacy impact assessments must be completed for all new agent capabilities',
    'Compliance training must be completed by all agent operators annually',
    'Agent data transfers across borders must comply with applicable regulations',
    'Regulatory change notifications must be processed within 48 hours',
    'Compliance violations must be documented and remediated within 30 days',
    'All agent data subject access requests must be fulfilled within 30 days',
    'Compliance certification status must be displayed in the agent dashboard',
    'Agent consent management must follow regulatory requirements',
    'Industry-specific compliance requirements must be mapped per department',
    'Compliance testing must be included in agent deployment pipelines',
    'Agent audit logs must be tamper-proof and retention-policy compliant',
    'Third-party agent integrations must pass compliance validation',
    'Compliance risk assessments must be updated quarterly',
    'Agent data classification must align with the enterprise data taxonomy',
    'Compliance reporting must be automated and delivered to stakeholders monthly',
    'All agent configurations must support right-to-erasure requests',
    'Compliance monitoring must run continuously across all agent activities',
    'Agent data anonymization must be applied before analytics processing',
    'Regulatory filings must be prepared using verified agent-collected data',
    'Compliance checklists must be maintained for each regulated domain',
    'Agent output must not contain content that violates advertising regulations',
    'Compliance exceptions must be tracked with justification and expiry dates',
    'Agent handling of financial data must comply with SOX requirements',
    'Compliance metrics must be included in agent performance dashboards',
    'All agent data exports must be logged and approved by compliance team',
    'Compliance incident response procedures must be tested semi-annually',
    'Agent health data processing must comply with HIPAA requirements',
    'Compliance documentation must be available for regulatory inspections',
    'Agent terms of service must include required regulatory disclosures',
    'Compliance with accessibility standards must be verified for agent interfaces',
    'Agent data processing agreements must be in place for all vendors',
    'Compliance training records must be maintained for a minimum of three years',
    'Agent operations must not result in anti-competitive behavior',
    'Compliance with consumer protection laws must be verified quarterly',
    'Agent environmental impact must comply with sustainability reporting requirements',
    'Compliance gate review must occur before each major release',
    'Agent records must support legal hold and e-discovery processes',
    'Compliance with industry standards must be documented and auditable',
    'Agent data lineage must be traceable for compliance verification',
    'Compliance breach notification procedures must be tested annually',
    'Agent cookie and tracking policies must comply with e-privacy regulations',
  ],
  operations: [
    'All automated workflows must have manual approval checkpoints',
    'Agent deployment must follow the blue-green deployment strategy',
    'Operational runbooks must be updated with each agent version release',
    'All agent failures must trigger automated alerting to on-call teams',
    'Agent scaling policies must be configured per workload tier',
    'Operational metrics must be collected at one-minute intervals minimum',
    'Agent rollback procedures must be tested before each production deployment',
    'All agent dependencies must have defined SLA requirements',
    'Operational dashboards must display real-time agent health indicators',
    'Agent capacity planning must be performed monthly with growth projections',
    'Operational change windows must be scheduled during low-traffic periods',
    'All agent infrastructure must support horizontal scaling',
    'Operational incident management must follow the P1-P4 severity framework',
    'Agent monitoring must cover CPU, memory, network, and disk utilization',
    'Operational playbooks must exist for all known failure scenarios',
    'All agent deployments must include smoke test validation',
    'Operational costs must be tracked per agent and reported monthly',
    'Agent configuration drift must be detected and corrected automatically',
    'Operational readiness reviews must be completed before go-live',
    'All agent APIs must have circuit breaker patterns implemented',
    'Operational SLA targets must be defined and measured for each agent',
    'Agent batch processing must not impact real-time operation latency',
    'Operational documentation must be kept current with live procedures',
    'All agent connections to external services must have timeout configurations',
    'Operational health checks must run every 30 seconds on all agents',
    'Agent resource quotas must be enforced to prevent noisy neighbor issues',
    'Operational disaster recovery must achieve RPO under 15 minutes',
    'All agent releases must pass integration testing in staging environment',
    'Operational efficiency metrics must be reviewed in weekly ops meetings',
    'Agent load balancing must distribute traffic evenly across instances',
    'Operational incident post-mortems must be completed within 72 hours',
    'All agent scheduled tasks must have proper failure notifications',
    'Operational tooling must support canary deployments for agent updates',
    'Agent graceful shutdown must complete in-flight operations before terminating',
    'Operational capacity alerts must trigger at 70% resource utilization',
    'All agent external dependencies must have fallback strategies defined',
    'Operational run automation must reduce manual intervention by 80%',
    'Agent startup sequences must follow a defined initialization order',
    'Operational visibility must include distributed tracing across agents',
    'All agent configuration changes must be applied through infrastructure as code',
    'Operational cost optimization reviews must be conducted quarterly',
    'Agent maintenance windows must be communicated 48 hours in advance',
    'Operational reliability engineering practices must be applied to all agents',
    'All agent logs must be shipped to centralized logging infrastructure',
  ],
  ethics: [
    'AI agents must disclose when content is AI-generated',
    'Agent decisions affecting humans must include an appeal process',
    'Ethical review must be conducted for all high-impact agent deployments',
    'Agents must not generate content that promotes discrimination or bias',
    'Ethical guidelines must be reviewed and updated semi-annually',
    'Agent training data provenance must be documented and auditable',
    'Ethics committee approval must be obtained for autonomous agent actions',
    'Agents must not impersonate real individuals or organizations',
    'Ethical impact assessments must be completed for each new agent capability',
    'Agent bias testing must be performed before production deployment',
    'Ethical boundaries must be encoded as hard constraints in agent behavior',
    'Agents must not manipulate user behavior through dark patterns',
    'Ethics training must be mandatory for all agent development teams',
    'Agent transparency reports must be published quarterly',
    'Ethical use policies must be acknowledged by all agent operators',
    'Agents must respect user autonomy and provide opt-out mechanisms',
    'Ethics violations must be reported through a confidential channel',
    'Agent content generation must include source attribution when applicable',
    'Ethical risk scoring must be part of the agent approval process',
    'Agents must not engage in deceptive practices or misinformation',
    'Ethical oversight must include external stakeholder representation',
    'Agent interaction logs must be available for ethical audit',
    'Ethics by design principles must be integrated into agent development lifecycle',
    'Agents must not make irreversible decisions without human confirmation',
    'Ethical framework compliance must be verified through automated checks',
    'Agent recommendations must be explainable to end users',
    'Ethical review board must include members from diverse backgrounds',
    'Agents must not exploit user vulnerabilities or emotional states',
    'Ethical use of user data must be validated by the privacy team',
    'Agent decision-making processes must be documented for accountability',
    'Ethics incident response must include remediation and prevention plans',
    'Agents must comply with industry-specific ethical codes of conduct',
    'Ethical constraints must override performance optimization when in conflict',
    'Agent output must be reviewed for potential harm before delivery to users',
    'Ethics metrics must be tracked alongside operational KPIs',
    'Agents must not collect data beyond what is necessary for their function',
    'Ethical guidelines must address emerging AI capabilities proactively',
    'Agent user consent must be informed, specific, and revocable',
    'Ethics review must consider both individual and societal impact',
    'Agents must provide fair and equitable service to all users',
    'Ethical standards must apply equally to internal and external agent interactions',
    'Agent content moderation policies must be aligned with ethical guidelines',
    'Ethics compliance must be a criterion in vendor selection for agent tools',
    'Agents must not generate content that could cause psychological harm',
    'Ethical review documentation must be preserved for a minimum of five years',
  ],
  data: [
    'PII data must be encrypted at rest and in transit',
    'Data classification labels must be applied to all agent-accessible datasets',
    'Agent data queries must be logged with full audit trail',
    'Data access permissions must follow the principle of least privilege',
    'Agent-generated data must be tagged with creation metadata',
    'Data quality checks must run on all ingested data before agent processing',
    'Agent data storage must comply with regional data residency requirements',
    'Data backup and recovery procedures must be tested monthly',
    'Agent data pipelines must include data validation at each transformation stage',
    'Data retention periods must be enforced automatically on all agent stores',
    'Agent data schemas must be versioned and backward-compatible changes required',
    'Data lineage tracking must cover all agent data transformations',
    'Agent data exports must be encrypted and logged',
    'Data deduplication must be performed on all agent knowledge bases weekly',
    'Agent data access patterns must be monitored for unauthorized usage',
    'Data governance policies must be enforced programmatically on all agents',
    'Agent data migration must follow the enterprise data migration framework',
    'Data profiling must be performed on all new data sources before agent integration',
    'Agent data caching must respect data freshness requirements',
    'Data masking must be applied to sensitive fields in non-production environments',
    'Agent data synchronization must handle conflicts with defined resolution strategies',
    'Data catalog entries must be created for all agent-accessible datasets',
    'Agent data deletion requests must cascade through all dependent systems',
    'Data integrity checks must verify checksums on all stored agent data',
    'Agent data sampling must be statistically representative for training purposes',
    'Data ownership must be clearly assigned for each agent data domain',
    'Agent data compression must not result in loss of critical information',
    'Data breach notification procedures must be activated within one hour of detection',
    'Agent data access must be revoked immediately upon role change or termination',
    'Data quality scores must be tracked and reported for all agent data sources',
    'Agent data transformation logic must be documented and reviewable',
    'Data replication lag must not exceed 5 minutes for agent real-time queries',
    'Agent data archival must follow the enterprise archival policy',
    'Data schema evolution must include backward compatibility testing',
    'Agent data ingestion pipelines must handle rate limiting and backpressure',
    'Data partitioning strategies must be optimized for agent query patterns',
    'Agent data sharing agreements must be documented and enforced',
    'Data anomaly detection must flag unusual agent data access patterns',
    'Agent data versioning must support point-in-time recovery',
    'Data access reviews must be conducted quarterly for all agent systems',
    'Agent data streaming must include exactly-once delivery guarantees',
    'Data stewardship roles must be assigned for each agent data domain',
    'Agent data enrichment must preserve original data provenance',
    'Data compliance checks must run on all agent data pipelines daily',
    'Agent data warehouse queries must be optimized for performance',
    'Data destruction procedures must render data unrecoverable',
    'Agent data contracts must be established between producing and consuming agents',
  ],
  ai: [
    'Model outputs must pass toxicity screening before delivery',
    'AI model versioning must track all training data and hyperparameters',
    'Agent AI models must be evaluated for fairness across demographic groups',
    'AI model deployment must include A/B testing with rollback capability',
    'Agent inference latency must not exceed 2 seconds for real-time use cases',
    'AI model training must use approved datasets with documented licenses',
    'Agent hallucination detection must be enabled for all factual queries',
    'AI model monitoring must track drift, accuracy, and latency metrics',
    'Agent model updates must pass regression testing before production release',
    'AI explainability reports must be generated for high-stakes decisions',
    'Agent model selection must be based on documented evaluation criteria',
    'AI model serving infrastructure must support auto-scaling',
    'Agent prompt engineering must follow security best practices',
    'AI model data pipelines must ensure training-serving consistency',
    'Agent output moderation must filter harmful content in real-time',
    'AI model performance benchmarks must be run monthly',
    'Agent context window management must prevent token overflow errors',
    'AI model security must prevent prompt injection and extraction attacks',
    'Agent multi-model routing must be optimized for cost and quality',
    'AI model bias mitigation must be applied throughout the ML pipeline',
    'Agent fine-tuning must be approved by the AI governance committee',
    'AI model resource requirements must be estimated before deployment',
    'Agent output confidence scores must be included when below threshold',
    'AI model training costs must be tracked and optimized',
    'Agent model cards must document capabilities, limitations, and intended use',
    'AI model caching must be used strategically to reduce inference costs',
    'Agent failure modes must be documented and tested for each AI model',
    'AI model evaluation must include adversarial testing',
    'Agent conversation memory must be managed with configurable retention',
    'AI model input sanitization must prevent encoding-based attacks',
    'Agent output format must be validated against expected schema',
    'AI model observability must include prediction distribution monitoring',
    'Agent tool use by AI models must be logged and auditable',
    'AI model capacity planning must account for projected growth',
    'Agent grounding techniques must be used to reduce factual errors',
    'AI model version rollback must complete within 5 minutes',
    'Agent multi-modal input handling must follow standardized processing',
    'AI model feature stores must be maintained for reproducible experiments',
    'Agent output length must be controlled to prevent excessive token usage',
    'AI model red-teaming must be conducted before major releases',
    'Agent reasoning chain visibility must be available for debugging',
    'AI model cost allocation must be tracked per consuming agent',
    'Agent self-correction capabilities must be tested and validated',
    'AI model deployment must include load testing at peak capacity',
    'Agent knowledge cutoff dates must be documented and communicated',
  ],
  hr: [
    'AI hiring recommendations must include human review step',
    'Agent access to employee records must be limited to authorized HR personnel',
    'HR agent interactions must comply with labor regulations',
    'Agent-assisted performance reviews must be reviewed by a human manager',
    'HR data processing must follow employee consent requirements',
    'Agent scheduling must respect employee working hour regulations',
    'HR agent responses must not disclose one employee\'s data to another',
    'Agent onboarding workflows must be completed within the first week',
    'HR compliance training must be tracked and reminders sent automatically',
    'Agent exit interviews must be confidential and anonymized for analysis',
    'HR policy updates must be distributed to all employees within 24 hours',
    'Agent benefits enrollment must validate employee eligibility',
    'HR agent must escalate sensitive employee issues to human counselors',
    'Agent time-off requests must follow the approved leave hierarchy',
    'HR data retention must comply with employment record regulations',
    'Agent payroll queries must be restricted to authorized payroll administrators',
    'HR agent must not make employment termination decisions autonomously',
    'Agent recruitment outreach must follow equal opportunity guidelines',
    'HR agent training data must not include personally identifiable information',
    'Agent workplace safety reports must trigger immediate human review',
    'HR agent must support multiple languages for diverse workforce',
    'Agent employee directory access must follow role-based permissions',
    'HR agent must log all accesses to sensitive employee information',
    'Agent learning and development recommendations must be personalized',
    'HR agent must comply with diversity and inclusion policies',
    'Agent expense report processing must flag anomalies for human review',
    'HR agent must provide accurate and up-to-date policy information',
    'Agent organizational chart queries must respect visibility levels',
    'HR agent must not store employee biometric data without explicit consent',
    'Agent candidate communication must use approved templates only',
    'HR agent must integrate with the enterprise HRIS system securely',
    'Agent survey responses must be anonymized before analysis',
    'HR agent must support compliance with local labor laws per jurisdiction',
    'Agent travel request processing must follow corporate travel policy',
    'HR agent must not discriminate based on protected characteristics',
    'Agent performance improvement plan tracking must be confidential',
    'HR agent must provide accommodation for employees with disabilities',
    'Agent background check results must only be accessible to authorized HR staff',
    'HR agent must ensure compliance with overtime regulations',
    'Agent employee referral processing must be fair and transparent',
    'HR agent must maintain audit trails for all policy changes',
    'Agent immigration and visa tracking must comply with regulations',
    'HR agent must support collective bargaining agreement compliance',
    'Agent wellness program recommendations must respect employee privacy',
    'HR agent must ensure proper documentation for all personnel actions',
    'Agent grievance handling must follow the established escalation process',
  ],
  finance: [
    'Automated payments above $10,000 require dual approval',
    'Agent financial transactions must be logged with full audit trail',
    'Finance agent access must be restricted to authorized financial personnel',
    'Agent invoice processing must include three-way matching validation',
    'Financial data must be reconciled daily between agent systems and ERP',
    'Agent budget queries must not expose individual department details to unauthorized users',
    'Finance agent must comply with SOX control requirements',
    'Agent expense approvals must follow the organizational delegation matrix',
    'Financial reporting by agents must use GAAP-compliant calculations',
    'Agent revenue recognition must follow ASC 606 guidelines',
    'Finance agent must not authorize payments outside approved vendor list',
    'Agent tax calculations must be verified by a certified tax professional',
    'Financial data encryption must meet PCI-DSS requirements where applicable',
    'Agent forecasting models must include confidence intervals and assumptions',
    'Finance agent must flag duplicate payments for human review',
    'Agent currency conversion must use real-time exchange rate feeds',
    'Financial anomaly detection must trigger alerts within 15 minutes',
    'Agent procurement requests must follow competitive bidding requirements',
    'Finance agent must maintain segregation of duties in all workflows',
    'Agent financial close processes must be completed within the defined period',
    'Finance agent must support multi-currency and multi-entity accounting',
    'Agent payment scheduling must optimize for working capital efficiency',
    'Financial agent must comply with anti-money laundering regulations',
    'Agent cost center allocations must be reviewed and approved monthly',
    'Finance agent must generate audit-ready documentation for all transactions',
    'Agent cash flow forecasting must incorporate seasonal patterns',
    'Financial data access by agents must be logged and reviewable',
    'Agent intercompany transactions must be documented and reconciled',
    'Finance agent must validate vendor bank account changes through secondary channel',
    'Agent financial KPIs must be calculated consistently across all departments',
    'Finance agent must not process transactions with sanctioned entities',
    'Agent budget variance analysis must be performed weekly',
    'Financial agent must support real-time treasury position monitoring',
    'Agent contract terms must be validated against financial approval thresholds',
    'Finance agent must ensure compliance with revenue recognition policies',
    'Agent payroll processing must be validated before fund disbursement',
    'Financial agent must maintain records for the required statutory retention period',
    'Agent capital expenditure requests must include ROI analysis',
    'Finance agent must support audit trail reconstruction for any transaction',
    'Agent financial reporting must include variance explanations',
    'Financial agent must not modify closed accounting periods without approval',
    'Agent credit management must follow the established risk framework',
    'Finance agent must reconcile all bank statements within 3 business days',
    'Agent grant and fund accounting must comply with donor restrictions',
    'Financial agent must implement fraud detection rules on all transactions',
    'Agent financial data must be backed up with point-in-time recovery capability',
    'Finance agent must ensure tax compliance across all operating jurisdictions',
  ],
  legal: [
    'All agent interactions must be compliant with data protection regulations',
    'Legal hold notices must be applied to all relevant agent data within 4 hours',
    'Agent-generated contracts must be reviewed by a licensed attorney',
    'Legal agent must not provide legal advice to external parties',
    'Agent records must be preserved according to the litigation hold policy',
    'Legal agent must flag potential intellectual property issues in agent outputs',
    'Agent communications must include required legal disclaimers',
    'Legal agent must track regulatory changes affecting agent operations',
    'Agent data processing must comply with cross-border data transfer requirements',
    'Legal agent must maintain a registry of all agent-related legal obligations',
    'Agent terms of service must be reviewed by legal counsel annually',
    'Legal agent must ensure agent compliance with antitrust regulations',
    'Agent liability limitations must be clearly communicated to users',
    'Legal agent must review all agent-facing privacy policies',
    'Agent evidence preservation must follow forensic best practices',
    'Legal agent must track all agent-related contracts and agreements',
    'Agent trademark usage must be reviewed for proper attribution',
    'Legal agent must ensure compliance with consumer protection laws',
    'Agent incident documentation must support potential legal proceedings',
    'Legal agent must review agent outputs for potential defamation risks',
    'Agent data subject rights must be facilitated in compliance with GDPR',
    'Legal agent must maintain templates for common legal requests',
    'Agent whistleblower reports must be handled confidentially',
    'Legal agent must monitor agent compliance with export control regulations',
    'Agent content licensing must be verified before distribution',
    'Legal agent must track statute of limitations for agent-related claims',
    'Agent insurance coverage must be reviewed for AI liability protection',
    'Legal agent must ensure agent compliance with accessibility laws',
    'Agent contractual obligations must be tracked and fulfilled on time',
    'Legal agent must review all third-party agent integrations for legal risk',
    'Agent data breach response must follow the legal notification timeline',
    'Legal agent must maintain an up-to-date regulatory requirement matrix',
    'Agent employment law compliance must be verified across jurisdictions',
    'Legal agent must ensure proper record-keeping for regulatory audits',
    'Agent end-user license agreements must be reviewed by legal',
    'Legal agent must track changes in AI-specific regulations globally',
    'Agent security incident documentation must meet legal evidentiary standards',
    'Legal agent must review agent marketing materials for regulatory compliance',
    'Agent data sharing agreements must be current and legally binding',
    'Legal agent must ensure compliance with electronic signature requirements',
    'Agent dispute resolution processes must be documented and accessible',
    'Legal agent must monitor litigation trends affecting AI and automation',
    'Agent SLA commitments must be reviewed for legal enforceability',
    'Legal agent must maintain relationships with external legal counsel',
    'Agent open-source license compliance must be verified for all dependencies',
    'Legal agent must ensure agent compliance with industry-specific regulations',
    'Agent corporate governance documents must be accessible to legal team',
  ],
}

const ruleDescriptions: Record<string, string[]> = {
  governance: [
    'This rule ensures that all AI-driven decisions are fully documented with their reasoning chain, enabling transparent audit and accountability. Non-compliance may result in governance action and mandatory review.',
    'This policy mandates governance board review for any changes to agent policies, ensuring alignment with organizational strategy and risk tolerance. Changes must be submitted through the governance portal.',
    'Complex multi-agent workflows require clear orchestration authority to prevent conflicting actions and ensure coherent outcomes. The designated orchestrator has final decision authority.',
  ],
  security: [
    'Short-lived tokens significantly reduce the window of opportunity for token theft and replay attacks. All API endpoints must reject tokens issued more than 5 minutes ago.',
    'TLS 1.3 provides the strongest encryption and most secure handshake protocol available. All agent communications must use this standard without fallback to older versions.',
    'Multi-factor authentication prevents unauthorized access even when credentials are compromised. All agent authentication flows must verify at least two independent factors.',
  ],
  compliance: [
    'Regular review of data retention policies ensures alignment with evolving regulatory requirements and organizational needs. Reviews must include legal counsel and data stewards.',
    'GDPR compliance requires that all personal data processing follows the six core principles including lawfulness, purpose limitation, and data minimization. Agents must be configured accordingly.',
    'Semi-annual compliance audits provide regular assurance that agent operations meet regulatory requirements. Audit findings must be remediated within defined timelines.',
  ],
  operations: [
    'Manual approval checkpoints in automated workflows prevent cascading failures and ensure human oversight for critical decisions. Checkpoints must be defined at every stage transition.',
    'Blue-green deployment eliminates downtime and enables instant rollback if issues are detected. All agent deployments must maintain parallel environments with traffic switching capability.',
    'Updated runbooks ensure that operations teams have current procedures for handling agent incidents. Runbooks must be versioned and linked to specific agent versions.',
  ],
  ethics: [
    'Transparency about AI-generated content builds trust and allows users to make informed decisions about the content they consume. All agent outputs must include clear AI attribution.',
    'When AI decisions significantly impact human outcomes, affected individuals must have the right to appeal and request human review. The appeal process must be accessible and timely.',
    'High-impact agent deployments require ethical review to identify potential harms and ensure alignment with organizational values. Reviews must be documented and findings addressed.',
  ],
  data: [
    'Encryption of PII data both at rest and in transit protects sensitive information from unauthorized access. All PII must use AES-256 encryption with key management through the enterprise vault.',
    'Data classification labels enable appropriate handling and access controls for different sensitivity levels. All datasets accessible to agents must be classified before integration.',
    'Complete audit trails of data queries enable forensic analysis and compliance verification. Every agent query must log the requester, timestamp, data accessed, and purpose.',
  ],
  ai: [
    'Toxicity screening prevents harmful content from reaching end users through agent outputs. All model outputs must pass automated toxicity checks before delivery.',
    'Model versioning with full metadata enables reproducibility, debugging, and regulatory compliance. Every model version must document training data, hyperparameters, and evaluation metrics.',
    'Fairness evaluation ensures that AI models do not produce biased outcomes across demographic groups. Models must be tested for disparate impact before deployment.',
  ],
  hr: [
    'AI hiring recommendations are decision-support tools, not autonomous decision-makers. Every AI-generated hiring recommendation must include a mandatory human review step.',
    'Employee records contain highly sensitive information that must be protected. Agent access must be limited to authorized HR personnel with a legitimate business need.',
    'All HR-related agent interactions must comply with applicable labor regulations including working time directives, equal opportunity laws, and employee privacy protections.',
  ],
  finance: [
    'Dual approval for high-value payments provides a critical control against fraud and unauthorized transactions. Both approvers must independently verify the payment details.',
    'Complete audit trails for financial transactions enable regulatory compliance, fraud detection, and dispute resolution. Every agent-initiated transaction must be fully logged.',
    'Three-way matching validation prevents overpayments and fraud by verifying purchase orders, receiving reports, and invoices align before processing.',
  ],
  legal: [
    'Data protection regulations such as GDPR, CCPA, and sector-specific laws impose strict requirements on how agents handle personal data. Compliance must be verified continuously.',
    'Legal hold notices require immediate action to preserve all potentially relevant data. All agent data stores must be flagged within 4 hours of receiving a legal hold notice.',
    'AI-generated contracts may contain errors or omissions that could create legal liability. A licensed attorney must review all contracts before execution.',
  ],
}

// ─── B. SOP TITLES BY CATEGORY ───────────────────────────────────────────────

const sopCategories = [
  { name: 'onboarding', prefix: 'ONB' },
  { name: 'operations', prefix: 'OPR' },
  { name: 'security', prefix: 'SEC' },
  { name: 'incident', prefix: 'INC' },
  { name: 'deployment', prefix: 'DEP' },
  { name: 'compliance', prefix: 'CMP' },
  { name: 'communication', prefix: 'COM' },
  { name: 'quality', prefix: 'QAL' },
] as const

const sopTitlesByCategory: Record<string, string[]> = {
  onboarding: [
    'New Agent Onboarding Procedure', 'Department Agent Setup Procedure', 'Agent Permission Provisioning SOP',
    'New Agent Configuration Template SOP', 'Agent Knowledge Base Initialization Procedure', 'Agent Skill Assignment SOP',
    'Agent Integration Testing Onboarding Procedure', 'New Agent Welcome Workflow Setup SOP', 'Agent Documentation Handover Procedure',
    'Agent Environment Provisioning SOP', 'Agent Monitoring Setup Onboarding Procedure', 'Agent Team Introduction Workflow SOP',
    'Agent Security Credential Issuance Procedure', 'Agent Training Data Preparation SOP', 'Agent Stakeholder Notification Onboarding SOP',
    'Agent Role Assignment Procedure', 'Agent API Key Provisioning SOP', 'Agent Compliance Checklist Onboarding Procedure',
    'Agent Performance Baseline Establishment SOP', 'Agent Access Control Setup Procedure', 'Agent Notification Channel Configuration SOP',
    'Agent Data Source Connection Setup Procedure', 'Agent Integration Partner Onboarding SOP', 'Agent Quality Gate Setup Procedure',
    'Agent Backup Configuration Onboarding SOP', 'Agent Logging Infrastructure Setup SOP', 'Agent Feedback Loop Initialization SOP',
    'Agent SLA Definition Onboarding Procedure', 'Agent Escalation Path Setup SOP', 'Agent Knowledge Transfer Procedure',
    'Agent Testing Environment Setup SOP', 'Agent Network Access Provisioning SOP', 'Agent Security Training Onboarding SOP',
    'Agent Documentation Review Onboarding SOP', 'Agent Operational Readiness Checklist SOP', 'Agent Handoff Protocol Setup Procedure',
    'Agent Capacity Planning Onboarding SOP', 'Agent Vendor Integration Setup SOP', 'Agent Cross-Department Access Setup SOP',
    'Agent Cost Tracking Setup SOP', 'Agent Alert Threshold Configuration Procedure', 'Agent Dashboard Setup Onboarding SOP',
    'Agent Error Handling Configuration SOP', 'Agent Rollback Procedure Setup SOP', 'Agent Version Control Setup Procedure',
    'Agent Authentication Setup Procedure', 'Agent Compliance Training Assignment SOP', 'Agent Stakeholder Access Setup Procedure',
    'Agent Dependency Mapping Procedure', 'Agent Communication Protocol Setup SOP', 'Agent Operational Runbook Creation Procedure',
    'Agent Performance Monitoring Setup SOP', 'Agent Security Baseline Configuration Procedure', 'Agent Data Flow Documentation SOP',
    'Agent Integration Testing Schedule Setup SOP', 'Agent Maintenance Window Configuration Procedure', 'Agent Onboarding Review Meeting SOP',
    'Agent Post-Onboarding Validation Procedure', 'Agent Knowledge Base Verification SOP', 'Agent Operational Handoff Procedure',
    'Agent First 30 Days Monitoring SOP', 'Agent Feedback Collection Setup Procedure', 'Agent Onboarding Completion Sign-off SOP',
  ],
  operations: [
    'Daily System Health Check Procedure', 'Agent Performance Monitoring SOP', 'Infrastructure Scaling Procedure',
    'Agent Task Queue Management SOP', 'System Backup and Recovery Procedure', 'Agent Resource Allocation SOP',
    'Database Maintenance Procedure', 'Agent Log Rotation and Archival SOP', 'Network Connectivity Verification Procedure',
    'Agent Configuration Drift Detection SOP', 'System Capacity Review Procedure', 'Agent Workload Balancing SOP',
    'Scheduled Maintenance Execution Procedure', 'Agent Runtime Health Monitoring SOP', 'System Notification Management Procedure',
    'Agent Dependency Health Check SOP', 'Service Degradation Response Procedure', 'Agent Queue Overflow Management SOP',
    'System Resource Cleanup Procedure', 'Agent Session Management SOP', 'Operational Metric Collection Procedure',
    'Agent Performance Baseline Update SOP', 'System Inventory Reconciliation Procedure', 'Agent Integration Point Verification SOP',
    'Operational Alert Triage Procedure', 'Agent Auto-Scaling Trigger Review SOP', 'System Patch Management Procedure',
    'Agent Configuration Backup SOP', 'Operational Dashboard Update Procedure', 'Agent SLA Compliance Monitoring SOP',
    'System Certificate Renewal Procedure', 'Agent Cache Invalidation SOP', 'Operational Runbook Update Procedure',
    'Agent Health Score Calculation SOP', 'System Load Balancer Verification Procedure', 'Agent Connection Pool Management SOP',
    'Operational Standup Meeting Procedure', 'Agent Memory Usage Optimization SOP', 'System Disk Space Management Procedure',
    'Agent Throughput Monitoring SOP', 'Operational Change Request Procedure', 'Agent Timeout Configuration Review SOP',
    'System DNS Resolution Verification Procedure', 'Agent Batching Optimization SOP', 'Operational Cost Tracking Procedure',
    'Agent Parallel Processing Management SOP', 'System Firewall Rule Review Procedure', 'Agent Priority Queue Management SOP',
    'Operational Incident Prevention SOP', 'Agent Retry Logic Configuration SOP', 'System Time Synchronization Procedure',
    'Agent API Rate Limit Management SOP', 'Operational Weekly Review Procedure', 'Agent Graceful Shutdown Procedure',
    'System Service Discovery Verification SOP', 'Agent Warm-Up Procedure SOP', 'Operational Knowledge Base Update Procedure',
    'Agent Cold Start Optimization SOP', 'System Capacity Forecasting Procedure', 'Agent Operational Audit SOP',
    'Operational Efficiency Review SOP', 'Agent Dependency Update Procedure', 'System Architecture Review Procedure',
  ],
  security: [
    'Security Incident Response Procedure', 'Agent Authentication Verification SOP', 'Security Patch Deployment Procedure',
    'Agent Access Review Procedure', 'Security Vulnerability Scanning SOP', 'Agent Secret Rotation Procedure',
    'Security Log Analysis Procedure', 'Agent Encryption Key Management SOP', 'Security Penetration Testing SOP',
    'Agent Input Validation Verification Procedure', 'Security Configuration Audit SOP', 'Agent Network Traffic Monitoring Procedure',
    'Security Certificate Management SOP', 'Agent File Upload Security Check Procedure', 'Security Threat Intelligence Review SOP',
    'Agent Session Security Monitoring Procedure', 'Security Compliance Verification SOP', 'Agent API Security Testing Procedure',
    'Security Incident Escalation Procedure', 'Agent Data Leakage Prevention SOP', 'Security Access Revocation Procedure',
    'Agent Container Security Scan Procedure', 'Security Firewall Rule Update SOP', 'Agent Dependency Vulnerability Check Procedure',
    'Security Anomaly Detection Review SOP', 'Agent Webhook Security Verification Procedure', 'Security Password Policy Enforcement SOP',
    'Agent Rate Limiting Verification Procedure', 'Security Header Configuration Review SOP', 'Agent Output Sanitization Check Procedure',
    'Security Audit Trail Review Procedure', 'Agent Permission Cleanup SOP', 'Security Social Engineering Prevention SOP',
    'Agent Background Check Procedure', 'Security Code Review Procedure', 'Agent Supply Chain Security Verification SOP',
    'Security Incident Documentation SOP', 'Agent Environment Isolation Verification Procedure', 'Security Compliance Reporting SOP',
    'Agent Two-Factor Authentication Setup Procedure', 'Security Network Segmentation Review SOP', 'Agent Privilege Escalation Monitoring SOP',
    'Security Risk Assessment Procedure', 'Agent Data Classification Verification SOP', 'Security Incident Post-Mortem Procedure',
    'Agent Cross-Site Scripting Prevention SOP', 'Security Token Validation Review SOP', 'Agent SQL Injection Prevention SOP',
    'Security Endpoint Protection Update SOP', 'Agent CSRF Protection Verification Procedure', 'Security Identity Management Review SOP',
    'Agent Security Baseline Compliance SOP', 'Security DDoS Mitigation Procedure', 'Agent Content Security Policy Review SOP',
    'Security Data Masking Verification SOP', 'Agent Security Training Assignment SOP', 'Security Third-Party Risk Assessment SOP',
    'Agent Security Exception Request Procedure', 'Security Compliance Evidence Collection SOP', 'Agent Security Metrics Reporting SOP',
    'Security Access Certification Procedure', 'Agent Security Configuration Drift Detection SOP', 'Security Threat Modeling Procedure',
    'Agent Security Awareness Program SOP', 'Security Zero-Trust Verification SOP', 'Agent Security Incident Recovery SOP',
  ],
  incident: [
    'Critical System Failure Recovery SOP', 'Agent Unresponsive Incident Procedure', 'Data Breach Response SOP',
    'Agent Performance Degradation Response Procedure', 'Network Outage Recovery SOP', 'Agent Dependency Failure Response Procedure',
    'Database Failure Recovery SOP', 'Agent Cascade Failure Prevention SOP', 'Service Disruption Communication Procedure',
    'Agent Memory Leak Response Procedure', 'Infrastructure Failure Recovery SOP', 'Agent Timeout Spike Response Procedure',
    'Security Incident Containment SOP', 'Agent Error Rate Spike Response Procedure', 'Capacity Exhaustion Recovery SOP',
    'Agent Queue Backup Response Procedure', 'Integration Point Failure Recovery SOP', 'Agent Configuration Error Response Procedure',
    'Authentication Service Failure SOP', 'Agent Rate Limiting Incident Response Procedure', 'Data Corruption Recovery SOP',
    'Agent Deployment Rollback Procedure', 'External API Failure Response SOP', 'Agent Resource Starvation Response Procedure',
    'Disk Space Emergency Procedure', 'Agent Certificate Expiry Response Procedure', 'Network Partition Recovery SOP',
    'Agent Deadlock Resolution Procedure', 'Load Balancer Failure Recovery SOP', 'Agent Orphaned Process Cleanup Procedure',
    'DNS Resolution Failure Response SOP', 'Agent Stale Cache Incident Response Procedure', 'Firewall Block Incident Response SOP',
    'Agent Memory Overflow Response Procedure', 'Replication Lag Incident Response SOP', 'Agent Connection Pool Exhaustion Procedure',
    'Scheduled Downtime Incident SOP', 'Agent Permission Denied Incident Response Procedure', 'SSL Handshake Failure Response SOP',
    'Agent Infinite Loop Detection and Response SOP', 'Message Queue Failure Recovery SOP', 'Agent Timeout Chain Response Procedure',
    'Configuration Drift Incident Response SOP', 'Agent Batch Job Failure Response Procedure', 'Service Mesh Failure Recovery SOP',
    'Agent Resource Contention Resolution Procedure', 'API Gateway Failure Response SOP', 'Agent Concurrent Modification Response SOP',
    'Storage System Failure Recovery SOP', 'Agent Partial Failure Response Procedure', 'Cache Stampede Prevention and Response SOP',
    'Agent Health Check Failure Response Procedure', 'Network Latency Spike Response SOP', 'Agent Validation Error Surge Response Procedure',
    'Load Shedding Activation Procedure', 'Agent Backpressure Management SOP', 'Circuit Breaker Activation Response SOP',
    'Agent Fallback Activation Procedure', 'Graceful Degradation Activation SOP', 'Agent Bulkhead Isolation Procedure',
    'Retry Storm Prevention SOP', 'Agent Timeout Cascade Prevention SOP', 'Priority Inversion Resolution Procedure',
    'Agent Resource Leak Detection SOP', 'Hotfix Deployment Emergency Procedure', 'Agent State Inconsistency Resolution SOP',
  ],
  deployment: [
    'Production Deployment Verification SOP', 'Agent Version Upgrade Procedure', 'Blue-Green Deployment Execution SOP',
    'Canary Release Procedure', 'Agent Database Migration Deployment SOP', 'Rollback Execution Procedure',
    'Deployment Pre-Checklist Procedure', 'Agent Configuration Deployment SOP', 'Staging Environment Validation SOP',
    'Agent Feature Flag Deployment Procedure', 'Deployment Notification SOP', 'Agent Infrastructure Provisioning Procedure',
    'Deployment Smoke Test Procedure', 'Agent API Version Deployment SOP', 'Production Health Verification Post-Deploy SOP',
    'Agent Dependency Update Deployment Procedure', 'Deployment Approval Workflow SOP', 'Agent Secret Deployment Procedure',
    'Deployment Rollback Verification SOP', 'Agent Schema Migration Deployment SOP', 'Deployment Window Management SOP',
    'Agent Load Balancer Configuration Deployment SOP', 'Deployment Conflict Resolution SOP', 'Agent Certificate Deployment Procedure',
    'Deployment Documentation Update SOP', 'Agent Monitoring Update Post-Deploy SOP', 'Deployment Access Control Procedure',
    'Agent Cache Clearing Post-Deploy SOP', 'Deployment Notification to Stakeholders SOP', 'Agent CDN Invalidation Post-Deploy SOP',
    'Deployment Pipeline Execution SOP', 'Agent Environment Variable Deployment SOP', 'Deployment Security Scan Procedure',
    'Agent Integration Test Post-Deploy SOP', 'Deployment Performance Benchmark SOP', 'Agent DNS Update Deployment Procedure',
    'Deployment Database Backup Pre-Check SOP', 'Agent Service Mesh Update Deployment SOP', 'Deployment Approval Gate Procedure',
    'Agent Webhook Configuration Deployment SOP', 'Deployment Queue Drain Procedure', 'Agent Scheduled Task Deployment SOP',
    'Deployment Artifact Storage Procedure', 'Agent Rate Limit Configuration Deployment SOP', 'Deployment Traffic Routing SOP',
    'Agent Retry Policy Deployment SOP', 'Deployment Compatibility Check SOP', 'Agent Timeout Configuration Deployment SOP',
    'Deployment Rollback Communication SOP', 'Agent Circuit Breaker Configuration Deployment SOP', 'Deployment Validation Gate SOP',
    'Agent Logging Level Deployment SOP', 'Deployment Feature Toggle Activation SOP', 'Agent Alert Threshold Deployment SOP',
    'Deployment Post-Mortem Procedure', 'Agent SLA Verification Post-Deploy SOP', 'Deployment Schedule Management SOP',
    'Agent Capacity Planning Post-Deploy SOP', 'Deployment Risk Assessment Procedure', 'Agent Cache Warming Post-Deploy SOP',
    'Deployment Success Criteria Verification SOP', 'Agent Monitoring Alert Post-Deploy SOP', 'Deployment Documentation Archival SOP',
    'Agent User Notification Post-Deploy SOP', 'Deployment Metrics Collection SOP', 'Agent Regression Test Post-Deploy SOP',
    'Deployment Environment Sync Procedure', 'Agent Configuration Verification Post-Deploy SOP', 'Deployment Rollback Readiness Check SOP',
  ],
  compliance: [
    'Quarterly Compliance Audit SOP', 'GDPR Data Processing Audit Procedure', 'Agent Compliance Checklist Review SOP',
    'Regulatory Change Impact Assessment SOP', 'Agent Data Retention Compliance Check Procedure', 'Compliance Reporting Procedure',
    'Agent Privacy Impact Assessment SOP', 'Compliance Training Verification SOP', 'Agent Consent Management Audit Procedure',
    'Compliance Exception Management SOP', 'Agent Data Subject Access Request Procedure', 'Compliance Risk Assessment SOP',
    'Agent Third-Party Compliance Verification Procedure', 'Compliance Documentation Update SOP', 'Agent Cross-Border Data Transfer Check SOP',
    'Compliance Certification Renewal SOP', 'Agent Accessibility Compliance Check Procedure', 'Compliance Incident Response SOP',
    'Agent Financial Compliance Verification SOP', 'Compliance Audit Evidence Collection SOP', 'Agent Security Compliance Review SOP',
    'Compliance Policy Distribution Procedure', 'Agent Contract Compliance Verification SOP', 'Compliance Monitoring Dashboard Review SOP',
    'Agent HR Compliance Check Procedure', 'Compliance Self-Assessment SOP', 'Agent Environmental Compliance Verification SOP',
    'Compliance Stakeholder Reporting SOP', 'Agent Marketing Compliance Review Procedure', 'Compliance Vendor Assessment SOP',
    'Agent Health Data Compliance Check Procedure', 'Compliance Record Retention Review SOP', 'Agent Consumer Protection Compliance SOP',
    'Compliance Regulatory Filing Procedure', 'Agent Intellectual Property Compliance SOP', 'Compliance Audit Preparation Checklist SOP',
    'Agent Export Control Compliance Check SOP', 'Compliance Training Material Update SOP', 'Agent Anti-Corruption Compliance Procedure',
    'Compliance Data Mapping Procedure', 'Agent Competition Law Compliance SOP', 'Compliance Internal Control Review SOP',
    'Agent Whistleblower Protection Procedure', 'Compliance External Audit Support SOP', 'Agent Data Breach Notification Procedure',
    'Compliance Policy Exception Request SOP', 'Agent Sanctions Screening Procedure', 'Compliance Board Reporting SOP',
    'Agent Insurance Compliance Verification SOP', 'Compliance Technology Assessment SOP', 'Agent Tax Compliance Review Procedure',
    'Compliance Maturity Assessment SOP', 'Agent Labor Law Compliance Check Procedure', 'Compliance Continuous Monitoring SOP',
    'Agent Product Safety Compliance Procedure', 'Compliance Remediation Tracking SOP', 'Agent Financial Reporting Compliance SOP',
    'Compliance Benchmark Review SOP', 'Agent Supply Chain Compliance Verification SOP', 'Compliance Governance Review SOP',
    'Agent Ethics Compliance Check Procedure', 'Compliance Regulatory Mapping SOP', 'Agent Data Governance Compliance SOP',
    'Compliance Third-Party Risk Review SOP', 'Agent Sustainability Compliance Procedure', 'Compliance Framework Update SOP',
    'Agent Industry Standard Compliance SOP', 'Compliance Effectiveness Review SOP', 'Agent Privacy by Design Verification SOP',
  ],
  communication: [
    'Stakeholder Notification SOP', 'Incident Communication Procedure', 'Agent Status Update Communication SOP',
    'Weekly Team Report Procedure', 'Agent Deployment Communication SOP', 'Cross-Department Communication SOP',
    'Agent Incident Alert Communication Procedure', 'Executive Summary Report SOP', 'Agent Performance Report Communication SOP',
    'System Maintenance Notification Procedure', 'Agent Change Communication SOP', 'Customer Communication Procedure',
    'Agent Escalation Communication SOP', 'Internal Newsletter Distribution SOP', 'Agent Knowledge Sharing Communication SOP',
    'Post-Incident Communication SOP', 'Agent Milestone Communication Procedure', 'Compliance Communication SOP',
    'Agent Feedback Communication SOP', 'All-Hands Meeting Preparation Procedure', 'Agent Health Status Communication SOP',
    'Vendor Communication Procedure', 'Agent Release Notes Communication SOP', 'Security Alert Communication SOP',
    'Agent Training Communication SOP', 'Board Reporting Communication SOP', 'Agent Integration Communication SOP',
    'Crisis Communication Procedure', 'Agent Success Story Communication SOP', 'Project Status Communication SOP',
    'Agent Schedule Change Communication SOP', 'Budget Communication Procedure', 'Agent KPI Report Communication SOP',
    'Stakeholder Meeting Preparation SOP', 'Agent Onboarding Communication Procedure', 'Policy Update Communication SOP',
    'Agent Issue Communication SOP', 'Press Release Review Procedure', 'Agent Capacity Alert Communication SOP',
    'Team Transition Communication SOP', 'Agent Decommission Communication SOP', 'Regulatory Communication Procedure',
    'Agent Partnership Communication SOP', 'Quarterly Business Review Communication SOP', 'Agent Innovation Communication SOP',
    'Employee Communication Procedure', 'Agent Risk Communication SOP', 'Technology Update Communication SOP',
    'Agent Vendor Update Communication SOP', 'Operational Update Communication SOP', 'Agent Compliance Alert Communication SOP',
    'Strategic Communication Procedure', 'Agent Customer Feedback Communication SOP', 'Change Management Communication SOP',
    'Agent Learning Communication SOP', 'Financial Communication Procedure', 'Agent Roadmap Communication SOP',
    'External Communication Review SOP', 'Agent Community Communication SOP', 'Anniversary and Milestone Communication SOP',
    'Agent Support Communication SOP', 'Knowledge Base Update Communication SOP', 'Agent Recognition Communication SOP',
    'Emergency Communication Procedure', 'Agent Data Breach Communication SOP', 'Stakeholder Feedback Collection SOP',
    'Agent Success Metric Communication SOP', 'Cross-Functional Communication SOP', 'Agent Rebranding Communication SOP',
  ],
  quality: [
    'Code Quality Review SOP', 'Agent Output Quality Assessment SOP', 'Data Quality Verification Procedure',
    'Agent Response Quality Scoring SOP', 'Documentation Quality Review SOP', 'Agent Accuracy Verification Procedure',
    'Quality Gate Check Before Release SOP', 'Agent Consistency Check Procedure', 'Quality Metric Collection and Reporting SOP',
    'Agent Relevance Scoring Procedure', 'Quality Audit Procedure', 'Agent Completeness Verification SOP',
    'Quality Improvement Plan SOP', 'Agent Timeliness Check Procedure', 'Quality Baseline Establishment SOP',
    'Agent Formatting Verification Procedure', 'Quality Regression Testing SOP', 'Agent Grammar and Style Check Procedure',
    'Quality Root Cause Analysis SOP', 'Agent Factual Accuracy Verification Procedure', 'Quality Peer Review SOP',
    'Agent User Satisfaction Measurement SOP', 'Quality Control Checklist SOP', 'Agent Error Rate Monitoring Procedure',
    'Quality Standard Compliance Check SOP', 'Agent Response Time Quality Check Procedure', 'Quality Benchmark Update SOP',
    'Agent Hallucination Detection Procedure', 'Quality Assurance Planning SOP', 'Agent Toxicity Screening Procedure',
    'Quality Non-Conformance Report SOP', 'Agent Bias Detection Quality Check Procedure', 'Quality Corrective Action SOP',
    'Agent Readability Scoring Procedure', 'Quality Review Meeting SOP', 'Agent Completeness Scoring SOP',
    'Quality Trend Analysis SOP', 'Agent Coherence Check Procedure', 'Quality Escalation Procedure',
    'Agent Redundancy Check Procedure', 'Quality Feedback Loop SOP', 'Agent Plagiarism Check Procedure',
    'Quality Training Material Review SOP', 'Agent Context Relevance Verification SOP', 'Quality Document Control SOP',
    'Agent Tone and Style Consistency Check SOP', 'Quality Risk Assessment SOP', 'Agent Technical Accuracy Verification Procedure',
    'Quality Improvement Tracking SOP', 'Agent User Feedback Integration Procedure', 'Quality Standard Update SOP',
    'Agent Multilingual Quality Check Procedure', 'Quality Cost Analysis SOP', 'Agent Accessibility Quality Check Procedure',
    'Quality Compliance Audit SOP', 'Agent Security Quality Verification Procedure', 'Quality Performance Report SOP',
    'Agent Scalability Quality Check Procedure', 'Quality Acceptance Criteria SOP', 'Agent Integration Quality Verification Procedure',
    'Quality Defect Classification SOP', 'Agent Reliability Quality Check Procedure', 'Quality Continuous Improvement SOP',
    'Agent Maintainability Quality Check Procedure', 'Quality Review Turnaround SOP', 'Agent Portability Quality Check Procedure',
    'Quality KPI Dashboard Update SOP', 'Agent Efficiency Quality Check Procedure', 'Quality Maturity Assessment SOP',
    'Agent Interoperability Quality Check Procedure', 'Quality Review Scheduling SOP', 'Agent Privacy Quality Check Procedure',
    'Quality Knowledge Base Update SOP', 'Agent Ethical Quality Check Procedure', 'Quality Audit Preparation SOP',
    'Agent Transparency Quality Check Procedure', 'Quality Stakeholder Communication SOP', 'Agent Accountability Quality Check SOP',
    'Quality Process Optimization SOP',
  ],
}

// ─── C. PROMPT TEMPLATE DATA ──────────────────────────────────────────────────

const promptCategories = [
  { name: 'analysis', prefix: 'ANL' },
  { name: 'generation', prefix: 'GEN' },
  { name: 'coding', prefix: 'COD' },
  { name: 'writing', prefix: 'WRT' },
  { name: 'research', prefix: 'RSC' },
  { name: 'planning', prefix: 'PLN' },
  { name: 'review', prefix: 'REV' },
  { name: 'optimization', prefix: 'OPT' },
  { name: 'communication', prefix: 'CMN' },
  { name: 'creative', prefix: 'CRT' },
] as const

const promptTitlesByCategory: Record<string, string[]> = {
  analysis: [
    'Data Analysis Report', 'Trend Analysis', 'Sentiment Analysis', 'Performance Metrics Review', 'Cost-Benefit Analysis',
    'Risk Assessment', 'Gap Analysis', 'SWOT Analysis', 'Competitive Analysis', 'Root Cause Analysis',
    'Financial Statement Analysis', 'Market Segmentation Analysis', 'Customer Behavior Analysis', 'Sales Pipeline Analysis',
    'Operational Efficiency Analysis', 'Vulnerability Assessment', 'Compliance Gap Analysis', 'Workload Analysis',
    'Resource Utilization Analysis', 'Agent Performance Analysis', 'Error Pattern Analysis', 'User Journey Analysis',
    'Revenue Trend Analysis', 'Churn Analysis', 'Conversion Funnel Analysis', 'Quality Metrics Analysis',
    'Security Posture Analysis', 'Capacity Planning Analysis', 'Cost Allocation Analysis', 'Stakeholder Impact Analysis',
    'Process Bottleneck Analysis', 'Data Quality Analysis', 'Agent Decision Analysis', 'Incident Trend Analysis',
    'Budget Variance Analysis', 'Compliance Status Analysis', 'Knowledge Base Analysis', 'Agent Interaction Analysis',
    'System Performance Analysis', 'Customer Satisfaction Analysis', 'Team Productivity Analysis', 'Inventory Analysis',
    'Supply Chain Analysis', 'Vendor Performance Analysis', 'Agent Utilization Analysis', 'Technology Stack Analysis',
    'Regulatory Impact Analysis', 'Workforce Analysis', 'Agent Behavior Analysis', 'Service Level Analysis',
  ],
  generation: [
    'Content Generator', 'Code Generator', 'Report Generator', 'Email Generator', 'Summary Generator',
    'Documentation Generator', 'Test Case Generator', 'Proposal Generator', 'Presentation Generator', 'FAQ Generator',
    'Product Description Generator', 'Social Media Post Generator', 'Meeting Agenda Generator', 'Invoice Generator',
    'Job Description Generator', 'Press Release Generator', 'Newsletter Generator', 'Contract Generator',
    'SOP Generator', 'Checklist Generator', 'API Documentation Generator', 'User Story Generator',
    'Requirement Generator', 'Budget Report Generator', 'Performance Review Generator', 'Risk Report Generator',
    'Compliance Report Generator', 'Agent Configuration Generator', 'Database Schema Generator', 'Migration Script Generator',
    'Test Data Generator', 'Mock API Response Generator', 'Configuration File Generator', 'Deployment Manifest Generator',
    'Alert Rule Generator', 'Dashboard Layout Generator', 'Query Generator', 'Notification Template Generator',
    'Workflow Definition Generator', 'Permission Matrix Generator', 'SLA Definition Generator', 'Escalation Rule Generator',
    'KPI Definition Generator', 'Health Check Generator', 'Backup Script Generator', 'Monitoring Rule Generator',
    'Access Control Policy Generator', 'Data Classification Rule Generator', 'Incident Report Generator',
  ],
  coding: [
    'Code Review', 'Bug Fix', 'Refactoring', 'API Design', 'Database Query', 'Unit Test',
    'Integration Test', 'Error Handler', 'Middleware', 'Authentication Module', 'Rate Limiter',
    'Caching Layer', 'Queue Consumer', 'Webhook Handler', 'Data Validator', 'Schema Migration',
    'API Client', 'Logger Utility', 'Config Loader', 'Health Check Endpoint', 'File Uploader',
    'Search Indexer', 'Email Sender', 'Notification Service', 'Task Scheduler', 'Event Emitter',
    'Retry Logic', 'Circuit Breaker', 'Bulk Processor', 'Data Transformer', 'CSV Parser',
    'JWT Handler', 'Permission Checker', 'Role Manager', 'Session Store', 'Password Hasher',
    'Input Sanitizer', 'Output Formatter', 'Response Builder', 'Pagination Helper', 'Filter Builder',
    'Sort Utility', 'Date Formatter', 'Number Formatter', 'Slug Generator', 'UUID Generator',
    'Retry Handler', 'Timeout Manager', 'Connection Pool', 'Stream Processor', 'Batch Runner',
  ],
  writing: [
    'Blog Post', 'Technical Doc', 'User Guide', 'API Documentation', 'Proposal',
    'Executive Summary', 'Case Study', 'White Paper', 'How-To Guide', 'Tutorial',
    'Release Notes', 'Knowledge Base Article', 'Onboarding Guide', 'Troubleshooting Guide', 'Architecture Decision Record',
    'Runbook', 'Playbook', 'Best Practices Guide', 'Style Guide', 'Code Comment Generator',
    'README Generator', 'Changelog', 'Migration Guide', 'Feature Specification', 'User Manual',
    'Quick Start Guide', 'FAQ Document', 'Policy Document', 'Process Description', 'Training Material',
    'Assessment Criteria', 'Scoring Rubric', 'Evaluation Report', 'Audit Report', 'Compliance Document',
    'Legal Disclaimer', 'Terms of Service', 'Privacy Policy', 'Cookie Policy', 'SLA Document',
    'Incident Report Template', 'Post-Mortem Template', 'Meeting Minutes', 'Decision Log', 'Requirement Document',
    'Design Document', 'System Overview', 'Integration Guide', 'Configuration Reference', 'Troubleshooting Steps',
    'Optimization Guide', 'Performance Report', 'Capacity Planning Doc', 'Disaster Recovery Plan', 'Business Continuity Plan',
    'Vendor Assessment', 'Technology Evaluation', 'Cost Analysis Report', 'ROI Analysis', 'Risk Assessment Document',
  ],
  research: [
    'Market Research', 'Literature Review', 'Competitive Intelligence', 'Technology Assessment',
    'Industry Analysis', 'Customer Research', 'Product Research', 'Regulatory Research',
    'Best Practice Research', 'Benchmarking Study', 'User Experience Research', 'Trend Forecasting',
    'Threat Intelligence', 'Compliance Research', 'Vendor Evaluation', 'Framework Comparison',
    'Tool Evaluation', 'Methodology Research', 'Data Source Assessment', 'Patent Research',
    'Academic Literature Review', 'Standards Research', 'Regulatory Change Research', 'Market Entry Research',
    'Supply Chain Research', 'Competitor Product Analysis', 'Technology Stack Research', 'AI Model Comparison',
    'Cloud Provider Comparison', 'Security Standard Research', 'Privacy Law Research', 'Accessibility Standard Research',
    'Performance Benchmark Research', 'Cost Optimization Research', 'Scalability Research', 'Integration Pattern Research',
    'Data Architecture Research', 'Deployment Strategy Research', 'Monitoring Tool Research', 'Incident Management Research',
    'Change Management Research', 'Knowledge Management Research', 'Collaboration Tool Research', 'Automation Opportunity Research',
    'Process Mining Research', 'Workflow Analysis Research', 'Agent Capability Research', 'Skill Gap Research',
    'Training Need Research', 'Capacity Planning Research', 'Vendor Risk Research', 'Business Continuity Research',
  ],
  planning: [
    'Project Plan', 'Sprint Plan', 'Release Plan', 'Migration Plan', 'Capacity Plan',
    'Budget Plan', 'Resource Plan', 'Training Plan', 'Onboarding Plan', 'Rollout Plan',
    'Disaster Recovery Plan', 'Business Continuity Plan', 'Succession Plan', 'Expansion Plan', 'Consolidation Plan',
    'Technology Roadmap', 'Product Roadmap', 'Feature Roadmap', 'Integration Plan', 'Decommission Plan',
    'Upgrade Plan', 'Patch Plan', 'Maintenance Plan', 'Backup Plan', 'Testing Plan',
    'Deployment Plan', 'Rollback Plan', 'Contingency Plan', 'Communication Plan', 'Change Management Plan',
    'Quality Plan', 'Risk Mitigation Plan', 'Vendor Management Plan', 'Procurement Plan', 'Hiring Plan',
    'Retention Plan', 'Performance Improvement Plan', 'Compliance Improvement Plan', 'Security Improvement Plan',
    'Architecture Plan', 'Infrastructure Plan', 'Network Plan', 'Storage Plan', 'Database Plan',
    'API Design Plan', 'Monitoring Plan', 'Alerting Plan', 'Incident Response Plan', 'Escalation Plan',
    'Knowledge Transfer Plan', 'Transition Plan', 'Phase-Out Plan', 'Cost Reduction Plan', 'Efficiency Plan',
  ],
  review: [
    'Code Review', 'Document Review', 'Security Review', 'Performance Review', 'Design Review',
    'Architecture Review', 'API Review', 'Database Review', 'Configuration Review', 'Compliance Review',
    'Process Review', 'Policy Review', 'Contract Review', 'Proposal Review', 'Budget Review',
    'Risk Review', 'Quality Review', 'Accessibility Review', 'Usability Review', 'Content Review',
    'Test Plan Review', 'Release Review', 'Incident Review', 'Change Review', 'Access Review',
    'Vendor Review', 'SLA Review', 'Capacity Review', 'Cost Review', 'Security Audit Review',
    'Data Classification Review', 'Privacy Review', 'Ethics Review', 'Sustainability Review',
    'Integration Review', 'Dependency Review', 'License Review', 'Compatibility Review', 'Migration Review',
    'Deployment Review', 'Monitoring Review', 'Alert Review', 'Runbook Review', 'Playbook Review',
    'Training Material Review', 'Documentation Review', 'Onboarding Review', 'Offboarding Review',
    'Knowledge Base Review', 'FAQ Review', 'Template Review', 'Workflow Review', 'Automation Review',
    'Agent Configuration Review', 'Agent Performance Review', 'Agent Behavior Review', 'Agent Output Review',
    'Agent Security Review', 'Agent Compliance Review', 'Agent Quality Review', 'Agent Efficiency Review',
  ],
  optimization: [
    'Performance Optimization', 'Cost Optimization', 'Resource Optimization', 'Process Optimization',
    'Query Optimization', 'Code Optimization', 'Database Optimization', 'Network Optimization', 'Storage Optimization',
    'Memory Optimization', 'CPU Optimization', 'Cache Optimization', 'Image Optimization', 'Bundle Optimization',
    'Load Optimization', 'Concurrency Optimization', 'Throughput Optimization', 'Latency Optimization', 'Scalability Optimization',
    'Reliability Optimization', 'Availability Optimization', 'Efficiency Optimization', 'Productivity Optimization',
    'Workflow Optimization', 'Pipeline Optimization', 'Build Optimization', 'Deploy Optimization', 'Test Optimization',
    'Monitoring Optimization', 'Alert Optimization', 'Logging Optimization', 'Security Optimization',
    'Configuration Optimization', 'Routing Optimization', 'Load Balancing Optimization', 'Connection Pool Optimization',
    'Batch Size Optimization', 'Retry Policy Optimization', 'Timeout Optimization', 'Circuit Breaker Optimization',
    'Rate Limit Optimization', 'Queue Optimization', 'Worker Pool Optimization', 'Thread Pool Optimization',
    'Index Optimization', 'Schema Optimization', 'Partition Optimization', 'Shard Optimization', 'Replication Optimization',
    'Backup Optimization', 'Recovery Optimization', 'Failover Optimization', 'Rollback Optimization',
    'Agent Prompt Optimization', 'Agent Context Optimization', 'Agent Token Optimization', 'Agent Response Optimization',
  ],
  communication: [
    'Stakeholder Update', 'Status Report', 'Meeting Summary', 'Announcement', 'Alert',
    'Notification', 'Reminder', 'Escalation', 'De-escalation', 'Acknowledgment',
    'Status Page Update', 'Incident Update', 'Maintenance Notification', 'Release Announcement', 'Feature Announcement',
    'Policy Update', 'Process Change', 'Schedule Change', 'Resource Update', 'Budget Update',
    'Risk Alert', 'Compliance Alert', 'Security Advisory', 'Performance Alert', 'Capacity Alert',
    'Welcome Message', 'Onboarding Email', 'Offboarding Notice', 'Handoff Note', 'Transition Brief',
    'Weekly Digest', 'Monthly Report', 'Quarterly Review', 'Annual Summary', 'Executive Brief',
    'Technical Summary', 'User Communication', 'Customer Update', 'Vendor Communication', 'Partner Update',
    'Team Update', 'Department Update', 'Organization Update', 'Board Update', 'Investor Update',
    'Public Statement', 'Press Response', 'FAQ Update', 'Knowledge Update', 'Training Announcement',
    'Event Invitation', 'Webinar Reminder', 'Workshop Announcement', 'Conference Summary', 'Feedback Request',
    'Survey Invitation', 'Satisfaction Check', 'Follow-Up', 'Thank You Note', 'Apology Message',
  ],
  creative: [
    'Brainstorm Ideas', 'Creative Brief', 'Marketing Copy', 'Social Media Post', 'Brand Story',
    'Product Description', 'Ad Copy', 'Email Campaign', 'Landing Page Copy', 'Slogan Generator',
    'Tagline Creator', 'Mission Statement', 'Vision Statement', 'Value Proposition', 'Elevator Pitch',
    'Campaign Theme', 'Event Concept', 'Content Calendar', 'Story Outline', 'Character Description',
    'Scene Description', 'Dialogue Generator', 'Narrative Arc', 'Plot Twist Idea', 'World Building',
    'Product Name', 'Feature Name', 'Project Codename', 'Initiative Title', 'Program Name',
    'Award Nomination', 'Recognition Message', 'Celebration Post', 'Milestone Description', 'Achievement Summary',
    'Innovation Idea', 'Disruption Concept', 'Trend Prediction', 'Future Vision', 'Thought Leadership',
    'Case Study Narrative', 'Success Story', 'Customer Testimonial', 'Partner Spotlight', 'Team Highlight',
    'Culture Description', 'Value Story', 'Impact Narrative', 'Change Story', 'Transformation Journey',
    'Metaphor Generator', 'Analogy Creator', 'Comparison Framework', 'Visualization Concept', 'Infographic Idea',
    'Video Script Outline', 'Podcast Episode Plan', 'Newsletter Theme', 'Blog Series Concept', 'Content Pillar',
    'Thought Experiment', 'What-If Scenario', 'Hypothetical Analysis', 'Creative Constraint', 'Design Challenge',
  ],
}

const promptSubcategories: Record<string, string[]> = {
  analysis: ['data', 'trend', 'sentiment', 'performance', 'risk', 'financial', 'market', 'competitive', 'operational', 'compliance'],
  generation: ['content', 'code', 'report', 'email', 'documentation', 'test', 'configuration', 'template', 'structure', 'data'],
  coding: ['backend', 'frontend', 'database', 'api', 'security', 'testing', 'utility', 'middleware', 'integration', 'devops'],
  writing: ['technical', 'business', 'user-facing', 'internal', 'legal', 'compliance', 'marketing', 'educational', 'reference', 'operational'],
  research: ['market', 'technology', 'competitive', 'regulatory', 'academic', 'industry', 'user', 'vendor', 'framework', 'methodology'],
  planning: ['project', 'release', 'migration', 'capacity', 'budget', 'resource', 'risk', 'technology', 'process', 'contingency'],
  review: ['code', 'security', 'performance', 'design', 'architecture', 'compliance', 'documentation', 'process', 'configuration', 'access'],
  optimization: ['performance', 'cost', 'resource', 'query', 'code', 'workflow', 'infrastructure', 'configuration', 'memory', 'network'],
  communication: ['status', 'alert', 'announcement', 'report', 'notification', 'escalation', 'update', 'reminder', 'stakeholder', 'team'],
  creative: ['brainstorm', 'copywriting', 'naming', 'storytelling', 'branding', 'campaign', 'content', 'ideation', 'vision', 'narrative'],
}

const outputFormats = ['text', 'json', 'markdown', 'code', 'structured'] as const

const systemPromptTemplates: Record<string, string[]> = {
  analysis: [
    'You are a data analysis expert. Analyze the provided data and extract key insights.',
    'You are a business analyst. Provide thorough analysis with actionable recommendations.',
    'You are a risk analyst. Identify potential risks and assess their impact and likelihood.',
  ],
  generation: [
    'You are a content generation specialist. Create high-quality, relevant content.',
    'You are a technical writer. Generate clear, accurate technical documentation.',
    'You are a creative generator. Produce original and engaging content.',
  ],
  coding: [
    'You are a senior software engineer. Write clean, efficient, well-documented code.',
    'You are a full-stack developer. Generate production-ready code with best practices.',
    'You are a DevOps engineer. Create reliable infrastructure and deployment code.',
  ],
  writing: [
    'You are a professional writer. Create clear, concise, and well-structured documents.',
    'You are a technical communicator. Translate complex concepts into accessible language.',
    'You are a business writer. Produce professional documents with clear messaging.',
  ],
  research: [
    'You are a research analyst. Conduct thorough research and present findings clearly.',
    'You are a market researcher. Analyze market trends and competitive landscape.',
    'You are a technology researcher. Evaluate technologies and provide recommendations.',
  ],
  planning: [
    'You are a project planner. Create detailed, actionable plans with clear milestones.',
    'You are a strategic planner. Develop comprehensive plans aligned with business goals.',
    'You are an operations planner. Design efficient processes and resource allocation.',
  ],
  review: [
    'You are a code reviewer. Identify issues, suggest improvements, and ensure quality.',
    'You are a quality reviewer. Evaluate content for accuracy, completeness, and quality.',
    'You are a security reviewer. Identify vulnerabilities and recommend mitigations.',
  ],
  optimization: [
    'You are a performance optimization expert. Identify bottlenecks and suggest improvements.',
    'You are a cost optimization specialist. Find opportunities to reduce costs efficiently.',
    'You are a process optimization expert. Streamline workflows and improve efficiency.',
  ],
  communication: [
    'You are a communication specialist. Draft clear, professional messages for the audience.',
    'You are a corporate communicator. Create appropriate messages for business contexts.',
    'You are a technical communicator. Explain technical topics clearly to stakeholders.',
  ],
  creative: [
    'You are a creative strategist. Generate innovative ideas and compelling narratives.',
    'You are a brand storyteller. Create engaging brand narratives and messaging.',
    'You are a content creative. Produce fresh, original creative concepts.',
  ],
}

// ─── D. KNOWLEDGE GRAPH DATA ──────────────────────────────────────────────────

const nodeTypes = ['concept', 'entity', 'process', 'rule', 'skill', 'tool', 'document', 'person', 'department'] as const
const nodeDomains = ['enterprise', 'technology', 'operations', 'finance', 'hr', 'legal', 'security', 'ai', 'data', 'compliance'] as const
const edgeRelationTypes = ['depends_on', 'part_of', 'related_to', 'implements', 'requires', 'produces', 'governs'] as const

const nodeTitlesByType: Record<string, string[]> = {
  concept: [
    'Microservices Architecture', 'Event-Driven Design', 'Domain-Driven Design', 'Zero Trust Security',
    'Continuous Delivery', 'Infrastructure as Code', 'Observability', 'Site Reliability Engineering',
    'ChatOps', 'AIOps', 'MLOps', 'DataOps', 'GitOps', 'DevSecOps', 'BizDevOps',
    'Platform Engineering', 'SRE Practices', 'Chaos Engineering', 'API-First Design', 'Headless CMS',
    'Serverless Computing', 'Edge Computing', 'Stream Processing', 'CQRS Pattern', 'Event Sourcing',
    'Circuit Breaker Pattern', 'Saga Pattern', 'Bulkhead Pattern', 'Strangler Fig Pattern', 'Sidecar Pattern',
    'Ambassador Pattern', 'Backend for Frontend', 'Twelve-Factor App', 'Immutable Infrastructure', 'Blue-Green Deployment',
    'Canary Release', 'Feature Flags', 'Progressive Delivery', 'Shift-Left Testing', 'Test-Driven Development',
    'Behavior-Driven Development', 'Acceptance Test-Driven', 'Specification by Example', 'Lean Startup', 'Agile Methodology',
    'Scrum Framework', 'Kanban System', 'Value Stream Mapping', 'Theory of Constraints', 'Lean Thinking',
  ],
  entity: [
    'Agent Runtime Environment', 'Knowledge Graph Store', 'Vector Database', 'Message Queue',
    'API Gateway', 'Load Balancer', 'Container Orchestrator', 'Service Mesh',
    'Identity Provider', 'Secret Manager', 'Configuration Server', 'Service Registry',
    'Monitoring Stack', 'Log Aggregator', 'Alert Manager', 'Metric Collector',
    'CI/CD Pipeline', 'Artifact Repository', 'Image Registry', 'Helm Chart Repository',
    'Policy Engine', 'Compliance Checker', 'Audit Logger', 'Token Manager',
    'Rate Limiter', 'Circuit Breaker', 'Retry Handler', 'Bulk Processor',
    'Cache Layer', 'Search Engine', 'File Storage', 'Object Storage',
    'Notification Service', 'Email Service', 'SMS Service', 'Push Notification Service',
    'Webhook Manager', 'Event Bus', 'Command Bus', 'Saga Coordinator',
    'Workflow Engine', 'Decision Engine', 'Rules Engine', 'Validation Engine',
    'Transformation Engine', 'Enrichment Engine', 'Classification Engine', 'Scoring Engine',
  ],
  process: [
    'Agent Lifecycle Management', 'Skill Approval Workflow', 'Compliance Audit Process',
    'Incident Response Process', 'Change Management Process', 'Release Management Process',
    'Problem Management Process', 'Capacity Management Process', 'Availability Management Process',
    'Security Assessment Process', 'Risk Management Process', 'Knowledge Management Process',
    'Data Governance Process', 'Access Management Process', 'Identity Verification Process',
    'Performance Review Process', 'Budget Approval Process', 'Vendor Onboarding Process',
    'Contract Review Process', 'Policy Update Process', 'Training Delivery Process',
    'Onboarding Process', 'Offboarding Process', 'Handover Process', 'Escalation Process',
    'Approval Workflow', 'Review Workflow', 'Validation Workflow', 'Testing Workflow',
    'Deployment Workflow', 'Rollback Workflow', 'Recovery Workflow', 'Backup Workflow',
    'Monitoring Workflow', 'Alerting Workflow', 'Notification Workflow', 'Reporting Workflow',
    'Discovery Process', 'Assessment Process', 'Remediation Process', 'Verification Process',
    'Certification Process', 'Accreditation Process', 'Benchmarking Process', 'Optimization Process',
  ],
  rule: [
    'Data Encryption Policy', 'Access Control Policy', 'Password Policy', 'Session Policy',
    'API Authentication Rule', 'Rate Limiting Rule', 'Input Validation Rule', 'Output Filtering Rule',
    'Content Moderation Rule', 'Pii Detection Rule', 'Secret Scanning Rule', 'Dependency Check Rule',
    'Code Quality Gate', 'Test Coverage Gate', 'Performance Threshold', 'Availability Target',
    'Error Budget Policy', 'Change Freeze Policy', 'Maintenance Window Policy', 'Deployment Policy',
    'Backup Retention Rule', 'Log Retention Rule', 'Audit Trail Rule', 'Compliance Check Rule',
    'Approval Threshold Rule', 'Escalation Trigger Rule', 'Notification Rule', 'Retry Policy',
    'Timeout Policy', 'Circuit Breaker Rule', 'Fallback Policy', 'Degradation Policy',
    'Cost Control Rule', 'Resource Quota Rule', 'Scaling Policy', 'Priority Rule',
    'Scheduling Rule', 'Concurrency Rule', 'Isolation Rule', 'Versioning Rule',
    'Naming Convention', 'Documentation Standard', 'Review Requirement', 'Sign-off Requirement',
    'Conflict Resolution Rule', 'Consistency Rule', 'Idempotency Rule', 'Immutability Rule',
  ],
  skill: [
    'Natural Language Understanding', 'Sentiment Analysis', 'Entity Extraction', 'Text Summarization',
    'Code Generation', 'Code Review', 'Bug Detection', 'Performance Profiling',
    'Data Visualization', 'Report Generation', 'Email Composition', 'Document Analysis',
    'Knowledge Retrieval', 'Semantic Search', 'Question Answering', 'Translation',
    'Speech Recognition', 'Image Classification', 'Anomaly Detection', 'Pattern Recognition',
    'Forecasting', 'Clustering', 'Classification', 'Regression',
    'Recommendation', 'Personalization', 'A/B Testing', 'Multi-Armed Bandit',
    'Workflow Orchestration', 'Task Scheduling', 'Resource Allocation', 'Capacity Planning',
    'Cost Analysis', 'Risk Assessment', 'Compliance Checking', 'Policy Enforcement',
    'Incident Triage', 'Root Cause Analysis', 'Impact Assessment', 'Remediation Planning',
    'Change Impact Analysis', 'Dependency Mapping', 'Conflict Resolution', 'Negotiation',
    'Stakeholder Management', 'Communication Planning', 'Knowledge Transfer', 'Mentoring',
  ],
  tool: [
    'PostgreSQL Database', 'Redis Cache', 'Elasticsearch', 'RabbitMQ Message Broker',
    'Kubernetes Cluster', 'Docker Container Runtime', 'Terraform IaC', 'Ansible Configuration',
    'Prometheus Monitoring', 'Grafana Dashboard', 'Jaeger Tracing', 'Fluentd Logging',
    'Vault Secret Manager', 'Consul Service Discovery', 'Envoy Proxy', 'Nginx Ingress',
    'ArgoCD Deployment', 'Jenkins Pipeline', 'GitHub Actions CI', 'SonarQube Quality',
    'Snyk Security Scan', 'Trivy Container Scan', ' OWASP ZAP', 'Burp Suite',
    'Jira Project Management', 'Confluence Documentation', 'Slack Communication', 'PagerDuty Alerting',
    'Datadog APM', 'New Relic Performance', 'Splunk SIEM', 'CrowdStrike EDR',
    'MinIO Object Storage', 'Apache Kafka', 'Apache Flink', 'Apache Spark',
    'MLflow Model Registry', 'Weights and Biases', 'LangChain Framework', 'LlamaIndex Framework',
    'FastAPI Framework', 'Next.js Framework', 'React Component Library', 'Tailwind CSS',
  ],
  document: [
    'Enterprise Architecture Document', 'System Design Document', 'API Specification', 'Database Schema Document',
    'Security Policy Document', 'Compliance Framework', 'Disaster Recovery Plan', 'Business Continuity Plan',
    'Incident Response Playbook', 'Change Management Policy', 'Release Management Process', 'Capacity Plan',
    'Service Level Agreement', 'Operational Level Agreement', 'Underpinning Contract', 'Statement of Work',
    'Master Service Agreement', 'Non-Disclosure Agreement', 'Data Processing Agreement', 'Privacy Policy',
    'Terms of Service', 'Acceptable Use Policy', 'Information Security Policy', 'Access Control Policy',
    'Employee Handbook', 'Onboarding Guide', 'Offboarding Checklist', 'Performance Review Template',
    'Project Charter', 'Business Case', 'Feasibility Study', 'Cost-Benefit Analysis',
    'Risk Register', 'Issue Log', 'Decision Log', 'Lessons Learned Document',
    'Technical Debt Register', 'Architecture Decision Record', 'Design Review Document', 'Test Strategy',
    'Test Plan', 'Test Case Specification', 'User Acceptance Criteria', 'Deployment Runbook',
    'Operational Runbook', 'Troubleshooting Guide', 'Knowledge Base Article', 'FAQ Document',
  ],
  person: [
    'Chief Technology Officer', 'Chief Information Security Officer', 'Chief Data Officer',
    'Vice President of Engineering', 'Director of Platform Engineering', 'Director of Security',
    'Head of AI/ML', 'Head of Data Engineering', 'Head of DevOps', 'Head of SRE',
    'Principal Architect', 'Senior Software Engineer', 'Staff Engineer', 'Engineering Manager',
    'Product Manager', 'Program Manager', 'Project Manager', 'Scrum Master',
    'Security Engineer', 'Compliance Officer', 'Data Protection Officer', 'Risk Manager',
    'Solutions Architect', 'Cloud Architect', 'Data Architect', 'ML Engineer',
    'DevOps Engineer', 'SRE Engineer', 'QA Engineer', 'UX Designer',
    'Technical Writer', 'Knowledge Engineer', 'Prompt Engineer', 'AI Ethics Researcher',
    'Vendor Manager', 'Contract Manager', 'Financial Controller', 'Budget Analyst',
    'HR Business Partner', 'Talent Acquisition Lead', 'Learning and Development Manager',
    'Internal Communications Manager', 'Change Management Lead', 'Business Analyst',
    'Systems Analyst', 'Integration Specialist', 'Automation Engineer', 'Release Engineer',
  ],
  department: [
    'Platform Engineering', 'Site Reliability Engineering', 'Security Operations Center',
    'Data Engineering', 'Machine Learning Engineering', 'Product Engineering',
    'Cloud Infrastructure', 'Network Operations', 'Identity and Access Management',
    'Application Security', 'Compliance and Governance', 'Risk Management',
    'Enterprise Architecture', 'IT Service Management', 'Quality Assurance',
    'Developer Experience', 'API Platform', 'Data Platform', 'AI Platform',
    'Observability Engineering', 'Incident Management', 'Change Management',
    'Release Engineering', 'Configuration Management', 'Capacity Management',
    'Vendor Management', 'Contract Management', 'Financial Planning',
    'Human Resources', 'Legal Affairs', 'Internal Audit',
    'Customer Success', 'Technical Support', 'Professional Services',
    'Solutions Consulting', 'Partner Engineering', 'Field Engineering',
  ],
}

// ─── E. ENGINE RECORD DATA ────────────────────────────────────────────────────

const engineTypes = [
  'memory', 'planning', 'reflection', 'self_healing', 'self_optimization',
  'evaluation', 'governance', 'security', 'audit', 'compliance', 'observability',
] as const

const engineActions: Record<string, string[]> = {
  memory: ['store', 'retrieve', 'consolidate', 'forget', 'search'],
  planning: ['create_plan', 'execute_plan', 'adjust_plan', 'evaluate_plan'],
  reflection: ['reflect', 'compare', 'learn', 'adapt'],
  self_healing: ['detect_anomaly', 'diagnose', 'repair', 'verify', 'prevent'],
  self_optimization: ['analyze', 'benchmark', 'optimize', 'validate', 'deploy'],
  evaluation: ['evaluate', 'score', 'rank', 'compare', 'report'],
  governance: ['enforce_policy', 'check_compliance', 'escalate', 'audit', 'update_policy'],
  security: ['scan', 'validate', 'block', 'report', 'patch'],
  audit: ['audit', 'log', 'review', 'archive', 'report'],
  compliance: ['check', 'validate', 'remediate', 'report', 'certify'],
  observability: ['monitor', 'trace', 'alert', 'dashboard', 'investigate'],
}

// ─── F. EVENT DATA ────────────────────────────────────────────────────────────

const eventTypes = [
  'agent.action', 'system.health', 'workflow.complete', 'rule.violated',
  'compliance.breach', 'security.alert', 'knowledge.updated', 'collaboration.started',
  'evaluation.completed', 'deployment.success', 'error.occurred', 'performance.threshold',
  'data.processed',
] as const

const eventSources = ['system', 'agent', 'user', 'external', 'scheduler'] as const
const eventSeverities: ('info' | 'warning' | 'critical' | 'debug')[] = ['info', 'warning', 'critical', 'debug']

// ─── G. DATA LAKE DATA ────────────────────────────────────────────────────────

const dataLakeSources = ['agent_logs', 'system_metrics', 'interactions', 'knowledge', 'compliance'] as const
const dataLakeCategories = ['raw', 'processed', 'aggregated', 'archived'] as const
const dataLakeFormats = ['json', 'csv', 'parquet'] as const
const dataLakeRetentions = ['30d', '90d', '180d', '365d', '730d'] as const

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  ENTERPRISE SEED SCRIPT V2 — Master Data Population')
  console.log('═══════════════════════════════════════════════════════════════')
  const startTime = Date.now()

  // ── Check if already seeded ─────────────────────────────────────────────────
  const existingRules = await db.constitutionalRule.count()
  if (existingRules > 0) {
    console.log(`\n⏭️  Database already has ${existingRules} constitutional rules. Skipping seed.`)
    console.log('   If you want to re-seed, truncate the tables first.')
    await db.$disconnect()
    return
  }

  // ── Fetch existing departments and agents ───────────────────────────────────
  console.log('\n📋 Fetching existing departments and agents...')
  const departments = await db.department.findMany({ select: { id: true, name: true } })
  console.log(`   Found ${departments.length} departments`)

  const agents = await db.agent.findMany({ select: { id: true, agentId: true } })
  console.log(`   Found ${agents.length} agents`)

  if (departments.length === 0) {
    console.error('❌ No departments found. Please seed departments first.')
    await db.$disconnect()
    process.exit(1)
  }

  const deptIds = departments.map((d) => d.id)
  const agentIds = agents.map((a) => a.id)

  // ═══════════════════════════════════════════════════════════════════════════
  // A. SEED CONSTITUTIONAL RULES (500+)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION A: Seeding Constitutional Rules (500+)...')
  let ruleCount = 0
  let ruleNum = 0
  let ruleBatch: Array<{
    ruleId: string
    title: string
    category: string
    severity: string
    description: string
    conditions: string
    actions: string
    departmentId: string | null
    isActive: boolean
  }> = []

  for (const cat of ruleCategories) {
    const titles = ruleTitlesByCategory[cat.name]
    const descriptions = ruleDescriptions[cat.name]
    const rulesPerCat = 50

    for (let i = 0; i < rulesPerCat; i++) {
      ruleNum++
      const title = titles[i % titles.length]
      const desc = descriptions[i % descriptions.length]
      const severity = pick(severities)
      const deptId = Math.random() < 0.3 ? null : pick(deptIds)

      const conditions = [
        `Agent operates in ${cat.name} domain`,
        `Action severity level is ${severity}`,
        `Department ${deptId ? 'scope is limited' : 'scope is enterprise-wide'}`,
      ]

      const actions = [
        `Log the ${cat.name} event with full context`,
        `Notify the ${severity === 'critical' ? 'incident response' : 'operations'} team`,
        severity === 'critical' ? 'Block the action and require manual override' : 'Allow action with monitoring',
        `Update the ${cat.name} compliance dashboard`,
      ]

      ruleBatch.push({
        ruleId: `RULE-${cat.prefix}-${padNum(i + 1)}`,
        title: i < titles.length ? title : `${title} — Variant ${Math.ceil((i + 1) / titles.length)}`,
        category: cat.name,
        severity,
        description: desc,
        conditions: JSON.stringify(conditions),
        actions: JSON.stringify(actions),
        departmentId: deptId,
        isActive: true,
      })

      if (ruleBatch.length >= BATCH_SMALL) {
        try {
          const created = await db.constitutionalRule.createMany({ data: ruleBatch })
          ruleCount += created.count
        } catch (e) {
          console.error(`   Error inserting rule batch at ${ruleNum}:`, e)
        }
        ruleBatch = []
      }

      if (ruleNum % 100 === 0) {
        console.log(`   ✅ ${ruleNum} rules processed...`)
      }
    }
  }
  if (ruleBatch.length > 0) {
    const created = await db.constitutionalRule.createMany({ data: ruleBatch })
    ruleCount += created.count
  }
  console.log(`   ✅ Total constitutional rules created: ${ruleCount}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // B. SEED ENTERPRISE SOPs (500+)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION B: Seeding Enterprise SOPs (500+)...')
  let sopCount = 0
  let sopNum = 0
  let sopBatch: Array<{
    sopId: string
    title: string
    category: string
    departmentId: string
    ownerRole: string
    priority: string
    description: string
    steps: string
    checklist: string
    estimatedTime: string
    status: string
    isActive: boolean
  }> = []

  const sopPriorities: ('critical' | 'high' | 'medium' | 'low')[] = ['critical', 'high', 'medium', 'low']
  const sopOwnerRoles: ('manager' | 'operator' | 'admin')[] = ['manager', 'operator', 'admin']
  const sopEstTimes = ['15 min', '30 min', '45 min', '1 hour', '2 hours', '4 hours']

  function generateSteps(title: string): string {
    const numSteps = randInt(5, 8)
    const steps = []
    const assignees = ['manager', 'operator', 'admin', 'specialist']
    for (let s = 1; s <= numSteps; s++) {
      steps.push({
        step: s,
        title: `Step ${s}: ${s === 1 ? 'Initialize' : s === numSteps ? 'Complete and Document' : `Execute ${title.split(' ')[0]} Task ${s - 1}`}`,
        description: `Perform the required action for step ${s} of the ${title} procedure. Verify all preconditions are met before proceeding.`,
        assignee: pick(assignees),
      })
    }
    return JSON.stringify(steps)
  }

  function generateChecklist(): string {
    const numItems = randInt(5, 10)
    const items = [
      'All prerequisites verified', 'Required tools and access available', 'Stakeholders notified',
      'Pre-checks completed successfully', 'Documentation updated', 'Post-implementation validation performed',
      'Rollback plan confirmed', 'Compliance requirements met', 'Performance metrics within acceptable range',
      'Security review completed', 'Approval obtained from relevant authority', 'Dependencies verified',
      'Testing completed in staging environment', 'Communication sent to affected parties', 'Monitoring configured',
    ]
    return JSON.stringify(pickN(items, numItems))
  }

  for (const cat of sopCategories) {
    const titles = sopTitlesByCategory[cat.name]
    const sopsPerCat = 62

    for (let i = 0; i < sopsPerCat; i++) {
      sopNum++
      const title = i < titles.length ? titles[i] : `${titles[i % titles.length]} — Variant ${Math.ceil((i + 1) / titles.length)}`
      const deptId = pick(deptIds)
      const priority = pick(sopPriorities)
      const ownerRole = pick(sopOwnerRoles)
      const estTime = pick(sopEstTimes)
      const status = Math.random() < 0.9 ? 'active' : 'draft'

      sopBatch.push({
        sopId: `SOP-${cat.prefix}-${padNum(i + 1)}`,
        title,
        category: cat.name,
        departmentId: deptId,
        ownerRole,
        priority,
        description: `Standard operating procedure for ${title.toLowerCase()}. This SOP ensures consistent execution across the organization and compliance with enterprise standards.`,
        steps: generateSteps(title),
        checklist: generateChecklist(),
        estimatedTime: estTime,
        status,
        isActive: true,
      })

      if (sopBatch.length >= BATCH_SMALL) {
        try {
          const created = await db.enterpriseSOP.createMany({ data: sopBatch })
          sopCount += created.count
        } catch (e) {
          console.error(`   Error inserting SOP batch at ${sopNum}:`, e)
        }
        sopBatch = []
      }

      if (sopNum % 100 === 0) {
        console.log(`   ✅ ${sopNum} SOPs processed...`)
      }
    }
  }
  if (sopBatch.length > 0) {
    const created = await db.enterpriseSOP.createMany({ data: sopBatch })
    sopCount += created.count
  }
  console.log(`   ✅ Total SOPs created: ${sopCount}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // C. SEED PROMPT TEMPLATES (50,000+)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION C: Seeding Prompt Templates (50,000+)...')
  let promptCount = 0
  let promptNum = 0

  const tagPool = [
    'enterprise', 'automation', 'analysis', 'reporting', 'compliance', 'security',
    'operations', 'planning', 'optimization', 'communication', 'quality', 'performance',
    'data', 'ai', 'ml', 'nlp', 'analytics', 'monitoring', 'review', 'assessment',
    'strategy', 'risk', 'governance', 'hr', 'finance', 'legal', 'technical',
    'business', 'product', 'engineering', 'devops', 'sre', 'infrastructure',
  ]

  function generatePromptData(
    catName: string,
    catPrefix: string,
    title: string,
    subcat: string,
    variation: number,
  ) {
    const sysPrompts = systemPromptTemplates[catName] || systemPromptTemplates['analysis']
    const systemPrompt = sysPrompts[variation % sysPrompts.length]

    const variables = [
      `{{${catName}_input}}`,
      `{{context}}`,
      `{{format}}`,
      `{{detail_level}}`,
    ].slice(0, randInt(2, 4))

    const userTemplate = `Analyze the following ${catName} input and provide a comprehensive ${subcat} ${title.toLowerCase()}.

Input: {{${catName}_input}}
Context: {{context}}
Desired Format: {{format}}
Detail Level: {{detail_level}}

Please ensure your response is well-structured and includes actionable insights specific to this ${subcat} domain.`

    const tags = pickN(tagPool, randInt(2, 5))

    return {
      templateId: `PROMPT-${catPrefix}-${padNum(variation + 1, 4)}`,
      title: variation < 50 ? title : `${title} v${Math.ceil((variation + 1) / 50)}`,
      category: catName,
      subcategory: subcat,
      departmentId: Math.random() < 0.4 ? null : pick(deptIds),
      agentTypeId: '',
      description: `A ${catName} prompt template for ${subcat} ${title.toLowerCase()}. Provides structured output for enterprise use.`,
      systemPrompt,
      userTemplate,
      variables: JSON.stringify(variables),
      outputFormat: pick([...outputFormats]) as string,
      temperature: randFloat(0.0, 1.0),
      maxTokens: pick([256, 512, 1024, 2048, 4096]),
      isPublic: Math.random() > 0.4,
      usageCount: randInt(0, 5000),
      rating: randFloat(0, 5),
      tags: JSON.stringify(tags),
      isActive: true,
    }
  }

  for (const cat of promptCategories) {
    const titles = promptTitlesByCategory[cat.name]
    const subcats = promptSubcategories[cat.name]
    const promptsPerCat = 5000

    let batch: typeof generatePromptData extends (...args: any[]) => infer R ? R[] : never = []

    for (let i = 0; i < promptsPerCat; i++) {
      promptNum++
      const titleIdx = i % titles.length
      const subcatIdx = i % subcats.length
      const variation = Math.floor(i / titles.length)

      const data = generatePromptData(
        cat.name,
        cat.prefix,
        titles[titleIdx],
        subcats[subcatIdx],
        i,
      )

      batch.push(data)

      if (batch.length >= BATCH_MEDIUM) {
        try {
          await db.promptTemplate.createMany({ data: batch })
          promptCount += batch.length
        } catch (e) {
          console.error(`   Error inserting prompt batch at ${promptNum}:`, e)
        }
        batch = []

        if (promptNum % 5000 === 0) {
          console.log(`   ✅ ${promptNum.toLocaleString()} prompts created...`)
        }
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      try {
        await db.promptTemplate.createMany({ data: batch })
        promptCount += batch.length
      } catch (e) {
        console.error(`   Error inserting final prompt batch for ${cat.name}:`, e)
      }
      batch = []
    }

    console.log(`   ✅ ${cat.name}: ${promptsPerCat} prompts completed`)
  }
  console.log(`   ✅ Total prompt templates created: ${promptCount.toLocaleString()}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // D. SEED KNOWLEDGE GRAPH NODES (2,500)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION D: Seeding Knowledge Graph Nodes (2,500)...')
  let nodeCount = 0
  const nodeIdToDbId: Map<string, string> = new Map()
  const nodeDbIds: string[] = []
  const typePrefixes: Record<string, string> = {
    concept: 'CON', entity: 'ENT', process: 'PRC', rule: 'RUL',
    skill: 'SKL', tool: 'TOL', document: 'DOC', person: 'PER', department: 'DEP',
  }
  const sources: ('internal' | 'external' | 'learned')[] = ['internal', 'external', 'learned']

  let nodeBatch: Array<{
    nodeId: string
    title: string
    type: string
    domain: string
    departmentId: string | null
    content: string
    metadata: string
    confidence: number
    source: string
  }> = []

  let nodeIdx = 0
  for (const nodeType of nodeTypes) {
    const titles = nodeTitlesByType[nodeType]
    const nodesPerType = 278 // ~2500 / 9

    for (let i = 0; i < nodesPerType; i++) {
      nodeIdx++
      const title = i < titles.length ? titles[i] : `${titles[i % titles.length]} Variant ${Math.ceil((i + 1) / titles.length)}`
      const domain = pick([...nodeDomains])
      const deptId = pick(deptIds)
      const source = pick(sources)
      const confidence = randFloat(0.7, 1.0)
      const importance = pick(['high', 'medium', 'low'])

      const nodeId = `KNODE-${typePrefixes[nodeType]}-${padNum(i + 1, 4)}`

      nodeBatch.push({
        nodeId,
        title,
        type: nodeType,
        domain,
        departmentId: Math.random() < 0.2 ? null : deptId,
        content: `This ${nodeType} represents ${title.toLowerCase()} within the ${domain} domain. It serves as a key knowledge element for enterprise operations and decision-making processes.`,
        metadata: JSON.stringify({ importance, connections: randInt(1, 15), verified: Math.random() > 0.2 }),
        confidence,
        source,
      })

      if (nodeBatch.length >= BATCH_SMALL) {
        const created = await db.knowledgeNode.createMany({ data: nodeBatch })
        nodeCount += created.count
        nodeBatch = []
      }

      if (nodeIdx % 500 === 0) {
        console.log(`   ✅ ${nodeIdx} nodes processed...`)
      }
    }
  }

  if (nodeBatch.length > 0) {
    const created = await db.knowledgeNode.createMany({ data: nodeBatch })
    nodeCount += created.count
  }

  // Collect all node DB IDs for edge creation
  const allNodes = await db.knowledgeNode.findMany({ select: { id: true, nodeId: true } })
  console.log(`   ✅ Total knowledge nodes created: ${nodeCount}`)
  console.log(`   ✅ Fetching ${allNodes.length} nodes for edge creation...`)

  const nodeDbIdList = allNodes.map((n) => n.id)

  // ═══════════════════════════════════════════════════════════════════════════
  // E. SEED KNOWLEDGE GRAPH EDGES (5,000)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION E: Seeding Knowledge Graph Edges (5,000)...')
  let edgeCount = 0

  if (nodeDbIdList.length < 2) {
    console.error('   ❌ Not enough nodes to create edges')
  } else {
    let edgeBatch: Array<{
      edgeId: string
      fromNodeId: string
      toNodeId: string
      relationType: string
      weight: number
      metadata: string
    }> = []

    for (let i = 0; i < 5000; i++) {
      let fromId = pick(nodeDbIdList)
      let toId = pick(nodeDbIdList)
      // Ensure different nodes
      while (toId === fromId) {
        toId = pick(nodeDbIdList)
      }

      edgeBatch.push({
        edgeId: `KEDGE-${padNum(i + 1, 5)}`,
        fromNodeId: fromId,
        toNodeId: toId,
        relationType: pick([...edgeRelationTypes]),
        weight: randFloat(0.1, 1.0),
        metadata: JSON.stringify({}),
      })

      if (edgeBatch.length >= BATCH_MEDIUM) {
        try {
          const created = await db.knowledgeEdge.createMany({ data: edgeBatch })
          edgeCount += created.count
        } catch (e) {
          console.error(`   Error inserting edge batch at ${i}:`, e)
        }
        edgeBatch = []
      }

      if ((i + 1) % 1000 === 0) {
        console.log(`   ✅ ${i + 1} edges created...`)
      }
    }

    if (edgeBatch.length > 0) {
      const created = await db.knowledgeEdge.createMany({ data: edgeBatch })
      edgeCount += created.count
    }
  }
  console.log(`   ✅ Total knowledge edges created: ${edgeCount}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // F. SEED ENGINE RECORDS (5,000)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION F: Seeding Engine Records (5,000)...')
  let engineCount = 0
  const engineStatuses: ('completed' | 'running' | 'failed' | 'pending')[] = ['completed', 'completed', 'completed', 'completed',
    'completed', 'completed', 'completed', 'completed', 'running', 'running', 'failed', 'pending']

  let engineBatch: Array<{
    engineType: string
    action: string
    status: string
    input: string
    output: string
    agentId: string | null
    departmentId: string | null
    duration: number
    score: number | null
    metadata: string
  }> = []

  for (let i = 0; i < 5000; i++) {
    const eType = pick([...engineTypes])
    const actions = engineActions[eType] || ['process']
    const action = pick(actions)
    const status = pick(engineStatuses)
    const agentId = agentIds.length > 0 ? pick(agentIds) : null
    const deptId = pick(deptIds)
    const duration = randInt(50, 5000)
    const score = status === 'completed' ? randFloat(0.5, 1.0) : null

    engineBatch.push({
      engineType: eType,
      action,
      status,
      input: JSON.stringify({ query: `Engine ${eType} ${action} execution for record ${i + 1}`, timestamp: new Date().toISOString() }),
      output: status === 'completed'
        ? JSON.stringify({ result: `${action} completed successfully`, score, itemsProcessed: randInt(1, 100) })
        : status === 'failed'
          ? JSON.stringify({ error: 'Processing error occurred', retryable: Math.random() > 0.5 })
          : JSON.stringify({ status: 'in progress' }),
      agentId,
      departmentId: deptId,
      duration,
      score,
      metadata: JSON.stringify({ batch: true, source: 'seed' }),
    })

    if (engineBatch.length >= BATCH_MEDIUM) {
      try {
        const created = await db.engineRecord.createMany({ data: engineBatch })
        engineCount += created.count
      } catch (e) {
        console.error(`   Error inserting engine batch at ${i}:`, e)
      }
      engineBatch = []
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`   ✅ ${i + 1} engine records created...`)
    }
  }

  if (engineBatch.length > 0) {
    const created = await db.engineRecord.createMany({ data: engineBatch })
    engineCount += created.count
  }
  console.log(`   ✅ Total engine records created: ${engineCount}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // G. SEED ENTERPRISE EVENTS (10,000)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION G: Seeding Enterprise Events (10,000)...')
  let eventCount = 0

  // Weighted severity: info 60%, warning 20%, critical 10%, debug 10%
  function pickSeverity(): string {
    const r = Math.random()
    if (r < 0.6) return 'info'
    if (r < 0.8) return 'warning'
    if (r < 0.9) return 'critical'
    return 'debug'
  }

  const eventPayloads: Record<string, string> = {
    'agent.action': 'Agent executed action successfully with standard parameters',
    'system.health': 'System health check passed — all services operational',
    'workflow.complete': 'Workflow completed all stages within expected time',
    'rule.violated': 'Constitutional rule violation detected — action blocked',
    'compliance.breach': 'Compliance breach identified — remediation initiated',
    'security.alert': 'Security alert triggered by anomalous access pattern',
    'knowledge.updated': 'Knowledge graph updated with new node connections',
    'collaboration.started': 'Multi-agent collaboration session initiated',
    'evaluation.completed': 'Agent evaluation cycle completed with scoring',
    'deployment.success': 'Production deployment completed successfully',
    'error.occurred': 'Unexpected error encountered during processing',
    'performance.threshold': 'Performance threshold exceeded — monitoring active',
    'data.processed': 'Data processing batch completed and stored',
  }

  let eventBatch: Array<{
    eventType: string
    source: string
    severity: string
    payload: string
    agentId: string | null
    departmentId: string | null
    correlationId: string | null
    processed: boolean
  }> = []

  for (let i = 0; i < 10000; i++) {
    const eType = pick([...eventTypes])
    const source = pick([...eventSources])
    const severity = pickSeverity()
    const aId = Math.random() < 0.5 && agentIds.length > 0 ? pick(agentIds) : null
    const dId = Math.random() < 0.5 ? pick(deptIds) : null
    const correlationId = `corr-${randInt(100000, 999999)}`
    const processed = Math.random() > 0.3

    eventBatch.push({
      eventType: eType,
      source,
      severity,
      payload: JSON.stringify({
        message: eventPayloads[eType] || 'Event occurred',
        details: `Event ${eType} from ${source} at index ${i + 1}`,
        timestamp: new Date().toISOString(),
      }),
      agentId: aId,
      departmentId: dId,
      correlationId,
      processed,
    })

    if (eventBatch.length >= BATCH_MEDIUM) {
      try {
        const created = await db.enterpriseEvent.createMany({ data: eventBatch })
        eventCount += created.count
      } catch (e) {
        console.error(`   Error inserting event batch at ${i}:`, e)
      }
      eventBatch = []
    }

    if ((i + 1) % 2000 === 0) {
      console.log(`   ✅ ${(i + 1).toLocaleString()} events created...`)
    }
  }

  if (eventBatch.length > 0) {
    const created = await db.enterpriseEvent.createMany({ data: eventBatch })
    eventCount += created.count
  }
  console.log(`   ✅ Total enterprise events created: ${eventCount.toLocaleString()}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // H. SEED DATA LAKE ENTRIES (5,000)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n\n📌 SECTION H: Seeding Data Lake Entries (5,000)...')
  let lakeCount = 0

  const dataLakeTags: Record<string, string[]> = {
    agent_logs: ['agent', 'execution', 'trace', 'interaction'],
    system_metrics: ['metrics', 'performance', 'health', 'infrastructure'],
    interactions: ['user', 'conversation', 'feedback', 'engagement'],
    knowledge: ['knowledge', 'graph', 'embedding', 'document'],
    compliance: ['compliance', 'audit', 'policy', 'regulation'],
  }

  let lakeBatch: Array<{
    source: string
    category: string
    format: string
    data: string
    size: number
    departmentId: string | null
    tags: string
    retention: string
  }> = []

  for (let i = 0; i < 5000; i++) {
    const source = pick([...dataLakeSources])
    const category = pick([...dataLakeCategories])
    const format = pick([...dataLakeFormats])
    const dId = Math.random() < 0.3 ? null : pick(deptIds)
    const tags = pickN(dataLakeTags[source] || ['data'], randInt(2, 3))
    const retention = pick([...dataLakeRetentions])
    const size = randInt(1024, 10485760) // 1KB to 10MB

    const sampleData: Record<string, string> = {
      agent_logs: `[{"agentId":"AGENT-${padNum(randInt(1, 2000), 4)}","action":"${pick(['query', 'response', 'error', 'timeout'])}","timestamp":"${new Date().toISOString()}"}]`,
      system_metrics: `[{"metric":"${pick(['cpu', 'memory', 'disk', 'network', 'requests'])}","value":${randInt(1, 100)},"unit":"${pick(['%', 'MB', 'GB', 'ms', 'req/s'])}"}]`,
      interactions: `[{"userId":"user-${randInt(1, 500)}","type":"${pick(['chat', 'feedback', 'rating', 'complaint'])}","score":${randFloat(1, 5)}}]`,
      knowledge: `[{"nodeId":"KNODE-${padNum(randInt(1, 2500), 4)}","action":"${pick(['create', 'update', 'delete', 'query'])}","domain":"${pick([...nodeDomains])}"}]`,
      compliance: `[{"ruleId":"RULE-${pick(['GOV', 'SEC', 'CMP', 'OPS'])}-${padNum(randInt(1, 50))}","status":"${pick(['pass', 'fail', 'warning'])}","timestamp":"${new Date().toISOString()}"}]`,
    }

    lakeBatch.push({
      source,
      category,
      format,
      data: sampleData[source] || '{}',
      size,
      departmentId: dId,
      tags: JSON.stringify(tags),
      retention,
    })

    if (lakeBatch.length >= BATCH_MEDIUM) {
      try {
        const created = await db.dataLakeEntry.createMany({ data: lakeBatch })
        lakeCount += created.count
      } catch (e) {
        console.error(`   Error inserting data lake batch at ${i}:`, e)
      }
      lakeBatch = []
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`   ✅ ${(i + 1).toLocaleString()} data lake entries created...`)
    }
  }

  if (lakeBatch.length > 0) {
    const created = await db.dataLakeEntry.createMany({ data: lakeBatch })
    lakeCount += created.count
  }
  console.log(`   ✅ Total data lake entries created: ${lakeCount.toLocaleString()}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  const endTime = Date.now()
  const duration = ((endTime - startTime) / 1000).toFixed(1)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  SEED COMPLETE — SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Constitutional Rules:    ${ruleCount.toLocaleString()}`)
  console.log(`  Enterprise SOPs:         ${sopCount.toLocaleString()}`)
  console.log(`  Prompt Templates:        ${promptCount.toLocaleString()}`)
  console.log(`  Knowledge Nodes:         ${nodeCount.toLocaleString()}`)
  console.log(`  Knowledge Edges:         ${edgeCount.toLocaleString()}`)
  console.log(`  Engine Records:          ${engineCount.toLocaleString()}`)
  console.log(`  Enterprise Events:       ${eventCount.toLocaleString()}`)
  console.log(`  Data Lake Entries:       ${lakeCount.toLocaleString()}`)
  console.log('───────────────────────────────────────────────────────────────')
  console.log(`  Total Records:           ${(ruleCount + sopCount + promptCount + nodeCount + edgeCount + engineCount + eventCount + lakeCount).toLocaleString()}`)
  console.log(`  Duration:                ${duration}s`)
  console.log('═══════════════════════════════════════════════════════════════')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
