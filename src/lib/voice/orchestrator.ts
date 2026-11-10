/**
 * AI conversation orchestrator for voice calls (Modules B, E, I of the master
 * prompt — AI voice agents, inbound receptionist, handoff).
 *
 * Responsibilities per conversation turn:
 * 1. Evaluate structural handoff rules (consent.ts) — the AI cannot override
 *    a mandatory transfer (payment disputes, legal questions, customer
 *    request, repeated recognition failures).
 * 2. Produce the agent's next utterance through a pluggable responder.
 * 3. Emit structured call outcomes — never claiming a business action
 *    succeeded unless the corresponding service call actually returned success.
 *
 * The default responder is rule-based and deterministic (used by tests and as
 * the safe fallback when no LLM is configured). An LLM-backed responder can be
 * registered through `setConversationResponder` — e.g. the existing ai-router
 * providers — without changing this orchestration logic.
 */

import { evaluateHandoff, type HandoffDecision } from './consent'

export interface ConversationTurnInput {
  companyId: string
  callSessionId: string
  /** Customer utterance (from ASR). Empty when the turn is call opening. */
  utterance?: string
  asrConfidence?: number | null
  asrFailureCount?: number
  callDurationSeconds?: number
  maxCallSeconds?: number
  /** Conversation history: role + text pairs, oldest first. */
  history?: Array<{ role: 'customer' | 'agent' | 'system'; text: string }>
  /** Agent config snapshot (greeting, instructions, language, fallback). */
  agent?: {
    name: string
    language: string
    greeting?: string | null
    fallbackMessage?: string | null
    systemInstructions?: string | null
  } | null
}

export interface ConversationTurnOutput {
  reply: string
  handoff: HandoffDecision
  /** Structured outcome fragments accumulated this turn. */
  intents: string[]
  /** Set when the orchestrator decided the call should end. */
  endCall: boolean
  endReason?: string
  /** Which responder produced the reply (for audit rows). */
  responder: string
}

export interface ConversationResponder {
  id: string
  respond(input: ConversationTurnInput, handoff: HandoffDecision): Promise<{ reply: string; intents?: string[]; endCall?: boolean; endReason?: string }>
}

/**
 * Deterministic rule-based responder. Safe default: it never invents prices,
 * policies or commitments — it greets, acknowledges, and offers escalation.
 */
export class RuleBasedResponder implements ConversationResponder {
  readonly id = 'rule-based'

  async respond(
    input: ConversationTurnInput,
    handoff: HandoffDecision,
  ): Promise<{ reply: string; intents?: string[]; endCall?: boolean; endReason?: string }> {
    const fallback =
      input.agent?.fallbackMessage ??
      'দুঃখিত, আমি বিষয়টি পুরোপুরি বুঝতে পারিনি। আমি আপনাকে একজন প্রতিনিধির সাথে সংযোগ করে দিচ্ছি।'

    if (!input.utterance || input.utterance.trim().length === 0) {
      return { reply: input.agent?.greeting ?? 'আসসালামু আলাইকুম! আমি আপনাকে কীভাবে সাহায্য করতে পারি?', intents: ['call_opening'] }
    }
    if (handoff.handoff) {
      return {
        reply: 'এক মুহূর্ত, আমি আপনাকে একজন প্রতিনিধির সাথে সংযোগ করে দিচ্ছি।',
        intents: ['handoff_announced'],
      }
    }
    if (typeof input.asrConfidence === 'number' && input.asrConfidence < 0.5) {
      return { reply: 'দুঃখিত, আপনি কি একটু আবার বলতে পারবেন?', intents: ['clarification_requested'] }
    }
    return { reply: fallback, intents: ['fallback_response'] }
  }
}

let activeResponder: ConversationResponder = new RuleBasedResponder()

/** Register an LLM-backed responder (ai-router integration point). */
export function setConversationResponder(responder: ConversationResponder): void {
  activeResponder = responder
}
export function currentConversationResponder(): string {
  return activeResponder.id
}

export interface PendingBusinessAction {
  description: string
  /** Must be set from the REAL service call's result — never asserted in advance. */
  confirmed: boolean
  result?: Record<string, unknown>
}

export interface StructuredOutcome {
  intents: string[]
  actions: PendingBusinessAction[]
  handoff?: HandoffDecision
  summaryNotes: string[]
}

/**
 * Build the structured outcome for a finished call. Only CONFIRMED actions
 * are reported as succeeded; unconfirmed ones are listed honestly as
 * `not_confirmed` so downstream CRM/automation never acts on a lie.
 */
export function buildStructuredOutcome(params: {
  intents: string[]
  actions?: PendingBusinessAction[]
  handoff?: HandoffDecision
  notes?: string[]
}): StructuredOutcome {
  const actions = (params.actions ?? []).map((a) => ({
    ...a,
    result: a.confirmed ? a.result : { status: 'not_confirmed', detail: 'action was attempted but not confirmed by the underlying service' },
  }))
  return {
    intents: params.intents,
    actions,
    handoff: params.handoff,
    summaryNotes: params.notes ?? [],
  }
}

/**
 * Run one conversation turn: handoff evaluation first (structural rules win),
 * then the responder. This ordering is the safety contract — the responder
 * receives the handoff decision and must honor it, and the orchestrator
 * independently enforces `mandatory` handoffs even if a responder ignores it.
 *
 * `responderOverride` lets a caller inject the responder for THIS turn (e.g.
 * a per-tenant LLM responder with correct attribution). When omitted the
 * globally registered responder is used.
 */
export async function runConversationTurn(
  input: ConversationTurnInput,
  responderOverride?: ConversationResponder,
): Promise<ConversationTurnOutput> {
  const handoff = evaluateHandoff({
    utterance: input.utterance,
    asrFailureCount: input.asrFailureCount,
    asrConfidence: input.asrConfidence,
    callDurationSeconds: input.callDurationSeconds,
    maxCallSeconds: input.maxCallSeconds,
  })

  const responder = responderOverride ?? activeResponder
  const responderResult = await responder.respond(input, handoff)
  const mandatoryHandoff = handoff.handoff && handoff.mandatory
  const endCall = responderResult.endCall === true && !mandatoryHandoff ? true : handoff.handoff && handoff.trigger === 'max_duration'

  return {
    reply: responderResult.reply,
    handoff: mandatoryHandoff
      ? handoff
      : responderResult.endCall && !handoff.handoff
        ? { handoff: false, mandatory: false, reason: 'responder ended call (no handoff)' }
        : handoff,
    intents: responderResult.intents ?? [],
    endCall,
    endReason: responderResult.endReason ?? (endCall ? handoff.trigger : undefined),
    responder: responder.id,
  }
}

/**
 * Build transcript segments from a call's history — the persistence shape for
 * CallTranscript. Keeps speaker labels and timestamps the caller measured;
 * nothing here invents content that was not said.
 */
export function transcriptSegmentsFromHistory(
  history: Array<{ role: 'customer' | 'agent' | 'system'; text: string; atMs?: number }>,
): Array<{ speaker: string; text: string; startMs: number; endMs: number }> {
  let cursor = 0
  return history.map((h) => {
    const startMs = h.atMs ?? cursor
    const endMs = startMs + Math.max(500, Math.round(h.text.length * 60))
    cursor = endMs
    return { speaker: h.role, text: h.text, startMs, endMs }
  })
}
