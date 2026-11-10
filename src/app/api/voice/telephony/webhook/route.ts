import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { answerCall, endCall, transferCall } from '@/lib/voice/call-service'
import { isCallState } from '@/lib/voice/call-state'
import { verifyWebhookSignature } from '@/lib/voice/webhook-security'
import { beginConversation } from '@/lib/voice/conversation-service'

export const dynamic = 'force-dynamic'

/**
 * Telephony provider webhook (master prompt §08/§19/§22).
 *
 * Real adapters (Asterisk/FreeSWITCH/SIP trunk) post call-state events here.
 *
 * AUTHENTICATION (two methods during the adapter migration window):
 * 1. HMAC (preferred, replay-safe):
 *      x-alolabs-timestamp = unix seconds
 *      x-alolabs-signature = hex(HMAC_SHA256(company.apiSecret, `${timestamp}.${rawBody}`))
 * 2. Legacy static header `x-alolabs-webhook-secret` — accepted only when no
 *    signature headers are present; the tenant is identified by `companyId`
 *    in the query string. Invalid credentials are rejected with 401 and the
 *    event is never applied.
 *
 * The webhook only drives the state machine and conversation lifecycle — it
 * can never fabricate call content or invent durations.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 401 })
    }
    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, apiSecret: true } })
    if (!company || !company.apiSecret) {
      return NextResponse.json({ error: 'Invalid webhook credentials' }, { status: 401 })
    }

    // Raw body is required for the HMAC (the signature is computed over the
    // exact bytes the adapter signed).
    const rawBody = await request.text()
    const auth = verifyWebhookSignature({
      rawBody,
      headers: request.headers,
      secret: company.apiSecret,
    })
    if (!auth.ok) {
      return NextResponse.json({ error: `Webhook authentication failed: ${auth.reason}` }, { status: auth.status })
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const callId = typeof body.callSessionId === 'string' ? body.callSessionId : null
    const event = typeof body.event === 'string' ? body.event : null
    if (!callId || !event) {
      return NextResponse.json({ error: 'callSessionId and event required' }, { status: 400 })
    }

    // Tenant isolation: the call must belong to the authenticated company.
    const call = await db.callSession.findFirst({ where: { id: callId, companyId } })
    if (!call) {
      return NextResponse.json({ error: 'call not found for this tenant' }, { status: 404 })
    }

    const providerCallId = typeof body.providerCallId === 'string' ? body.providerCallId : undefined
    await db.callEvent.create({
      data: {
        callSessionId: call.id,
        companyId,
        type: `provider_${event}`,
        payload: JSON.stringify({ providerCallId, authMethod: auth.method, ...sanitize(body) }),
      },
    })

    switch (event) {
      case 'answered': {
        await answerCall(call.id, companyId)
        // Inbound AI calls open the real conversation (greeting carries the
        // mandatory AI identity disclosure).
        let conversation: { greeting: string; language: string } | null = null
        if (call.direction === 'inbound' && call.agentType === 'ai' && call.voiceAgentId) {
          const opening = await beginConversation({
            companyId,
            callSessionId: call.id,
            detectedLanguage: typeof body.detectedLanguage === 'string' ? body.detectedLanguage : null,
          })
          conversation = { greeting: opening.greeting, language: opening.language }
        }
        return NextResponse.json({ ok: true, conversation })
      }
      case 'ended': {
        const finalState = typeof body.finalState === 'string' && isCallState(body.finalState)
          ? body.finalState : 'completed'
        await endCall(call.id, companyId, finalState, typeof body.reason === 'string' ? body.reason : 'provider reported end')
        break
      }
      case 'transfer':
        await transferCall(call.id, companyId, String(body.target ?? ''), 'provider requested transfer')
        break
      case 'no_answer':
        await endCall(call.id, companyId, 'no_answer', 'provider reported no answer')
        break
      case 'busy':
        await endCall(call.id, companyId, 'busy', 'provider reported busy')
        break
      case 'failed':
        await endCall(call.id, companyId, 'failed', String(body.reason ?? 'provider reported failure'))
        break
      default:
        // Unknown provider events are recorded for audit but never guess a state.
        break
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'webhook processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Strip anything that looks like a credential from stored payloads. */
function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...body }
  for (const key of Object.keys(clone)) {
    if (/secret|token|password|authorization/i.test(key) || key === 'signature') clone[key] = '[redacted]'
  }
  return clone
}
