import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import ZAI from 'z-ai-web-dev-sdk';

let _zai: ZAI | null = null;
async function getZAI(): Promise<ZAI> {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
}

// ── In-memory rate limit counters ──────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

// ── In-memory user usage aggregation cache ─────────────────────────────
interface UserUsageEntry {
  requestCount: number;
  tokenConsumption: number;
  dayStart: string; // YYYY-MM-DD
}
const userUsageMap = new Map<string, UserUsageEntry>();

function getUserUsageKey(userId: string): string {
  return userId;
}

function getTodayLabel(): string {
  return new Date().toISOString().slice(0, 10);
}

function recordUserUsage(userId: string, tokensUsed: number): UserUsageEntry {
  const today = getTodayLabel();
  const key = getUserUsageKey(userId);
  let entry = userUsageMap.get(key);

  if (!entry || entry.dayStart !== today) {
    entry = { requestCount: 0, tokenConsumption: 0, dayStart: today };
    userUsageMap.set(key, entry);
  }

  entry.requestCount += 1;
  entry.tokenConsumption += tokensUsed;
  return entry;
}

function getUserUsage(userId: string): UserUsageEntry | undefined {
  const key = getUserUsageKey(userId);
  const entry = userUsageMap.get(key);
  if (!entry || entry.dayStart !== getTodayLabel()) return undefined;
  return entry;
}

// ── Intent detection types & model routing ─────────────────────────────
type IntentCategory =
  | 'general_chat'
  | 'data_query'
  | 'content_generation'
  | 'code_assistance'
  | 'document_analysis'
  | 'research'
  | 'translation'
  | 'summarization';

interface IntentRule {
  patterns: RegExp[];
  intent: IntentCategory;
  model: string;
  priority: number;
}

const INTENT_RULES: IntentRule[] = [
  // code_assistance — highest priority to avoid misrouting
  {
    patterns: [
      /\b(?:write|create|generate|build|fix|debug|refactor|implement)\s+(?:a\s+)?(?:function|class|component|module|api|endpoint|script|program|code|algorithm|handler|service|middleware)\b/i,
      /\b(?:javascript|typescript|python|java|go|rust|c\+\+|ruby|php|sql|html|css|jsx|tsx)\b.*\b(?:code|function|example|snippet|implement)\b/i,
      /\b(?:bug|error|exception|stack\s*trace|type\s*error|syntax\s*error)\b/i,
      /\b(?:code\s*review|pull\s*request|code\s*quality|lint|format)\b/i,
      /\b(?:how\s+(?:do|to|can)\s+I\s+)?(?:code|program|implement|write)\b/i,
      /```(?:js|ts|py|java|go|rs|rb|php|sql|html|css|tsx|jsx|sh|bash)/,
      /\b(?:npm|yarn|bun|pip|cargo|go\s+mod|composer)\b.*\b(?:install|add|run)\b/i,
    ],
    intent: 'code_assistance',
    model: 'deepseek-coder',
    priority: 100,
  },
  // translation
  {
    patterns: [
      /\btranslate\s+(?:this|the|from|to|into|in)\b/i,
      /\b(?:translation|translate|翻译|traduire|übersetzen|traducir)\b/i,
      /\b(?:from|to)\s+(?:english|chinese|spanish|french|german|japanese|korean|arabic|russian|portuguese|italian)\b/i,
      /\b(?:英译中|中译英|翻译成|翻译为)\b/,
    ],
    intent: 'translation',
    model: 'qwen-72b',
    priority: 90,
  },
  // summarization
  {
    patterns: [
      /\b(?:summarize|summary|tldr|tl;dr|recap|digest|brief|outline|condense|abridge)\b/i,
      /\b(?:summarization|概括|总结|摘要|归纳|简述)\b/i,
      /\b(?:key\s+(?:points|takeaways|findings|highlights|insights))\b/i,
      /\bin\s+(?:\d+)\s+(?:words|sentences|lines|bullets)\b/i,
    ],
    intent: 'summarization',
    model: 'deepseek-v3',
    priority: 85,
  },
  // document_analysis
  {
    patterns: [
      /\b(?:analyze|analysis|parse|extract|review)\s+(?:this\s+)?(?:document|pdf|file|report|paper|article|contract|invoice|receipt)\b/i,
      /\b(?:document\s+analysis|文档分析|文件分析|pdf.*分析)\b/i,
      /\b(?:ocr|optical\s+character|text\s+recognition)\b/i,
      /\b(?:table\s+extraction|data\s+extraction|form\s+parsing)\b/i,
    ],
    intent: 'document_analysis',
    model: 'qwen-72b',
    priority: 80,
  },
  // research
  {
    patterns: [
      /\b(?:research|investigate|explore|study|survey|find\s+out|look\s+into|dig\s+into)\b/i,
      /\b(?:what\s+is\s+the\s+(?:latest|current|recent)|recent\s+(?:developments|advances|trends|studies|research))\b/i,
      /\b(?:compare\s+(?:and\s+contrast|vs|versus|with)|comparison\s+of|differences?\s+between)\b/i,
      /\b(?:学术|研究|调研|文献|论文|资料)\b/,
    ],
    intent: 'research',
    model: 'deepseek-v3',
    priority: 70,
  },
  // data_query
  {
    patterns: [
      /\b(?:query|search|filter|find|look\s+up|get|fetch|retrieve|list|show\s+me)\s+(?:the\s+)?(?:data|records?|entries?|items?|results?|rows?|documents?)\b/i,
      /\b(?:sql|select\s+.*from|where\s+.*=|group\s+by|order\s+by|join\s+|aggregate)\b/i,
      /\b(?:data\s+query|数据查询|查询|检索|筛选)\b/i,
      /\b(?:how\s+many|count|total|average|sum|median|percentage|proportion)\b/i,
      /\b(?:dashboard|metrics?|kpi|analytics?|statistics|stats)\b/i,
    ],
    intent: 'data_query',
    model: 'qwen-72b',
    priority: 60,
  },
  // content_generation
  {
    patterns: [
      /\b(?:write|create|generate|draft|compose|craft|produce|make)\s+(?:a\s+)?(?:article|blog|post|essay|story|poem|song|email|letter|memo|report|whitepaper|guide|tutorial|documentation|copy|headline|slogan|tagline|caption|description|bio|profile|about\s+page|landing\s+page)\b/i,
      /\b(?:content\s+generation|内容生成|写一?篇|帮我写|生成.*内容)\b/i,
      /\b(?:marketing\s+copy|ad\s+copy|social\s+media\s+post|product\s+description)\b/i,
    ],
    intent: 'content_generation',
    model: 'deepseek-v3',
    priority: 50,
  },
];

const DEFAULT_INTENT: IntentCategory = 'general_chat';
const DEFAULT_MODEL = 'qwen-72b';

interface DetectedIntent {
  category: IntentCategory;
  model: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns: number;
}

function detectIntent(inputStr: string): DetectedIntent {
  let bestMatch: DetectedIntent = {
    category: DEFAULT_INTENT,
    model: DEFAULT_MODEL,
    confidence: 'low',
    matchedPatterns: 0,
  };

  for (const rule of INTENT_RULES) {
    let matchCount = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(inputStr)) {
        matchCount++;
      }
    }
    if (matchCount > 0 && (matchCount > bestMatch.matchedPatterns || rule.priority > 100)) {
      const confidence: 'high' | 'medium' | 'low' =
        matchCount >= 3 ? 'high' : matchCount >= 2 ? 'medium' : 'low';
      bestMatch = {
        category: rule.intent,
        model: rule.model,
        confidence,
        matchedPatterns: matchCount,
      };
    }
  }

  return bestMatch;
}

// ── Skill matching helpers ─────────────────────────────────────────────
interface MatchedSkill {
  id: string;
  name: string;
  slug: string;
  content: string;
  purpose: string;
  category: string;
}

async function findMatchingSkills(inputStr: string, companyId: string): Promise<MatchedSkill[]> {
  const allSkills = await db.skill.findMany({
    where: {
      status: { in: ['approved', 'private'] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      content: true,
      purpose: true,
      category: true,
    },
  });

  if (allSkills.length === 0) return [];

  const inputLower = inputStr.toLowerCase();
  const matches: MatchedSkill[] = [];

  for (const skill of allSkills) {
    // Match by skill name/slug appearing in input
    const nameMatch = inputLower.includes(skill.name.toLowerCase()) || inputLower.includes(skill.slug.toLowerCase());
    // Match by category keyword
    const categoryMatch = skill.category && inputLower.includes(skill.category.toLowerCase());
    // Match by purpose keywords
    const purposeKeywords = skill.purpose
      .toLowerCase()
      .split(/[,;\s]+/)
      .filter((w) => w.length > 3);
    const purposeMatchCount = purposeKeywords.filter((kw) => inputLower.includes(kw)).length;

    if (nameMatch || categoryMatch || purposeMatchCount >= 2) {
      matches.push({
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        content: skill.content,
        purpose: skill.purpose,
        category: skill.category,
      });
    }
  }

  return matches.slice(0, 3); // Cap at 3 skills to avoid context bloat
}

// ── Output schema validation ───────────────────────────────────────────
interface ValidationResult {
  valid: boolean;
  parsedJson: unknown | null;
  warning?: string;
}

function validateOutputSchema(output: string, expectJson: boolean): ValidationResult {
  if (!expectJson) {
    return { valid: true, parsedJson: null };
  }

  const trimmed = output.trim();

  // Try to extract JSON from markdown code blocks or raw
  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return { valid: true, parsedJson: parsed };
  } catch {
    return {
      valid: false,
      parsedJson: null,
      warning: 'Output was expected to be valid JSON but failed to parse',
    };
  }
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ── IPv4 CIDR matching ───────────────────────────────────────────────
function ipv4ToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr || '32', 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(range) & mask);
}

function isIpAllowed(clientIp: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((entry) => isIpInCidr(clientIp, entry));
}

function checkRateLimit(keyId: string, limit: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(keyId);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    rateLimitMap.set(keyId, entry);
  }

  const allowed = entry.count < limit;
  if (allowed) {
    entry.count++;
  }

  return {
    allowed,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS,
  };
}

// ── Protection mode patterns (mirrors protection route) ────────────────
const PROTECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /(?:read|access|cat|print)\s+.*(?:credential|secret|api.?key)\b/i, reason: 'Credential access attempt' },
  { pattern: /document\.cookie/i, reason: 'Cookie access attempt' },
  { pattern: /rm\s+.*-rf/i, reason: 'Dangerous recursive deletion' },
  { pattern: /curl\b.*\|\s*(?:ba)?sh/i, reason: 'curl pipe bash execution' },
  { pattern: /wget\b.*(?:-O|-o).*(?:ba)?sh/i, reason: 'wget to shell script' },
  { pattern: /echo\b.*base64.*\|\s*(?:ba)?sh/i, reason: 'Base64 pipe to shell' },
  { pattern: /(?:exfil|exfiltrat|send.*data.*outside|upload.*sensitive|leak.*data)/i, reason: 'Data exfiltration attempt' },
  { pattern: /(?:clone|replicate|deepfake|copy)\s*(?:real.?person|person|face|identity)/i, reason: 'Real-person clone attempt' },
];

function runProtectionCheck(input: string): { blocked: boolean; reason?: string } {
  for (const rule of PROTECTION_PATTERNS) {
    if (rule.pattern.test(input)) {
      return { blocked: true, reason: rule.reason };
    }
  }
  return { blocked: false };
}

// ── Paid API patterns (mirrors payment-guard) ──────────────────────────
const PAID_API_PATTERNS: { pattern: RegExp; apiName: string }[] = [
  { pattern: /\bopenai\b/i, apiName: 'openai' },
  { pattern: /\banthropic\b/i, apiName: 'anthropic' },
  { pattern: /\bgemini\b/i, apiName: 'gemini' },
  { pattern: /\bgpt-4\b/i, apiName: 'gpt-4' },
  { pattern: /\bclaude\b/i, apiName: 'claude' },
];

function runPaymentGuardCheck(input: string, paidApiAllowed: boolean): { blocked: boolean; apiName?: string; reason?: string } {
  for (const rule of PAID_API_PATTERNS) {
    if (rule.pattern.test(input)) {
      if (!paidApiAllowed) {
        return { blocked: true, apiName: rule.apiName, reason: `Paid API "${rule.apiName}" requires payment authorization` };
      }
    }
  }
  return { blocked: false };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'validate':
        return handleValidate(body);
      case 'execute':
        return handleExecute(body, request);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[tenant-gateway POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── VALIDATE ───────────────────────────────────────────────────────────
async function handleValidate(body: Record<string, unknown>) {
  const { apiKey, requiredScopes } = body;
  const errors: string[] = [];

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ valid: false, errors: ['API key is required'] });
  }

  // 1. Hash and lookup the key
  const keyHash = hashKey(apiKey);
  const keyRecord = await db.companyApiKey.findUnique({ where: { keyHash } });
  if (!keyRecord) {
    errors.push('Invalid API key');
    return NextResponse.json({ valid: false, errors });
  }

  // 2. Check active
  if (!keyRecord.isActive) {
    errors.push('API key is inactive');
  }

  // 3. Check expiry
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    errors.push('API key has expired');
  }

  // 4. Resolve company
  const company = await db.company.findUnique({ where: { id: keyRecord.companyId } });
  if (!company) {
    errors.push('Associated company not found');
  }
  if (company && company.status !== 'active') {
    errors.push(`Company status is "${company.status}" (must be active)`);
  }

  // 5. Validate scopes
  const keyScopes: string[] = JSON.parse(keyRecord.scopes);
  const required = Array.isArray(requiredScopes) ? requiredScopes : [];
  const missingScopes = required.filter((s: string) => !keyScopes.includes(s) && !keyScopes.includes('*'));
  if (missingScopes.length > 0) {
    errors.push(`Missing scopes: ${missingScopes.join(', ')}`);
  }

  // 6. Rate limit check
  const rateCheck = checkRateLimit(keyRecord.id, keyRecord.rateLimit);
  if (!rateCheck.allowed) {
    errors.push('Rate limit exceeded');
  }

  // Update last used
  await db.companyApiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  const valid = errors.length === 0;

  return NextResponse.json({
    valid,
    company: company ? {
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
    } : null,
    key: {
      id: keyRecord.id,
      name: keyRecord.name,
      keyType: keyRecord.keyType,
      scopes: keyScopes,
    },
    scopes: keyScopes,
    remainingRate: rateCheck.remaining,
    resetAt: rateCheck.resetAt,
    errors: valid ? [] : errors,
  });
}

// ── EXECUTE ────────────────────────────────────────────────────────────
async function handleExecute(body: Record<string, unknown>, request: NextRequest) {
  const { apiKey, workflowId, agentId, input, requiredScopes } = body;
  const errors: string[] = [];

  // 1. Validate API key
  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'API key is required' }, { status: 401 });
  }

  const keyHash = hashKey(apiKey);
  const keyRecord = await db.companyApiKey.findUnique({ where: { keyHash } });
  if (!keyRecord) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }
  if (!keyRecord.isActive) {
    return NextResponse.json({ error: 'API key is inactive' }, { status: 403 });
  }
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return NextResponse.json({ error: 'API key has expired' }, { status: 403 });
  }

  // 2b. IP allowlist enforcement
  const ipAllowlist: string[] = JSON.parse(keyRecord.ipAllowlist || '[]');
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '';
  if (ipAllowlist.length > 0 && clientIp && !isIpAllowed(clientIp, ipAllowlist)) {
    return NextResponse.json({ error: 'IP not in allowlist' }, { status: 403 });
  }

  // 2. Resolve company (tenant)
  const company = await db.company.findUnique({ where: { id: keyRecord.companyId } });
  if (!company) {
    return NextResponse.json({ error: 'Associated company not found' }, { status: 500 });
  }
  if (company.status !== 'active') {
    return NextResponse.json({ error: `Company is not active (status: ${company.status})` }, { status: 403 });
  }

  // Resolve user from header
  const userId = request.headers.get('x-alo-user-id');
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;

  // 3. Validate scopes
  const keyScopes: string[] = JSON.parse(keyRecord.scopes);
  const required = Array.isArray(requiredScopes) ? requiredScopes : [];
  const missingScopes = required.filter((s: string) => !keyScopes.includes(s) && !keyScopes.includes('*'));
  if (missingScopes.length > 0) {
    return NextResponse.json({ error: `Insufficient scopes. Missing: ${missingScopes.join(', ')}` }, { status: 403 });
  }

  // 4. Check rate limit
  const rateCheck = checkRateLimit(keyRecord.id, keyRecord.rateLimit);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAt: rateCheck.resetAt, remainingRate: 0 },
      { status: 429 }
    );
  }

  // 5. Check company usage limit
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const monthlyUsage = await db.usageLog.count({
    where: {
      companyId: company.id,
      createdAt: { gte: currentMonthStart },
    },
  });

  if (monthlyUsage >= company.monthlyUsageLimit) {
    return NextResponse.json(
      { error: `Monthly usage limit reached (${monthlyUsage}/${company.monthlyUsageLimit})` },
      { status: 429 }
    );
  }

  // Validate input
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ error: 'input (object) is required' }, { status: 400 });
  }

  const inputStr = JSON.stringify(input);

  // 6. Protection Mode check
  const protectionResult = runProtectionCheck(inputStr);
  if (protectionResult.blocked) {
    await db.protectionLog.create({
      data: {
        actionType: 'gateway_blocked',
        blocked: true,
        reason: protectionResult.reason || 'Unknown protection rule',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user?.id || null,
        action: 'tenant_gateway.protection_blocked',
        resource: 'CompanyApiKey',
        details: JSON.stringify({ companyId: company.id, keyId: keyRecord.id, reason: protectionResult.reason }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json(
      { error: `Blocked by protection mode: ${protectionResult.reason}` },
      { status: 403 }
    );
  }

  // 7. Payment Guard check
  const paymentResult = runPaymentGuardCheck(inputStr, company.paidApiAllowed);
  if (paymentResult.blocked) {
    await db.paymentGuardLog.create({
      data: {
        apiName: paymentResult.apiName || 'unknown',
        blocked: true,
        reason: paymentResult.reason,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user?.id || null,
        action: 'tenant_gateway.payment_guard_blocked',
        resource: 'CompanyApiKey',
        details: JSON.stringify({ companyId: company.id, keyId: keyRecord.id, apiName: paymentResult.apiName, reason: paymentResult.reason }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    });

    return NextResponse.json(
      { error: `Blocked by payment guard: ${paymentResult.reason}` },
      { status: 403 }
    );
  }

  // Check for pending approvals
  const pendingApproval = await db.approval.findFirst({
    where: {
      status: 'pending',
      OR: [
        { type: 'deployment' },
        { type: 'paid_api' },
        { type: 'external_cost' },
      ],
    },
  });
  if (pendingApproval) {
    return NextResponse.json({ error: 'Pending approval required', approvalId: pendingApproval.id }, { status: 403 });
  }

  // Determine execution target
  let executionTarget: { type: string; name: string; id: string };

  if (agentId && typeof agentId === 'string') {
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    if (agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent is not active' }, { status: 403 });
    }
    executionTarget = { type: 'agent', name: agent.name, id: agent.id };
  } else if (workflowId && typeof workflowId === 'string') {
    const workflow = await db.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    if (workflow.status !== 'active') {
      return NextResponse.json({ error: 'Workflow is not active' }, { status: 403 });
    }
    executionTarget = { type: 'workflow', name: workflow.name, id: workflow.id };
  } else {
    // Default: no specific agent/workflow, just process input directly
    executionTarget = { type: 'direct', name: 'Direct Execution', id: 'direct' };
  }

  // ── Step 8b: Intent Detection & Auto-Routing ──────────────────────
  const detectedIntent = detectIntent(inputStr);
  const selectedModel = detectedIntent.model;

  // ── Step 8c: Skill Inline Execution ───────────────────────────────
  const matchedSkills = await findMatchingSkills(inputStr, company.id);
  let skillContext = '';
  let skillExecutionDetails: { skillId: string; skillName: string; status: string; durationMs: number; output: string | null }[] = [];

  if (matchedSkills.length > 0) {
    const skillParts: string[] = [];
    for (const skill of matchedSkills) {
      const skillStart = Date.now();
      try {
        // Execute the skill's prompt template as a lightweight inline invocation
        // The skill content (SKILL.md) serves as the system prompt enrichment
        const skillPrompt = skill.purpose
          ? `${skill.name}: ${skill.purpose}\n\n${skill.content}`
          : `${skill.name}:\n${skill.content}`;

        // We do a quick LLM call per skill to generate contextual knowledge
        const skillResponse = await (await getZAI()).chat.completions.create({
          messages: [
            { role: 'system', content: `You are a skill execution engine. Given the skill definition and user context, produce a concise knowledge summary that will help answer the user's request. Keep it focused and actionable.` },
            { role: 'user', content: `Skill Definition:\n${skillPrompt}\n\nUser Request:\n${inputStr}\n\nProduce a concise knowledge summary for this skill in the context of the user request.` },
          ],
          model: selectedModel,
        });

        const skillOutput = typeof skillResponse === 'string' ? skillResponse : JSON.stringify(skillResponse);
        skillParts.push(`[Skill: ${skill.name}]\n${skillOutput}`);
        skillExecutionDetails.push({
          skillId: skill.id,
          skillName: skill.name,
          status: 'completed',
          durationMs: Date.now() - skillStart,
          output: skillOutput.substring(0, 2000),
        });
      } catch (skillErr) {
        const errMsg = skillErr instanceof Error ? skillErr.message : 'Skill execution failed';
        skillParts.push(`[Skill: ${skill.name}] (execution failed: ${errMsg})`);
        skillExecutionDetails.push({
          skillId: skill.id,
          skillName: skill.name,
          status: 'failed',
          durationMs: Date.now() - skillStart,
          output: errMsg,
        });
      }
    }
    skillContext = matchedSkills.length > 0
      ? `\n\nThe following skill knowledge was retrieved and should inform your response:\n${skillParts.join('\n\n---\n\n')}`
      : '';
  }

  // 8. Execute via z-ai-web-dev-sdk
  const startTime = Date.now();
  let runRecordId: string | null = null;
  let runOutput: string | null = null;
  let executionError: string | null = null;
  let outputValidationWarning: string | undefined;

  try {
    // Create run record
    if (executionTarget.type === 'workflow') {
      const run = await db.workflowRun.create({
        data: {
          workflowId: executionTarget.id,
          workflowName: executionTarget.name,
          companyId: company.id,
          status: 'running',
          input: inputStr,
        },
      });
      runRecordId = run.id;
    } else if (executionTarget.type === 'agent') {
      const run = await db.agentRun.create({
        data: {
          agentId: executionTarget.id,
          agentName: executionTarget.name,
          status: 'running',
          input: inputStr,
        },
      });
      runRecordId = run.id;
    }

    // Build messages for LLM — model is now selected by intent detection
    const userMessage = typeof input === 'object' ? JSON.stringify(input) : String(input);
    const systemPrompt = `You are ${executionTarget.name}, operating within the ALO Labs Agent Hub for company: ${company.name}. Process the user request according to your designated role.${skillContext}`;

    const response = await (await getZAI()).chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model: selectedModel,
    });

    runOutput = typeof response === 'string' ? response : JSON.stringify(response);

    // ── Step 8d: Output Schema Validation ───────────────────────────
    // Determine if the caller expects JSON output
    const expectJson = typeof input === 'object' && (input as Record<string, unknown>).responseFormat === 'json';
    const validation = validateOutputSchema(runOutput, expectJson);

    if (!validation.valid) {
      // Retry once with a corrective prompt
      try {
        const correctiveResponse = await (await getZAI()).chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
            { role: 'assistant', content: runOutput },
            { role: 'user', content: 'Your previous response was expected to be valid JSON but failed to parse. Please re-generate your response as properly formatted JSON only, with no extra text before or after the JSON object/array.' },
          ],
          model: selectedModel,
        });
        const correctiveOutput = typeof correctiveResponse === 'string' ? correctiveResponse : JSON.stringify(correctiveResponse);
        const retryValidation = validateOutputSchema(correctiveOutput, expectJson);

        if (retryValidation.valid) {
          runOutput = correctiveOutput;
        } else {
          // Retry also failed — keep original with warning
          outputValidationWarning = 'Output schema validation failed after retry; raw output returned';
        }
      } catch {
        // Corrective call itself failed — keep original with warning
        outputValidationWarning = 'Output schema validation failed; raw output returned';
      }
    }

    // Update run record as completed
    const endTime = Date.now();
    if (runRecordId) {
      if (executionTarget.type === 'workflow') {
        await db.workflowRun.update({
          where: { id: runRecordId },
          data: { status: 'completed', output: runOutput, completedAt: new Date(), durationMs: endTime - startTime },
        });
      } else if (executionTarget.type === 'agent') {
        await db.agentRun.update({
          where: { id: runRecordId },
          data: { status: 'completed', output: runOutput, completedAt: new Date(), durationMs: endTime - startTime },
        });
      }
    }
  } catch (err) {
    executionError = err instanceof Error ? err.message : 'Execution failed';

    if (runRecordId) {
      if (executionTarget.type === 'workflow') {
        await db.workflowRun.update({
          where: { id: runRecordId },
          data: { status: 'failed', output: JSON.stringify({ error: executionError }), completedAt: new Date(), durationMs: Date.now() - startTime },
        });
      } else if (executionTarget.type === 'agent') {
        await db.agentRun.update({
          where: { id: runRecordId },
          data: { status: 'failed', output: JSON.stringify({ error: executionError }), completedAt: new Date(), durationMs: Date.now() - startTime },
        });
      }
    }

    return NextResponse.json(
      { error: 'Execution failed', details: executionError, runId: runRecordId },
      { status: 500 }
    );
  }

  // Post-execution metrics
  const elapsed = Date.now() - startTime;
  const tokensUsed = runOutput ? Math.ceil(runOutput.length / 4) : 0;

  // Create a Task record for step logs and output storage
  const task = await db.task.create({
    data: {
      title: `${executionTarget.name} - Gateway Run`,
      status: 'completed',
      workflowId: executionTarget.type === 'workflow' ? executionTarget.id : null,
      agentId: executionTarget.type === 'agent' ? executionTarget.id : null,
      userId: user?.id || null,
      startedAt: new Date(startTime),
      completedAt: new Date(),
    },
  });

  // Create step logs
  if (workflowId) {
    await db.taskStep.create({
      data: {
        taskId: task.id,
        stepNumber: 1,
        agentId: typeof agentId === 'string' ? agentId : null,
        action: 'llm_execution',
        input: JSON.stringify(body),
        output: runOutput ? runOutput.substring(0, 10000) : null,
        status: 'completed',
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
    });
  }

  // Update company usage summary
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodLabel = `monthly-${monthStart.toISOString().slice(0, 7)}`;
  const existingCompanyUsage = await db.companyUsageSummary.findFirst({
    where: { companyId: company.id, period: periodLabel },
  });
  if (existingCompanyUsage) {
    await db.companyUsageSummary.update({
      where: { id: existingCompanyUsage.id },
      data: { totalRequests: { increment: 1 }, totalTokensUsed: { increment: tokensUsed } },
    });
  } else {
    await db.companyUsageSummary.create({
      data: { companyId: company.id, period: periodLabel, totalRequests: 1, totalTokensUsed: tokensUsed, totalCostEstimate: 0 },
    });
  }

  // Update agent usage summary
  if (agentId) {
    const existingAgentUsage = await db.agentUsageSummary.findFirst({
      where: { agentId, period: periodLabel },
    });
    if (existingAgentUsage) {
      await db.agentUsageSummary.update({
        where: { id: existingAgentUsage.id },
        data: { totalRuns: { increment: 1 }, successCount: { increment: 1 }, avgRuntimeMs: elapsed, totalTokensUsed: { increment: tokensUsed } },
      });
    } else {
      await db.agentUsageSummary.create({
        data: { agentId: agentId as string, period: periodLabel, totalRuns: 1, successCount: 1, failureCount: 0, avgRuntimeMs: elapsed, totalTokensUsed: tokensUsed },
      });
    }
  }

  // Store output
  if (runOutput) {
    await db.output.create({
      data: {
        taskId: task.id,
        type: 'text',
        content: runOutput,
      },
    });
  }

  // Audit log for successful execution
  await db.auditLog.create({
    data: {
      userId: user?.id || null,
      action: 'task.execute.success',
      resource: agentId ? 'Agent' : 'Workflow',
      details: JSON.stringify({ companyId: company.id, agentId, workflowId, durationMs: elapsed }),
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    },
  });

  // ── Step 8e: Skill Usage Logging ─────────────────────────────────
  if (skillExecutionDetails.length > 0) {
    for (const detail of skillExecutionDetails) {
      await db.skillRun.create({
        data: {
          skillId: detail.skillId,
          skillName: detail.skillName,
          taskId: task.id,
          status: detail.status,
          input: JSON.stringify({ source: 'gateway_inline', inputPreview: inputStr.substring(0, 500) }),
          output: detail.output,
          durationMs: detail.durationMs,
          createdAt: new Date(),
          completedAt: detail.status === 'completed' ? new Date() : null,
        },
      });
    }
  }

  // ── Step 8f: User Usage Aggregation ──────────────────────────────
  let userUsageSnapshot: UserUsageEntry | undefined;
  if (user?.id) {
    userUsageSnapshot = recordUserUsage(user.id, tokensUsed);
  }

  // 9. Log usage
  await db.usageLog.create({
    data: {
      companyId: company.id,
      companyName: company.name,
      userId: user?.id || null,
      userName: user?.name || 'api-user',
      workflowId: executionTarget.type === 'workflow' ? executionTarget.id : null,
      workflowName: executionTarget.type === 'workflow' ? executionTarget.name : null,
      agentId: executionTarget.type === 'agent' ? executionTarget.id : null,
      agentName: executionTarget.type === 'agent' ? executionTarget.name : null,
      skillId: skillExecutionDetails.length > 0 ? skillExecutionDetails.map((s) => s.skillId).join(',') : null,
      skillName: skillExecutionDetails.length > 0 ? skillExecutionDetails.map((s) => s.skillName).join(',') : null,
      tokensOrLocalUsed: tokensUsed,
      status: 'completed',
      completedAt: new Date(),
    },
  });

  // Update last used on key
  await db.companyApiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  // 10. Return result
  return NextResponse.json({
    success: true,
    runId: runRecordId,
    company: { id: company.id, name: company.name },
    target: executionTarget,
    output: runOutput ? JSON.parse(runOutput) : null,
    durationMs: Date.now() - startTime,
    remainingRate: rateCheck.remaining,
    // Step 8b metadata
    intent: {
      category: detectedIntent.category,
      model: selectedModel,
      confidence: detectedIntent.confidence,
    },
    // Step 8c metadata
    skillsInvoked: skillExecutionDetails.map((s) => ({
      skillId: s.skillId,
      skillName: s.skillName,
      status: s.status,
      durationMs: s.durationMs,
    })),
    // Step 8d metadata
    schemaValidation: outputValidationWarning
      ? { valid: false, warning: outputValidationWarning }
      : { valid: true },
    // Step 8f metadata
    userUsage: userUsageSnapshot
      ? {
          date: userUsageSnapshot.dayStart,
          requestCount: userUsageSnapshot.requestCount,
          tokenConsumption: userUsageSnapshot.tokenConsumption,
        }
      : undefined,
  });
}