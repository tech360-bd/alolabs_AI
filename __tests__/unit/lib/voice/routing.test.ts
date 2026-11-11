import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUSINESS_HOURS,
  applyNodeAction,
  businessHoursStatus,
  evaluateIvrDigit,
  ivrEntryNode,
  orderQueueCandidates,
  type IvrFlowGraph,
} from '@/lib/voice/routing'

const menuGraph: IvrFlowGraph = {
  entryNodeId: 'menu-1',
  nodes: [
    {
      id: 'menu-1',
      type: 'menu',
      prompt: 'Press 1 for sales, 2 for support',
      options: [
        { digit: '1', label: 'Sales', action: 'queue', actionTargetId: 'q-sales' },
        { digit: '2', label: 'Support', action: 'voice_agent', actionTargetId: 'va-1' },
        { digit: '9', label: 'Repeat', action: 'menu' },
      ],
    },
  ],
}

describe('ivr routing', () => {
  it('resolves the entry node', () => {
    expect(ivrEntryNode(menuGraph)?.id).toBe('menu-1')
    expect(ivrEntryNode({ nodes: [] })).toBeNull()
  })

  it('routes digits to configured actions', () => {
    const node = ivrEntryNode(menuGraph)!
    expect(evaluateIvrDigit(node, '1')).toMatchObject({ action: 'queue', actionTargetId: 'q-sales' })
    expect(evaluateIvrDigit(node, '2')).toMatchObject({ action: 'voice_agent', actionTargetId: 'va-1' })
  })

  it('replays the menu on unknown digits instead of dropping the caller', () => {
    const node = ivrEntryNode(menuGraph)!
    const decision = evaluateIvrDigit(node, '7')
    expect(decision.action).toBe('menu')
    expect(decision.reason).toContain('not offered')
  })

  it('flags nodes without any action as invalid — never silently hangs up', () => {
    const decision = applyNodeAction({ id: 'n1', type: 'route' })
    expect(decision.action).toBe('invalid')
  })

  it('handles voicemail and hangup nodes', () => {
    expect(applyNodeAction({ id: 'v', type: 'voicemail' }).action).toBe('voicemail')
    expect(applyNodeAction({ id: 'h', type: 'hangup' }).action).toBe('hangup')
  })
})

describe('business hours (Asia/Dhaka default)', () => {
  // 2026-01-05 is a Monday. 03:00 UTC == 09:00 Dhaka (UTC+6).
  const at = (iso: string) => new Date(iso)

  it('is open during 09:00–18:00 local time', () => {
    const status = businessHoursStatus(DEFAULT_BUSINESS_HOURS, at('2026-01-05T03:00:00Z'))
    expect(status.open).toBe(true)
    expect(status.localDate).toBe('2026-01-05')
    expect(status.localTime).toBe('09:00')
  })

  it('is closed before opening and after closing', () => {
    expect(businessHoursStatus(DEFAULT_BUSINESS_HOURS, at('2026-01-05T02:59:00Z')).open).toBe(false)
    expect(businessHoursStatus(DEFAULT_BUSINESS_HOURS, at('2026-01-05T12:01:00Z')).open).toBe(false) // 18:01 Dhaka
  })

  it('is closed on the configured closed days (Sunday)', () => {
    expect(businessHoursStatus(DEFAULT_BUSINESS_HOURS, at('2026-01-04T06:00:00Z')).open).toBe(false)
  })

  it('respects holidays', () => {
    const cfg = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-01-05'] }
    const status = businessHoursStatus(cfg, at('2026-01-05T03:00:00Z'))
    expect(status.open).toBe(false)
    expect(status.reason).toContain('holiday')
  })

  it('FAILS CLOSED when the timezone is unknown', () => {
    const cfg = { ...DEFAULT_BUSINESS_HOURS, timezone: 'Mars/Olympus' }
    const status = businessHoursStatus(cfg, at('2026-01-05T03:00:00Z'))
    expect(status.open).toBe(false)
    expect(status.reason).toContain('failing closed')
  })
})

describe('queue ordering', () => {
  const members = [
    { userId: 'a', priority: 1, status: 'available', lastServedAt: new Date('2026-01-01T00:00:00Z') },
    { userId: 'b', priority: 5, status: 'available', lastServedAt: new Date('2026-01-02T00:00:00Z') },
    { userId: 'c', priority: 9, status: 'busy' },
    { userId: 'd', priority: 3, status: 'available', lastServedAt: new Date('2025-12-01T00:00:00Z') },
  ]

  it('filters out unavailable agents first', () => {
    const ordered = orderQueueCandidates(members, 'round_robin')
    expect(ordered.map((m) => m.userId)).not.toContain('c')
  })

  it('orders by priority for round_robin', () => {
    expect(orderQueueCandidates(members, 'round_robin').map((m) => m.userId)).toEqual(['b', 'd', 'a'])
  })

  it('orders least-recently-served first for least_recent', () => {
    expect(orderQueueCandidates(members, 'least_recent').map((m) => m.userId)).toEqual(['d', 'a', 'b'])
  })
})
