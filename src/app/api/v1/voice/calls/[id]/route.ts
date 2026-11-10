import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'

/**
 * /api/v1/voice/calls/:id — single call with transcript/summary/events.
 * The id is the second-to-last path segment (:id from /calls/:id).
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }, request) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  const id = segments[segments.indexOf('calls') + 1]
  const call = await db.callSession.findFirst({
    where: { id, companyId: identity.companyId }, // tenant isolation
    include: {
      events: { orderBy: { createdAt: 'asc' }, take: 100 },
      transcript: true,
      summary: true,
      recording: true,
    },
  })
  if (!call) throw new V1Error('Call not found', 404, 'NOT_FOUND')
  return { call }
})
