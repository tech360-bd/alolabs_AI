import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

const INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /ignore all (?:above|prior) instructions/i,
  /you are now/i,
  /forget your rules/i,
  /system prompt/i,
  /pretend you are/i,
  /act as if/i,
  /jailbreak/i,
  /bypass safety/i,
  /override instructions/i,
]

const PERSONAL_DATA_PATTERNS = [
  /\b\d{16}\b/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
]

const SECRET_PATTERNS = [
  /\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/i,
  /\b(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*["']?[^\s"',;}]{8,}/i,
]

const FORBIDDEN_ACTIONS = [
  'grant permissions',
  'disable security',
  'delete logs',
  'change billing',
  'escalate privileges',
  'modify roles',
  'drop database',
  'delete all',
]

export interface SecurityContext {
  companyId?: string
  agentId?: string
}

export async function validateInput(
  input: Record<string, unknown>,
  context: SecurityContext = {},
): Promise<{ valid: boolean; flags: string[]; riskScore: number; sanitized: Record<string, unknown> }> {
  const flags: string[] = []
  let riskScore = 0
  const inputStr = JSON.stringify(input)

  if (INJECTION_PATTERNS.some((pattern) => pattern.test(inputStr))) {
    flags.push('prompt_injection')
    riskScore += 0.7
  }

  if (PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(inputStr))) {
    flags.push('potential_personal_data')
    riskScore += 0.1
  }

  if (SECRET_PATTERNS.some((pattern) => pattern.test(inputStr))) {
    flags.push('potential_secret_in_input')
    riskScore += 0.5
  }

  const lowerInput = inputStr.toLowerCase()
  if (FORBIDDEN_ACTIONS.some((action) => lowerInput.includes(action))) {
    flags.push('restricted_action_requested')
    riskScore += 0.5
  }

  if (inputStr.length > 50_000) {
    flags.push('oversized_input')
    riskScore += 0.2
  }

  const boundedRiskScore = Math.min(riskScore, 1)
  const valid = !flags.includes('prompt_injection') && !flags.includes('oversized_input')
  await logSecurityEvent(
    'prompt_injection_check',
    severityFor(boundedRiskScore),
    inputStr,
    undefined,
    boundedRiskScore,
    valid ? (flags.length > 0 ? 'flagged' : 'passed') : 'blocked',
    flags,
    context,
  )

  return { valid, flags, riskScore: boundedRiskScore, sanitized: input }
}

export async function validateOutput(
  output: string,
  context: SecurityContext = {},
): Promise<{ valid: boolean; flags: string[]; riskScore: number }> {
  const flags: string[] = []
  let riskScore = 0

  if (PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(output))) {
    flags.push('personal_data_in_output')
    riskScore += 0.5
  }

  if (SECRET_PATTERNS.some((pattern) => pattern.test(output))) {
    flags.push('secret_in_output')
    riskScore += 0.8
  }

  const boundedRiskScore = Math.min(riskScore, 1)
  const valid = flags.length === 0
  await logSecurityEvent(
    'output_validation',
    severityFor(boundedRiskScore),
    undefined,
    output,
    boundedRiskScore,
    valid ? 'passed' : 'blocked',
    flags,
    context,
  )

  return { valid, flags, riskScore: boundedRiskScore }
}

export async function calculateRiskScore(input: string, output?: string): Promise<number> {
  let score = 0
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(input))) score += 0.7
  if (FORBIDDEN_ACTIONS.some((action) => input.toLowerCase().includes(action))) score += 0.5
  if (SECRET_PATTERNS.some((pattern) => pattern.test(input))) score += 0.5
  if (output && PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(output))) score += 0.5
  if (output && SECRET_PATTERNS.some((pattern) => pattern.test(output))) score += 0.8
  return Math.min(score, 1)
}

export async function checkToolAbuse(
  toolName: string,
  config: Record<string, unknown>,
  agentId?: string,
  companyId?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const dangerousTools = new Set([
    'shell_execute',
    'database_drop',
    'user_delete',
    'role_modify',
    'permission_grant',
    'log_delete',
    'billing_modify',
  ])
  if (dangerousTools.has(toolName)) {
    await logSecurityEvent(
      'tool_abuse',
      'high',
      JSON.stringify({ toolName, config }),
      undefined,
      0.9,
      'blocked',
      ['dangerous_tool'],
      { agentId, companyId },
    )
    return { allowed: false, reason: `Tool '${toolName}' requires explicit human approval` }
  }
  return { allowed: true }
}

export async function getSecurityRules(companyId?: string) {
  const where: Prisma.ConstitutionalRuleWhereInput = {
    isActive: true,
    ...(companyId ? { companyId } : {}),
  }
  return db.constitutionalRule.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function createSecurityRule(data: {
  name: string
  type: string
  pattern?: string
  config?: Record<string, unknown>
  action?: string
  severity?: string
  companyId?: string
  description?: string
}) {
  const condition = {
    ...(data.pattern ? { pattern: data.pattern } : {}),
    ...(data.config ? { config: data.config } : {}),
  }
  const actions = data.action ? [{ type: data.action }] : [{ type: 'block' }]

  return db.constitutionalRule.create({
    data: {
      ruleId: randomUUID(),
      title: data.name,
      category: data.type,
      description: data.description || data.name,
      conditions: JSON.stringify([condition]),
      actions: JSON.stringify(actions),
      severity: data.severity || 'high',
      isActive: true,
      companyId: data.companyId,
    },
  })
}

export async function getSecurityEvents(filters?: {
  type?: string
  severity?: string
  agentId?: string
  companyId?: string
  limit?: number
}) {
  const where: Prisma.SecurityEventWhereInput = {
    ...(filters?.type ? { type: filters.type } : {}),
    ...(filters?.severity ? { severity: filters.severity } : {}),
    ...(filters?.agentId ? { agentId: filters.agentId } : {}),
    ...(filters?.companyId ? { companyId: filters.companyId } : {}),
  }
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500)
  return db.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })
}

export async function getSecurityStats(companyId?: string) {
  const where: Prisma.SecurityEventWhereInput = companyId ? { companyId } : {}
  const [total, blocked, flagged, passed] = await Promise.all([
    db.securityEvent.count({ where }),
    db.securityEvent.count({ where: { ...where, action: 'blocked' } }),
    db.securityEvent.count({ where: { ...where, action: 'flagged' } }),
    db.securityEvent.count({ where: { ...where, action: 'passed' } }),
  ])
  return {
    total,
    blocked,
    flagged,
    passed,
    blockRate: total > 0 ? ((blocked / total) * 100).toFixed(1) : '0',
  }
}

function severityFor(riskScore: number): string {
  if (riskScore >= 0.8) return 'critical'
  if (riskScore >= 0.5) return 'high'
  if (riskScore >= 0.2) return 'medium'
  return 'low'
}

function redactSensitiveText(value: string | undefined): string | undefined {
  if (!value) return value
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_ID]')
    .replace(/\b\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d\b/g, '[REDACTED_NUMBER]')
    .replace(/\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b/gi, '[REDACTED_SECRET]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'Bearer [REDACTED_SECRET]')
    .replace(/\b(api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*["']?[^\s"',;}]{8,}/gi, '$1=[REDACTED_SECRET]')
    .slice(0, 10_000)
}

async function logSecurityEvent(
  type: string,
  severity: string,
  input: string | undefined,
  output: string | undefined,
  riskScore: number,
  action: string,
  flags: string[],
  context: SecurityContext = {},
): Promise<void> {
  await db.securityEvent.create({
    data: {
      type,
      severity,
      source: 'validator',
      input: redactSensitiveText(input),
      output: redactSensitiveText(output),
      riskScore,
      action,
      details: JSON.stringify({ flags, timestamp: new Date().toISOString() }),
      agentId: context.agentId,
      companyId: context.companyId,
    },
  })
}
