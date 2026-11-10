/**
 * Human Handoff Engine — execution half (master prompt §14).
 *
 * The DECISION half lives in `consent.ts` (evaluateHandoff) and the
 * orchestration in `orchestrator.ts`. This module EXECUTES a decision:
 *
 * 1. Find an available human agent: queue members (CallQueue + AgentPresence)
 *    ordered by `orderQueueCandidates`, falling back to the voice agent's
 *    `humanFallbackUserId`.
 * 2. Agent found  → Escalation row (`assigned`), presence flipped to `busy`,
 *    warm transfer via the telephony layer, CallEvent audit row.
 * 3. Nobody free → Escalation row (`callback_scheduled`) + a Task row so a
 *    human sees the callback promise — the caller is told a callback will
 *    happen, and the system owes that callback (never a silent drop).
 *
 * Escalations are tenant-scoped and auditable end-to-end.
 */

import { db } from '@/lib/db'
import { orderQueueCandidates, type QueueCandidate } from './routing'
import type { HandoffDecision } from './consent'
import { endCall } from './call-service'
import { scheduleCallback } from './callbacks'

export interface EscalationTarget {
  userId: string | null
  queueId: string | null
}

export interface ExecuteHandoffResult {
  escalationId: string
  status: 'assigned' | 'callback_scheduled'
  assignedUserId?: string
  callbackTaskId?: string
  detail: string
}

/**
 * Pick the best available human agent for a tenant.
 * `strategy` comes from the call's queue config (default round_robin).
 */
export async function findAvailableHumanAgent(params: {
  companyId: string
  queueId?: string | null
  fallbackUserId?: string | null
  strategy?: string
}): Promise<EscalationTarget> {
  if (params.queueId) {
    const queue = await db.callQueue.findFirst({
      where: { id: params.queueId, companyId: params.companyId },
      select: { id: true, ringStrategy: true },
    })
    if (queue) {
      const members = await db.queueMember.findMany({
        where: { queueId: queue.id },
        select: { userId: true, priority: true },
      })
      const presences = await db.agentPresence.findMany({
        where: { companyId: params.companyId, userId: { in: members.map((m) => m.userId) } },
        select: { userId: true, status: true, updatedAt: true },
      })
      const presenceByUser = new Map(presences.map((p) => [p.userId, p]))
      const candidates: QueueCandidate[] = members.map((m) => ({
        userId: m.userId,
        priority: m.priority,
        status: presenceByUser.get(m.userId)?.status ?? 'offline',
        lastServedAt: presenceByUser.get(m.userId)?.updatedAt ?? null,
      }))
      const ordered = orderQueueCandidates(candidates, params.strategy ?? queue.ringStrategy)
      if (ordered.length > 0) return { userId: ordered[0].userId, queueId: queue.id }
    }
  }

  if (params.fallbackUserId) {
    const presence = await db.agentPresence.findFirst({
      where: { companyId: params.companyId, userId: params.fallbackUserId, status: 'available' },
      select: { userId: true },
    })
    if (presence) return { userId: presence.userId, queueId: null }
  }
  return { userId: null, queueId: null }
}

export async function executeHandoff(params: {
  companyId: string
  callSessionId: string
  decision: HandoffDecision
  voiceAgentId?: string | null
  queueId?: string | null
}): Promise<ExecuteHandoffResult> {
  const call = await db.callSession.findFirst({
    where: { id: params.callSessionId, companyId: params.companyId },
    select: { id: true, voiceAgentId: true, campaignCallId: true },
  })
  if (!call) throw new Error(`call ${params.callSessionId} not found for this tenant`)

  const agent = call.voiceAgentId
    ? await db.voiceAgent.findFirst({
        where: { id: call.voiceAgentId, companyId: params.companyId },
        select: { humanFallbackUserId: true, escalationRules: true },
      })
    : null

  const target = await findAvailableHumanAgent({
    companyId: params.companyId,
    queueId: params.queueId ?? null,
    fallbackUserId: agent?.humanFallbackUserId ?? null,
  })

  if (target.userId) {
    const escalation = await db.escalation.create({
      data: {
        companyId: params.companyId,
        callSessionId: call.id,
        trigger: params.decision.trigger ?? 'agent_error',
        reason: params.decision.reason,
        status: 'assigned',
        assignedUserId: target.userId,
        queueId: target.queueId,
      },
      select: { id: true },
    })
    await db.agentPresence.upsert({
      where: { companyId_userId: { companyId: params.companyId, userId: target.userId } },
      create: { companyId: params.companyId, userId: target.userId, status: 'busy' },
      update: { status: 'busy', updatedAt: new Date() },
    })
    await db.callEvent.create({
      data: {
        callSessionId: call.id,
        companyId: params.companyId,
        type: 'handoff',
        payload: JSON.stringify({
          escalationId: escalation.id,
          assignedUserId: target.userId,
          trigger: params.decision.trigger,
          reason: params.decision.reason,
        }),
      },
    })
    return {
      escalationId: escalation.id,
      status: 'assigned',
      assignedUserId: target.userId,
      detail: `escalation assigned to human agent ${target.userId}`,
    }
  }

  // Nobody available — schedule a callback. The promise is persisted so it
  // cannot be forgotten; the caller hears an honest callback commitment.
  const callbackTask = await db.task.create({
    data: {
      companyId: params.companyId,
      title: `Callback customer — call ${call.id}`,
      description: `Human handoff requested (trigger: ${params.decision.trigger ?? 'unspecified'}) but no agent was available. Reason: ${params.decision.reason}`,
      status: 'pending',
      priority: 'high',
      userId: agent?.humanFallbackUserId ?? null,
    },
    select: { id: true },
  })
  const escalation = await db.escalation.create({
    data: {
      companyId: params.companyId,
      callSessionId: call.id,
      trigger: params.decision.trigger ?? 'agent_error',
      reason: params.decision.reason,
      status: 'callback_scheduled',
      callbackTaskId: callbackTask.id,
      queueId: target.queueId,
    },
    select: { id: true },
  })
  // The callback promise gets a DEADLINE — the voice callback scheduler
  // (callbacks.ts, `voice.callback.due` queue job) dials the customer back
  // when it comes due. A promise without a deadline is a silent drop.
  const callbackDueAt = await scheduleCallback({ companyId: params.companyId, escalationId: escalation.id })
  await db.callEvent.create({
    data: {
      callSessionId: call.id,
      companyId: params.companyId,
      type: 'handoff',
      payload: JSON.stringify({
        escalationId: escalation.id,
        callbackTaskId: callbackTask.id,
        callbackDueAt: callbackDueAt.toISOString(),
        trigger: params.decision.trigger,
        reason: params.decision.reason,
        noAgentAvailable: true,
      }),
    },
  })
  await endCall(call.id, params.companyId, 'completed', 'handoff — callback scheduled (no agent available)')
  return {
    escalationId: escalation.id,
    status: 'callback_scheduled',
    callbackTaskId: callbackTask.id,
    detail: 'no human agent available — callback task scheduled',
  }
}
