/**
 * Inbound routing: IVR menus, business hours, holidays, ring strategies.
 *
 * Pure functions — no database access — so routing decisions are unit-testable
 * and deterministic. The call service applies the decisions with tenant checks.
 *
 * Bangladesh default: Asia/Dhaka timezone. All times are evaluated in the
 * number/tenant's configured timezone, never in the server's local time.
 */

export interface IvrMenuOption {
  digit: string
  label: string
  targetNodeId?: string
  /** queue | voice_agent | user | voicemail | hangup */
  action: string
  actionTargetId?: string
}

export interface IvrNode {
  id: string
  /** greeting | menu | route | voicemail | hangup */
  type: string
  prompt?: string
  options?: IvrMenuOption[]
  action?: string
  actionTargetId?: string
}

export interface IvrFlowGraph {
  nodes: IvrNode[]
  entryNodeId?: string
}

export interface RouteDecision {
  /** queue | voice_agent | user | voicemail | hangup | menu | invalid */
  action: string
  actionTargetId?: string
  nodeId?: string
  reason: string
}

/** Resolve the entry node of an IVR graph, or null when the graph is broken. */
export function ivrEntryNode(graph: IvrFlowGraph): IvrNode | null {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  if (nodes.length === 0) return null
  const entry = graph.entryNodeId ? nodes.find((n) => n.id === graph.entryNodeId) : undefined
  return entry ?? nodes.find((n) => n.type === 'menu' || n.type === 'greeting') ?? null
}

/**
 * Evaluate a DTMF digit against a menu node. Unknown digits fall back to a
 * repeat of the menu (action 'menu') so callers are never silently dropped.
 */
export function evaluateIvrDigit(node: IvrNode, digit: string): RouteDecision {
  if (node.type !== 'menu') {
    return applyNodeAction(node)
  }
  const options = Array.isArray(node.options) ? node.options : []
  const match = options.find((o) => o.digit.trim() === digit.trim())
  if (!match) {
    return {
      action: 'menu',
      nodeId: node.id,
      reason: `digit "${digit}" not offered — replaying menu`,
    }
  }
  return {
    action: match.action,
    actionTargetId: match.actionTargetId ?? match.targetNodeId,
    nodeId: node.id,
    reason: `digit ${digit} → ${match.label}`,
  }
}

/** Apply a non-menu node's configured action. */
export function applyNodeAction(node: IvrNode): RouteDecision {
  if (node.type === 'voicemail') return { action: 'voicemail', nodeId: node.id, reason: 'voicemail node' }
  if (node.type === 'hangup') return { action: 'hangup', nodeId: node.id, reason: 'hangup node' }
  if (node.action) {
    return { action: node.action, actionTargetId: node.actionTargetId, nodeId: node.id, reason: `node ${node.type}` }
  }
  return { action: 'invalid', nodeId: node.id, reason: `node ${node.id} has no action configured` }
}

// ---- Business hours ----

export interface WeeklyScheduleDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number
  open?: string // "09:00"
  close?: string // "18:00"
  closed?: boolean
}

export interface BusinessHourConfig {
  timezone: string
  weeklySchedule: WeeklyScheduleDay[]
  holidays: string[] // ISO dates "2026-12-16"
}

export const DEFAULT_BUSINESS_HOURS: BusinessHourConfig = {
  timezone: 'Asia/Dhaka',
  weeklySchedule: [
    { day: 0, closed: true },
    { day: 1, open: '09:00', close: '18:00' },
    { day: 2, open: '09:00', close: '18:00' },
    { day: 3, open: '09:00', close: '18:00' },
    { day: 4, open: '09:00', close: '18:00' },
    { day: 5, open: '09:00', close: '18:00' },
    { day: 6, closed: true },
  ],
  holidays: [],
}

export interface BusinessHoursStatus {
  open: boolean
  reason: string
  localDate: string
  localTime: string
  nextChange?: string
}

function zonedParts(date: Date, timezone: string): { dateStr: string; minutes: number; day: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    })
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`
    const hour = Number(parts.hour === '24' ? '00' : parts.hour)
    const minutes = hour * 60 + Number(parts.minute)
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const day = Math.max(0, weekdays.indexOf(parts.weekday ?? 'Sun'))
    return { dateStr, minutes, day }
  } catch {
    // Unknown timezone: fail OPEN is wrong for compliance — fail closed to
    // outside-hours so outbound campaigns never call when we cannot verify.
    return { dateStr: '', minutes: -1, day: -1 }
  }
}

function parseHm(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Decide whether `at` is inside business hours. Timezone resolution errors
 * result in open=false (fail closed) with an explicit reason.
 */
export function businessHoursStatus(
  config: BusinessHourConfig | null | undefined,
  at: Date = new Date(),
): BusinessHoursStatus {
  const tz = config?.timezone || DEFAULT_BUSINESS_HOURS.timezone
  const { dateStr, minutes, day } = zonedParts(at, tz)
  const localTime = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

  if (day < 0 || !dateStr) {
    return { open: false, reason: `cannot resolve timezone "${tz}" — failing closed`, localDate: '', localTime: '' }
  }
  if ((config?.holidays ?? []).includes(dateStr)) {
    return { open: false, reason: `holiday ${dateStr}`, localDate: dateStr, localTime }
  }
  const schedule = Array.isArray(config?.weeklySchedule) && config.weeklySchedule.length > 0
    ? config.weeklySchedule
    : DEFAULT_BUSINESS_HOURS.weeklySchedule
  const today = schedule.find((d) => d.day === day)
  if (!today || today.closed) {
    return { open: false, reason: 'closed day', localDate: dateStr, localTime }
  }
  const openMin = parseHm(today.open)
  const closeMin = parseHm(today.close)
  if (openMin === null || closeMin === null) {
    return { open: false, reason: 'schedule for today has no valid open/close time', localDate: dateStr, localTime }
  }
  const open = minutes >= openMin && minutes < closeMin
  return {
    open,
    reason: open ? 'within business hours' : minutes < openMin ? 'before opening' : 'after closing',
    localDate: dateStr,
    localTime,
  }
}

// ---- Ring strategies for queues ----

export interface QueueCandidate {
  userId: string
  priority: number
  status: string // AgentPresence.status
  lastServedAt?: Date | null
}

/** Order queue members for delivery; unavailable agents are filtered out. */
export function orderQueueCandidates(
  members: QueueCandidate[],
  strategy: string,
): QueueCandidate[] {
  const available = members.filter((m) => m.status === 'available')
  const sorted = [...available]
  switch (strategy) {
    case 'simultaneous':
      return sorted.sort((a, b) => b.priority - a.priority)
    case 'least_recent':
      return sorted.sort((a, b) => {
        const aT = a.lastServedAt?.getTime() ?? 0
        const bT = b.lastServedAt?.getTime() ?? 0
        return aT - bT || b.priority - a.priority
      })
    case 'round_robin':
    default:
      return sorted.sort((a, b) => b.priority - a.priority)
  }
}
