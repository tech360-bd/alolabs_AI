/**
 * LLM-backed conversation responder — the bridge between the voice call loop
 * and the ONE AI runtime (master prompt §05 Module 8, §09).
 *
 * Design rules:
 * - Goes through `executeCompanyAIChat` (multi-tenant-ai) so model routing,
 *   tenant attribution, budget guards and audit trails stay on the single
 *   existing path. Voice must NOT open a second inference route.
 * - The system prompt hard-codes the AI identity disclosure requirement and
 *   the language policy (reply in the caller's detected language).
 * - On any LLM failure the responder throws; the conversation service falls
 *   back to the deterministic rule-based responder and records the failure —
 *   callers never hear an invented answer, and failures are visible.
 */

import { executeCompanyAIChat, CompanyAIError } from '@/lib/multi-tenant-ai/service'
import { detectLanguage, type LanguageDetection } from './language'
import { knowledgeBlockForPrompt, type KnowledgeSnippet } from './knowledge'
import type { ConversationResponder, ConversationTurnInput } from './orchestrator'
import type { HandoffDecision } from './consent'

export interface LlmResponderOptions {
  /** Model routing profile — voice wants the low-latency tier. */
  profile?: 'local_fast' | 'free_general'
  /** Attribution user for the AI runtime actor (call owner / system user). */
  userId: string
  /** Role used for tenant attribution of the AI call. */
  role?: string
  maxTokens?: number
}

const VOICE_SYSTEM_PROMPT = `You are the AI phone agent of a business contact center. Rules you must never break:
1. You ARE an AI assistant. If asked, say so. Never claim to be a human.
2. Reply in the SAME language the customer used: Bangla (bn), English (en), or natural Bangla-English mix. Match their register.
3. Keep replies short and natural for telephone speech: 1-3 sentences, no markdown, no lists, no emojis.
4. Never invent prices, policies, schedules, order statuses or commitments. If you do not know, say you will check or offer a human agent.
5. If the customer asks for a human, a representative, mentions payment disputes, refunds, or legal matters, announce the transfer politely and stop.
6. Output plain speech only — your reply is spoken aloud by TTS.`

export class LlmConversationResponder implements ConversationResponder {
  readonly id = 'llm-ai-router'
  private readonly options: Required<Pick<LlmResponderOptions, 'userId'>> & LlmResponderOptions

  constructor(options: LlmResponderOptions) {
    this.options = { role: 'member', maxTokens: 300, ...options }
  }

  async respond(
    input: ConversationTurnInput,
    handoff: HandoffDecision,
  ): Promise<{ reply: string; intents?: string[]; endCall?: boolean; endReason?: string }> {
    const detection: LanguageDetection = detectLanguage(input.utterance ?? '')
    const history = (input.history ?? []).slice(-12) // keep telephone-sized context

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: this.systemPromptFor(input, detection, handoff) },
      ...history.map((h) => ({
        role: h.role === 'customer' ? ('user' as const) : ('assistant' as const),
        content: h.text,
      })),
    ]
    if (input.utterance?.trim()) {
      messages.push({ role: 'user', content: input.utterance.trim() })
    }

    try {
      const result = await executeCompanyAIChat(
        { companyId: input.companyId, userId: this.options.userId, role: this.options.role! },
        { model: '', messages, temperature: 0.4, maxTokens: this.options.maxTokens },
        {
          profile: this.options.profile ?? 'local_fast',
          dataClassification: 'confidential',
          requestId: `voice_turn:${input.callSessionId}`,
        },
      )
      const reply = result.response.content?.trim()
      if (!reply) throw new Error('LLM returned an empty reply')
      return { reply, intents: [`llm_turn:${result.response.model}`] }
    } catch (err) {
      if (err instanceof CompanyAIError) {
        throw new Error(`voice LLM deferred (${err.code}): ${err.message}`)
      }
      throw err
    }
  }

  private systemPromptFor(input: ConversationTurnInput, detection: LanguageDetection, handoff: HandoffDecision): string {
    const parts: string[] = [VOICE_SYSTEM_PROMPT]
    const lang =
      detection.language === 'mixed' ? 'Bangla-English mix' : detection.language === 'bn-BD' ? 'Bangla' : 'English'
    parts.push(`Customer's current language: ${lang}. Reply accordingly.`)
    const agent = input.agent
    if (agent) {
      parts.push(
        `Agent profile — name: ${agent.name}; language: ${agent.language}` +
          (agent.systemInstructions ? `; business instructions: ${agent.systemInstructions}` : ''),
      )
      if (agent.greeting) parts.push(`Opening greeting already spoken (do not repeat verbatim): "${agent.greeting}"`)
    }
    const knowledge = (input.knowledge ?? []) as KnowledgeSnippet[]
    if (knowledge.length > 0) {
      const block = knowledgeBlockForPrompt(knowledge)
      if (block) parts.push(block)
    }
    if (handoff.handoff) {
      parts.push(
        `MANDATORY: a structural rule requires a human handoff NOW (reason: ${handoff.reason}). Announce the transfer in one short sentence and nothing else.`,
      )
    }
    return parts.join('\n')
  }
}

/**
 * A wrapper that ALWAYS returns something speakable: tries the primary
 * responder, and on failure falls back to the rule-based responder while
 * surfacing the degradation in intents (visible in transcript/audit).
 */
export class FallbackSafeResponder implements ConversationResponder {
  readonly id: string

  constructor(
    private readonly primary: ConversationResponder,
    private readonly fallback: ConversationResponder,
  ) {
    this.id = `fallback-safe(${primary.id}→${fallback.id})`
  }

  async respond(
    input: ConversationTurnInput,
    handoff: HandoffDecision,
  ): Promise<{ reply: string; intents?: string[]; endCall?: boolean; endReason?: string }> {
    try {
      return await this.primary.respond(input, handoff)
    } catch (err) {
      const result = await this.fallback.respond(input, handoff)
      const detail = err instanceof Error ? err.message : 'primary responder failed'
      return {
        ...result,
        intents: [...(result.intents ?? []), 'responder_fallback', `responder_error:${detail}`.slice(0, 300)],
      }
    }
  }
}
