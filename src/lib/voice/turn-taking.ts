/**
 * Turn-taking, barge-in and silence handling — the server-side half of the
 * natural-conversation requirements (master prompt §07 "handle customer
 * interruptions", §09 "natural turn-taking / barge-in / silence detection").
 *
 * This module is deliberately AUDIO-PLANE AGNOSTIC: it consumes already-timed
 * facts from whichever transport observed them (SIP webhook, WebRTC client,
 * sandbox driver) and produces deterministic decisions that the conversation
 * service executes and audits. Real-time media behavior (echo-cancelled
 * barge-in detection on RTP) lives in the media server per
 * docs/TELEPHONY_ARCHITECTURE.md — this layer owns the CONVERSATION policy.
 *
 * All decision functions are pure and unit-testable.
 */

// ---- Barge-in ----

export interface BargeInFacts {
  /** True when customer speech began while the agent's TTS was still playing. */
  customerSpokeDuringAgentSpeech: boolean
  /** Minimum speech duration (ms) before an interruption counts as barge-in — filters coughs/noise. */
  customerSpeechDurationMs?: number | null
  minSpeechDurationMs?: number
}

export interface BargeInDecision {
  bargedIn: boolean
  reason: string
}

/** Decide whether an interruption is a real barge-in (not background noise). */
export function classifyBargeIn(facts: BargeInFacts): BargeInDecision {
  if (!facts.customerSpokeDuringAgentSpeech) {
    return { bargedIn: false, reason: 'customer spoke after agent finished (normal turn)' }
  }
  const min = facts.minSpeechDurationMs ?? 250
  const duration = facts.customerSpeechDurationMs
  if (typeof duration === 'number' && duration < min) {
    return { bargedIn: false, reason: `speech too short to be an interruption (${duration}ms < ${min}ms)` }
  }
  return { bargedIn: true, reason: 'customer interrupted while the agent was speaking' }
}

// ---- Silence / dead-air ----

export type SilenceAction = 'continue' | 'nudge' | 'end_call'

export interface SilenceDecision {
  action: SilenceAction
  reason: string
}

/** Pure: evaluate how long the customer has been silent after an agent reply. */
export function evaluateSilence(params: {
  silenceMs: number
  maxSilenceMs: number
  nudgesSoFar: number
  maxNudges?: number
}): SilenceDecision {
  const maxNudges = params.maxNudges ?? 2
  if (params.silenceMs < params.maxSilenceMs) {
    return { action: 'continue', reason: `customer still within silence window (${params.silenceMs}ms < ${params.maxSilenceMs}ms)` }
  }
  if (params.nudgesSoFar < maxNudges) {
    return { action: 'nudge', reason: `silence ${params.silenceMs}ms — prompt the customer again (nudge ${params.nudgesSoFar + 1}/${maxNudges})` }
  }
  return {
    action: 'end_call',
    reason: `silence ${params.silenceMs}ms after ${params.nudgesSoFar} nudges — ending the call politely`,
  }
}

/** Pure: the reprompt line for a nudge, in the caller's language. */
export function silenceNudgeReply(language: string): string {
  return language.startsWith('bn')
    ? 'আপনি কি সেখানে আছেন? আরও কিছু জানতে চাইলে বলুন।'
    : 'Are you still there? Let me know if there is anything else I can help with.'
}

/** Pure: the goodbye line before a silence hang-up, in the caller's language. */
export function silenceEndReply(language: string): string {
  return language.startsWith('bn')
    ? 'উত্তর না পাওয়ায় আমি কলটি শেষ করছি। প্রয়োজনে আমাদের কল করুন। ধন্যবাদ।'
    : 'I did not hear a response, so I will end the call. Please call us back anytime. Thank you.'
}

// ---- Per-call turn-taking accumulator (session state, no timers) ----

export interface TurnTakingEvent {
  type: 'agent_reply' | 'customer_turn' | 'barge_in' | 'nudge'
  atMs: number
}

/**
 * Tracks turn-taking facts for one call. The transport feeds events; the
 * conversation service queries the counters. Stateless DB rows
 * (CallEvent `barge_in`, turn payload `nudgesSoFar`) are the durable source —
 * this accumulator is per-process convenience, rebuildable from events.
 */
export class TurnTakingTracker {
  private events: TurnTakingEvent[] = []
  private nudges = 0
  private bargeIns = 0
  private lastAgentReplyAtMs: number | null = null

  recordAgentReply(atMs: number): void {
    this.events.push({ type: 'agent_reply', atMs })
    this.lastAgentReplyAtMs = atMs
  }

  recordCustomerTurn(atMs: number, facts: BargeInFacts): BargeInDecision {
    const decision = classifyBargeIn({
      ...facts,
      customerSpokeDuringAgentSpeech:
        facts.customerSpokeDuringAgentSpeech &&
        this.lastAgentReplyAtMs !== null &&
        atMs >= this.lastAgentReplyAtMs,
    })
    this.events.push({ type: 'customer_turn', atMs })
    if (decision.bargedIn) {
      this.events.push({ type: 'barge_in', atMs })
      this.bargeIns += 1
    }
    return decision
  }

  recordNudge(atMs: number): void {
    this.events.push({ type: 'nudge', atMs })
    this.nudges += 1
  }

  get nudgeCount(): number {
    return this.nudges
  }

  get bargeInCount(): number {
    return this.bargeIns
  }

  /** Silence elapsed since the last agent reply (0 when nothing was said yet). */
  silenceSinceLastReply(nowMs: number): number {
    if (this.lastAgentReplyAtMs === null) return 0
    return Math.max(0, nowMs - this.lastAgentReplyAtMs)
  }

  eventsSnapshot(): TurnTakingEvent[] {
    return [...this.events]
  }
}
