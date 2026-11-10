import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * Human escalations (master prompt §14).
 * GET   — tenant-scoped escalation list (open first).
 * PATCH — { escalationId, action: 'resolve'|'cancel', resolutionNote? }
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const where = { companyId: auth.companyId, ...(status ? { status } : {}) }
    const [total, data] = await Promise.all([
      db.escalation.count({ where: { companyId: auth.companyId } }),
      db.escalation.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
    ])
    return { data, total }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const escalationId = requireString(body, 'escalationId')
    const action = requireString(body, 'action')
    if (!['resolve', 'cancel'].includes(action)) {
      throw new Error('Invalid request: action must be "resolve" or "cancel"')
    }
    const escalation = await db.escalation.findFirst({
      where: { id: escalationId, companyId: auth.companyId },
    })
    if (!escalation) throw new Error(`escalation ${escalationId} not found for this tenant`)
    if (['resolved', 'cancelled'].includes(escalation.status)) {
      throw new Error(`escalation already ${escalation.status}`)
    }
    const updated = await db.escalation.update({
      where: { id: escalation.id },
      data: {
        status: action === 'resolve' ? 'resolved' : 'cancelled',
        resolvedAt: new Date(),
        resolutionNote: optionalString(body, 'resolutionNote') ?? null,
      },
    })
    // Free the human agent's presence so the queue can route to them again.
    if (escalation.assignedUserId) {
      await db.agentPresence.upsert({
        where: { companyId_userId: { companyId: auth.companyId, userId: escalation.assignedUserId } },
        create: { companyId: auth.companyId, userId: escalation.assignedUserId, status: 'available' },
        update: { status: 'available', updatedAt: new Date() },
      })
    }
    return { data: updated }
  })
}
