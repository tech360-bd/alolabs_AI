import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { createQueue, addQueueMember, removeQueueMember, queueRoster } from '@/lib/voice/telephony-config'

export const dynamic = 'force-dynamic'

/**
 * Call-queue management (Module A — ring groups, call queues, queue priority).
 *
 * GET   — list queues with roster + live presence; ?queueId= returns one roster
 * POST  — create a queue { name, ringStrategy?, priority?, maxWaitSeconds?,
 *         overflowVoiceAgentId? }
 * PATCH — { queueId, action: 'add_member'|'remove_member'|'update', userId?,
 *           priority?, ... } — membership requires a real tenant membership
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const queueId = searchParams.get('queueId')
    if (queueId) return { data: await queueRoster(auth.companyId, queueId) }

    const queues = await db.callQueue.findMany({
      where: { companyId: auth.companyId },
      orderBy: { priority: 'desc' },
      include: { members: true },
    })
    if (queues.length === 0) return { data: [], total: 0 }

    const userIds = [...new Set(queues.flatMap((q) => q.members.map((m) => m.userId)))]
    const [presences, users] = await Promise.all([
      userIds.length > 0 ? db.agentPresence.findMany({ where: { companyId: auth.companyId, userId: { in: userIds } } }) : Promise.resolve([]),
      userIds.length > 0 ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    ])
    const presenceByUser = new Map(presences.map((p) => [p.userId, p.status]))
    const nameByUser = new Map(users.map((u) => [u.id, u.name]))

    return {
      data: queues.map((queue) => ({
        id: queue.id,
        name: queue.name,
        priority: queue.priority,
        ringStrategy: queue.ringStrategy,
        maxWaitSeconds: queue.maxWaitSeconds,
        overflowVoiceAgentId: queue.overflowVoiceAgentId,
        createdAt: queue.createdAt,
        members: queue.members.map((m) => ({
          userId: m.userId,
          priority: m.priority,
          name: nameByUser.get(m.userId) ?? null,
          presence: presenceByUser.get(m.userId) ?? 'offline',
          routable: presenceByUser.get(m.userId) === 'available',
        })),
        availableAgents: queue.members.filter((m) => presenceByUser.get(m.userId) === 'available').length,
      })),
      total: queues.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const created = await createQueue({
      companyId: auth.companyId,
      name: requireString(body, 'name'),
      ringStrategy: optionalString(body, 'ringStrategy'),
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      maxWaitSeconds: typeof body.maxWaitSeconds === 'number' ? body.maxWaitSeconds : undefined,
      overflowVoiceAgentId: optionalString(body, 'overflowVoiceAgentId'),
    })
    return { data: created }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const queueId = requireString(body, 'queueId')
    const action = optionalString(body, 'action') ?? 'update'

    if (action === 'add_member') {
      const member = await addQueueMember({
        companyId: auth.companyId,
        queueId,
        userId: requireString(body, 'userId'),
        priority: typeof body.priority === 'number' ? body.priority : 0,
      })
      return { data: member, notice: 'Member added — they can receive queue calls when their presence is "available".' }
    }
    if (action === 'remove_member') {
      await removeQueueMember({ companyId: auth.companyId, queueId, userId: requireString(body, 'userId') })
      return { data: { ok: true } }
    }
    if (action === 'update') {
      const queue = await db.callQueue.findFirst({ where: { id: queueId, companyId: auth.companyId }, select: { id: true } })
      if (!queue) throw new Error(`queue ${queueId} not found for this tenant`)
      const data: Record<string, unknown> = {}
      if (optionalString(body, 'name')) data.name = optionalString(body, 'name')
      if (optionalString(body, 'ringStrategy')) data.ringStrategy = optionalString(body, 'ringStrategy')
      if (typeof body.priority === 'number') data.priority = body.priority
      if (typeof body.maxWaitSeconds === 'number') data.maxWaitSeconds = body.maxWaitSeconds
      if (body.overflowVoiceAgentId !== undefined) data.overflowVoiceAgentId = optionalString(body, 'overflowVoiceAgentId') ?? null
      if (Object.keys(data).length === 0) throw new Error('Invalid request: nothing to update')
      await db.callQueue.updateMany({ where: { id: queueId, companyId: auth.companyId }, data })
      return { data: { ok: true } }
    }
    throw new Error('Invalid request: action must be add_member, remove_member or update')
  })
}

export async function DELETE(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const queueId = requireString(body, 'queueId')
    const inUse = await db.phoneNumber.count({ where: { companyId: auth.companyId, assignedQueueId: queueId } })
    if (inUse > 0) throw new Error(`refused: ${inUse} phone number(s) still route to this queue`)
    const queue = await db.callQueue.findFirst({ where: { id: queueId, companyId: auth.companyId }, select: { id: true } })
    if (!queue) throw new Error(`queue ${queueId} not found for this tenant`)
    // QueueMember has onDelete: Cascade on the queue relation.
    await db.callQueue.delete({ where: { id: queue.id } })
    return { data: { ok: true } }
  })
}
