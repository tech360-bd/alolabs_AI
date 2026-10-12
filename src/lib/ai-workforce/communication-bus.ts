import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export async function sendMessage(data: { fromAgentId?: string; toAgentId?: string; fromInstanceId?: string; toInstanceId?: string; type: string; subject: string; payload?: Record<string, unknown>; parentMsgId?: string; companyId?: string }) {
  return db.agentCommunication.create({ data: { ...data, payload: JSON.stringify(data.payload || {}), status: 'pending' } })
}

export async function getMessages(filters: { agentId?: string; instanceId?: string; type?: string; status?: string; companyId?: string; limit?: number }) {
  const where: Prisma.AgentCommunicationWhereInput = {}
  if (filters.agentId) where.OR = [{ fromAgentId: filters.agentId }, { toAgentId: filters.agentId }]
  if (filters.instanceId) where.OR = [{ fromInstanceId: filters.instanceId }, { toInstanceId: filters.instanceId }]
  if (filters.type) where.type = filters.type
  if (filters.status) where.status = filters.status
  if (filters.companyId) where.companyId = filters.companyId
  return db.agentCommunication.findMany({ where, orderBy: { createdAt: 'desc' }, take: filters.limit || 50, include: { fromAgent: true, toAgent: true } }).catch(() => db.agentCommunication.findMany({ where, orderBy: { createdAt: 'desc' }, take: filters.limit || 50 }))
}

export async function markDelivered(msgId: string) {
  return db.agentCommunication.update({ where: { id: msgId }, data: { status: 'delivered', deliveredAt: new Date() } })
}

export async function markActed(msgId: string) {
  return db.agentCommunication.update({ where: { id: msgId }, data: { status: 'acted', actedAt: new Date() } })
}

export async function delegateTask(data: { fromAgentId: string; toAgentId: string; subject: string; task: Record<string, unknown>; companyId?: string; executionId?: string }) {
  return sendMessage({ ...data, type: 'delegation', payload: { task: data.task, executionId: data.executionId } })
}

export async function escalate(data: { fromAgentId: string; toAgentId?: string; subject: string; reason: string; severity: string; companyId?: string }) {
  return sendMessage({ ...data, type: 'escalation', payload: { reason: data.reason, severity: data.severity } })
}

export async function requestConsensus(data: { fromAgentId: string; toAgentIds: string[]; subject: string; proposal: Record<string, unknown>; companyId?: string }) {
  const msgs = []
  for (const toId of data.toAgentIds) {
    msgs.push(await sendMessage({ fromAgentId: data.fromAgentId, toAgentId: toId, type: 'consensus', subject: data.subject, payload: { proposal: data.proposal }, companyId: data.companyId }))
  }
  return msgs
}

export async function getCommunicationStats(companyId?: string) {
  const where: Prisma.AgentCommunicationWhereInput = companyId ? { companyId } : {}
  const [total, pending, delivered, acted] = await Promise.all([
    db.agentCommunication.count({ where }),
    db.agentCommunication.count({ where: { ...where, status: 'pending' } }),
    db.agentCommunication.count({ where: { ...where, status: 'delivered' } }),
    db.agentCommunication.count({ where: { ...where, status: 'acted' } }),
  ])
  return { total, pending, delivered, acted }
}
