import { v1Handler, V1Error } from '@/lib/v1'
import { endCall } from '@/lib/voice/call-service'
import { CALL_STATES, isCallState } from '@/lib/voice/call-state'

/**
 * /api/v1/voice/calls/:id/end — end a call. Idempotent: ending an already
 * terminal call returns the recorded duration without new transitions.
 * POST { finalState?, reason? }
 */
export const dynamic = 'force-dynamic'

export const POST = v1Handler(async ({ identity }, request) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  const id = segments[segments.indexOf('calls') + 1]
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const finalState = typeof body.finalState === 'string' && isCallState(body.finalState)
    ? body.finalState : 'completed'
  const validFinal = CALL_STATES.includes(finalState)
  if (!validFinal) throw new V1Error(`finalState must be one of ${CALL_STATES.join(', ')}`, 400, 'BAD_REQUEST')
  const result = await endCall(
    id,
    identity.companyId,
    finalState,
    typeof body.reason === 'string' ? body.reason : 'ended via API',
  )
  return { id, status: finalState, ...result }
})
