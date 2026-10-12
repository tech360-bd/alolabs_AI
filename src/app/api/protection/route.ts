import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProtectionCheck {
  companyId?: string;
  userId?: string;
  agentId?: string;
  action: string;
  resource?: string;
  dataClassification?: string; // public, internal, confidential, restricted, secret
  financialCost?: number;
  isExternalCommunication?: boolean;
  isPublicPublishing?: boolean;
  isDataDeletion?: boolean;
  isProductionChange?: boolean;
  isCredentialAccess?: boolean;
  isLegalSensitive?: boolean;
  isStudentPrivacy?: boolean;
  isCrossCompanyAccess?: boolean;
  isBulkOperation?: boolean;
  toolName?: string;
  modelName?: string;
  bulkCount?: number;
}

export interface ProtectionResult {
  allowed: boolean;
  reason: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  approvalType?: string;
  blockedRules: string[];
  warnings: string[];
}

interface RuleEvaluation {
  ruleId: string;
  passed: boolean;
  reason: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  approvalType?: string;
}

// ─── Pattern-based rules (legacy + new) ─────────────────────────────────────

const PATTERN_RULES: { pattern: RegExp; reason: string; actionType: string }[] = [
  { pattern: /(?:read|access|cat|print)\s+.*(?:credential|secret|api.?key)\b/i, reason: 'Credential access attempt detected', actionType: 'credential_stealing' },
  { pattern: /document\.cookie/i, reason: 'Browser cookie access attempt detected', actionType: 'token_cookie_theft' },
  { pattern: /(?:logins|passwords)\.json/i, reason: 'Browser password file access attempt detected', actionType: 'browser_password_access' },
  { pattern: /ssh.*(?:private|key)/i, reason: 'SSH private key access attempt detected', actionType: 'ssh_key_access' },
  { pattern: /(?:wallet|crypto).*\.(?:json|dat|key)/i, reason: 'Crypto wallet file access attempt detected', actionType: 'crypto_wallet_access' },
  { pattern: /\/etc\/shadow/i, reason: 'Sensitive system file /etc/shadow access attempt detected', actionType: 'etc_shadow_access' },
  { pattern: /curl\b.*\|\s*(?:ba)?sh/i, reason: 'curl pipe bash execution attempt detected', actionType: 'curl_pipe_bash' },
  { pattern: /wget\b.*(?:-O|-o).*(?:ba)?sh/i, reason: 'wget to shell script download attempt detected', actionType: 'wget_pipe_shell' },
  { pattern: /echo\b.*base64.*\|\s*(?:ba)?sh/i, reason: 'Base64 pipe to shell execution attempt detected', actionType: 'base64_shell' },
  { pattern: /(?:exfil|exfiltrat|send.*data.*outside|upload.*sensitive|leak.*data)/i, reason: 'Data exfiltration attempt detected', actionType: 'exfiltration' },
  { pattern: /(?:disable|stop|turn.?off)\s*(?:firewall|ufw|iptables|pf)/i, reason: 'Firewall disable attempt detected', actionType: 'firewall_disable' },
  { pattern: /iptables\s+-F/i, reason: 'iptables flush (firewall disable) attempt detected', actionType: 'firewall_disable' },
  { pattern: /(?:resolv\.conf|\/etc\/dns)/i, reason: 'DNS configuration file modification attempt detected', actionType: 'dns_change' },
  { pattern: /rm\s+.*-rf/i, reason: 'Dangerous recursive file deletion attempt detected', actionType: 'file_deletion' },
  { pattern: /(?:publish|deploy|push)\s+(?:to\s+)?(?:public|github\.com|npm|pypi|docker.?hub)/i, reason: 'Public publish attempt detected — requires approval', actionType: 'public_publish' },
  { pattern: /(?:openai|anthropic|gemini|gpt-4|claude).*api.*(?:call|request|key|secret)/i, reason: 'Paid API usage attempt detected', actionType: 'paid_api' },
  { pattern: /(?:scrape|crawl|harvest).*(?:login|private|admin|dashboard|backend)/i, reason: 'Private/login page scrape attempt detected', actionType: 'private_scrape' },
  { pattern: /(?:clone|replicate|deepfake|copy)\s*(?:real.?person|person|face|identity)/i, reason: 'Real-person clone without consent attempt detected', actionType: 'real_person_clone' },
  { pattern: /(?:clone|replicate|mimic|copy)\s*(?:celebrity|famous)\s*(?:voice|speech|audio)/i, reason: 'Celebrity voice clone attempt detected', actionType: 'celebrity_voice_clone' },
  { pattern: /(?:clone|copy|duplicate|mirror)\s*(?:copyrighted|licensed|proprietary)\s*(?:website|site|web.?app)/i, reason: 'Copyrighted website copy attempt detected', actionType: 'copyrighted_website' },
];

// ─── 18-Category Rule Engine ────────────────────────────────────────────────

async function evaluateCompanyAccess(check: ProtectionCheck): Promise<RuleEvaluation> {
  if (!check.companyId) {
    return { ruleId: 'company_access', passed: true, reason: 'No company context — skip', riskLevel: 'none', requiresApproval: false };
  }
  const company = await db.company.findUnique({ where: { id: check.companyId } });
  if (!company) {
    return { ruleId: 'company_access', passed: false, reason: 'Company not found', riskLevel: 'high', requiresApproval: false };
  }
  if (company.status === 'suspended') {
    return { ruleId: 'company_access', passed: false, reason: 'Company is suspended', riskLevel: 'critical', requiresApproval: false };
  }
  if (company.status !== 'active') {
    return { ruleId: 'company_access', passed: false, reason: `Company status is "${company.status}" — not active`, riskLevel: 'high', requiresApproval: false };
  }
  return { ruleId: 'company_access', passed: true, reason: 'Company is active', riskLevel: 'none', requiresApproval: false };
}

async function evaluateUserRole(check: ProtectionCheck): Promise<RuleEvaluation> {
  if (!check.userId) {
    return { ruleId: 'user_role', passed: true, reason: 'No user context — skip', riskLevel: 'none', requiresApproval: false };
  }
  const user = await db.user.findUnique({ where: { id: check.userId }, select: { role: true, isActive: true } });
  if (!user) {
    return { ruleId: 'user_role', passed: false, reason: 'User not found', riskLevel: 'high', requiresApproval: false };
  }
  if (!user.isActive) {
    return { ruleId: 'user_role', passed: false, reason: 'User account is disabled', riskLevel: 'high', requiresApproval: false };
  }
  const roleHierarchy = ['viewer', 'operator', 'manager', 'admin', 'super_admin'];
  const isDestructive = check.isDataDeletion || check.isProductionChange || check.isCredentialAccess;
  if (isDestructive && roleHierarchy.indexOf(user.role) < roleHierarchy.indexOf('admin')) {
    return { ruleId: 'user_role', passed: false, reason: `User role "${user.role}" insufficient for destructive action`, riskLevel: 'high', requiresApproval: false };
  }
  return { ruleId: 'user_role', passed: true, reason: `User role "${user.role}" verified`, riskLevel: 'none', requiresApproval: false };
}

async function evaluateAgentPermission(check: ProtectionCheck): Promise<RuleEvaluation> {
  if (!check.agentId) {
    return { ruleId: 'agent_permission', passed: true, reason: 'No agent context — skip', riskLevel: 'none', requiresApproval: false };
  }
  const agent = await db.agent.findUnique({ where: { id: check.agentId }, include: { permissions: true } });
  if (!agent) {
    return { ruleId: 'agent_permission', passed: false, reason: 'Agent not found', riskLevel: 'high', requiresApproval: false };
  }
  if (agent.status !== 'active') {
    return { ruleId: 'agent_permission', passed: false, reason: `Agent "${agent.name}" is not active (status: ${agent.status})`, riskLevel: 'high', requiresApproval: false };
  }
  // Check if agent has a permission covering the resource/action
  if (check.resource && agent.permissions.length > 0) {
    const hasPermission = agent.permissions.some(
      (p) => p.resourceId === check.resource || p.resourceId === '*'
    );
    if (!hasPermission) {
      return {
        ruleId: 'agent_permission',
        passed: false,
        reason: `Agent "${agent.name}" has no permission for resource "${check.resource}"`,
        riskLevel: 'medium',
        requiresApproval: true,
        approvalType: 'agent_permission_override',
      };
    }
  }
  return { ruleId: 'agent_permission', passed: true, reason: `Agent "${agent.name}" permission verified`, riskLevel: 'none', requiresApproval: false };
}

async function evaluateToolPermission(check: ProtectionCheck): Promise<RuleEvaluation> {
  if (!check.toolName || !check.agentId) {
    return { ruleId: 'tool_permission', passed: true, reason: 'No tool or agent context — skip', riskLevel: 'none', requiresApproval: false };
  }
  const agent = await db.agent.findUnique({ where: { id: check.agentId }, select: { name: true, allowedTools: true, forbiddenTools: true } });
  if (!agent) {
    return { ruleId: 'tool_permission', passed: true, reason: 'Agent not found — skip tool check', riskLevel: 'none', requiresApproval: false };
  }
  try {
    const forbidden: string[] = JSON.parse(agent.forbiddenTools || '[]');
    if (forbidden.includes(check.toolName) || forbidden.some((f) => new RegExp(f, 'i').test(check.toolName!))) {
      return {
        ruleId: 'tool_permission',
        passed: false,
        reason: `Tool "${check.toolName}" is in agent "${agent.name}" forbidden list`,
        riskLevel: 'high',
        requiresApproval: false,
      };
    }
    const allowed: string[] = JSON.parse(agent.allowedTools || '[]');
    if (allowed.length > 0 && !allowed.includes('*') && !allowed.includes(check.toolName) && !allowed.some((a) => new RegExp(a, 'i').test(check.toolName!))) {
      return {
        ruleId: 'tool_permission',
        passed: false,
        reason: `Tool "${check.toolName}" is not in agent "${agent.name}" allowed tools list`,
        riskLevel: 'medium',
        requiresApproval: true,
        approvalType: 'tool_permission_override',
      };
    }
  } catch {
    // JSON parse failure — allow by default
  }
  return { ruleId: 'tool_permission', passed: true, reason: `Tool "${check.toolName}" permitted for agent`, riskLevel: 'none', requiresApproval: false };
}

function evaluateDataClassification(check: ProtectionCheck): RuleEvaluation {
  if (!check.dataClassification) {
    return { ruleId: 'data_classification', passed: true, reason: 'No data classification specified — skip', riskLevel: 'none', requiresApproval: false };
  }
  const classificationRisk: Record<string, { risk: 'none' | 'low' | 'medium' | 'high' | 'critical'; needsApproval: boolean }> = {
    public: { risk: 'none', needsApproval: false },
    internal: { risk: 'low', needsApproval: false },
    confidential: { risk: 'medium', needsApproval: true },
    restricted: { risk: 'high', needsApproval: true },
    secret: { risk: 'critical', needsApproval: true },
  };
  const config = classificationRisk[check.dataClassification];
  if (!config) {
    return { ruleId: 'data_classification', passed: true, reason: `Unknown classification "${check.dataClassification}" — skip`, riskLevel: 'none', requiresApproval: false };
  }
  return {
    ruleId: 'data_classification',
    passed: config.risk !== 'critical',
    reason: `Data classified as "${check.dataClassification}" (risk: ${config.risk})`,
    riskLevel: config.risk,
    requiresApproval: config.needsApproval,
    approvalType: config.needsApproval ? 'data_access_approval' : undefined,
  };
}

function evaluateActionRisk(check: ProtectionCheck): RuleEvaluation {
  const action = check.action.toLowerCase();
  const highRiskActions = ['delete', 'remove', 'drop', 'truncate', 'destroy', 'purge', 'erase', 'wipe'];
  const mediumRiskActions = ['update', 'modify', 'change', 'edit', 'replace', 'overwrite', 'migrate', 'transfer'];
  const lowRiskActions = ['read', 'get', 'list', 'search', 'query', 'view', 'fetch', 'download', 'export'];

  if (highRiskActions.some((a) => action.includes(a))) {
    return { ruleId: 'action_risk', passed: true, reason: 'High-risk action detected', riskLevel: 'high', requiresApproval: true, approvalType: 'high_risk_action' };
  }
  if (mediumRiskActions.some((a) => action.includes(a))) {
    return { ruleId: 'action_risk', passed: true, reason: 'Medium-risk action detected', riskLevel: 'medium', requiresApproval: false };
  }
  if (lowRiskActions.some((a) => action.includes(a))) {
    return { ruleId: 'action_risk', passed: true, reason: 'Low-risk action detected', riskLevel: 'low', requiresApproval: false };
  }
  return { ruleId: 'action_risk', passed: true, reason: 'Action risk could not be determined — defaulting to medium', riskLevel: 'medium', requiresApproval: false };
}

function evaluateFinancialCost(check: ProtectionCheck): RuleEvaluation {
  if (check.financialCost == null || check.financialCost === 0) {
    return { ruleId: 'financial_cost', passed: true, reason: 'No financial cost — skip', riskLevel: 'none', requiresApproval: false };
  }
  if (check.financialCost > 1000) {
    return { ruleId: 'financial_cost', passed: false, reason: `Financial cost $${check.financialCost} exceeds $1,000 threshold`, riskLevel: 'critical', requiresApproval: true, approvalType: 'financial_approval' };
  }
  if (check.financialCost > 100) {
    return { ruleId: 'financial_cost', passed: true, reason: `Financial cost $${check.financialCost} requires manager approval`, riskLevel: 'high', requiresApproval: true, approvalType: 'financial_approval' };
  }
  if (check.financialCost > 10) {
    return { ruleId: 'financial_cost', passed: true, reason: `Financial cost $${check.financialCost} noted`, riskLevel: 'low', requiresApproval: false };
  }
  return { ruleId: 'financial_cost', passed: true, reason: `Financial cost $${check.financialCost} within limits`, riskLevel: 'none', requiresApproval: false };
}

function evaluateExternalCommunication(check: ProtectionCheck): RuleEvaluation {
  if (!check.isExternalCommunication) {
    return { ruleId: 'external_communication', passed: true, reason: 'Not external communication — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'external_communication', passed: true, reason: 'External communication requires approval', riskLevel: 'medium', requiresApproval: true, approvalType: 'external_communication' };
}

function evaluatePublicPublishing(check: ProtectionCheck): RuleEvaluation {
  if (!check.isPublicPublishing) {
    return { ruleId: 'public_publishing', passed: true, reason: 'Not public publishing — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'public_publishing', passed: true, reason: 'Public publishing ALWAYS requires Super Admin approval', riskLevel: 'high', requiresApproval: true, approvalType: 'super_admin_publish' };
}

function evaluateDataDeletion(check: ProtectionCheck): RuleEvaluation {
  if (!check.isDataDeletion) {
    return { ruleId: 'data_deletion', passed: true, reason: 'Not a data deletion operation — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'data_deletion', passed: true, reason: 'Data deletion ALWAYS requires approval', riskLevel: 'high', requiresApproval: true, approvalType: 'data_deletion_approval' };
}

function evaluateInfrastructureChange(check: ProtectionCheck): RuleEvaluation {
  if (!check.isProductionChange) {
    return { ruleId: 'infrastructure_change', passed: true, reason: 'Not a production change — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'infrastructure_change', passed: true, reason: 'Infrastructure/production change ALWAYS requires approval', riskLevel: 'high', requiresApproval: true, approvalType: 'infrastructure_approval' };
}

function evaluateProductionDeployment(check: ProtectionCheck): RuleEvaluation {
  if (!check.isProductionChange) {
    return { ruleId: 'production_deployment', passed: true, reason: 'Not a production deployment — skip', riskLevel: 'none', requiresApproval: false };
  }
  const action = check.action.toLowerCase();
  const deployActions = ['deploy', 'release', 'publish', 'promote'];
  if (deployActions.some((a) => action.includes(a))) {
    return { ruleId: 'production_deployment', passed: true, reason: 'Production deployment ALWAYS requires Super Admin approval', riskLevel: 'critical', requiresApproval: true, approvalType: 'super_admin_deploy' };
  }
  return { ruleId: 'production_deployment', passed: true, reason: 'Production change noted', riskLevel: 'high', requiresApproval: true, approvalType: 'infrastructure_approval' };
}

function evaluateCredentialAccess(check: ProtectionCheck): RuleEvaluation {
  if (!check.isCredentialAccess) {
    return { ruleId: 'credential_access', passed: true, reason: 'Not credential access — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'credential_access', passed: false, reason: 'Credential access is ALWAYS blocked for non-super-admin users', riskLevel: 'critical', requiresApproval: false };
}

function evaluateLegalSensitivity(check: ProtectionCheck): RuleEvaluation {
  if (!check.isLegalSensitive) {
    return { ruleId: 'legal_sensitivity', passed: true, reason: 'Not legally sensitive — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'legal_sensitivity', passed: true, reason: 'Legally sensitive action requires legal team review', riskLevel: 'high', requiresApproval: true, approvalType: 'legal_review' };
}

function evaluateStudentPrivacy(check: ProtectionCheck): RuleEvaluation {
  if (!check.isStudentPrivacy) {
    return { ruleId: 'student_privacy', passed: true, reason: 'Not student privacy data — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'student_privacy', passed: true, reason: 'Student privacy data — strict protection enforced', riskLevel: 'critical', requiresApproval: true, approvalType: 'privacy_officer_approval' };
}

function evaluateCrossCompanyLeakage(check: ProtectionCheck): RuleEvaluation {
  if (!check.isCrossCompanyAccess) {
    return { ruleId: 'cross_company_leakage', passed: true, reason: 'No cross-company access — skip', riskLevel: 'none', requiresApproval: false };
  }
  return { ruleId: 'cross_company_leakage', passed: false, reason: 'Cross-company data access is ALWAYS BLOCKED', riskLevel: 'critical', requiresApproval: false };
}

function evaluateBulkOperations(check: ProtectionCheck): RuleEvaluation {
  if (!check.isBulkOperation) {
    return { ruleId: 'bulk_operations', passed: true, reason: 'Not a bulk operation — skip', riskLevel: 'none', requiresApproval: false };
  }
  const count = check.bulkCount || 0;
  if (count > 100) {
    return { ruleId: 'bulk_operations', passed: true, reason: `Bulk operation on ${count} items (>100) requires Super Admin approval`, riskLevel: 'high', requiresApproval: true, approvalType: 'super_admin_bulk' };
  }
  if (count > 10) {
    return { ruleId: 'bulk_operations', passed: true, reason: `Bulk operation on ${count} items requires approval`, riskLevel: 'medium', requiresApproval: true, approvalType: 'bulk_operation_approval' };
  }
  return { ruleId: 'bulk_operations', passed: true, reason: `Bulk operation on ${count} items within threshold`, riskLevel: 'low', requiresApproval: false };
}

function evaluateModelOutputValidation(check: ProtectionCheck): RuleEvaluation {
  if (!check.action) {
    return { ruleId: 'model_output_validation', passed: true, reason: 'No action to validate — skip', riskLevel: 'none', requiresApproval: false };
  }
  // Detect prompt injection patterns in the action string
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|above)\s+(instructions?|prompts?)/i,
    /you\s+are\s+now\s+(a|an|the)\s+/i,
    /new\s+instructions?\s*:/i,
    /system\s*:\s*/i,
    /\[INST\]/i,
    /<\|im_start\|>/i,
    /forget\s+(everything|all|your)/i,
    /pretend\s+(you|to\s+be)/i,
    /act\s+as\s+(if|a|an|the)\s+/i,
    /roleplay\s+as/i,
    /jailbreak/i,
    /DAN\s+mode/i,
  ];
  const detected = injectionPatterns.filter((p) => p.test(check.action));
  if (detected.length > 0) {
    return {
      ruleId: 'model_output_validation',
      passed: false,
      reason: `Prompt injection detected: ${detected.length} suspicious pattern(s) found in action`,
      riskLevel: 'critical',
      requiresApproval: false,
    };
  }
  return { ruleId: 'model_output_validation', passed: true, reason: 'No prompt injection patterns detected', riskLevel: 'none', requiresApproval: false };
}

// ─── Full 18-category evaluation ────────────────────────────────────────────

export async function evaluateProtection(check: ProtectionCheck): Promise<ProtectionResult> {
  const evaluations: RuleEvaluation[] = await Promise.all([
    evaluateCompanyAccess(check),
    evaluateUserRole(check),
    evaluateAgentPermission(check),
    evaluateToolPermission(check),
    Promise.resolve(evaluateDataClassification(check)),
    Promise.resolve(evaluateActionRisk(check)),
    Promise.resolve(evaluateFinancialCost(check)),
    Promise.resolve(evaluateExternalCommunication(check)),
    Promise.resolve(evaluatePublicPublishing(check)),
    Promise.resolve(evaluateDataDeletion(check)),
    Promise.resolve(evaluateInfrastructureChange(check)),
    Promise.resolve(evaluateProductionDeployment(check)),
    Promise.resolve(evaluateCredentialAccess(check)),
    Promise.resolve(evaluateLegalSensitivity(check)),
    Promise.resolve(evaluateStudentPrivacy(check)),
    Promise.resolve(evaluateCrossCompanyLeakage(check)),
    Promise.resolve(evaluateBulkOperations(check)),
    Promise.resolve(evaluateModelOutputValidation(check)),
  ]);

  const blockedRules = evaluations.filter((e) => !e.passed).map((e) => e.ruleId);
  const warnings = evaluations.filter((e) => e.passed && e.riskLevel !== 'none').map((e) => e.reason);
  const requiresApproval = evaluations.some((e) => e.requiresApproval);
  const approvalTypes = evaluations.filter((e) => e.requiresApproval && e.approvalType).map((e) => e.approvalType!);
  const uniqueApprovalTypes = [...new Set(approvalTypes)];

  // Determine overall risk level
  const riskOrder: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const maxRisk = evaluations.reduce((max, e) => {
    const score = riskOrder[e.riskLevel] ?? 0;
    return score > riskOrder[max] ? e.riskLevel : max;
  }, 'none' as 'none' | 'low' | 'medium' | 'high' | 'critical');

  const allowed = blockedRules.length === 0;

  return {
    allowed,
    reason: allowed
      ? requiresApproval
        ? `Action allowed but requires approval: ${uniqueApprovalTypes.join(', ')}`
        : 'Action passed all protection checks'
      : `Action blocked by rules: ${blockedRules.join(', ')}`,
    riskLevel: maxRisk,
    requiresApproval,
    approvalType: uniqueApprovalTypes.length > 0 ? uniqueApprovalTypes[0] : undefined,
    blockedRules,
    warnings,
  };
}

// ─── API Handlers ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const [logs, total, blockedCount, allowedCount, topActions] = await Promise.all([
      db.protectionLog.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.protectionLog.count(),
      db.protectionLog.count({ where: { blocked: true } }),
      db.protectionLog.count({ where: { blocked: false } }),
      db.protectionLog.groupBy({
        by: ['actionType'],
        where: { blocked: true },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      stats: {
        total,
        blocked: blockedCount,
        allowed: allowedCount,
        topActions: topActions.map((a) => ({
          actionType: a.actionType,
          count: a._count.id,
        })),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { action, commandId, agentId, companyId, userId, resource, dataClassification, financialCost, isExternalCommunication, isPublicPublishing, isDataDeletion, isProductionChange, isCredentialAccess, isLegalSensitive, isStudentPrivacy, isCrossCompanyAccess, isBulkOperation, toolName, modelName, bulkCount } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const actionStr = action.trim();

    // Phase 1: Pattern-based detection (legacy compatibility)
    for (const rule of PATTERN_RULES) {
      if (rule.pattern.test(actionStr)) {
        await db.blockedAction.create({
          data: {
            actionType: rule.actionType,
            reason: rule.reason,
            commandId: commandId || null,
            agentId: agentId || null,
          },
        });

        await db.protectionLog.create({
          data: {
            actionType: rule.actionType,
            blocked: true,
            reason: rule.reason,
            commandId: commandId || null,
            agentId: agentId || null,
          },
        });

        return NextResponse.json({
          blocked: true,
          reason: rule.reason,
          actionType: rule.actionType,
        });
      }
    }

    // Phase 2: Full 18-category evaluation (when context fields are provided)
    const hasAdvancedContext = companyId || userId || agentId || dataClassification || isExternalCommunication || isPublicPublishing || isDataDeletion || isProductionChange || isCredentialAccess || isLegalSensitive || isStudentPrivacy || isCrossCompanyAccess || isBulkOperation;

    if (hasAdvancedContext) {
      const result = await evaluateProtection({
        companyId,
        userId,
        agentId,
        action: actionStr,
        resource,
        dataClassification,
        financialCost,
        isExternalCommunication,
        isPublicPublishing,
        isDataDeletion,
        isProductionChange,
        isCredentialAccess,
        isLegalSensitive,
        isStudentPrivacy,
        isCrossCompanyAccess,
        isBulkOperation,
        toolName,
        modelName,
        bulkCount,
      });

      await db.protectionLog.create({
        data: {
          actionType: result.allowed ? 'evaluated_pass' : 'evaluated_block',
          blocked: !result.allowed,
          reason: result.reason,
          commandId: commandId || null,
          agentId: agentId || null,
        },
      });

      if (!result.allowed) {
        await db.blockedAction.create({
          data: {
            actionType: `rule_engine:${result.blockedRules.join(',')}`,
            reason: result.reason,
            commandId: commandId || null,
            agentId: agentId || null,
          },
        });
      }

      return NextResponse.json(result);
    }

    // Legacy: simple pattern check passed
    await db.protectionLog.create({
      data: {
        actionType: 'checked',
        blocked: false,
        reason: 'Action passed all protection checks',
        commandId: commandId || null,
        agentId: agentId || null,
      },
    });

    return NextResponse.json({ blocked: false });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}