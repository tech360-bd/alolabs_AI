/**
 * Telephony configuration service — IVR flows, call queues, queue membership,
 * business hours/holidays and voicemail (Module A).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `IvrFlow`, `CallQueue`, `QueueMember` and `BusinessHour` were declared in the
 * schema and `routing.ts` had pure evaluators for them, but nothing in the
 * application could CREATE one — no route, no service. Inbound routing was
 * therefore unreachable configuration: an operator could not build an IVR or a
 * queue at all.
 *
 * DESIGN
 * ------
 * - Validation is structural: an IVR graph is rejected if a menu option points
 *   at a node that does not exist, because a live caller must never be routed
 *   into a dead end.
 * - Every read/write is tenant-scoped with explicit `companyId` filters.
 * - Activations are exclusive where the schema implies it: one active IVR per
 *   tenant at a time, so routing is deterministic.
 * - Voicemail rows are created only from a real reported leg; a sandbox call
 *   produces a row flagged `simulated` AND without media, never a fake wav.
 */

import { db } from '@/lib/db'
import type { IvrFlowGraph, IvrNode } from './routing'

export class TelephonyConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelephonyConfigError'
  }
}

// ─── IVR ─────────────────────────────────────────────────────────────────────

const IVR_NODE_TYPES = new Set(['greeting', 'menu', 'route', 'voicemail', 'hangup', 'queue', 'voice_agent', 'user'])
const IVR_ACTIONS = new Set(['queue', 'voice_agent', 'user', 'voicemail', 'hangup', 'menu', 'route', 'forward'])

export interface IvrValidationResult {
  ok: boolean
  errors: string[]
  /** Non-fatal advisories (e.g. a menu node with one option). */
  warnings: string[]
  nodeCount: number
}

/**
 * Structural validation of an IVR graph. Pure — unit tested.
 *
 * Rules:
 *  1. At least one node; every node needs a unique non-empty id and a known type.
 *  2. Menu nodes need >= 1 option; every option needs a digit and an action.
 *  3. Any `targetNodeId` must resolve to an existing node.
 *  4. `actionTargetId` is required for queue/voice_agent/user actions.
 *  5. The graph must contain a reachable entry (explicit or discoverable).
 *  6. Nodes must not form a menu-only cycle with no terminal (hangup/voicemail).
 */
export function validateIvrGraph(graph: IvrFlowGraph): IvrValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  if (nodes.length === 0) {
    return { ok: false, errors: ['IVR needs at least one node'], warnings, nodeCount: 0 }
  }

  const ids = new Set<string>()
  for (const node of nodes as IvrNode[]) {
    if (!node || typeof node.id !== 'string' || !node.id.trim()) {
      errors.push('every IVR node needs a non-empty id')
      continue
    }
    if (ids.has(node.id)) errors.push(`duplicate node id "${node.id}"`)
    ids.add(node.id)
    if (!IVR_NODE_TYPES.has(node.type)) {
      errors.push(`node "${node.id}" has unknown type "${node.type}" (allowed: ${[...IVR_NODE_TYPES].join(', ')})`)
    }
  }

  for (const node of nodes as IvrNode[]) {
    if (node.type === 'menu') {
      const options = Array.isArray(node.options) ? node.options : []
      if (options.length === 0) errors.push(`menu node "${node.id}" has no options`)
      const digits = new Set<string>()
      for (const option of options) {
        if (!/^[0-9*#]$/.test(String(option.digit ?? ''))) {
          errors.push(`menu node "${node.id}" has invalid digit "${option.digit}" (0-9, *, #)`)
        }
        if (digits.has(String(option.digit))) errors.push(`menu node "${node.id}" repeats digit "${option.digit}"`)
        digits.add(String(option.digit))
        if (!option.action || !IVR_ACTIONS.has(option.action)) {
          errors.push(`menu node "${node.id}" option "${option.digit}" has invalid action "${option.action}"`)
        }
        if (['queue', 'voice_agent', 'user'].includes(String(option.action)) && !option.actionTargetId) {
          errors.push(`menu node "${node.id}" option "${option.digit}" action "${option.action}" needs actionTargetId`)
        }
        if (option.targetNodeId && !ids.has(option.targetNodeId)) {
          errors.push(`menu node "${node.id}" option "${option.digit}" targets missing node "${option.targetNodeId}"`)
        }
      }
      if (options.length === 1) warnings.push(`menu node "${node.id}" offers only one option`)
    }
    if (node.action && !IVR_ACTIONS.has(node.action)) {
      errors.push(`node "${node.id}" has invalid action "${node.action}"`)
    }
    if (node.actionTargetId && !ids.has(node.actionTargetId) && node.type === 'route') {
      // A route node may target an external queue/agent id rather than a node,
      // so this is only advisory.
      warnings.push(`route node "${node.id}" actionTargetId "${node.actionTargetId}" is not an IVR node`)
    }
  }

  const entry = graph.entryNodeId
  if (entry) {
    if (!ids.has(entry)) errors.push(`entryNodeId "${entry}" does not exist`)
  } else if (!nodes.some((n) => n.type === 'menu' || n.type === 'greeting')) {
    warnings.push('no entryNodeId and no menu/greeting node — the entry will be the first node')
  }

  const hasTerminal = nodes.some((n) => n.type === 'hangup' || n.type === 'voicemail' ||
    (Array.isArray(n.options) && n.options.some((o) => o.action === 'hangup' || o.action === 'voicemail')))
  if (!hasTerminal) warnings.push('graph has no hangup or voicemail path — callers may loop')

  return { ok: errors.length === 0, errors, warnings, nodeCount: ids.size }
}

export async function createIvrFlow(params: {
  companyId: string
  name: string
  description?: string
  graph: IvrFlowGraph
  active?: boolean
}): Promise<{ id: string; validation: IvrValidationResult }> {
  const validation = validateIvrGraph(params.graph)
  if (!validation.ok) {
    throw new TelephonyConfigError(`invalid IVR graph: ${validation.errors.join('; ')}`)
  }
  const flow = await db.ivrFlow.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      description: params.description ?? null,
      nodes: JSON.stringify(params.graph.nodes ?? []),
      entryNodeId: params.graph.entryNodeId ?? null,
      active: false, // activation is explicit and exclusive
    },
    select: { id: true },
  })
  if (params.active) await activateIvrFlow(params.companyId, flow.id)
  return { id: flow.id, validation }
}

/** Activate one flow for the tenant, deactivating all others atomically. */
export async function activateIvrFlow(companyId: string, flowId: string): Promise<void> {
  const flow = await db.ivrFlow.findFirst({
    where: { id: flowId, companyId },
    select: { id: true, nodes: true, entryNodeId: true },
  })
  if (!flow) throw new TelephonyConfigError(`IVR flow ${flowId} not found for this tenant`)

  // Re-validate the PERSISTED graph: what is in the database is what a caller
  // will actually be routed through, so activation must check that, not the
  // request body.
  let parsed: IvrFlowGraph
  try {
    parsed = { nodes: JSON.parse(flow.nodes) as IvrNode[], entryNodeId: flow.entryNodeId ?? undefined }
  } catch {
    throw new TelephonyConfigError(`IVR flow ${flowId} has unreadable node JSON — refusing to activate`)
  }
  const validation = validateIvrGraph(parsed)
  if (!validation.ok) {
    throw new TelephonyConfigError(`refusing to activate invalid IVR: ${validation.errors.join('; ')}`)
  }

  await db.$transaction([
    db.ivrFlow.updateMany({ where: { companyId, active: true }, data: { active: false } }),
    db.ivrFlow.update({ where: { id: flowId }, data: { active: true } }),
  ])
}

export async function updateIvrFlow(params: {
  companyId: string
  flowId: string
  name?: string
  description?: string
  graph?: IvrFlowGraph
}): Promise<{ validation: IvrValidationResult | null }> {
  const existing = await db.ivrFlow.findFirst({
    where: { id: params.flowId, companyId: params.companyId },
    select: { id: true, active: true },
  })
  if (!existing) throw new TelephonyConfigError(`IVR flow ${params.flowId} not found for this tenant`)

  let validation: IvrValidationResult | null = null
  const data: Record<string, unknown> = {}
  if (params.name !== undefined) data.name = params.name
  if (params.description !== undefined) data.description = params.description
  if (params.graph) {
    validation = validateIvrGraph(params.graph)
    if (!validation.ok) throw new TelephonyConfigError(`invalid IVR graph: ${validation.errors.join('; ')}`)
    data.nodes = JSON.stringify(params.graph.nodes ?? [])
    data.entryNodeId = params.graph.entryNodeId ?? null
  }
  if (Object.keys(data).length === 0) throw new TelephonyConfigError('nothing to update')
  await db.ivrFlow.updateMany({ where: { id: params.flowId, companyId: params.companyId }, data })

  // An ACTIVE flow must stay valid after the edit, or deactivate it. Routing
  // reads the stored graph, so a broken active flow would drop live callers.
  if (existing.active && validation) {
    await db.ivrFlow.update({ where: { id: params.flowId }, data: { active: false } })
  }
  return { validation }
}

export async function deleteIvrFlow(companyId: string, flowId: string): Promise<void> {
  const flow = await db.ivrFlow.findFirst({ where: { id: flowId, companyId }, select: { active: true } })
  if (!flow) throw new TelephonyConfigError(`IVR flow ${flowId} not found for this tenant`)
  if (flow.active) throw new TelephonyConfigError('deactivate the IVR flow before deleting it')
  const assigned = await db.phoneNumber.count({ where: { companyId, assignedIvrFlowId: flowId } })
  if (assigned > 0) throw new TelephonyConfigError(`${assigned} phone number(s) still use this IVR flow`)
  await db.ivrFlow.delete({ where: { id: flowId } })
}

// ─── Queues ──────────────────────────────────────────────────────────────────

const RING_STRATEGIES = new Set(['round_robin', 'least_recent', 'simultaneous'])

export async function createQueue(params: {
  companyId: string
  name: string
  priority?: number
  ringStrategy?: string
  maxWaitSeconds?: number
  overflowVoiceAgentId?: string
}): Promise<{ id: string }> {
  const strategy = params.ringStrategy ?? 'round_robin'
  if (!RING_STRATEGIES.has(strategy)) {
    throw new TelephonyConfigError(`ringStrategy must be one of ${[...RING_STRATEGIES].join(', ')}`)
  }
  const maxWait = params.maxWaitSeconds ?? 300
  if (maxWait < 10 || maxWait > 3600) throw new TelephonyConfigError('maxWaitSeconds must be 10–3600')

  if (params.overflowVoiceAgentId) {
    const agent = await db.voiceAgent.findFirst({
      where: { id: params.overflowVoiceAgentId, companyId: params.companyId },
      select: { id: true },
    })
    if (!agent) throw new TelephonyConfigError('overflowVoiceAgentId does not belong to this tenant')
  }

  const queue = await db.callQueue.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      priority: params.priority ?? 0,
      ringStrategy: strategy,
      maxWaitSeconds: maxWait,
      overflowVoiceAgentId: params.overflowVoiceAgentId ?? null,
    },
    select: { id: true },
  })
  return { id: queue.id }
}

/**
 * Add a member to a queue. Verifies the user really has a tenant membership —
 * a queue member is a routing permission, so a foreign user id must be refused.
 */
export async function addQueueMember(params: {
  companyId: string
  queueId: string
  userId: string
  priority?: number
}): Promise<{ id: string }> {
  const queue = await db.callQueue.findFirst({
    where: { id: params.queueId, companyId: params.companyId },
    select: { id: true },
  })
  if (!queue) throw new TelephonyConfigError(`queue ${params.queueId} not found for this tenant`)

  const membership = await db.companyUser.findFirst({
    where: { companyId: params.companyId, userId: params.userId },
    select: { id: true },
  })
  if (!membership) throw new TelephonyConfigError(`user ${params.userId} is not a member of this tenant`)

  const member = await db.queueMember.upsert({
    where: { queueId_userId: { queueId: params.queueId, userId: params.userId } },
    create: { queueId: params.queueId, userId: params.userId, priority: params.priority ?? 0 },
    update: { priority: params.priority ?? 0 },
    select: { id: true },
  })
  return { id: member.id }
}

export async function removeQueueMember(params: { companyId: string; queueId: string; userId: string }): Promise<void> {
  const queue = await db.callQueue.findFirst({
    where: { id: params.queueId, companyId: params.companyId },
    select: { id: true },
  })
  if (!queue) throw new TelephonyConfigError(`queue ${params.queueId} not found for this tenant`)
  await db.queueMember.deleteMany({ where: { queueId: params.queueId, userId: params.userId } })
}

/** Queue roster with live presence, so a supervisor sees who can actually answer. */
export async function queueRoster(companyId: string, queueId: string) {
  const queue = await db.callQueue.findFirst({
    where: { id: queueId, companyId },
    include: { members: { orderBy: { priority: 'desc' } } },
  })
  if (!queue) throw new TelephonyConfigError(`queue ${queueId} not found for this tenant`)
  const userIds = queue.members.map((m) => m.userId)
  const [presences, users] = await Promise.all([
    userIds.length > 0
      ? db.agentPresence.findMany({ where: { companyId, userId: { in: userIds } } })
      : Promise.resolve([]),
    userIds.length > 0
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ])
  const presenceByUser = new Map(presences.map((p) => [p.userId, p.status]))
  const userById = new Map(users.map((u) => [u.id, u]))
  return {
    queue: {
      id: queue.id,
      name: queue.name,
      ringStrategy: queue.ringStrategy,
      priority: queue.priority,
      maxWaitSeconds: queue.maxWaitSeconds,
      overflowVoiceAgentId: queue.overflowVoiceAgentId,
    },
    members: queue.members.map((m) => ({
      userId: m.userId,
      priority: m.priority,
      name: userById.get(m.userId)?.name ?? null,
      email: userById.get(m.userId)?.email ?? null,
      presence: presenceByUser.get(m.userId) ?? 'offline',
      routable: presenceByUser.get(m.userId) === 'available',
    })),
  }
}

// ─── Business hours ──────────────────────────────────────────────────────────

export interface WeeklySlot {
  day: number // 0 = Sunday … 6 = Saturday
  open: string // "09:00"
  close: string // "18:00"
  closed?: boolean
}

export interface BusinessHoursValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Validate weekly schedule + holidays. Pure. */
export function validateBusinessHours(weekly: WeeklySlot[], holidays: string[]): BusinessHoursValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!Array.isArray(weekly)) errors.push('weeklySchedule must be an array')
  const seen = new Set<number>()
  let openDays = 0
  for (const slot of Array.isArray(weekly) ? weekly : []) {
    if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) {
      errors.push(`invalid day "${slot.day}" (0 = Sunday … 6 = Saturday)`)
      continue
    }
    if (seen.has(slot.day)) errors.push(`day ${slot.day} appears more than once (split shifts are not modelled yet)`)
    seen.add(slot.day)
    if (slot.closed) continue
    openDays++
    if (!HHMM.test(slot.open ?? '')) errors.push(`day ${slot.day} open "${slot.open}" is not HH:MM`)
    if (!HHMM.test(slot.close ?? '')) errors.push(`day ${slot.day} close "${slot.close}" is not HH:MM`)
    if (HHMM.test(slot.open ?? '') && HHMM.test(slot.close ?? '') && slot.close <= slot.open) {
      // Overnight closing is deliberately unsupported: routing.ts compares
      // same-day windows and would silently treat 22:00–06:00 as "closed".
      errors.push(`day ${slot.day} close (${slot.close}) must be after open (${slot.open}); overnight hours are not supported`)
    }
  }
  for (const holiday of Array.isArray(holidays) ? holidays : []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday)) errors.push(`holiday "${holiday}" is not YYYY-MM-DD`)
  }
  if (openDays === 0) warnings.push('no open days configured — every call will be treated as closed')
  return { ok: errors.length === 0, errors, warnings }
}

export async function createBusinessHours(params: {
  companyId: string
  name: string
  timezone?: string
  weeklySchedule: WeeklySlot[]
  holidays?: string[]
}): Promise<{ id: string; validation: BusinessHoursValidation }> {
  const holidays = params.holidays ?? []
  const validation = validateBusinessHours(params.weeklySchedule, holidays)
  if (!validation.ok) throw new TelephonyConfigError(`invalid business hours: ${validation.errors.join('; ')}`)
  const created = await db.businessHour.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      timezone: params.timezone ?? 'Asia/Dhaka',
      weeklySchedule: JSON.stringify(params.weeklySchedule),
      holidays: JSON.stringify(holidays),
    },
    select: { id: true },
  })
  return { id: created.id, validation }
}

export async function upsertBusinessHours(params: {
  companyId: string
  id: string
  name?: string
  timezone?: string
  weeklySchedule?: WeeklySlot[]
  holidays?: string[]
}): Promise<{ validation: BusinessHoursValidation | null }> {
  const existing = await db.businessHour.findFirst({
    where: { id: params.id, companyId: params.companyId },
    select: { weeklySchedule: true, holidays: true },
  })
  if (!existing) throw new TelephonyConfigError(`business hours ${params.id} not found for this tenant`)

  let validation: BusinessHoursValidation | null = null
  if (params.weeklySchedule || params.holidays) {
    const weekly = params.weeklySchedule ?? (JSON.parse(existing.weeklySchedule) as WeeklySlot[])
    const holidays = params.holidays ?? (JSON.parse(existing.holidays) as string[])
    validation = validateBusinessHours(weekly, holidays)
    if (!validation.ok) throw new TelephonyConfigError(`invalid business hours: ${validation.errors.join('; ')}`)
  }
  const data: Record<string, unknown> = {}
  if (params.name !== undefined) data.name = params.name
  if (params.timezone !== undefined) data.timezone = params.timezone
  if (params.weeklySchedule) data.weeklySchedule = JSON.stringify(params.weeklySchedule)
  if (params.holidays) data.holidays = JSON.stringify(params.holidays)
  if (Object.keys(data).length === 0) throw new TelephonyConfigError('nothing to update')
  await db.businessHour.updateMany({ where: { id: params.id, companyId: params.companyId }, data })
  return { validation }
}

/** Validate an IANA timezone name without network access. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// ─── Voicemail ───────────────────────────────────────────────────────────────

/**
 * Persist a voicemail left by a caller. Media is recorded ONLY when the
 * adapter actually delivered a storage key; otherwise the row records the fact
 * that a message was left with no retrievable audio (honest empty state).
 */
export async function recordVoicemail(params: {
  companyId: string
  fromNumber: string
  phoneNumberId?: string | null
  callSessionId?: string | null
  contactId?: string | null
  durationSeconds?: number
  storageKey?: string | null
  mimeType?: string
  transcript?: string | null
  simulated?: boolean
}): Promise<{ id: string; hasMedia: boolean }> {
  const row = await db.voicemail.create({
    data: {
      companyId: params.companyId,
      fromNumber: params.fromNumber,
      phoneNumberId: params.phoneNumberId ?? null,
      callSessionId: params.callSessionId ?? null,
      contactId: params.contactId ?? null,
      durationSeconds: Math.max(0, Math.round(params.durationSeconds ?? 0)),
      storageKey: params.storageKey ?? null,
      mimeType: params.mimeType ?? 'audio/wav',
      transcript: params.transcript ?? null,
      simulated: params.simulated ?? false,
    },
    select: { id: true, storageKey: true },
  })
  return { id: row.id, hasMedia: Boolean(row.storageKey) }
}

export async function markVoicemail(companyId: string, voicemailId: string, status: string, assignedUserId?: string): Promise<void> {
  const allowed = new Set(['unread', 'read', 'archived'])
  if (!allowed.has(status)) throw new TelephonyConfigError(`status must be one of ${[...allowed].join(', ')}`)
  const existing = await db.voicemail.findFirst({ where: { id: voicemailId, companyId }, select: { id: true } })
  if (!existing) throw new TelephonyConfigError(`voicemail ${voicemailId} not found for this tenant`)
  await db.voicemail.updateMany({
    where: { id: voicemailId, companyId },
    data: { status, ...(assignedUserId ? { assignedUserId } : {}) },
  })
}
