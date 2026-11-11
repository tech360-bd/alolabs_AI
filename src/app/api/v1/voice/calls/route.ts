import { NextResponse } from 'next/server'
import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'
import { startCall } from '@/lib/voice/call-service'
import { isDncBlocked } from '@/lib/voice/consent'
import { identifyCaller } from '@/lib/voice/customers'
import { checkCallQuota, recordQuotaAlert } from '@/lib/voice/quotas'
import { checkRateLimit } from '@/lib/rate-limiter'
import { withIdempotency } from '@/lib/voice/idempotency'

/**
 * /api/v1/voice/calls — versioned call surface (master prompt §22).
 * GET  : list calls for the tenant (voice:read)
 * POST : start an outbound call (voice:write) — rate limit, idempotency,
 *        suppression list and usage quota enforced fail-closed.
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }, request) => {
  const params = request.nextUrl.searchParams
  const status = params.get('status')
  const direction = params.get('direction')
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? '50') || 50))
  const where = {
    companyId: identity.companyId,
    ...(status ? { status } : {}),
    ...(direction ? { direction } : {}),
  }
  const [total, data] = await Promise.all([
    db.callSession.count({ where }),
    db.callSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, direction: true, channel: true, fromNumber: true, toNumber: true,
        status: true, agentType: true, language: true, durationSeconds: true,
        disposition: true, transferred: true, simulated: true, contactId: true,
        voiceAgentId: true, startedAt: true, answeredAt: true, endedAt: true, createdAt: true,
      },
    }),
  ])
  return { calls: data, total }
})

export const POST = v1Handler(async ({ identity }, request) => {
  const rate = await checkRateLimit(`voice:calls:post:${identity.companyId}`, 30, 60_000)
  if (!rate.allowed) throw new V1Error('Rate limited: max 30 call starts per minute', 429, 'RATE_LIMITED')

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const from = typeof body.from === 'string' ? body.from : null
  const to = typeof body.to === 'string' ? body.to : null
  if (!from || !to) throw new V1Error('from and to are required', 400, 'BAD_REQUEST')
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''

  const outcome = await withIdempotency({
    companyId: identity.companyId,
    scope: 'v1.voice.calls',
    key: idempotencyKey,
    fn: async () => {
      const dncEntries = await db.dncEntry.findMany({
        where: { companyId: identity.companyId },
        select: { phoneNumber: true, reason: true },
      })
      const dnc = isDncBlocked({ number: to, dncEntries, respectDnc: body.respectDnc !== false })
      if (dnc.blocked) throw new V1Error(`Destination is on the suppression list (${dnc.reason})`, 409, 'SUPPRESSED')

      const quota = await checkCallQuota({ companyId: identity.companyId, agentType: 'ai', maxCallSeconds: 600 })
      if (!quota.allowed) throw new V1Error(quota.reason, 402, 'QUOTA_EXCEEDED')
      if (quota.alertTriggered && quota.limitMinutes) {
        await recordQuotaAlert({
          companyId: identity.companyId, dimension: quota.dimension,
          usedMinutes: quota.usedMinutes, limitMinutes: quota.limitMinutes,
          periodKey: new Date().toISOString().slice(0, 7),
        }).catch(() => undefined)
      }

      const activeNumber = await db.phoneNumber.findFirst({
        where: { companyId: identity.companyId, status: 'active' },
        orderBy: { createdAt: 'desc' },
        select: { provider: true },
      })
      const started = await startCall({
        companyId: identity.companyId,
        direction: 'outbound',
        from,
        to,
        provider: activeNumber?.provider ?? 'sandbox',
        agentType: 'ai',
        assignedUserId: identity.kind === 'session' ? identity.userId : undefined,
      })
      return {
        id: started.id,
        state: started.state,
        providerCallId: started.providerCallId ?? null,
        simulated: started.simulated,
        notice: started.simulated
          ? 'Simulated call (sandbox adapter) — no real telephone network was contacted.'
          : 'Call handed to the configured telephony provider.',
      }
    },
  })
  return NextResponse.json({ success: true, data: outcome.result, replayed: outcome.replayed })
})
