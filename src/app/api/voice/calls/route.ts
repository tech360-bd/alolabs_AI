import { db } from '@/lib/db'
import { readJson, requireString, optionalString, optionalNumber, withCompany } from '@/lib/voice/api-helpers'
import { startCall, answerCall, endCall, holdCall, transferCall } from '@/lib/voice/call-service'
import { beginConversation } from '@/lib/voice/conversation-service'
import { isCallState } from '@/lib/voice/call-state'
import { CALL_STATES } from '@/lib/voice/call-state'
import { isDncBlocked, normalizePhoneNumber } from '@/lib/voice/consent'
import { normalizeBdPhoneNumber, identifyCaller } from '@/lib/voice/customers'
import { checkCallQuota, recordQuotaAlert } from '@/lib/voice/quotas'
import { withIdempotency, pruneIdempotencyKeys } from '@/lib/voice/idempotency'
import { checkRateLimit } from '@/lib/rate-limiter'

export const dynamic = 'force-dynamic'

/**
 * Call management (master prompt §12/§13/§22).
 * GET  — tenant-scoped call history with pagination + status filter.
 * POST — start a call. Outbound dials pass: rate limit → idempotency →
 *        suppression list → usage quota, all fail-closed. Inbound starts
 *        identify the caller (exact normalized-phone CRM match) and attach
 *        the contact to the call.
 * PATCH — drive the lifecycle of one call: answer (opens the AI conversation
 *         with disclosure) / hold / resume / transfer / end.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const direction = searchParams.get('direction')
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50') || 50))
    const where = {
      companyId: auth.companyId,
      ...(status ? { status } : {}),
      ...(direction ? { direction } : {}),
    }
    const [total, data] = await Promise.all([
      db.callSession.count({ where }),
      db.callSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { events: { orderBy: { createdAt: 'asc' }, take: 20 } },
      }),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  })
}

/** Per-tenant POST rate limit: 30 new calls per minute. */
const CALLS_RATE_LIMIT = 30
const CALLS_RATE_WINDOW_MS = 60_000

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const rate = await checkRateLimit(`voice:calls:post:${auth.companyId}`, CALLS_RATE_LIMIT, CALLS_RATE_WINDOW_MS)
    if (!rate.allowed) {
      throw new Error(`rate limited: max ${CALLS_RATE_LIMIT} call starts per minute for this tenant`)
    }
    void pruneIdempotencyKeys().catch(() => undefined)

    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const from = requireString(body, 'from')
    const to = requireString(body, 'to')
    const direction = optionalString(body, 'direction') === 'inbound' ? 'inbound' : 'outbound'
    const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''

    return withIdempotency({
      companyId: auth.companyId,
      scope: 'calls.post',
      key: idempotencyKey,
      fn: async () => {
        // Resolve the provider from the tenant's number when possible, so sandbox
        // vs real adapter selection is a property of the number, not the caller.
        let provider = optionalString(body, 'provider')
        if (!provider && body.phoneNumberId) {
          const number = await db.phoneNumber.findFirst({
            where: { id: String(body.phoneNumberId), companyId: auth.companyId },
            select: { provider: true },
          })
          provider = number?.provider
        }
        if (!provider) {
          const activeNumber = await db.phoneNumber.findFirst({
            where: { companyId: auth.companyId, status: 'active' },
            orderBy: { createdAt: 'desc' },
            select: { provider: true },
          })
          provider = activeNumber?.provider ?? 'sandbox'
        }

        // Suppression list — outbound manual dials are governed exactly like
        // campaign dials: customer-request opt-outs can NEVER be called.
        if (direction === 'outbound') {
          const dncEntries = await db.dncEntry.findMany({
            where: { companyId: auth.companyId },
            select: { phoneNumber: true, reason: true },
          })
          const dnc = isDncBlocked({ number: to, dncEntries, respectDnc: body.respectDnc !== false })
          if (dnc.blocked) {
            throw new Error(`refused: destination is on the suppression list (${dnc.reason})`)
          }
          // Quota pre-flight against REAL metered usage (fail-closed).
          const quota = await checkCallQuota({ companyId: auth.companyId, agentType: optionalString(body, 'agentType') ?? 'ai', maxCallSeconds: 600 })
          if (!quota.allowed) throw new Error(`refused: ${quota.reason}`)
          if (quota.alertTriggered && quota.limitMinutes) {
            await recordQuotaAlert({
              companyId: auth.companyId,
              dimension: quota.dimension,
              usedMinutes: quota.usedMinutes,
              limitMinutes: quota.limitMinutes,
              periodKey: new Date().toISOString().slice(0, 7),
            }).catch(() => undefined)
          }
        }

        // Inbound caller identification (exact normalized-phone match only).
        let contactId: string | null = null
        let callerIdentification: unknown = null
        if (direction === 'inbound') {
          const normalized = normalizeBdPhoneNumber(from)
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
          const identification = identifyCaller({ fromNumber: from, contacts, dncEntries })
          contactId = identification.contactId
          callerIdentification = identification
        }

        const started = await startCall({
          companyId: auth.companyId,
          direction,
          from,
          to,
          provider,
          phoneNumberId: optionalString(body, 'phoneNumberId'),
          voiceAgentId: optionalString(body, 'voiceAgentId'),
          agentType: (optionalString(body, 'agentType') as 'ai' | 'human' | 'ivr') ?? 'ai',
          assignedUserId: optionalString(body, 'assignedUserId') ?? auth.userId,
          contactId,
          sandboxBehavior: optionalString(body, 'sandboxBehavior') as never,
        })
        return {
          data: { ...started, contactId, callerIdentification },
          notice: started.simulated
            ? 'Simulated call (sandbox adapter) — no real telephone network was contacted.'
            : 'Call handed to the configured telephony provider.',
        }
      },
    })
  })
}

const ACTIONS = new Set(['answer', 'hold', 'resume', 'transfer', 'end'])

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const callId = requireString(body, 'callId')
    const action = requireString(body, 'action')
    if (!ACTIONS.has(action)) {
      throw new Error(`Invalid request: action must be one of ${[...ACTIONS].join(', ')}`)
    }

    switch (action) {
      case 'answer': {
        const call = await db.callSession.findFirst({
          where: { id: callId, companyId: auth.companyId },
          select: { direction: true, agentType: true, voiceAgentId: true, status: true },
        })
        if (!call) throw new Error(`call ${callId} not found for this tenant`)
        await answerCall(callId, auth.companyId)
        // AI inbound calls open the real conversation (greeting + AI
        // disclosure). Human/ivr calls keep their own answering flow.
        if (call.direction === 'inbound' && call.agentType === 'ai' && call.voiceAgentId) {
          const opening = await beginConversation({
            companyId: auth.companyId,
            callSessionId: callId,
            detectedLanguage: optionalString(body, 'detectedLanguage'),
          })
          return { data: { ok: true, action, conversationOpened: true, greeting: opening.greeting, language: opening.language } }
        }
        return { data: { ok: true, action } }
      }
      case 'hold':
        await holdCall(callId, auth.companyId, true)
        return { data: { ok: true, action } }
      case 'resume':
        await holdCall(callId, auth.companyId, false)
        return { data: { ok: true, action } }
      case 'transfer': {
        const target = requireString(body, 'target')
        await transferCall(callId, auth.companyId, target, optionalString(body, 'reason'))
        return { data: { ok: true, action, target } }
      }
      case 'end': {
        const finalState = optionalString(body, 'finalState') ?? 'completed'
        if (!isCallState(finalState)) {
          throw new Error(`Invalid request: finalState must be one of ${CALL_STATES.join(', ')}`)
        }
        const result = await endCall(callId, auth.companyId, finalState, optionalString(body, 'reason'))
        return { data: { ok: true, action, ...result } }
      }
      default:
        throw new Error('Invalid request: unsupported action')
    }
  })
}
