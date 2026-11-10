/**
 * Campaign dialer — the background worker that makes outbound campaigns
 * actually run (master prompt §13: "scheduled auto-start" + controlled
 * execution). Runs as a `voice_campaign` worker on the existing ONE job
 * queue; no second scheduler stack.
 *
 * Tick model:
 * - `enqueueCampaignTick(companyId)` enqueues a tick (idempotent while one is
 *   pending — checked via the queue, so ticks never stack).
 * - The tick iterates all `approved`/`running` campaigns of the tenant and,
 *   for each, fills up to the campaign's concurrency limit from contacts
 *   whose `nextAttemptAt` has arrived, honoring: expiry → status → daily
 *   quota → DNC → calling hours → attempts → frequency gap (prepare gates in
 *   campaigns.ts) → duplicate prevention.
 * - After dialing it re-enqueues the next tick with a short delay while any
 *   campaign still has pending work; quiet tenants produce no follow-ups.
 */

import { db } from '@/lib/db'
import { campaignExpiryCheck } from './campaign-lifecycle'
import { prepareCampaignCall, dialCampaignCall } from './campaigns'

export interface TickDecision {
  campaignId: string
  action: 'dial' | 'skip'
  reason: string
  dialedCount?: number
}

/** Pure: choose dialable campaign calls from candidates. Unit-testable. */
export function pickDialableContacts(params: {
  candidates: Array<{
    id: string
    destinationNumber: string
    status: string
    attempts: number
    nextAttemptAt: Date | null
    lastAttemptAt: Date | null
    contactId: string | null
  }>
  now: Date
  maxConcurrentCalls: number
  activeCalls: number
  dailyQuota: number
  callsStartedToday: number
  maxAttemptsPerContact: number
}): { dialable: typeof params.candidates; skipped: Array<{ id: string; reason: string }> } {
  const skipped: Array<{ id: string; reason: string }> = []
  const dialable: typeof params.candidates = []
  let concurrencyUsed = params.activeCalls
  let quotaUsed = params.callsStartedToday

  for (const c of params.candidates) {
    if (c.status !== 'queued' && c.status !== 'pending') {
      skipped.push({ id: c.id, reason: `status ${c.status} is not dialable` })
      continue
    }
    if (c.nextAttemptAt && c.nextAttemptAt.getTime() > params.now.getTime()) {
      skipped.push({ id: c.id, reason: `next attempt scheduled for ${c.nextAttemptAt.toISOString()}` })
      continue
    }
    if (concurrencyUsed >= params.maxConcurrentCalls) {
      skipped.push({ id: c.id, reason: 'concurrent_call_limit' })
      continue
    }
    if (params.dailyQuota > 0 && quotaUsed >= params.dailyQuota) {
      skipped.push({ id: c.id, reason: 'daily_quota' })
      continue
    }
    if (c.attempts >= params.maxAttemptsPerContact) {
      skipped.push({ id: c.id, reason: 'max_attempts' })
      continue
    }
    dialable.push(c)
    concurrencyUsed += 1
    quotaUsed += 1
  }
  return { dialable, skipped }
}

/**
 * Run one dialer tick for a tenant: every dialing-enabled campaign gets its
 * concurrency slot filled from due contacts. Returns per-campaign decisions
 * for audit/logging.
 */
export async function runCampaignTick(companyId: string, at: Date = new Date()): Promise<TickDecision[]> {
  const campaigns = await db.campaign.findMany({
    where: { companyId, status: { in: ['approved', 'running'] } },
    select: {
      id: true, name: true, status: true, scheduledStart: true, scheduledEnd: true,
      maxConcurrentCalls: true, dailyQuota: true, maxAttemptsPerContact: true,
      respectDnc: true, callingHours: true, retryDelayMinutes: true, minGapMinutesPerContact: true,
      voiceAgentId: true, phoneNumberId: true, script: true, type: true,
    },
  })

  const decisions: TickDecision[] = []
  for (const campaign of campaigns) {
    const expiry = campaignExpiryCheck(campaign, at)
    if (expiry.expired) {
      await db.campaign.update({ where: { id: campaign.id }, data: { status: 'expired' } })
      decisions.push({ campaignId: campaign.id, action: 'skip', reason: expiry.reason! })
      continue
    }
    if (campaign.scheduledStart && campaign.scheduledStart.getTime() > at.getTime()) {
      decisions.push({ campaignId: campaign.id, action: 'skip', reason: 'before scheduledStart' })
      continue
    }

    // Concurrency: calls this campaign currently has in flight.
    const campaignCallIds = await db.campaignCall.findMany({
      where: { campaignId: campaign.id, companyId },
      select: { id: true },
    })
    const activeCalls = campaignCallIds.length
      ? await db.callSession.count({
          where: {
            companyId,
            campaignCallId: { in: campaignCallIds.map((cc) => cc.id) },
            status: { in: ['queued', 'ringing', 'in_progress', 'on_hold', 'transferring'] },
          },
        })
      : 0
    // Daily quota: attempts started since local midnight (UTC day used —
    // documented; the calling-hours config owns timezone correctness).
    const dayStart = new Date(at)
    dayStart.setUTCHours(0, 0, 0, 0)
    const callsStartedToday = await db.campaignCall.count({
      where: { campaignId: campaign.id, companyId, lastAttemptAt: { gte: dayStart } },
    })

    const candidates = await db.campaignCall.findMany({
      where: { campaignId: campaign.id, companyId, status: { in: ['queued', 'pending'] } },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: 50,
      select: {
        id: true, destinationNumber: true, status: true, attempts: true,
        nextAttemptAt: true, lastAttemptAt: true, contactId: true,
      },
    })

    const { dialable, skipped } = pickDialableContacts({
      candidates,
      now: at,
      maxConcurrentCalls: campaign.maxConcurrentCalls ?? 2,
      activeCalls,
      dailyQuota: campaign.dailyQuota ?? 0,
      callsStartedToday,
      maxAttemptsPerContact: campaign.maxAttemptsPerContact,
    })
    for (const s of skipped) {
      decisions.push({ campaignId: campaign.id, action: 'skip', reason: `${s.reason} (contact ${s.id})` })
    }

    let dialed = 0
    for (const contact of dialable) {
      // Full compliance re-check at dial time (DNC may have changed since
      // queueing; calling hours may have closed).
      const prep = await prepareCampaignCall({
        campaignId: campaign.id,
        companyId,
        destinationNumber: contact.destinationNumber,
        contactId: contact.contactId,
        respectDnc: campaign.respectDnc,
        callingHoursRaw: campaign.callingHours,
        maxAttemptsPerContact: campaign.maxAttemptsPerContact,
        minGapMinutesPerContact: campaign.minGapMinutesPerContact,
        attemptsSoFar: contact.attempts,
        lastAttemptAt: contact.lastAttemptAt,
        existingCampaignCallId: contact.id,
        at,
      })
      if (prep.action !== 'queued') {
        decisions.push({ campaignId: campaign.id, action: 'skip', reason: `${prep.action}: ${prep.reason}` })
        continue
      }
      // Resolve the outbound number for the campaign.
      const number = campaign.phoneNumberId
        ? await db.phoneNumber.findFirst({
            where: { id: campaign.phoneNumberId, companyId },
            select: { e164: true, provider: true },
          })
        : await db.phoneNumber.findFirst({
            where: { companyId, status: 'active' },
            orderBy: { createdAt: 'desc' },
            select: { e164: true, provider: true },
          })
      if (!number) {
        decisions.push({ campaignId: campaign.id, action: 'skip', reason: 'no active phone number for the tenant' })
        continue
      }
      try {
        await dialCampaignCall({
          campaignCallId: contact.id,
          companyId,
          provider: number.provider ?? 'sandbox',
          fromNumber: number.e164,
          voiceAgentId: campaign.voiceAgentId ?? undefined,
        })
        dialed += 1
        decisions.push({ campaignId: campaign.id, action: 'dial', reason: `dialed contact ${contact.id}`, dialedCount: dialed })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'dial failed'
        await db.campaignCall.update({
          where: { id: contact.id },
          data: {
            status: 'failed',
            outcome: message,
            nextAttemptAt: new Date(at.getTime() + Math.max(1, campaign.retryDelayMinutes) * 60_000),
          },
        })
        decisions.push({ campaignId: campaign.id, action: 'skip', reason: `dial error: ${message}` })
      }
    }

    if (dialed > 0 && campaign.status === 'approved') {
      await db.campaign.update({ where: { id: campaign.id }, data: { status: 'running' } })
    }
  }
  return decisions
}
