/**
 * Telephony configuration validation: IVR graphs, business hours, timezones.
 * These validators are the gate between an operator's YAML-ish idea of routing
 * and a live caller being dropped into a dead end.
 */
import { describe, expect, it } from 'vitest'
import { validateIvrGraph, validateBusinessHours, isValidTimezone } from '@/lib/voice/telephony-config'
import type { IvrFlowGraph } from '@/lib/voice/routing'

const goodGraph: IvrFlowGraph = {
  entryNodeId: 'greet',
  nodes: [
    { id: 'greet', type: 'greeting', prompt: 'স্বাগতম' },
    {
      id: 'main', type: 'menu', prompt: 'বাংলায় ১ চাপুন',
      options: [
        { digit: '1', label: 'Bengali', action: 'queue', actionTargetId: 'queue-1' },
        { digit: '2', label: 'English', action: 'voice_agent', actionTargetId: 'agent-1' },
        { digit: '0', label: 'Operator', action: 'voicemail' },
      ],
    },
    { id: 'bye', type: 'hangup' },
  ],
}

describe('validateIvrGraph', () => {
  it('accepts a well-formed graph', () => {
    const result = validateIvrGraph(goodGraph)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.nodeCount).toBe(3)
  })

  it('rejects an empty graph', () => {
    const result = validateIvrGraph({ nodes: [] })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('at least one node')
  })

  it('rejects a menu pointing at a missing node', () => {
    const result = validateIvrGraph({
      nodes: [{
        id: 'menu', type: 'menu',
        options: [{ digit: '1', label: 'gone', action: 'menu', targetNodeId: 'missing' }],
      }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('missing'))).toBe(true)
  })

  it('rejects duplicate digits on one menu', () => {
    const result = validateIvrGraph({
      nodes: [{
        id: 'menu', type: 'menu',
        options: [
          { digit: '1', label: 'a', action: 'hangup' },
          { digit: '1', label: 'b', action: 'hangup' },
        ],
      }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('repeats digit'))).toBe(true)
  })

  it('requires a target for queue/agent/user actions', () => {
    const result = validateIvrGraph({
      nodes: [{ id: 'm', type: 'menu', options: [{ digit: '1', label: 'Sales', action: 'queue' }] }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('actionTargetId'))).toBe(true)
  })

  it('rejects unknown node types and unknown actions', () => {
    const result = validateIvrGraph({
      nodes: [
        { id: 'x', type: 'teleport' },
        { id: 'y', type: 'route', action: 'summon' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown type'))).toBe(true)
    expect(result.errors.some((e) => e.includes('invalid action'))).toBe(true)
  })

  it('warns when there is no hangup/voicemail terminal', () => {
    const result = validateIvrGraph({
      nodes: [{ id: 'm', type: 'menu', options: [{ digit: '1', label: 'again', action: 'menu', targetNodeId: 'm' }] }],
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.includes('no hangup'))).toBe(true)
  })

  it('rejects an entryNodeId that does not exist', () => {
    const result = validateIvrGraph({ entryNodeId: 'nope', nodes: [{ id: 'a', type: 'greeting' }] })
    expect(result.ok).toBe(false)
  })
})

const weekdays = [1, 2, 3, 4, 5].map((day) => ({ day, open: '09:00', close: '18:00' }))

describe('validateBusinessHours', () => {
  it('accepts a normal schedule', () => {
    const result = validateBusinessHours(weekdays, ['2026-12-16'])
    expect(result.ok).toBe(true)
  })

  it('rejects close before open (overnight is not supported)', () => {
    const result = validateBusinessHours([{ day: 1, open: '22:00', close: '06:00' }], [])
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('overnight'))).toBe(true)
  })

  it('rejects malformed times, duplicate days and bad holidays', () => {
    const result = validateBusinessHours(
      [
        { day: 1, open: '9:00', close: '18:00' },
        { day: 1, open: '09:00', close: '17:00' },
        { day: 9, open: '09:00', close: '17:00' },
      ],
      ['16-Dec-2026'],
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('HH:MM'))).toBe(true)
    expect(result.errors.some((e) => e.includes('more than once'))).toBe(true)
    expect(result.errors.some((e) => e.includes('invalid day'))).toBe(true)
    expect(result.errors.some((e) => e.includes('YYYY-MM-DD'))).toBe(true)
  })

  it('warns when every day is closed', () => {
    const result = validateBusinessHours([{ day: 1, open: '09:00', close: '18:00', closed: true }], [])
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.includes('no open days'))).toBe(true)
  })

  it('validates IANA timezones without network access', () => {
    expect(isValidTimezone('Asia/Dhaka')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
  })
})
