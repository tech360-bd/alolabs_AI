/**
 * Call state machine for the ALO Labs Voice & Contact Center.
 *
 * WHY A STATE MACHINE
 * -------------------
 * Call records are money and compliance evidence. Every transition is
 * validated here so a bug (or a malicious API caller) can never move a call
 * backwards in its lifecycle — e.g. an `ended` call silently becoming
 * `in_progress` again would corrupt duration metering and billing.
 *
 * The machine is intentionally transport-agnostic: PSTN, SIP and the sandbox
 * adapter all drive the same states, so routing/metering logic is written once.
 */

export const CALL_STATES = [
  'queued', // created, not yet sent to the telephony layer
  'ringing', // invitation sent, waiting for answer
  'in_progress', // answered, conversation active
  'on_hold',
  'transferring', // supervised/attended transfer in flight
  'after_call_work', // human agent wrap-up; call leg already ended
  'completed',
  'no_answer',
  'busy',
  'voicemail',
  'failed',
  'cancelled',
  'abandoned', // caller hung up while queued/ringing
] as const

export type CallState = (typeof CALL_STATES)[number]

/** States that represent a finished call (no further transitions allowed). */
export const TERMINAL_STATES: readonly CallState[] = [
  'completed',
  'no_answer',
  'busy',
  'voicemail',
  'failed',
  'cancelled',
  'abandoned',
]

export function isTerminal(state: CallState): boolean {
  return TERMINAL_STATES.includes(state)
}

export function isCallState(value: string): value is CallState {
  return (CALL_STATES as readonly string[]).includes(value)
}

/**
 * Legal transitions. Anything not listed here is rejected by `transition()`.
 *
 * - `on_hold` and `transferring` return to `in_progress` (hold/transfer may fail
 *   and the conversation must resume).
 * - `after_call_work` is a post-call human wrap-up that ends in `completed`.
 * - Any non-terminal state can fail/cancel (network drop, caller abandon).
 */
const TRANSITIONS: Record<CallState, readonly CallState[]> = {
  queued: ['ringing', 'in_progress', 'cancelled', 'failed', 'no_answer', 'busy', 'abandoned'],
  ringing: ['in_progress', 'completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled', 'abandoned'],
  in_progress: ['on_hold', 'transferring', 'after_call_work', 'completed', 'failed', 'voicemail'],
  on_hold: ['in_progress', 'completed', 'failed', 'abandoned'],
  transferring: ['in_progress', 'completed', 'failed', 'no_answer'],
  after_call_work: ['completed'],
  completed: [],
  no_answer: [],
  busy: [],
  voicemail: [],
  failed: [],
  cancelled: [],
  abandoned: [],
}

export class InvalidCallTransitionError extends Error {
  constructor(
    public readonly from: CallState,
    public readonly to: CallState,
    public readonly callId?: string,
  ) {
    super(
      `Invalid call transition ${from} → ${to}` +
        (callId ? ` (call ${callId})` : '') +
        `. Allowed: ${TRANSITIONS[from].join(', ') || 'none (terminal state)'}`,
    )
    this.name = 'InvalidCallTransitionError'
  }
}

export interface TransitionResult {
  from: CallState
  to: CallState
  at: Date
  ended: boolean
}

/**
 * Validate and apply a transition. Pure — persistence is the caller's job
 * (see `call-service.ts`), so this can be unit-tested without a database.
 *
 * Throws `InvalidCallTransitionError` for illegal transitions, including all
 * transitions out of a terminal state.
 */
export function transition(current: CallState, next: CallState, callId?: string): TransitionResult {
  if (!isCallState(current)) throw new InvalidCallTransitionError(current as never, next, callId)
  if (!isCallState(next)) throw new InvalidCallTransitionError(current, next as never, callId)
  const allowed = TRANSITIONS[current]
  if (!allowed.includes(next)) throw new InvalidCallTransitionError(current, next, callId)
  return { from: current, to: next, at: new Date(), ended: isTerminal(next) }
}

/** States in which the call duration clock runs (answered conversations). */
export function isActiveConversation(state: CallState): boolean {
  return state === 'in_progress' || state === 'on_hold' || state === 'transferring'
}

/**
 * Compute talk duration from lifecycle timestamps. Uses explicit
 * answered→ended timestamps when present and never reports negative values.
 */
export function computeDurationSeconds(input: {
  answeredAt?: Date | null
  endedAt?: Date | null
  now?: Date
}): number {
  if (!input.answeredAt) return 0
  const end = input.endedAt ?? input.now ?? new Date()
  const seconds = Math.floor((end.getTime() - input.answeredAt.getTime()) / 1000)
  return Math.max(0, seconds)
}

/** Final disposition mapping used when a call reaches a terminal state. */
export function dispositionForState(state: CallState): string {
  switch (state) {
    case 'completed':
      return 'answered'
    case 'no_answer':
      return 'no_answer'
    case 'busy':
      return 'busy'
    case 'voicemail':
      return 'voicemail'
    case 'abandoned':
      return 'abandoned'
    default:
      return 'failed'
  }
}
