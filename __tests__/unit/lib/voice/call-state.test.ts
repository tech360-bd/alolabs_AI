import { describe, it, expect } from 'vitest'
import {
  CALL_STATES,
  InvalidCallTransitionError,
  computeDurationSeconds,
  dispositionForState,
  isActiveConversation,
  isTerminal,
  transition,
  type CallState,
} from '@/lib/voice/call-state'

describe('call state machine', () => {
  it('exposes the full documented state list', () => {
    expect(CALL_STATES).toEqual([
      'queued', 'ringing', 'in_progress', 'on_hold', 'transferring',
      'after_call_work', 'completed', 'no_answer', 'busy', 'voicemail',
      'failed', 'cancelled', 'abandoned',
    ])
  })

  it('walks the happy path: queued → ringing → in_progress → completed', () => {
    expect(transition('queued', 'ringing').ended).toBe(false)
    expect(transition('ringing', 'in_progress').ended).toBe(false)
    expect(transition('in_progress', 'completed').ended).toBe(true)
  })

  it('allows hold and transfer to resume to in_progress', () => {
    expect(transition('in_progress', 'on_hold').to).toBe('on_hold')
    expect(transition('on_hold', 'in_progress').to).toBe('in_progress')
    expect(transition('in_progress', 'transferring').to).toBe('transferring')
    expect(transition('transferring', 'in_progress').to).toBe('in_progress')
  })

  it('allows after_call_work wrap-up ending in completed', () => {
    expect(transition('in_progress', 'after_call_work')).toBeTruthy()
    const done = transition('after_call_work', 'completed')
    expect(done.ended).toBe(true)
  })

  it('rejects moving a terminal state anywhere', () => {
    const terminal: CallState[] = ['completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled', 'abandoned']
    for (const t of terminal) {
      expect(() => transition(t, 'in_progress')).toThrow(InvalidCallTransitionError)
    }
  })

  it('rejects impossible skips and regressions', () => {
    expect(() => transition('queued', 'after_call_work')).toThrow(InvalidCallTransitionError)
    expect(() => transition('completed', 'ringing')).toThrow(InvalidCallTransitionError)
    expect(() => transition('in_progress', 'queued')).toThrow(InvalidCallTransitionError)
    expect(() => transition('on_hold', 'ringing')).toThrow(InvalidCallTransitionError)
  })

  it('marks only answered states as active conversation', () => {
    expect(isActiveConversation('in_progress')).toBe(true)
    expect(isActiveConversation('on_hold')).toBe(true)
    expect(isActiveConversation('transferring')).toBe(true)
    expect(isActiveConversation('ringing')).toBe(false)
    expect(isActiveConversation('completed')).toBe(false)
  })

  it('computes duration from answered→ended and clamps negatives', () => {
    const answered = new Date('2026-01-01T10:00:00Z')
    const ended = new Date('2026-01-01T10:02:10Z')
    expect(computeDurationSeconds({ answeredAt: answered, endedAt: ended })).toBe(130)
    expect(computeDurationSeconds({ answeredAt: null, endedAt: ended })).toBe(0)
    const before = new Date('2026-01-01T09:00:00Z')
    expect(computeDurationSeconds({ answeredAt: answered, endedAt: before })).toBe(0)
  })

  it('maps terminal states to dispositions', () => {
    expect(dispositionForState('completed')).toBe('answered')
    expect(dispositionForState('no_answer')).toBe('no_answer')
    expect(dispositionForState('busy')).toBe('busy')
    expect(dispositionForState('abandoned')).toBe('abandoned')
    expect(dispositionForState('failed')).toBe('failed')
    expect(isTerminal('voicemail')).toBe(true)
  })
})
