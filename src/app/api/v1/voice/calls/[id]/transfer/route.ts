import { v1Handler, V1Error } from '@/lib/v1'
import { transferCall } from '@/lib/voice/call-service'
import { executeHandoff } from '@/lib/voice/handoff'

/**
 * /api/v1/voice/calls/:id/transfer — transfer to a human agent or number.
 * POST { target, reason?, escalate?: boolean }
 * With `escalate: true` the full handoff engine runs (queue routing,
 * escalation record, callback task when nobody is available).
 */
export const dynamic = 'force-dynamic'

export const POST = v1Handler(async ({ identity }, request) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  const id = segments[segments.indexOf('calls') + 1]
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const target = typeof body.target === 'string' ? body.target : null
  if (!target) throw new V1Error('target is required', 400, 'BAD_REQUEST')
  const reason = typeof body.reason === 'string' ? body.reason : 'api transfer'

  if (body.escalate === true) {
    const result = await executeHandoff({
      companyId: identity.companyId,
      callSessionId: id,
      decision: { handoff: true, mandatory: true, reason },
    })
    return { id, escalation: result }
  }

  await transferCall(id, identity.companyId, target, reason)
  return { id, status: 'transferring', target }
})
