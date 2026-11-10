/**
 * Voice observability metrics (master prompt §21/§22 Module 22).
 *
 * Every value here comes from a REAL database aggregate — no counters are
 * estimated or carried in memory (which would lie after a restart). Exported
 * in Prometheus text format by /api/metrics/prometheus.
 */

import { db } from '@/lib/db'

export interface VoiceMetricsSnapshot {
  callsTotal: number
  callsByStatus: Record<string, number>
  callsInbound: number
  callsOutbound: number
  callsActive: number
  callsSimulated: number
  avgDurationSeconds: number
  escalationsOpen: number
  campaignsRunning: number
  campaignCallsPending: number
  minutesMetered30d: { ai: number; pstn: number }
  window: string
}

const ACTIVE_STATES = ['queued', 'ringing', 'in_progress', 'on_hold', 'transferring', 'after_call_work']

export async function voiceMetricsSnapshot(): Promise<VoiceMetricsSnapshot> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [byStatus, byDirection, bySimulated, avg, escalationsOpen, campaignsRunning, campaignCallsPending, usage] =
    await Promise.all([
      db.callSession.groupBy({ by: ['status'], _count: { _all: true } }),
      db.callSession.groupBy({ by: ['direction'], _count: { _all: true } }),
      db.callSession.groupBy({ by: ['simulated'], _count: { _all: true } }),
      db.callSession.aggregate({ _avg: { durationSeconds: true } }),
      db.escalation.count({ where: { status: { in: ['assigned', 'callback_scheduled'] } } }),
      db.campaign.count({ where: { status: 'running' } }),
      db.campaignCall.count({ where: { status: { in: ['queued', 'pending'] } } }),
      db.voiceUsageEntry.groupBy({
        by: ['dimension'],
        where: { recordedAt: { gte: since30d }, dimension: { in: ['ai_call_minutes', 'pstn_minutes'] } },
        _sum: { quantity: true },
      }),
    ])

  const callsByStatus: Record<string, number> = {}
  let callsTotal = 0
  for (const row of byStatus) {
    callsByStatus[row.status] = row._count._all
    callsTotal += row._count._all
  }
  const callsActive = ACTIVE_STATES.reduce((sum, s) => sum + (callsByStatus[s] ?? 0), 0)

  const usageByDim = new Map(usage.map((u) => [u.dimension, u._sum.quantity ?? 0]))

  return {
    callsTotal,
    callsByStatus,
    callsInbound: byDirection.find((d) => d.direction === 'inbound')?._count._all ?? 0,
    callsOutbound: byDirection.find((d) => d.direction === 'outbound')?._count._all ?? 0,
    callsActive,
    callsSimulated: bySimulated.find((s) => s.simulated)?._count._all ?? 0,
    avgDurationSeconds: Math.round((avg._avg.durationSeconds ?? 0) * 100) / 100,
    escalationsOpen,
    campaignsRunning,
    campaignCallsPending,
    minutesMetered30d: {
      ai: usageByDim.get('ai_call_minutes') ?? 0,
      pstn: usageByDim.get('pstn_minutes') ?? 0,
    },
    window: 'all-time (counts) / rolling-30d (metered minutes)',
  }
}

/** Prometheus text-format lines for the voice subsystem. */
export function voiceMetricsPrometheusLines(s: VoiceMetricsSnapshot): string[] {
  const lines: string[] = []
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  lines.push('# HELP voice_calls_total Total call sessions recorded.')
  lines.push('# TYPE voice_calls_total counter')
  lines.push(`voice_calls_total ${s.callsTotal}`)
  for (const [status, count] of Object.entries(s.callsByStatus)) {
    lines.push(`voice_calls_by_status{status="${esc(status)}"} ${count}`)
  }
  lines.push('# HELP voice_calls_active Call sessions currently in flight.')
  lines.push('# TYPE voice_calls_active gauge')
  lines.push(`voice_calls_active ${s.callsActive}`)
  lines.push('# HELP voice_calls_simulated Calls placed by the sandbox (simulated) adapter.')
  lines.push('# TYPE voice_calls_simulated counter')
  lines.push(`voice_calls_simulated ${s.callsSimulated}`)
  lines.push('# HELP voice_call_duration_seconds_avg Average completed-call talk time in seconds.')
  lines.push('# TYPE voice_call_duration_seconds_avg gauge')
  lines.push(`voice_call_duration_seconds_avg ${s.avgDurationSeconds}`)
  lines.push('# HELP voice_escalations_open Open human escalations (assigned or callback scheduled).')
  lines.push('# TYPE voice_escalations_open gauge')
  lines.push(`voice_escalations_open ${s.escalationsOpen}`)
  lines.push('# HELP voice_campaigns_running Campaigns currently approved/running.')
  lines.push('# TYPE voice_campaigns_running gauge')
  lines.push(`voice_campaigns_running ${s.campaignsRunning}`)
  lines.push('# HELP voice_campaign_calls_pending Campaign contacts waiting to be dialed.')
  lines.push('# TYPE voice_campaign_calls_pending gauge')
  lines.push(`voice_campaign_calls_pending ${s.campaignCallsPending}`)
  lines.push('# HELP voice_minutes_metered_30d Metered call minutes (rolling 30 days).')
  lines.push('# TYPE voice_minutes_metered_30d gauge')
  lines.push(`voice_minutes_metered_30d{type="ai"} ${s.minutesMetered30d.ai}`)
  lines.push(`voice_minutes_metered_30d{type="pstn"} ${s.minutesMetered30d.pstn}`)
  return lines
}
