/**
 * Usage metering for the Voice & Contact Center billing dimensions.
 *
 * Rules
 * -----
 * - Every metered unit is written to `VoiceUsageEntry` with the tenant id and
 *   a `simulated` flag inherited from the source record. Billing reports must
 *   exclude (or separately label) simulated usage.
 * - Quantities are computed from actual lifecycle timestamps/character counts,
 *   never estimated at read time and never invented.
 * - Metering failures are thrown, not swallowed: dropping a usage row would
 *   understate a customer's bill.
 */

import { db } from '@/lib/db'
import { countTtsCharacters } from './speech'

export const VOICE_USAGE_DIMENSIONS = [
  'ai_call_minutes',
  'pstn_minutes',
  'tts_characters',
  'tts_audio_seconds',
  'asr_seconds',
  'recording_storage_mb',
  'active_number',
  'clone_storage_mb',
] as const

export type VoiceUsageDimension = (typeof VOICE_USAGE_DIMENSIONS)[number]

export function isVoiceUsageDimension(v: string): v is VoiceUsageDimension {
  return (VOICE_USAGE_DIMENSIONS as readonly string[]).includes(v)
}

export interface MeterUsageInput {
  companyId: string
  dimension: VoiceUsageDimension
  quantity: number
  unit: string
  simulated?: boolean
  callSessionId?: string
  campaignId?: string
  ttsJobId?: string
  asrJobId?: string
  phoneNumberId?: string
  metadata?: Record<string, unknown>
}

export async function meterUsage(input: MeterUsageInput): Promise<string> {
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new Error(`meterUsage: invalid quantity ${input.quantity} for ${input.dimension}`)
  }
  const row = await db.voiceUsageEntry.create({
    data: {
      companyId: input.companyId,
      dimension: input.dimension,
      quantity: input.quantity,
      unit: input.unit,
      simulated: input.simulated ?? false,
      callSessionId: input.callSessionId,
      campaignId: input.campaignId,
      ttsJobId: input.ttsJobId,
      asrJobId: input.asrJobId,
      phoneNumberId: input.phoneNumberId,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
    select: { id: true },
  })
  return row.id
}

/** Minutes from talk seconds, rounded up to the next whole minute (billing convention). */
export function minutesFromSeconds(seconds: number): number {
  return Math.ceil(Math.max(0, seconds) / 60)
}

export interface CallMeteringInput {
  companyId: string
  callSessionId: string
  simulated: boolean
  channel: string
  agentType: string
  durationSeconds: number
}

/** Meter a finished call into the correct dimension(s). */
export async function meterCallUsage(input: CallMeteringInput): Promise<string[]> {
  const ids: string[] = []
  const minutes = minutesFromSeconds(input.durationSeconds)
  if (minutes > 0) {
    ids.push(
      await meterUsage({
        companyId: input.companyId,
        dimension: input.agentType === 'ai' ? 'ai_call_minutes' : 'pstn_minutes',
        quantity: minutes,
        unit: 'minute',
        simulated: input.simulated,
        callSessionId: input.callSessionId,
        metadata: { channel: input.channel, durationSeconds: input.durationSeconds },
      }),
    )
  }
  return ids
}

export async function meterTtsUsage(input: {
  companyId: string
  ttsJobId: string
  text: string
  durationSeconds?: number | null
  simulated: boolean
}): Promise<string[]> {
  const ids: string[] = []
  ids.push(
    await meterUsage({
      companyId: input.companyId,
      dimension: 'tts_characters',
      quantity: countTtsCharacters(input.text),
      unit: 'character',
      simulated: input.simulated,
      ttsJobId: input.ttsJobId,
    }),
  )
  if (typeof input.durationSeconds === 'number' && input.durationSeconds > 0) {
    ids.push(
      await meterUsage({
        companyId: input.companyId,
        dimension: 'tts_audio_seconds',
        quantity: input.durationSeconds,
        unit: 'second',
        simulated: input.simulated,
        ttsJobId: input.ttsJobId,
      }),
    )
  }
  return ids
}

export async function meterAsrUsage(input: {
  companyId: string
  asrJobId: string
  durationSeconds: number
  simulated: boolean
}): Promise<string> {
  return meterUsage({
    companyId: input.companyId,
    dimension: 'asr_seconds',
    quantity: input.durationSeconds,
    unit: 'second',
    simulated: input.simulated,
    asrJobId: input.asrJobId,
  })
}

export interface UsageSummaryRow {
  dimension: string
  total: number
  simulatedTotal: number
  unit: string
}

/** Aggregate a tenant's metered usage; simulated usage is broken out separately. */
export async function usageSummary(companyId: string, since?: Date): Promise<UsageSummaryRow[]> {
  const rows = await db.voiceUsageEntry.groupBy({
    by: ['dimension', 'unit'],
    where: { companyId, recordedAt: since ? { gte: since } : undefined },
    _sum: { quantity: true },
  })
  const simRows = await db.voiceUsageEntry.groupBy({
    by: ['dimension'],
    where: { companyId, simulated: true, recordedAt: since ? { gte: since } : undefined },
    _sum: { quantity: true },
  })
  const simByDim = new Map(simRows.map((r) => [r.dimension, r._sum.quantity ?? 0]))
  return rows
    .map((r) => ({
      dimension: r.dimension,
      unit: r.unit,
      total: r._sum.quantity ?? 0,
      simulatedTotal: simByDim.get(r.dimension) ?? 0,
    }))
    .sort((a, b) => a.dimension.localeCompare(b.dimension))
}
