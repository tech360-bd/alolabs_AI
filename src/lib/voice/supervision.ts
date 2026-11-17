/**
 * Supervisor & quality assurance service (Module G — supervisor workspace).
 *
 * The agent-facing pieces (presence, call answer/transfer) existed; what a
 * SUPERVISOR needs did not: a live view of who is on what call, queue depths and
 * waits, and a human QA review workflow with its own audit trail.
 *
 * PRIVACY: live monitoring here is METADATA ONLY (who, what state, how long).
 * Listening to or recording a live conversation is a separate, consent-gated
 * capability (see recording.ts + docs/SECURITY_AND_COMPLIANCE.md). This module
 * never exposes transcript or audio of an in-progress call, because a supervisor
 * silent-monitoring a caller who was not told would be a compliance failure.
 */

import { db } from '@/lib/db'

export const REVIEW_CRITERIA = [
  'greeting',
  'disclosure',
  'accuracy',
  'empathy',
  'resolution',
  'compliance',
  'closing',
] as const
export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number]

const ACTIVE_STATES = ['queued', 'ringing', 'in_progress', 'on_hold', 'transferring', 'after_call_work']

export interface LiveAgentState {
  userId: string
  name: string | null
  email: string | null
  presence: string
  activeCalls: Array<{ callSessionId: string; status: string; direction: string; channel: string; secondsOnCall: number; agentType: string }>
  callsToday: number
  talkSecondsToday: number
}

/**
 * Live floor view: every agent with presence, their current calls and today's
 * totals. All values are database reads — nothing is held in process memory, so
 * the view is correct after a restart and across multiple app instances.
 */
export async function liveFloor(companyId: string, now: Date = new Date()): Promise<{
  agents: LiveAgentState[]
  queues: Array<{ id: string; name: string; waiting: number; longestWaitSeconds: number; availableAgents: number }>
  totals: { activeCalls: number; waitingCalls: number; agentsAvailable: number; agentsOnCall: number }
}> {
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)

  const [memberships, presences, activeCalls, todayCalls, queues] = await Promise.all([
    db.companyUser.findMany({ where: { companyId }, select: { userId: true } }),
    db.agentPresence.findMany({ where: { companyId } }),
    db.callSession.findMany({
      where: { companyId, status: { in: ACTIVE_STATES } },
      select: { id: true, status: true, direction: true, channel: true, agentType: true, assignedUserId: true, startedAt: true, answeredAt: true, createdAt: true },
    }),
    db.callSession.findMany({
      where: { companyId, createdAt: { gte: startOfDay }, assignedUserId: { not: null } },
      select: { assignedUserId: true, durationSeconds: true },
    }),
    db.callQueue.findMany({ where: { companyId }, include: { members: true }, orderBy: { priority: 'desc' } }),
  ])

  const userIds = memberships.map((m) => m.userId)
  const users = userIds.length > 0
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))
  const presenceByUser = new Map(presences.map((p) => [p.userId, p.status]))

  const callsByUser = new Map<string, typeof activeCalls>()
  for (const call of activeCalls) {
    if (!call.assignedUserId) continue
    const list = callsByUser.get(call.assignedUserId) ?? []
    list.push(call)
    callsByUser.set(call.assignedUserId, list)
  }

  const todayByUser = new Map<string, { count: number; seconds: number }>()
  for (const call of todayCalls) {
    if (!call.assignedUserId) continue
    const entry = todayByUser.get(call.assignedUserId) ?? { count: 0, seconds: 0 }
    entry.count++
    entry.seconds += call.durationSeconds
    todayByUser.set(call.assignedUserId, entry)
  }

  const agents: LiveAgentState[] = userIds.map((userId) => {
    const user = userById.get(userId)
    const todays = todayByUser.get(userId) ?? { count: 0, seconds: 0 }
    return {
      userId,
      name: user?.name ?? null,
      email: user?.email ?? null,
      presence: presenceByUser.get(userId) ?? 'offline',
      activeCalls: (callsByUser.get(userId) ?? []).map((call) => ({
        callSessionId: call.id,
        status: call.status,
        direction: call.direction,
        channel: call.channel,
        agentType: call.agentType,
        secondsOnCall: Math.max(0, Math.floor((now.getTime() - (call.answeredAt ?? call.startedAt ?? call.createdAt).getTime()) / 1000)),
      })),
      callsToday: todays.count,
      talkSecondsToday: todays.seconds,
    }
  })

  // Queue depth: waiting calls are those assigned to a queue member set and
  // still in `queued`/`ringing` (the queue id itself is not stored on the call,
  // so depth is computed from the queue's member availability + tenant waits).
  const waiting = activeCalls.filter((c) => c.status === 'queued' || c.status === 'ringing')
  const queueViews = queues.map((queue) => {
    const memberIds = new Set(queue.members.map((m) => m.userId))
    const availableAgents = [...memberIds].filter((id) => presenceByUser.get(id) === 'available').length
    const waitingForQueue = waiting.filter((c) => !c.assignedUserId || memberIds.has(c.assignedUserId))
    const longest = waitingForQueue.reduce((max, c) => {
      const seconds = Math.floor((now.getTime() - c.createdAt.getTime()) / 1000)
      return Math.max(max, seconds)
    }, 0)
    return { id: queue.id, name: queue.name, waiting: waitingForQueue.length, longestWaitSeconds: longest, availableAgents }
  })

  return {
    agents,
    queues: queueViews,
    totals: {
      activeCalls: activeCalls.length,
      waitingCalls: waiting.length,
      agentsAvailable: agents.filter((a) => a.presence === 'available').length,
      agentsOnCall: agents.filter((a) => a.activeCalls.length > 0).length,
    },
  }
}

export interface ReviewInput {
  companyId: string
  callSessionId: string
  reviewerUserId: string
  criteria: Partial<Record<ReviewCriterion, number>>
  notes?: string
  submit?: boolean
}

/**
 * Submit a human QA review. Criteria are 1–5; the overall score is the mean of
 * the criteria actually supplied (never a fabricated 0 for a skipped item).
 */
export async function submitReview(input: ReviewInput): Promise<{ id: string; score: number; status: string }> {
  const call = await db.callSession.findFirst({
    where: { id: input.callSessionId, companyId: input.companyId },
    select: { id: true },
  })
  if (!call) throw new Error(`call ${input.callSessionId} not found for this tenant`)

  const entries = Object.entries(input.criteria).filter(([criterion]) => (REVIEW_CRITERIA as readonly string[]).includes(criterion)) as Array<[ReviewCriterion, number]>
  if (entries.length === 0) throw new Error('at least one review criterion is required')
  for (const [criterion, value] of entries) {
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      throw new Error(`criterion "${criterion}" must be 1–5 (got ${value})`)
    }
  }
  const score = Math.round((entries.reduce((sum, [, value]) => sum + value, 0) / entries.length) * 100) / 100

  const review = await db.callReview.create({
    data: {
      companyId: input.companyId,
      callSessionId: input.callSessionId,
      reviewerUserId: input.reviewerUserId,
      score,
      criteria: JSON.stringify(Object.fromEntries(entries)),
      notes: input.notes ?? null,
      status: input.submit ? 'submitted' : 'draft',
      submittedAt: input.submit ? new Date() : null,
    },
    select: { id: true, status: true },
  })
  return { id: review.id, score, status: review.status }
}

/** QA summary for a period, from submitted reviews only. */
export async function qaSummary(companyId: string, options: { days?: number } = {}) {
  const since = new Date(Date.now() - (options.days ?? 30) * 24 * 60 * 60 * 1000)
  const reviews = await db.callReview.findMany({
    where: { companyId, createdAt: { gte: since }, status: 'submitted' },
    select: { score: true, criteria: true, createdAt: true, callSessionId: true, reviewerUserId: true },
    take: 5000,
  })
  const criterionTotals = new Map<string, { sum: number; count: number }>()
  for (const review of reviews) {
    let criteria: Record<string, number> = {}
    try {
      criteria = JSON.parse(review.criteria) as Record<string, number>
    } catch {
      criteria = {}
    }
    for (const [name, value] of Object.entries(criteria)) {
      if (!Number.isFinite(value)) continue
      const entry = criterionTotals.get(name) ?? { sum: 0, count: 0 }
      entry.sum += value
      entry.count++
      criterionTotals.set(name, entry)
    }
  }
  const scores = reviews.map((r) => r.score).filter((s): s is number => typeof s === 'number')
  return {
    reviewCount: reviews.length,
    averageScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
    byCriterion: [...criterionTotals.entries()].map(([name, v]) => ({
      criterion: name,
      average: Math.round((v.sum / v.count) * 100) / 100,
      samples: v.count,
    })),
    periodDays: options.days ?? 30,
  }
}

/**
 * Agent performance from real call data (no estimates):
 * calls handled, answered rate, talk time, avg handle time, transfers taken.
 */
export async function agentPerformance(companyId: string, options: { days?: number; userId?: string } = {}) {
  const since = new Date(Date.now() - (options.days ?? 30) * 24 * 60 * 60 * 1000)
  const calls = await db.callSession.findMany({
    where: {
      companyId,
      assignedUserId: options.userId ? options.userId : { not: null },
      createdAt: { gte: since },
      agentType: 'human',
    },
    select: { assignedUserId: true, status: true, durationSeconds: true, transferred: true, disposition: true },
    take: 20_000,
  })
  const byUser = new Map<string, { calls: number; answered: number; seconds: number; transfers: number }>()
  for (const call of calls) {
    if (!call.assignedUserId) continue
    const entry = byUser.get(call.assignedUserId) ?? { calls: 0, answered: 0, seconds: 0, transfers: 0 }
    entry.calls++
    if (call.status === 'completed') entry.answered++
    entry.seconds += call.durationSeconds
    if (call.transferred) entry.transfers++
    byUser.set(call.assignedUserId, entry)
  }
  const userIds = [...byUser.keys()]
  const users = userIds.length > 0
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  return [...byUser.entries()].map(([userId, stats]) => ({
    userId,
    name: nameById.get(userId) ?? null,
    callsHandled: stats.calls,
    answered: stats.answered,
    answerRate: stats.calls > 0 ? Math.round((stats.answered / stats.calls) * 1000) / 10 : null,
    talkMinutes: Math.round((stats.seconds / 60) * 10) / 10,
    averageHandleSeconds: stats.calls > 0 ? Math.round(stats.seconds / stats.calls) : 0,
    transfers: stats.transfers,
  })).sort((a, b) => b.callsHandled - a.callsHandled)
}
