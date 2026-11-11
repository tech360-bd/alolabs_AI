import { db } from '@/lib/db'
import { readJson, requireString, optionalString, optionalNumber, withCompany } from '@/lib/voice/api-helpers'
import { prepareCampaignCall, dialCampaignCall } from '@/lib/voice/campaigns'
import {
  campaignTransition,
  dialGate,
  isDuplicateDestination,
  isCampaignStatus,
  type CampaignStatus,
} from '@/lib/voice/campaign-lifecycle'
import { enqueueCampaignTick } from '@/lib/voice/queue-worker'
import { checkCallQuota } from '@/lib/voice/quotas'

export const dynamic = 'force-dynamic'

/**
 * Outbound campaign management (master prompt §13) with structural compliance:
 *
 * - POST creates a campaign (compliance defaults: BD calling hours, DNC on).
 * - PATCH actions:
 *     prepare — run every contact through duplicate-check → DNC → attempt
 *               caps → calling hours BEFORE any dialing
 *     dial    — place one call, gated by campaign status/expiry/concurrency
 *     approve — draft|pending_approval → approved (explicit approval step)
 *     pause / resume — controlled lifecycle transitions
 *     cancel  — stop a campaign; pending contacts are marked cancelled
 *     start   — enqueue a dialer tick on the durable voice queue
 */

export async function GET() {
  return withCompany(async (auth) => {
    const campaigns = await db.campaign.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { campaignCalls: { orderBy: { createdAt: 'desc' }, take: 25 } },
    })
    return { data: campaigns, total: campaigns.length }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const name = requireString(body, 'name')
    const expiresAt = optionalString(body, 'expiresAt')
    const campaign = await db.campaign.create({
      data: {
        companyId: auth.companyId,
        name,
        description: optionalString(body, 'description'),
        type: optionalString(body, 'type') ?? 'follow_up',
        script: optionalString(body, 'script'),
        voiceAgentId: optionalString(body, 'voiceAgentId'),
        phoneNumberId: optionalString(body, 'phoneNumberId'),
        // Compliance defaults: Bangladesh calling hours, DNC respected.
        respectDnc: body.respectDnc !== false,
        recordingDisclosure: optionalString(body, 'recordingDisclosure'),
        scheduledStart: optionalString(body, 'scheduledStart') ? new Date(optionalString(body, 'scheduledStart')!) : null,
        scheduledEnd: optionalString(body, 'scheduledEnd') ? new Date(optionalString(body, 'scheduledEnd')!) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxConcurrentCalls: Math.max(1, Math.min(50, optionalNumber(body, 'maxConcurrentCalls') ?? 2)),
        dailyQuota: Math.max(0, Math.min(100_000, optionalNumber(body, 'dailyQuota') ?? 200)),
      },
    })
    return { data: campaign }
  })
}

/**
 * Load the campaign with lifecycle facts and evaluate the dial gate for one
 * more concurrent call.
 */
async function gatedCampaign(companyId: string, campaignId: string, at = new Date()) {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, companyId },
  })
  if (!campaign) throw new Error(`campaign ${campaignId} not found for this tenant`)

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
  const dayStart = new Date(at)
  dayStart.setUTCHours(0, 0, 0, 0)
  const callsStartedToday = await db.campaignCall.count({
    where: { campaignId: campaign.id, companyId, lastAttemptAt: { gte: dayStart } },
  })

  const gate = dialGate({
    campaign: { status: campaign.status, scheduledEnd: campaign.scheduledEnd ?? campaign.expiresAt, maxConcurrentCalls: campaign.maxConcurrentCalls, dailyQuota: campaign.dailyQuota },
    facts: { activeCalls, callsStartedToday },
    at,
  })
  return { campaign, gate }
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const action = requireString(body, 'action')

    if (action === 'prepare') {
      const campaignId = requireString(body, 'campaignId')
      const campaign = await db.campaign.findFirst({
        where: { id: campaignId, companyId: auth.companyId },
      })
      if (!campaign) throw new Error(`campaign ${campaignId} not found for this tenant`)
      if (['completed', 'cancelled', 'expired'].includes(campaign.status)) {
        throw new Error(`refused: campaign is ${campaign.status} — no contacts may be added`)
      }
      const contacts = Array.isArray(body.contacts) ? body.contacts : []
      if (contacts.length === 0) throw new Error('Invalid request: contacts array required')

      // Duplicate prevention: load this campaign's existing destinations and
      // refuse duplicates before creating rows (§13).
      const existing = await db.campaignCall.findMany({
        where: { campaignId: campaign.id, companyId: auth.companyId },
        select: { destinationNumber: true },
      })
      const existingDestinations = existing.map((e) => e.destinationNumber)

      const results = []
      for (const raw of contacts) {
        const c = raw as Record<string, unknown>
        const number = typeof c.destinationNumber === 'string' ? c.destinationNumber : null
        if (!number) continue
        if (isDuplicateDestination(existingDestinations, number)) {
          results.push({
            contactId: typeof c.contactId === 'string' ? c.contactId : null,
            destinationNumber: number,
            campaignCallId: null,
            action: 'duplicate_blocked' as const,
            reason: 'this destination number is already a contact of this campaign',
          })
          continue
        }
        // Attempt history for re-prepares of an existing contact row.
        const prior = await db.campaignCall.findFirst({
          where: { campaignId: campaign.id, companyId: auth.companyId, destinationNumber: number },
          select: { id: true, attempts: true, lastAttemptAt: true },
        })
        const result = await prepareCampaignCall({
          campaignId: campaign.id,
          companyId: auth.companyId,
          destinationNumber: number,
          contactId: typeof c.contactId === 'string' ? c.contactId : null,
          respectDnc: campaign.respectDnc,
          callingHoursRaw: campaign.callingHours,
          maxAttemptsPerContact: campaign.maxAttemptsPerContact,
          minGapMinutesPerContact: campaign.minGapMinutesPerContact,
          attemptsSoFar: prior?.attempts ?? 0,
          lastAttemptAt: prior?.lastAttemptAt ?? null,
          existingCampaignCallId: prior?.id ?? null,
        })
        results.push(result)
        existingDestinations.push(number)
      }
      return { data: results }
    }

    if (action === 'dial') {
      const campaignCallId = requireString(body, 'campaignCallId')
      const cc = await db.campaignCall.findFirst({
        where: { id: campaignCallId, companyId: auth.companyId },
      })
      if (!cc) throw new Error(`campaign call ${campaignCallId} not found for this tenant`)

      const { campaign, gate } = await gatedCampaign(auth.companyId, cc.campaignId)
      if (!gate.allowed) throw new Error(`refused: ${gate.reason}`)

      // Quota pre-flight (fail-closed; metering already counts real usage).
      const quota = await checkCallQuota({
        companyId: auth.companyId,
        agentType: 'ai',
        maxCallSeconds: 600,
      })
      if (!quota.allowed) throw new Error(`refused: ${quota.reason}`)
      if (quota.alertTriggered) {
        const { recordQuotaAlert } = await import('@/lib/voice/quotas')
        const period = new Date().toISOString().slice(0, 7)
        await recordQuotaAlert({
          companyId: auth.companyId,
          dimension: quota.dimension,
          usedMinutes: quota.usedMinutes,
          limitMinutes: quota.limitMinutes ?? 0,
          periodKey: period,
        }).catch(() => undefined)
      }

      const number = campaign.phoneNumberId
        ? await db.phoneNumber.findFirst({
            where: { id: campaign.phoneNumberId, companyId: auth.companyId },
            select: { e164: true, provider: true },
          })
        : null
      const result = await dialCampaignCall({
        campaignCallId: cc.id,
        companyId: auth.companyId,
        provider: number?.provider ?? 'sandbox',
        fromNumber: number?.e164 ?? '+8800000000000',
        voiceAgentId: campaign.voiceAgentId ?? undefined,
      })
      return {
        data: result,
        notice: result.simulated
          ? 'Simulated dial (sandbox) — no real telephone network was contacted.'
          : 'Dial handed to the configured telephony provider.',
      }
    }

    // ---- Lifecycle transitions (approve / pause / resume / cancel / start) ----
    if (['approve', 'pause', 'resume', 'cancel', 'start'].includes(action)) {
      const campaignId = requireString(body, 'campaignId')
      const campaign = await db.campaign.findFirst({
        where: { id: campaignId, companyId: auth.companyId },
      })
      if (!campaign) throw new Error(`campaign ${campaignId} not found for this tenant`)
      const current = (isCampaignStatus(campaign.status) ? campaign.status : 'draft') as CampaignStatus

      if (action === 'start') {
        // Explicit dialer kickoff; still respects the dial gate on every tick.
        const { gate } = await gatedCampaign(auth.companyId, campaign.id)
        if (!gate.allowed) throw new Error(`refused: ${gate.reason}`)
        const queueItemId = await enqueueCampaignTick(auth.companyId)
        return { data: { campaignId: campaign.id, dialer: 'tick enqueued', queueItemId } }
      }

      const target: CampaignStatus =
        action === 'approve' ? 'approved'
        : action === 'pause' ? 'paused'
        : action === 'resume' ? 'running'
        : 'cancelled'

      if (action === 'approve' && !auth.userId) {
        throw new Error('refused: approval requires an authenticated user (no API-key approvals)')
      }
      const transitioned = campaignTransition(current, target)
      if (campaign.scheduledEnd && campaign.scheduledEnd.getTime() <= Date.now() && action !== 'cancel') {
        await db.campaign.update({ where: { id: campaign.id }, data: { status: 'expired' } })
        throw new Error('refused: campaign has expired (scheduledEnd passed)')
      }

      const updated = await db.campaign.update({
        where: { id: campaign.id },
        data: {
          status: transitioned.to,
          ...(action === 'approve'
            ? { approvedById: auth.userId ?? null, approvedAt: new Date() }
            : {}),
        },
      })
      return { data: updated, transition: { from: transitioned.from, to: transitioned.to } }
    }

    throw new Error('Invalid request: action must be one of prepare, dial, approve, pause, resume, cancel, start')
  })
}
