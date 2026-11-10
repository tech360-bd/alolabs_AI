/**
 * Conversation service — the WIRING half of the AI voice runtime.
 *
 * `runConversationTurn` (orchestrator.ts) is pure orchestration; this module
 * is the only place that connects a real call to it, so the conversation loop
 * has exactly ONE execution path (ONE-Runtime rule):
 *
 *   answer → opening greeting (AI disclosure, language detect)
 *     → per customer turn: runConversationTurn (handoff rules first, then
 *       LLM responder with rule-based fallback) → persist both utterances as
 *       CallEvent rows → handoff execution / call end
 *
 * On call end, `finalizeCallArtifacts` writes the real CallTranscript (from
 * the persisted events — nothing invented), a CallSummary (LLM when the AI
 * runtime is reachable, deterministic fact-list otherwise) and the structured
 * CallOutcome. LLM summarization failure degrades to the fact-list summary —
 * it never blocks the terminal state and never fabricates.
 */

import { db } from '@/lib/db'
import {
  runConversationTurn,
  RuleBasedResponder,
  transcriptSegmentsFromHistory,
  type ConversationTurnInput,
} from './orchestrator'
import { LlmConversationResponder, FallbackSafeResponder } from './responder-llm'
import { detectLanguage, replyLanguageFor } from './language'
import { buildOpeningGreeting } from './disclosure'
import { executeHandoff } from './handoff'
import { endCall, answerCall } from './call-service'
import { retrieveKnowledge } from './knowledge'
import { evaluateSilence, silenceNudgeReply, silenceEndReply, classifyBargeIn } from './turn-taking'
import type { HandoffTrigger } from './consent'

export class ConversationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConversationError'
  }
}

async function loadCall(companyId: string, callSessionId: string) {
  const call = await db.callSession.findFirst({
    where: { id: callSessionId, companyId }, // tenant isolation
    select: {
      id: true, companyId: true, status: true, direction: true, fromNumber: true, toNumber: true,
      voiceAgentId: true, assignedUserId: true, answeredAt: true, startedAt: true, language: true,
    },
  })
  if (!call) throw new ConversationError(`call ${callSessionId} not found for this tenant`)
  return call
}

async function loadAgent(companyId: string, voiceAgentId: string | null) {
  if (!voiceAgentId) return null
  return db.voiceAgent.findFirst({
    where: { id: voiceAgentId, companyId },
    select: {
      id: true, name: true, language: true, greeting: true, fallbackMessage: true,
      systemInstructions: true, maxCallSeconds: true, status: true,
      knowledgeScope: true, allowBargeIn: true,
    },
  })
}

/** Attribution user for the AI runtime actor on this call. */
async function resolveActorUserId(companyId: string, assignedUserId: string | null): Promise<string | null> {
  if (assignedUserId) return assignedUserId
  const admin = await db.user.findFirst({
    where: { isActive: true, role: { in: ['admin', 'super_admin', 'manager'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  return admin?.id ?? null
}

type HistoryEntry = { role: 'customer' | 'agent' | 'system'; text: string; atMs?: number }

async function loadHistory(companyId: string, callSessionId: string): Promise<HistoryEntry[]> {
  const events = await db.callEvent.findMany({
    where: { callSessionId, companyId, type: 'conversation_turn' },
    orderBy: { createdAt: 'asc' },
    select: { payload: true },
  })
  return events.map((e) => {
    const p = JSON.parse(e.payload) as { role: string; text: string }
    return { role: p.role as HistoryEntry['role'], text: p.text }
  })
}

async function persistTurn(
  companyId: string,
  callSessionId: string,
  role: 'customer' | 'agent' | 'system',
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.callEvent.create({
    data: {
      callSessionId,
      companyId,
      type: 'conversation_turn',
      payload: JSON.stringify({ role, text, ...extra }),
    },
  })
}

/**
 * Production responder chain for a call: LLM primary (when an attribution
 * user exists), deterministic rule-based fallback always available.
 */
function buildResponder(companyId: string, actorUserId: string | null) {
  const fallback = new RuleBasedResponder()
  if (!actorUserId) return fallback // honest: no attribution user → no LLM call
  const llm = new LlmConversationResponder({ userId: actorUserId, profile: 'local_fast' })
  return new FallbackSafeResponder(llm, fallback)
}

// ---- Conversation open (inbound answer) ----

/**
 * Answer an inbound call and speak the opening greeting with the mandatory
 * AI identity disclosure. Returns the greeting so the telephony layer can
 * render it through TTS.
 */
export async function beginConversation(params: {
  companyId: string
  callSessionId: string
  /** Override when the provider already detected the greeting language. */
  detectedLanguage?: string | null
}): Promise<{ greeting: string; language: string; simulated: boolean }> {
  const call = await loadCall(params.companyId, params.callSessionId)
  if (call.status === 'in_progress') {
    // Idempotent double-answer: return the already-recorded opening turn.
    const history = await loadHistory(params.companyId, call.id)
    const opening = history.find((h) => h.role === 'agent')
    if (opening) return { greeting: opening.text, language: call.language ?? 'bn-BD', simulated: true }
  }
  await answerCall(call.id, params.companyId)

  const agent = await loadAgent(params.companyId, call.voiceAgentId)
  const opening = buildOpeningGreeting({
    greeting: agent?.greeting,
    agentLanguage: agent?.language,
    detectedLanguage: params.detectedLanguage,
  })
  await db.callSession.update({
    where: { id: call.id },
    data: { language: opening.language },
  })
  await persistTurn(params.companyId, call.id, 'agent', opening.text, { opening: true, disclosure: true })
  return { greeting: opening.text, language: opening.language, simulated: false }
}

// ---- Customer turn ----

/**
 * Process one customer utterance on an active call. Persists the customer
 * turn and the agent reply, runs structural handoff rules, and executes the
 * handoff / ends the call when the orchestrator decides so.
 */
export async function handleConversationTurn(params: {
  companyId: string
  callSessionId: string
  utterance: string
  asrConfidence?: number | null
  asrFailureCount?: number
  /** Transport reports the customer started speaking while TTS was playing. */
  bargeIn?: boolean
  /** Transport-measured customer speech duration in ms (barge-in noise filter). */
  customerSpeechDurationMs?: number | null
  /** Silence since the agent's last reply (transport-measured), when the utterance is empty. */
  silenceMs?: number | null
  /** Silence nudges already spoken on this call (durable via prior turn payloads). */
  nudgesSoFar?: number
}): Promise<{
  reply: string
  handoff: { handoff: boolean; mandatory: boolean; reason: string }
  endCall: boolean
  endReason?: string
  language: string
  responder: string
  turnClassification?: 'barge_in' | 'silence_nudge' | 'silence_end' | 'normal'
}> {
  const call = await loadCall(params.companyId, params.callSessionId)
  const agent = await loadAgent(params.companyId, call.voiceAgentId)
  const history = await loadHistory(params.companyId, call.id)

  const detection = detectLanguage(params.utterance)
  await persistTurn(params.companyId, call.id, 'customer', params.utterance, {
    language: detection.language,
    asrConfidence: params.asrConfidence ?? null,
  })

  // --- Turn-taking: barge-in (customer interrupted the agent's speech) ---
  let turnClassification: 'barge_in' | 'silence_nudge' | 'silence_end' | 'normal' = 'normal'
  if (params.bargeIn) {
    const decision = classifyBargeIn({
      customerSpokeDuringAgentSpeech: true,
      customerSpeechDurationMs: params.customerSpeechDurationMs ?? null,
    })
    if (decision.bargedIn) turnClassification = 'barge_in'
    await db.callEvent.create({
      data: {
        callSessionId: call.id,
        companyId: params.companyId,
        type: 'barge_in',
        payload: JSON.stringify({
          recognized: decision.bargedIn,
          agentAllowsBargeIn: agent?.allowBargeIn ?? true,
          reason: decision.reason,
        }),
      },
    })
  }

  // --- Turn-taking: silence / dead-air (empty utterance + measured silence) ---
  if (!params.utterance.trim() && typeof params.silenceMs === 'number' && params.silenceMs > 0) {
    const nudgesSoFar = await countSilenceNudges(params.companyId, call.id)
    const silence = evaluateSilence({
      silenceMs: params.silenceMs,
      maxSilenceMs: Number(process.env.VOICE_MAX_SILENCE_MS ?? '20000'),
      nudgesSoFar,
    })
    const replyLanguage = replyLanguageFor(detection, agent?.language ?? 'bn-BD')
    if (silence.action === 'nudge') {
      const nudgeReply = silenceNudgeReply(replyLanguage)
      await persistTurn(params.companyId, call.id, 'agent', nudgeReply, {
        responder: 'turn-taking', intents: ['silence_nudge'], replyLanguage,
        turnClassification: 'silence_nudge',
      })
      return { reply: nudgeReply, handoff: { handoff: false, mandatory: false, reason: silence.reason }, endCall: false, language: replyLanguage, responder: 'turn-taking', turnClassification: 'silence_nudge' }
    }
    if (silence.action === 'end_call') {
      const endReply = silenceEndReply(replyLanguage)
      await persistTurn(params.companyId, call.id, 'agent', endReply, {
        responder: 'turn-taking', intents: ['silence_end'], replyLanguage,
        turnClassification: 'silence_end',
      })
      await endCall(call.id, params.companyId, 'completed', `silence_timeout after ${nudgesSoFar} nudges`)
      return { reply: endReply, handoff: { handoff: false, mandatory: false, reason: silence.reason }, endCall: true, endReason: 'silence_timeout', language: replyLanguage, responder: 'turn-taking', turnClassification: 'silence_end' }
    }
  }

  // --- Knowledge Engine (fail-soft): tenant-scoped retrieval for this turn ---
  let knowledge: Array<{ source: string; text: string }> = []
  let knowledgeMeta: { snippets: number; error: string | null; collections: string[] } = { snippets: 0, error: null, collections: [] }
  if (agent?.knowledgeScope && params.utterance.trim()) {
    const retrieval = await retrieveKnowledge({
      companyId: params.companyId,
      scopeRaw: agent.knowledgeScope,
      query: params.utterance,
      actorUserId: call.assignedUserId,
    })
    knowledge = retrieval.snippets.map((s) => ({ source: s.source, text: s.text }))
    knowledgeMeta = { snippets: knowledge.length, error: retrieval.error, collections: retrieval.collectionsQueried }
  }

  const durationSeconds = call.answeredAt
    ? Math.max(0, Math.floor((Date.now() - call.answeredAt.getTime()) / 1000))
    : 0

  const input: ConversationTurnInput = {
    companyId: params.companyId,
    callSessionId: call.id,
    utterance: params.utterance,
    asrConfidence: params.asrConfidence ?? null,
    asrFailureCount: params.asrFailureCount ?? 0,
    callDurationSeconds: durationSeconds,
    maxCallSeconds: agent?.maxCallSeconds ?? 600,
    history,
    agent: agent
      ? {
          name: agent.name,
          language: agent.language,
          greeting: agent.greeting,
          fallbackMessage: agent.fallbackMessage,
          systemInstructions: agent.systemInstructions,
        }
      : null,
    knowledge,
  }

  const actorUserId = await resolveActorUserId(params.companyId, call.assignedUserId)
  const output = await runConversationTurn(input, buildResponder(params.companyId, actorUserId))

  const replyLanguage = replyLanguageFor(detection, agent?.language ?? 'bn-BD')
  await persistTurn(params.companyId, call.id, 'agent', output.reply, {
    responder: output.responder,
    intents: output.intents,
    replyLanguage,
    turnClassification,
    knowledge: knowledgeMeta,
  })

  // Persist detected language on the call (first detection wins as primary,
  // later switches recorded per turn for the transcript).
  await db.callSession.update({
    where: { id: call.id },
    data: { language: call.language ?? detection.language },
  })

  if (output.handoff.handoff) {
    await executeHandoff({
      companyId: params.companyId,
      callSessionId: call.id,
      decision: { ...output.handoff, trigger: output.handoff.trigger as HandoffTrigger | undefined },
      voiceAgentId: call.voiceAgentId,
    })
    return { reply: output.reply, handoff: output.handoff, endCall: true, endReason: `handoff:${output.handoff.trigger ?? 'requested'}`, language: replyLanguage, responder: output.responder, turnClassification }
  }

  if (output.endCall) {
    await endCall(call.id, params.companyId, 'completed', output.endReason ?? 'conversation completed')
  }

  return {
    reply: output.reply,
    handoff: output.handoff,
    endCall: output.endCall,
    endReason: output.endReason,
    language: replyLanguage,
    responder: output.responder,
    turnClassification,
  }
}

/** Count prior silence nudges from durable turn payloads (not process memory). */
async function countSilenceNudges(companyId: string, callSessionId: string): Promise<number> {
  const events = await db.callEvent.findMany({
    where: { callSessionId, companyId, type: 'conversation_turn', payload: { contains: '"turnClassification":"silence_nudge"' } },
    select: { id: true },
  })
  return events.length
}

// ---- Call-end artifacts ----

/**
 * Write the honest end-of-call artifacts: transcript from persisted turns,
 * summary (LLM → fact-list fallback), structured outcome. Idempotent — safe
 * to call from every endCall path.
 */
export async function finalizeCallArtifacts(companyId: string, callSessionId: string): Promise<void> {
  const call = await db.callSession.findFirst({
    where: { id: callSessionId, companyId },
    select: {
      id: true, direction: true, fromNumber: true, toNumber: true, status: true,
      durationSeconds: true, disposition: true, endedReason: true, transferred: true,
      transferReason: true, voiceAgentId: true, campaignCallId: true, language: true,
      outcome: true, simulated: true, assignedUserId: true,
    },
  })
  if (!call) return

  const events = await db.callEvent.findMany({
    where: { callSessionId, companyId },
    orderBy: { createdAt: 'asc' },
    select: { type: true, payload: true, createdAt: true },
  })

  const turns = events
    .filter((e) => e.type === 'conversation_turn')
    .map((e) => JSON.parse(e.payload) as { role: string; text: string })
  const handoffEvent = events.find((e) => e.type === 'handoff')
  const handoffPayload = handoffEvent ? (JSON.parse(handoffEvent.payload) as { trigger?: string; reason?: string; noAgentAvailable?: boolean }) : null

  // Transcript — exactly what was said, speaker-labeled.
  if (turns.length > 0) {
    const segments = transcriptSegmentsFromHistory(
      turns.map((t) => ({ role: t.role as HistoryEntry['role'], text: t.text })),
    )
    await db.callTranscript.upsert({
      where: { callSessionId: call.id },
      create: {
        callSessionId: call.id,
        companyId,
        language: call.language ?? 'bn-BD',
        status: 'ready',
        segments: JSON.stringify(segments),
        provider: 'conversation_events',
      },
      update: { status: 'ready', segments: JSON.stringify(segments) },
    })
  }

  // Structured outcome — facts only.
  const intents = turns
    .filter((t) => t.role === 'agent')
    .length > 0 ? ['conversation_completed'] : []
  if (handoffPayload) intents.push(`handoff:${handoffPayload.trigger ?? 'requested'}`)
  const outcome = {
    direction: call.direction,
    disposition: call.disposition,
    endedReason: call.endedReason,
    transferred: call.transferred,
    transferReason: call.transferReason,
    handoff: handoffPayload,
    language: call.language,
    intents,
    simulated: call.simulated,
  }
  await db.callSession.update({
    where: { id: call.id },
    data: { outcome: JSON.stringify(outcome) },
  })

  // Campaign feedback loop — the CampaignCall row reflects the real result.
  if (call.campaignCallId) {
    const status =
      call.status === 'completed' ? 'completed'
      : call.status === 'no_answer' ? 'no_answer'
      : call.status === 'busy' ? 'busy'
      : call.status === 'voicemail' ? 'voicemail'
      : call.status === 'abandoned' ? 'abandoned'
      : 'failed'
    await db.campaignCall.updateMany({
      where: { id: call.campaignCallId, companyId },
      data: { status, nextAttemptAt: ['no_answer', 'busy', 'failed'].includes(status) ? new Date(Date.now() + 60 * 60 * 1000) : null },
    })
  }

  // Summary — LLM when reachable; deterministic fact-list otherwise.
  const existingSummary = await db.callSummary.findUnique({ where: { callSessionId: call.id }, select: { id: true } })
  if (existingSummary) return

  const agent = await loadAgent(companyId, call.voiceAgentId)
  let summaryText: string
  let model: string | null = null
  try {
    const actorUserId = await resolveActorUserId(companyId, call.assignedUserId)
    if (actorUserId && turns.length > 0) {
      const result = await executeSummary(companyId, actorUserId, call.id, call, turns, handoffPayload)
      summaryText = result
      model = 'ai-router:local_fast'
    } else {
      summaryText = factSummary(call, turns, handoffPayload, agent?.name ?? null)
    }
  } catch {
    summaryText = factSummary(call, turns, handoffPayload, agent?.name ?? null)
  }
  await db.callSummary.create({
    data: {
      callSessionId: call.id,
      companyId,
      summary: summaryText,
      sentiment: null, // never asserted without an engine that measures it
      intents: JSON.stringify(intents),
      actionItems: JSON.stringify(handoffPayload?.noAgentAvailable ? ['callback task scheduled (no agent available)'] : []),
      keyTopics: JSON.stringify(detectKeyTopics(turns)),
      model,
    },
  })
}

async function executeSummary(
  companyId: string,
  actorUserId: string,
  callSessionId: string,
  call: { durationSeconds: number; disposition: string | null; language: string | null },
  turns: Array<{ role: string; text: string }>,
  handoffPayload: { trigger?: string; reason?: string } | null,
): Promise<string> {
  const { executeCompanyAIChat } = await import('@/lib/multi-tenant-ai/service')
  const transcript = turns.map((t) => `${t.role}: ${t.text}`).join('\n').slice(0, 6000)
  const result = await executeCompanyAIChat(
    { companyId, userId: actorUserId, role: 'member' },
    {
      model: '',
      temperature: 0.2,
      maxTokens: 220,
      messages: [
        {
          role: 'system',
          content:
            'Summarize the finished phone call for a CRM record. 2-4 sentences, same language as the conversation. Facts only from the transcript: customer request, what the agent said/did, resolution or next step. Never invent outcomes.',
        },
        {
          role: 'user',
          content: `Call facts: duration ${call.durationSeconds}s, disposition ${call.disposition ?? 'n/a'}, language ${call.language ?? 'n/a'}${handoffPayload ? `, handoff trigger ${handoffPayload.trigger}` : ''}.\nTranscript:\n${transcript}`,
        },
      ],
    },
    { profile: 'local_fast', dataClassification: 'confidential', requestId: `voice_summary:${callSessionId}` },
  )
  return result.response.content.trim()
}

function factSummary(
  call: {
    direction: string; durationSeconds: number; disposition: string | null; endedReason: string | null;
    transferred: boolean; transferReason?: string | null; language: string | null; simulated: boolean;
  },
  turns: Array<{ role: string; text: string }>,
  handoffPayload: { trigger?: string; reason?: string; noAgentAvailable?: boolean } | null,
  agentName: string | null,
): string {
  const parts = [
    `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} call`,
    agentName ? `handled by voice agent "${agentName}"` : 'handled by the default flow',
    `${call.durationSeconds}s, disposition: ${call.disposition ?? call.endedReason ?? 'unknown'}`,
    call.transferred ? `transferred (${call.transferReason ?? 'reason not recorded'})` : null,
    `${turns.filter((t) => t.role === 'customer').length} customer turns, ${turns.filter((t) => t.role === 'agent').length} agent turns`,
  ].filter(Boolean)
  let text = parts.join('; ') + '.'
  if (handoffPayload) {
    text += handoffPayload.noAgentAvailable
      ? ' Human handoff was required but no agent was available — a callback task was scheduled.'
      : ` Human handoff executed (trigger: ${handoffPayload.trigger ?? 'n/a'}).`
  }
  if (turns.length === 0) text += ' No conversation turns were recorded (call did not reach the AI conversation layer).'
  if (call.simulated) text += ' [SIMULATED CALL — sandbox adapter, no real telephone network.]'
  return text
}

function detectKeyTopics(turns: Array<{ role: string; text: string }>): string[] {
  const topics: string[] = []
  const all = turns.map((t) => t.text).join(' ')
  const topicRules: Array<[RegExp, string]> = [
    [/(price|মূল্য|দাম|cost)/i, 'pricing'],
    [/(appointment|বুকিং|schedule|সময়)/i, 'appointment'],
    [/(refund|ফেরত|dispute)/i, 'payment_dispute'],
    [/(complaint|অভিযোগ)/i, 'complaint'],
    [/(order|অর্ডার|delivery|ডেলিভারি)/i, 'order'],
    [/(account|একাউন্ট)/i, 'account'],
  ]
  for (const [re, topic] of topicRules) if (re.test(all)) topics.push(topic)
  return topics
}


