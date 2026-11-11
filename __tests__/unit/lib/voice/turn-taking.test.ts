import { describe, it, expect } from 'vitest'
import {
  classifyBargeIn,
  evaluateSilence,
  silenceNudgeReply,
  silenceEndReply,
  TurnTakingTracker,
} from '@/lib/voice/turn-taking'

describe('classifyBargeIn', () => {
  it('recognizes a real interruption', () => {
    const d = classifyBargeIn({ customerSpokeDuringAgentSpeech: true, customerSpeechDurationMs: 800 })
    expect(d.bargedIn).toBe(true)
  })

  it('ignores speech that started after the agent finished (normal turn)', () => {
    const d = classifyBargeIn({ customerSpokeDuringAgentSpeech: false })
    expect(d.bargedIn).toBe(false)
  })

  it('filters noise shorter than the minimum speech duration', () => {
    const d = classifyBargeIn({ customerSpokeDuringAgentSpeech: true, customerSpeechDurationMs: 100, minSpeechDurationMs: 250 })
    expect(d.bargedIn).toBe(false)
    expect(d.reason).toContain('too short')
  })

  it('accepts unknown duration (transport could not measure)', () => {
    const d = classifyBargeIn({ customerSpokeDuringAgentSpeech: true, customerSpeechDurationMs: null })
    expect(d.bargedIn).toBe(true)
  })
})

describe('evaluateSilence', () => {
  it('continues while inside the silence window', () => {
    expect(evaluateSilence({ silenceMs: 5_000, maxSilenceMs: 20_000, nudgesSoFar: 0 }).action).toBe('continue')
  })

  it('nudges first (up to maxNudges), then ends the call', () => {
    expect(evaluateSilence({ silenceMs: 25_000, maxSilenceMs: 20_000, nudgesSoFar: 0 }).action).toBe('nudge')
    expect(evaluateSilence({ silenceMs: 25_000, maxSilenceMs: 20_000, nudgesSoFar: 1 }).action).toBe('nudge')
    const end = evaluateSilence({ silenceMs: 25_000, maxSilenceMs: 20_000, nudgesSoFar: 2 })
    expect(end.action).toBe('end_call')
  })

  it('respects a custom maxNudges', () => {
    expect(evaluateSilence({ silenceMs: 25_000, maxSilenceMs: 20_000, nudgesSoFar: 1, maxNudges: 1 }).action).toBe('end_call')
  })
})

describe('language lines', () => {
  it('nudge/goodbye lines exist in Bangla and English', () => {
    expect(silenceNudgeReply('bn-BD')).toMatch(/আছেন/)
    expect(silenceNudgeReply('en-US')).toMatch(/still there/i)
    expect(silenceEndReply('bn-BD')).toMatch(/কলটি শেষ/)
    expect(silenceEndReply('en-US')).toMatch(/end the call/i)
  })
})

describe('TurnTakingTracker', () => {
  it('counts barge-ins only for real interruptions', () => {
    const t = new TurnTakingTracker()
    t.recordAgentReply(1_000)
    expect(t.recordCustomerTurn(1_500, { customerSpokeDuringAgentSpeech: true, customerSpeechDurationMs: 900 }).bargedIn).toBe(true)
    expect(t.recordCustomerTurn(2_000, { customerSpokeDuringAgentSpeech: true, customerSpeechDurationMs: 50 }).bargedIn).toBe(false)
    expect(t.bargeInCount).toBe(1)
  })

  it('does not count a barge-in when customer speech precedes the agent reply', () => {
    const t = new TurnTakingTracker()
    t.recordCustomerTurn(100, { customerSpokeDuringAgentSpeech: true, customerSpeechDurationMs: 900 })
    expect(t.bargeInCount).toBe(0)
  })

  it('measures silence since the last agent reply and tracks nudges', () => {
    const t = new TurnTakingTracker()
    expect(t.silenceSinceLastReply(10_000)).toBe(0)
    t.recordAgentReply(5_000)
    expect(t.silenceSinceLastReply(15_000)).toBe(10_000)
    t.recordNudge(15_500)
    expect(t.nudgeCount).toBe(1)
  })
})
