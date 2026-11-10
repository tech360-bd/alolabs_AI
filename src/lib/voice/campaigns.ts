/**
 * Outbound campaign engine.
 *
 * Compliance is structural (Module F of the master prompt):
 * - DNC suppression via `consent.ts` (customer-request opt-outs are honored
 *   even if a campaign misconfigures `respectDnc`).
 * - Calling hours enforced in the campaign timezone; timezone failures close
 *   the window (never call when we cannot verify it is allowed).
 * - Attempt caps and per-contact frequency gaps.
 * - Every skipped contact is recorded with an explicit status
 *   (dnc_blocked / outside_hours / max_attempts) — never silently dropped.
 */

import { db } from '@/lib/db'
import { isDncBlocked, outboundEligibility, type CallingHoursConfig } from './consent'
import { startCall } from './call-service'

export interface CampaignPrepResult {
  contactId: string | null
  destinationNumber: string
  campaignCallId: string
  action: 'queued' | 'dnc_blocked' | 'outside_hours' | 'max_attempts' | 'frequency_gap'
  reason: string
}

/** Load the campaign's effective calling-hours config from its JSON column. */
export function parseCallingHours(raw: string): CallingHoursConfig {
  const fallback: CallingHoursConfig = {
    timezone: 'Asia/Dhaka',
    weeklySchedule: [
      { day: 0, closed: true },
      { day: 1, open: '09:00', close: '18:00' },
      { day: 2, open: '09:00', close: '18:00' },
      { day: 3, open: '09:00', close: '18:00' },
      { day: 4, open: '09:00', close: '18:00' },
      { day: 5, open: '09:00', close: '18:00' },
      { day: 6, closed: true },
    ],
    holidays: [],
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CallingHoursConfig>
    return {
      ...fallback,
      ...parsed,
      weeklySchedule: Array.isArray(parsed.weeklySchedule) && parsed.weeklySchedule.length > 0
        ? parsed.weeklySchedule
        : fallback.weeklySchedule,
    }
  } catch {
    return fallback
  }
}

/** UTC offset (ms) of an IANA timezone at a given instant (two-pass, DST-safe). */
function timezoneOffsetMs(timezone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - at.getTime()
}

/**
 * Pure: the UTC instant of LOCAL MIDNIGHT in `timezone` for the day containing
 * `at`. Used by the campaign dialer so the daily quota window matches the
 * campaign's calling-hours timezone (previously the window was UTC-midnight,
 * which let campaigns near midnight overshoot by up to the UTC offset).
 * Unknown timezones fall back to UTC (fail-closed to the old behavior).
 */
export function localDayStartUtc(at: Date, timezone: string): Date {
  try {
    const dayFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const [year, month, day] = dayFmt.format(at).split('-').map(Number)
    const localMidnightGuess = Date.UTC(year, month - 1, day, 0, 0, 0)
    const offset = timezoneOffsetMs(timezone, new Date(localMidnightGuess))
    return new Date(localMidnightGuess - offset)
  } catch {
    const fallback = new Date(at)
    fallback.setUTCHours(0, 0, 0, 0)
    return fallback
  }
}

/**
 * Evaluate one pending destination against every compliance gate and create
 * (or update) its CampaignCall row. Returns an explicit action so the caller
 * can report exactly why a contact was not called.
 */
export async function prepareCampaignCall(params: {
  campaignId: string
  companyId: string
  destinationNumber: string
  contactId?: string | null
  respectDnc: boolean
  callingHoursRaw: string
  maxAttemptsPerContact: number
  minGapMinutesPerContact: number
  attemptsSoFar?: number
  lastAttemptAt?: Date | null
  existingCampaignCallId?: string | null
  at?: Date
}): Promise<CampaignPrepResult> {
  const at = params.at ?? new Date()

  // 1. Do-not-call suppression.
  const dncEntries = await db.dncEntry.findMany({
    where: { companyId: params.companyId },
    select: { phoneNumber: true, reason: true },
  })
  const dnc = isDncBlocked({ number: params.destinationNumber, dncEntries, respectDnc: params.respectDnc })
  if (dnc.blocked) {
    return finalize(params, 'dnc_blocked', dnc.reason ?? 'dnc', at)
  }

  // 2. Attempt cap.
  const attemptsSoFar = params.attemptsSoFar ?? 0
  if (attemptsSoFar >= params.maxAttemptsPerContact) {
    return finalize(params, 'max_attempts', `max_attempts_reached (${params.maxAttemptsPerContact})`, at)
  }

  // 3. Calling hours + frequency gap.
  const config = parseCallingHours(params.callingHoursRaw)
  config.maxAttemptsPerContact = params.maxAttemptsPerContact
  config.minGapMinutesPerContact = params.minGapMinutesPerContact
  const eligibility = outboundEligibility({
    config,
    attemptsSoFar,
    lastAttemptAt: params.lastAttemptAt,
    at,
  })
  if (!eligibility.allowed) {
    const action = eligibility.reason.startsWith('frequency_limit') ? 'frequency_gap' : 'outside_hours'
    return finalize(params, action, eligibility.reason, at)
  }

  // 4. All gates passed — mark queued for dialing.
  return finalize(params, 'queued', eligibility.reason, at)
}

async function finalize(
  params: {
    campaignId: string
    companyId: string
    destinationNumber: string
    contactId?: string | null
    existingCampaignCallId?: string | null
  },
  action: CampaignPrepResult['action'],
  reason: string,
  at: Date,
): Promise<CampaignPrepResult> {
  const status =
    action === 'queued' ? 'queued'
    : action === 'dnc_blocked' ? 'dnc_blocked'
    : action === 'max_attempts' ? 'max_attempts'
    : action === 'frequency_gap' ? 'pending'
    : 'outside_hours'

  let campaignCallId = params.existingCampaignCallId ?? null
  if (campaignCallId) {
    await db.campaignCall.update({
      where: { id: campaignCallId },
      data: { status, outcome: reason, updatedAt: at },
    })
  } else {
    const row = await db.campaignCall.create({
      data: {
        campaignId: params.campaignId,
        companyId: params.companyId,
        contactId: params.contactId ?? null,
        destinationNumber: params.destinationNumber,
        status,
        outcome: reason,
      },
      select: { id: true },
    })
    campaignCallId = row.id
  }
  return {
    contactId: params.contactId ?? null,
    destinationNumber: params.destinationNumber,
    campaignCallId,
    action,
    reason,
  }
}

/**
 * Dial one queued CampaignCall through the call service. Marks the attempt,
 * and on failure records the honest failure (never a fake completion).
 */
export async function dialCampaignCall(params: {
  campaignCallId: string
  companyId: string
  provider: string
  fromNumber: string
  voiceAgentId?: string
  sandboxBehavior?: 'answer' | 'no_answer' | 'busy' | 'fail' | 'voicemail'
}): Promise<{ callSessionId: string; simulated: boolean; state: string }> {
  const cc = await db.campaignCall.findFirst({
    where: { id: params.campaignCallId, companyId: params.companyId },
  })
  if (!cc) throw new Error(`campaign call ${params.campaignCallId} not found for this tenant`)
  if (cc.status === 'dnc_blocked') throw new Error('refusing to dial a DNC-blocked contact')

  const started = await startCall({
    companyId: params.companyId,
    direction: 'outbound',
    from: params.fromNumber,
    to: cc.destinationNumber,
    provider: params.provider,
    voiceAgentId: params.voiceAgentId,
    agentType: 'ai',
    campaignCallId: cc.id,
    sandboxBehavior: params.sandboxBehavior,
  })

  await db.campaignCall.update({
    where: { id: cc.id },
    data: {
      status: 'dialing',
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      callSessionId: started.id,
    },
  })
  return { callSessionId: started.id, simulated: started.simulated, state: started.state }
}
