import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'
import { planInboundCall } from '@/lib/voice/inbound-routing'
import { startCall, answerCall } from '@/lib/voice/call-service'
import { beginConversation } from '@/lib/voice/conversation-service'
import { normalizeBdPhoneNumber, identifyCaller } from '@/lib/voice/customers'
import { recordVoicemail } from '@/lib/voice/telephony-config'

export const dynamic = 'force-dynamic'

/**
 * Inbound routing engine surface (Module E).
 *
 * POST { toNumber, digit?, currentNodeId?, dryRun? }
 *   dryRun=true  → return the ROUTING PLAN ONLY (no call record, no adapter
 *                  call). This is how an operator tests an IVR/queue/hours
 *                  configuration before it can touch a real caller.
 *   dryRun=false → execute the plan: create the inbound call leg, answer it,
 *                  open the AI conversation, deliver to a human (assigned) or
 *                  take a voicemail.
 *
 * The response always includes the reason chain so a wrong plan is diagnosable
 * without reading logs.
 */
export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const toNumber = requireString(body, 'toNumber')
    const fromNumber = optionalString(body, 'fromNumber') ?? '+880000000000'
    const digit = optionalString(body, 'digit')
    const currentNodeId = optionalString(body, 'currentNodeId')

    const plan = await planInboundCall({
      companyId: auth.companyId,
      toNumber,
      phoneNumberId: optionalString(body, 'phoneNumberId'),
      digit,
      currentNodeId,
    })

    if (body.dryRun === true) {
      return { data: { plan, executed: false }, notice: 'Dry run — no call leg was created and no provider was contacted.' }
    }

    // ── Execute the plan ────────────────────────────────────────────────────
    if (plan.action === 'unrouted' || plan.action === 'hangup') {
      return {
        data: { plan, executed: false },
        notice: plan.action === 'unrouted'
          ? 'Nothing is configured to answer this number. Assign an IVR, queue or AI agent first.'
          : 'The plan is to close the call politely (hangup); no leg was created.',
      }
    }

    const number = await db.phoneNumber.findFirst({
      where: { companyId: auth.companyId, e164: toNumber },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true },
    })
    const provider = number?.provider ?? 'sandbox'

    // Caller identification before the AI speaks (Customer Context Engine).
    const normalized = normalizeBdPhoneNumber(fromNumber)
    const contacts = normalized
      ? await db.crmContact.findMany({
          where: { companyId: auth.companyId, phone: { not: null } },
          orderBy: [{ lastContactAt: 'desc' }, { createdAt: 'desc' }],
          take: 500,
          select: { id: true, phone: true, firstName: true, lastName: true },
        })
      : []
    const dncEntries = await db.dncEntry.findMany({
      where: { companyId: auth.companyId },
      select: { phoneNumber: true, reason: true },
    })
    const identification = identifyCaller({ fromNumber, contacts, dncEntries })

    const started = await startCall({
      companyId: auth.companyId,
      direction: 'inbound',
      from: fromNumber,
      to: toNumber,
      provider,
      channel: plan.action === 'voice_agent' ? 'sandbox' : 'pstn',
      phoneNumberId: number?.id,
      voiceAgentId: plan.voiceAgentId,
      agentType: plan.action === 'voice_agent' ? 'ai' : 'human',
      assignedUserId: plan.userId,
      contactId: identification.contactId,
      recordingConsent: false,
    })

    // Answer the leg so an AI/human conversation can start.
    let conversation: { greeting: string; language: string } | null = null
    try {
      await answerCall(started.id, auth.companyId)
    } catch {
      // Some plans (queue waiting) do not answer immediately; the call stays
      // ringing with the assignment already recorded.
    }

    if (plan.action === 'voice_agent' && plan.voiceAgentId) {
      try {
        conversation = await beginConversation({
          companyId: auth.companyId,
          callSessionId: started.id,
        })
      } catch (err) {
        return {
          data: { plan, callSessionId: started.id, caller: identification, conversation: null },
          notice: `Call created but the AI conversation failed to open: ${err instanceof Error ? err.message : 'unknown error'}`,
        }
      }
    }

    if (plan.action === 'voicemail') {
      const voicemail = await recordVoicemail({
        companyId: auth.companyId,
        fromNumber,
        phoneNumberId: number?.id,
        callSessionId: started.id,
        contactId: identification.contactId,
        simulated: started.simulated,
      })
      return {
        data: { plan, callSessionId: started.id, caller: identification, voicemail, conversation: null },
        notice: plan.prompt
          ? `Voicemail prompt to play: “${plan.prompt}”`
          : 'Voicemail box entry created (no media until an adapter delivers audio).',
      }
    }

    return {
      data: {
        plan,
        callSessionId: started.id,
        caller: identification,
        conversation,
        simulated: started.simulated,
        assignedUserId: plan.userId ?? null,
        queueId: plan.queueId ?? null,
      },
      notice: started.simulated
        ? 'Simulated inbound leg (sandbox adapter) — no real telephone network was contacted.'
        : `Plan executed: ${plan.action}.`,
    }
  })
}

/** GET — the tenant's routing inventory so the UI can show what is wired. */
export async function GET() {
  return withCompany(async (auth) => {
    const [numbers, ivrFlows, queues, hours] = await Promise.all([
      db.phoneNumber.findMany({
        where: { companyId: auth.companyId },
        select: { id: true, e164: true, status: true, assignedIvrFlowId: true, assignedVoiceAgentId: true, assignedQueueId: true, metadata: true },
        take: 200,
      }),
      db.ivrFlow.findMany({ where: { companyId: auth.companyId }, select: { id: true, name: true, active: true }, take: 100 }),
      db.callQueue.findMany({ where: { companyId: auth.companyId }, select: { id: true, name: true, ringStrategy: true }, take: 100 }),
      db.businessHour.findMany({ where: { companyId: auth.companyId }, select: { id: true, name: true, timezone: true }, take: 20 }),
    ])
    return {
      data: {
        numbers: numbers.map((n) => ({
          ...n,
          inboundRouting: parseJsonColumn<Record<string, unknown>>(n.metadata, {}).inboundRouting ?? null,
        })),
        ivrFlows,
        queues,
        businessHours: hours,
      },
    }
  })
}
