/**
 * Inbound routing engine (Module E — Inbound AI Call Center).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `routing.ts` held pure evaluators (IVR digit → decision, business-hours
 * status, queue ordering) but NOTHING composed them into a real inbound path.
 * An inbound call could only "answer with the AI agent" — there was no way to
 * respect an IVR, a holiday calendar, a queue with a ring strategy, an
 * after-hours voicemail or a full-queue overflow. That is now implemented here.
 *
 * DECISION ORDER (fail-closed, deterministic):
 *   1. Phone number must be ACTIVE and belong to the tenant.
 *   2. Business hours → if closed, route to after-hours action
 *      (voicemail | voice_agent | hangup | forward).
 *   3. IVR flow (the number's active flow, else the tenant's) → greeting/menu.
 *   4. Menu decision → queue | voice_agent | user | voicemail | hangup | menu.
 *   5. Queue → order available agents; overflow to the queue's AI agent when
 *      nobody is available.
 *   6. Nothing configured → the number's assigned AI agent; else honest
 *      `unrouted` (never a fabricated agent).
 *
 * The engine returns a PLAN (`InboundPlan`) with a human-readable reason chain.
 * Executing the plan (placing/answering legs) is the caller's job, so this unit
 * is testable without a telephony provider.
 */

import { db } from '@/lib/db'
import {
  applyNodeAction,
  businessHoursStatus,
  evaluateIvrDigit,
  ivrEntryNode,
  orderQueueCandidates,
  type BusinessHourConfig,
  type IvrFlowGraph,
  type IvrNode,
  type QueueCandidate,
} from './routing'

export type InboundAction =
  | 'voice_agent'   // AI answers
  | 'queue'         // deliver to human queue
  | 'user'          // ring a specific user
  | 'voicemail'     // take a message
  | 'hangup'        // reject/close politely
  | 'forward'       // external forward number
  | 'play_menu'     // (re)play an IVR menu and wait for a digit
  | 'unrouted'      // nothing configured — honest failure for the operator

export interface InboundPlan {
  action: InboundAction
  /** Target id for the chosen action (agent/queue/user/flow/number). */
  targetId?: string
  voiceAgentId?: string
  queueId?: string
  userId?: string
  ivrFlowId?: string
  nodeId?: string
  /** Spoken prompt for this step (greeting / menu text / voicemail greeting). */
  prompt?: string
  /** Digits the caller may press now (menu only). */
  menu?: Array<{ digit: string; label: string }>
  /** Ordered, human-readable explanation of every decision made. */
  reasons: string[]
  businessHours: { open: boolean; reason: string; localTime: string; localDate: string }
  /** True when the plan came from a queue with no available humans. */
  overflowed?: boolean
}

export interface InboundContext {
  companyId: string
  toNumber: string
  phoneNumberId?: string | null
  /** DTMF digit the caller pressed, when continuing an IVR. */
  digit?: string | null
  /** IVR node the caller is currently on (returned by a previous plan). */
  currentNodeId?: string | null
  at?: Date
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return (JSON.parse(raw) as T) ?? fallback
  } catch {
    return fallback
  }
}

/** Read the tenant's number row, scoped to the tenant. */
async function resolveNumber(companyId: string, toNumber: string, phoneNumberId?: string | null) {
  if (phoneNumberId) {
    const byId = await db.phoneNumber.findFirst({ where: { id: phoneNumberId, companyId } })
    if (byId) return byId
  }
  return db.phoneNumber.findFirst({
    where: { companyId, e164: toNumber },
    orderBy: { createdAt: 'desc' },
  })
}

/** Tenant business hours: the newest definition wins; none = always open. */
async function resolveBusinessHours(companyId: string): Promise<BusinessHourConfig | null> {
  const row = await db.businessHour.findFirst({
    where: { companyId },
    orderBy: { updatedAt: 'desc' },
  })
  if (!row) return null
  const weekly = parseJson<Array<{ day: number; open?: string; close?: string; closed?: boolean }>>(row.weeklySchedule, [])
  return {
    timezone: row.timezone || 'Asia/Dhaka',
    weeklySchedule: weekly.map((d) => ({
      day: d.day,
      closed: d.closed ?? !d.open,
      ...(d.open ? { open: d.open } : {}),
      ...(d.close ? { close: d.close } : {}),
    })),
    holidays: parseJson<string[]>(row.holidays, []),
  }
}

interface NumberRoutingConfig {
  afterHoursAction?: InboundAction
  afterHoursTarget?: string
  forwardNumber?: string
  voicemailPrompt?: string
  ivrFlowId?: string
  voiceAgentId?: string
  queueId?: string
}

function numberRoutingConfig(raw: string | null | undefined): NumberRoutingConfig {
  const meta = parseJson<Record<string, unknown>>(raw, {})
  const routing = (meta.inboundRouting ?? {}) as NumberRoutingConfig
  return typeof routing === 'object' && routing !== null ? routing : {}
}

/**
 * Build the inbound routing plan for one call. Read-only: no call records are
 * created here, so an operator can dry-run routing before publishing a number.
 */
export async function planInboundCall(ctx: InboundContext): Promise<InboundPlan> {
  const reasons: string[] = []
  const at = ctx.at ?? new Date()

  const number = await resolveNumber(ctx.companyId, ctx.toNumber, ctx.phoneNumberId)
  if (number && number.status !== 'active') {
    reasons.push(`number ${number.e164} status is "${number.status}" — refusing to route`)
    return {
      action: 'hangup',
      reasons,
      businessHours: { open: false, reason: 'number inactive', localTime: '', localDate: '' },
    }
  }
  const routingConfig = numberRoutingConfig(number?.metadata)
  if (number) reasons.push(`number ${number.e164} resolved`)

  const hoursConfig = await resolveBusinessHours(ctx.companyId)
  const hours = businessHoursStatus(hoursConfig, at)
  reasons.push(`business hours: ${hours.reason}${hours.localTime ? ` (${hours.localDate} ${hours.localTime})` : ''}`)

  // 2. Closed hours → after-hours action (default: voicemail).
  if (!hours.open) {
    const action = routingConfig.afterHoursAction ?? 'voicemail'
    reasons.push(`closed hours → after-hours action "${action}"`)
    if (action === 'forward' && routingConfig.forwardNumber) {
      return { action: 'forward', targetId: routingConfig.forwardNumber, prompt: undefined, reasons, businessHours: hours }
    }
    if (action === 'voice_agent') {
      const agentId = routingConfig.voiceAgentId ?? number?.assignedVoiceAgentId ?? routingConfig.afterHoursTarget
      if (agentId) {
        const agent = await db.voiceAgent.findFirst({ where: { id: agentId, companyId: ctx.companyId }, select: { id: true, greeting: true } })
        if (agent) {
          return { action: 'voice_agent', voiceAgentId: agent.id, prompt: agent.greeting ?? undefined, reasons, businessHours: hours }
        }
        reasons.push(`after-hours agent ${agentId} not found for this tenant`)
      }
    }
    if (action === 'hangup') {
      return { action: 'hangup', reasons, businessHours: hours }
    }
    const greeting = routingConfig.voicemailPrompt ?? 'এখন আমাদের অফিস সময় শেষ। অনুগ্রহ করে আপনার নাম ও নম্বরসহ একটি বার্তা রেখে যান।'
    return { action: 'voicemail', prompt: greeting, reasons, businessHours: hours }
  }

  // 3. IVR — the number's own flow first, then the tenant's active flow.
  const ivrFlowId = number?.assignedIvrFlowId ?? routingConfig.ivrFlowId ?? null
  const flowRow = ivrFlowId
    ? await db.ivrFlow.findFirst({ where: { id: ivrFlowId, companyId: ctx.companyId, active: true } })
    : await db.ivrFlow.findFirst({ where: { companyId: ctx.companyId, active: true } })
  if (flowRow) {
    const graph: IvrFlowGraph = {
      nodes: parseJson<IvrNode[]>(flowRow.nodes, []),
      entryNodeId: flowRow.entryNodeId ?? undefined,
    }
    const node = ctx.currentNodeId
      ? graph.nodes.find((n) => n.id === ctx.currentNodeId) ?? ivrEntryNode(graph)
      : ivrEntryNode(graph)
    if (node) {
      reasons.push(`IVR flow "${flowRow.name}" node "${node.id}" (${node.type})`)

      // Menu + digit → decision
      if (node.type === 'menu' && ctx.digit) {
        const decision = evaluateIvrDigit(node, ctx.digit)
        reasons.push(`digit ${ctx.digit} → ${decision.action} (${decision.reason})`)
        if (decision.action === 'menu' || decision.action === 'route') {
          const nextNode = decision.nodeId ? graph.nodes.find((n) => n.id === decision.nodeId) : node
          return {
            action: 'play_menu',
            ivrFlowId: flowRow.id,
            nodeId: nextNode?.id,
            prompt: nextNode?.prompt,
            menu: (nextNode?.options ?? []).map((o) => ({ digit: o.digit, label: o.label })),
            reasons,
            businessHours: hours,
          }
        }
        if (decision.action === 'queue' && decision.actionTargetId) {
          const queuePlan = await routeToQueue(ctx.companyId, decision.actionTargetId, reasons, hours)
          return { ...queuePlan, ivrFlowId: flowRow.id, nodeId: node.id }
        }
        if (decision.action === 'voice_agent' && decision.actionTargetId) {
          return {
            action: 'voice_agent',
            voiceAgentId: decision.actionTargetId,
            ivrFlowId: flowRow.id,
            nodeId: node.id,
            reasons,
            businessHours: hours,
          }
        }
        if (decision.action === 'user' && decision.actionTargetId) {
          return {
            action: 'user',
            userId: decision.actionTargetId,
            ivrFlowId: flowRow.id,
            nodeId: node.id,
            reasons,
            businessHours: hours,
          }
        }
        if (decision.action === 'voicemail') {
          return { action: 'voicemail', ivrFlowId: flowRow.id, nodeId: node.id, prompt: node.prompt, reasons, businessHours: hours }
        }
        if (decision.action === 'hangup') {
          return { action: 'hangup', ivrFlowId: flowRow.id, nodeId: node.id, reasons, businessHours: hours }
        }
      }

      // Menu without a digit, greeting, or a route node: play it.
      if (node.type === 'menu' || node.type === 'greeting') {
        return {
          action: 'play_menu',
          ivrFlowId: flowRow.id,
          nodeId: node.id,
          prompt: node.prompt,
          menu: (node.options ?? []).map((o) => ({ digit: o.digit, label: o.label })),
          reasons,
          businessHours: hours,
        }
      }
      if (node.type !== 'menu' && node.action) {
        const decision = applyNodeAction(node)
        reasons.push(`node action → ${decision.action}`)
        if (decision.action === 'queue' && decision.actionTargetId) {
          const queuePlan = await routeToQueue(ctx.companyId, decision.actionTargetId, reasons, hours)
          return { ...queuePlan, ivrFlowId: flowRow.id, nodeId: node.id }
        }
        if (decision.action === 'voice_agent' && decision.actionTargetId) {
          return { action: 'voice_agent', voiceAgentId: decision.actionTargetId, ivrFlowId: flowRow.id, nodeId: node.id, reasons, businessHours: hours }
        }
        if (decision.action === 'voicemail') {
          return { action: 'voicemail', ivrFlowId: flowRow.id, nodeId: node.id, prompt: node.prompt, reasons, businessHours: hours }
        }
        if (decision.action === 'hangup') {
          return { action: 'hangup', ivrFlowId: flowRow.id, nodeId: node.id, reasons, businessHours: hours }
        }
      }
      if (node.type === 'voicemail') {
        return { action: 'voicemail', ivrFlowId: flowRow.id, nodeId: node.id, prompt: node.prompt, reasons, businessHours: hours }
      }
      if (node.type === 'hangup') {
        return { action: 'hangup', ivrFlowId: flowRow.id, nodeId: node.id, reasons, businessHours: hours }
      }
    } else {
      reasons.push(`IVR flow "${flowRow.name}" has no usable entry node — skipping`)
    }
  }

  // 6. Direct assignment on the number.
  const directAgentId = number?.assignedVoiceAgentId ?? routingConfig.voiceAgentId
  if (directAgentId) {
    const agent = await db.voiceAgent.findFirst({
      where: { id: directAgentId, companyId: ctx.companyId },
      select: { id: true, greeting: true, status: true },
    })
    if (agent) {
      reasons.push(`number is assigned to voice agent ${agent.id} (status ${agent.status})`)
      return { action: 'voice_agent', voiceAgentId: agent.id, prompt: agent.greeting ?? undefined, reasons, businessHours: hours }
    }
    reasons.push(`assigned voice agent ${directAgentId} not found for this tenant`)
  }
  if (number?.assignedQueueId) {
    reasons.push('number is assigned to a queue')
    const queuePlan = await routeToQueue(ctx.companyId, number.assignedQueueId, reasons, hours)
    return queuePlan
  }
  if (routingConfig.queueId) {
    return routeToQueue(ctx.companyId, routingConfig.queueId, reasons, hours)
  }

  reasons.push('no IVR, agent or queue is configured for this number — call cannot be routed')
  return { action: 'unrouted', reasons, businessHours: hours }
}

/** Order a queue's members by presence and ring strategy; overflow honestly. */
async function routeToQueue(
  companyId: string,
  queueId: string,
  reasons: string[],
  hours: InboundPlan['businessHours'],
): Promise<InboundPlan> {
  const queue = await db.callQueue.findFirst({
    where: { id: queueId, companyId },
    include: { members: true },
  })
  if (!queue) {
    reasons.push(`queue ${queueId} not found for this tenant`)
    return { action: 'unrouted', reasons, businessHours: hours }
  }

  const userIds = queue.members.map((m) => m.userId)
  const presences = userIds.length > 0
    ? await db.agentPresence.findMany({ where: { companyId, userId: { in: userIds } } })
    : []
  const presenceByUser = new Map(presences.map((p) => [p.userId, p.status]))

  // lastServedAt: most recent call assignment per agent (real data, not memory).
  const lastCalls = userIds.length > 0
    ? await db.callSession.groupBy({
        by: ['assignedUserId'],
        where: { companyId, assignedUserId: { in: userIds } },
        _max: { createdAt: true },
      })
    : []
  const lastServed = new Map(lastCalls.map((c) => [c.assignedUserId ?? '', c._max.createdAt]))

  const candidates: QueueCandidate[] = queue.members.map((m) => ({
    userId: m.userId,
    priority: m.priority,
    status: presenceByUser.get(m.userId) ?? 'offline',
    lastServedAt: lastServed.get(m.userId) ?? null,
  }))
  const ordered = orderQueueCandidates(candidates, queue.ringStrategy)
  reasons.push(
    `queue "${queue.name}": ${ordered.length} of ${candidates.length} agent(s) available (strategy ${queue.ringStrategy})`,
  )

  if (ordered.length > 0) {
    return {
      action: queue.ringStrategy === 'simultaneous' ? 'queue' : 'user',
      queueId: queue.id,
      userId: ordered[0].userId,
      reasons,
      businessHours: hours,
    }
  }

  // Nobody available → overflow to the queue's AI agent when configured.
  if (queue.overflowVoiceAgentId) {
    const agent = await db.voiceAgent.findFirst({
      where: { id: queue.overflowVoiceAgentId, companyId },
      select: { id: true, greeting: true },
    })
    if (agent) {
      reasons.push(`no agents available → overflow to AI agent ${agent.id}`)
      return {
        action: 'voice_agent',
        voiceAgentId: agent.id,
        queueId: queue.id,
        prompt: agent.greeting ?? undefined,
        reasons,
        businessHours: hours,
        overflowed: true,
      }
    }
    reasons.push(`overflow agent ${queue.overflowVoiceAgentId} not found — falling back to voicemail`)
  } else {
    reasons.push('no agents available and no overflow agent configured')
  }
  return {
    action: 'voicemail',
    queueId: queue.id,
    prompt: 'আমাদের সব প্রতিনিধি বর্তমানে ব্যস্ত আছেন। অনুগ্রহ করে আপনার নাম ও নম্বরসহ বার্তা রেখে যান, আমরা ফোন করে নেব।',
    reasons,
    businessHours: hours,
    overflowed: true,
  }
}

/** Advance an IVR call by one digit, returning the next plan. */
export async function continueIvr(params: InboundContext & { flowId: string; currentNodeId: string; digit: string }): Promise<InboundPlan> {
  return planInboundCall({
    companyId: params.companyId,
    toNumber: params.toNumber,
    phoneNumberId: params.phoneNumberId,
    currentNodeId: params.currentNodeId,
    digit: params.digit,
    at: params.at,
  })
}
