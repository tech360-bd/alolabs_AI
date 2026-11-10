import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'
import { startCall } from '@/lib/voice/call-service'
import { beginConversation } from '@/lib/voice/conversation-service'
import { normalizeBdPhoneNumber, identifyCaller } from '@/lib/voice/customers'
import { handleConversationTurn } from '@/lib/voice/conversation-service'

/**
 * /api/v1/voice/calls/inbound — inbound call surface (master prompt §22).
 *
 * POST { from, to, utterance?, asrConfidence?, phoneNumberId?, voiceAgentId? }
 *
 * Semantics:
 * - Without `utterance`: the call is answered — caller is identified (exact
 *   normalized-phone CRM match, never weak matching), the contact is attached
 *   to the call and the AI conversation opens with the greeting + mandatory
 *   AI identity disclosure.
 * - With `utterance`: the utterance is processed as the next conversation
 *   turn (handoff rules → LLM responder with rule-based fallback).
 */
export const dynamic = 'force-dynamic'

export const POST = v1Handler(async ({ identity }, request) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const from = typeof body.from === 'string' ? body.from : null
  const to = typeof body.to === 'string' ? body.to : null
  if (!from || !to) throw new V1Error('from and to are required', 400, 'BAD_REQUEST')

  if (typeof body.utterance === 'string' && body.utterance.trim()) {
    const callSessionId = typeof body.callSessionId === 'string' ? body.callSessionId : null
    if (!callSessionId) throw new V1Error('callSessionId is required with utterance', 400, 'BAD_REQUEST')
    const turn = await handleConversationTurn({
      companyId: identity.companyId,
      callSessionId,
      utterance: body.utterance,
      asrConfidence: typeof body.asrConfidence === 'number' ? body.asrConfidence : null,
      bargeIn: body.bargeIn === true,
      customerSpeechDurationMs: typeof body.customerSpeechDurationMs === 'number' ? body.customerSpeechDurationMs : null,
      silenceMs: typeof body.silenceMs === 'number' ? body.silenceMs : null,
    })
    return { callSessionId, turn }
  }

  // Identify the caller BEFORE the AI speaks (Customer Context Engine).
  const normalized = normalizeBdPhoneNumber(from)
  const contacts = normalized
    ? await db.crmContact.findMany({
        where: { companyId: identity.companyId, phone: { not: null } },
        orderBy: [{ lastContactAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        select: { id: true, phone: true, firstName: true, lastName: true },
      })
    : []
  const dncEntries = await db.dncEntry.findMany({
    where: { companyId: identity.companyId },
    select: { phoneNumber: true, reason: true },
  })
  const identification = identifyCaller({ fromNumber: from, contacts, dncEntries })

  const activeNumber = typeof body.phoneNumberId === 'string'
    ? await db.phoneNumber.findFirst({ where: { id: body.phoneNumberId, companyId: identity.companyId }, select: { provider: true } })
    : await db.phoneNumber.findFirst({ where: { companyId: identity.companyId, status: 'active' }, orderBy: { createdAt: 'desc' }, select: { provider: true } })

  const started = await startCall({
    companyId: identity.companyId,
    direction: 'inbound',
    from,
    to,
    provider: activeNumber?.provider ?? 'sandbox',
    agentType: 'ai',
    voiceAgentId: typeof body.voiceAgentId === 'string' ? body.voiceAgentId : undefined,
    contactId: identification.contactId,
  })

  let conversation: { greeting: string; language: string } | null = null
  if (started.state === 'in_progress' || started.simulated) {
    const opening = await beginConversation({
      companyId: identity.companyId,
      callSessionId: started.id,
    })
    conversation = opening
  }

  return {
    callSessionId: started.id,
    simulated: started.simulated,
    state: started.state,
    caller: identification,
    conversation,
    notice: started.simulated
      ? 'Simulated inbound leg (sandbox adapter) — no real telephone network was contacted.'
      : 'Inbound leg registered with the configured telephony provider.',
  }
})
