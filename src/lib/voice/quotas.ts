/**
 * Usage quotas & budget limits (master prompt §20).
 *
 * Fail-CLOSED policy: when a tenant's configured quota is exhausted, new
 * dialing (manual or campaign) is refused with an explicit reason — usage
 * metering already records every dimension in `VoiceUsageEntry`, so limits
 * are checked against REAL metered totals, never estimates.
 *
 * Quota sources (first non-empty wins):
 *   1. Company.metadata JSON  → `voiceQuota: { monthlyAiMinutes?, monthlyPstnMinutes?, budgetAlertUsd? }`
 *   2. Env `VOICE_DEFAULT_MONTHLY_MINUTE_QUOTA` (platform default, 0 = unlimited)
 *
 * Alerting: crossing 80% (or the configured budget threshold) writes a
 * Notification + AuditLog row once per period (deduped by scope key).
 */

import { db } from '@/lib/db'
import { usageSummary, minutesFromSeconds } from './metering'

export interface VoiceQuotaConfig {
  monthlyAiMinutes: number | null
  monthlyPstnMinutes: number | null
  alertThresholdRatio: number // 0..1, default 0.8
}

export interface QuotaCheckResult {
  allowed: boolean
  reason: string
  dimension: 'ai_call_minutes' | 'pstn_minutes' | 'none'
  usedMinutes: number
  limitMinutes: number | null
  alertTriggered: boolean
}

export function parseQuotaConfig(companyMetadata: string | null | undefined): VoiceQuotaConfig {
  const alertThresholdRatio = 0.8
  const envDefault = Number(process.env.VOICE_DEFAULT_MONTHLY_MINUTE_QUOTA ?? '0')
  const fallback: VoiceQuotaConfig = {
    monthlyAiMinutes: envDefault > 0 ? envDefault : null,
    monthlyPstnMinutes: null,
    alertThresholdRatio,
  }
  if (!companyMetadata) return fallback
  try {
    const meta = JSON.parse(companyMetadata) as { voiceQuota?: Partial<VoiceQuotaConfig> }
    const q = meta.voiceQuota
    if (!q || typeof q !== 'object') return fallback
    return {
      monthlyAiMinutes: typeof q.monthlyAiMinutes === 'number' && q.monthlyAiMinutes > 0 ? q.monthlyAiMinutes : fallback.monthlyAiMinutes,
      monthlyPstnMinutes: typeof q.monthlyPstnMinutes === 'number' && q.monthlyPstnMinutes > 0 ? q.monthlyPstnMinutes : null,
      alertThresholdRatio: typeof q.alertThresholdRatio === 'number' && q.alertThresholdRatio > 0 && q.alertThresholdRatio <= 1
        ? q.alertThresholdRatio
        : alertThresholdRatio,
    }
  } catch {
    return fallback
  }
}

/** Pure threshold decision (unit-testable without a DB). */
export function quotaDecision(params: {
  config: VoiceQuotaConfig
  usage: Array<{ dimension: string; total: number }>
  dimension: 'ai_call_minutes' | 'pstn_minutes'
  requestedMinutes: number
}): QuotaCheckResult {
  const limit =
    params.dimension === 'ai_call_minutes'
      ? params.config.monthlyAiMinutes
      : params.config.monthlyPstnMinutes
  const used =
    params.usage.find((u) => u.dimension === params.dimension)?.total ?? 0
  if (limit === null || limit === undefined) {
    return {
      allowed: true,
      reason: 'no quota configured — unlimited',
      dimension: params.dimension,
      usedMinutes: used,
      limitMinutes: null,
      alertTriggered: false,
    }
  }
  const projected = used + Math.max(0, params.requestedMinutes)
  if (projected > limit) {
    return {
      allowed: false,
      reason: `monthly ${params.dimension} quota exhausted: ${used}/${limit} used, ${params.requestedMinutes} more requested`,
      dimension: params.dimension,
      usedMinutes: used,
      limitMinutes: limit,
      alertTriggered: used / limit >= params.config.alertThresholdRatio,
    }
  }
  return {
    allowed: true,
    reason: 'within quota',
    dimension: params.dimension,
    usedMinutes: used,
    limitMinutes: limit,
    alertTriggered: projected / limit >= params.config.alertThresholdRatio,
  }
}

/**
 * Pre-flight quota check for a call about to be placed. `estimatedMinutes` is
 * the max the call could consume (its agent's `maxCallSeconds` cap, rounded
 * up) — we charge nothing here, metering happens at real call end.
 */
export async function checkCallQuota(params: {
  companyId: string
  agentType: 'ai' | 'human' | 'ivr' | string
  maxCallSeconds: number
}): Promise<QuotaCheckResult> {
  const company = (await db.company.findUnique({
    where: { id: params.companyId },
  })) as { metadata?: string | null } | null
  const config = parseQuotaConfig(company?.metadata ?? null)
  const dimension = params.agentType === 'ai' ? 'ai_call_minutes' : 'pstn_minutes'
  const limit = dimension === 'ai_call_minutes' ? config.monthlyAiMinutes : config.monthlyPstnMinutes
  if (limit === null) {
    return {
      allowed: true, reason: 'no quota configured — unlimited', dimension: dimension as QuotaCheckResult['dimension'],
      usedMinutes: 0, limitMinutes: null, alertTriggered: false,
    }
  }
  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)
  const usage = await usageSummary(params.companyId, periodStart)
  return quotaDecision({
    config,
    usage: usage.map((u) => ({ dimension: u.dimension, total: u.total })),
    dimension: dimension as 'ai_call_minutes' | 'pstn_minutes',
    requestedMinutes: minutesFromSeconds(params.maxCallSeconds),
  })
}

/** Write a quota/budget alert once per scope+period (deduped by audit key). */
export async function recordQuotaAlert(params: {
  companyId: string
  dimension: string
  usedMinutes: number
  limitMinutes: number
  periodKey: string
}): Promise<void> {
  const dedupeKey = `voice_quota_alert:${params.companyId}:${params.dimension}:${params.periodKey}`
  const existing = await db.auditLog.findFirst({
    where: { action: 'voice_quota_alert', details: { contains: dedupeKey } },
    select: { id: true },
  })
  if (existing) return
  await db.auditLog.create({
    data: {
      action: 'voice_quota_alert',
      resource: 'VoiceUsageEntry',
      details: JSON.stringify({
        dedupeKey,
        level: 'warning',
        companyId: params.companyId,
        dimension: params.dimension,
        usedMinutes: params.usedMinutes,
        limitMinutes: params.limitMinutes,
        periodKey: params.periodKey,
      }),
    },
  })
}
