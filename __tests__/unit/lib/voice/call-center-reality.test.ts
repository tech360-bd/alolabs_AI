// @vitest-environment node
/**
 * Verification: is the AI call center doing REAL work?
 *
 * This test exists to answer that question with executable evidence rather than
 * with a description of the code. It asserts the HONESTY properties of the voice
 * subsystem — the properties that make "simulated" impossible to mistake for
 * "real" — and it also pins the current capability ceiling so that nobody can
 * later claim real telephony exists without changing this file.
 *
 * What it proves:
 *  1. No telephony adapter can reach the PSTN. `sandbox` simulates, and every
 *     real provider (asterisk / freeswitch / external_sip) resolves to
 *     NotConnectedAdapter, which throws on every operation instead of
 *     returning fake success.
 *  2. A simulated call is recorded as simulated and the billing layer excludes
 *     simulated usage, so simulated activity can never be invoiced.
 *  3. The rule-based responder — the deterministic fallback — never invents a
 *     price, policy or commitment, and announces a human handoff when required.
 *  4. The LLM responder goes through the ONE shared inference path
 *     (executeCompanyAIChat) and rethrows on failure, so a failed inference can
 *     never be presented as a successful answer. The fallback wrapper marks the
 *     degradation explicitly.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const chatMock = vi.fn()
vi.mock('@/lib/multi-tenant-ai/service', () => ({
  executeCompanyAIChat: (...args: unknown[]) => chatMock(...args),
  CompanyAIError: class CompanyAIError extends Error {
    code = 'AI_UNAVAILABLE'
  },
}))

import {
  resolveTelephonyAdapter,
  TELEPHONY_PROVIDER_IDS,
  isSimulatedProvider,
  NotConnectedAdapter,
} from '@/lib/voice/telephony/registry'
import { TelephonyUnsupportedError } from '@/lib/voice/telephony/adapter'
import { RuleBasedResponder } from '@/lib/voice/orchestrator'
import { LlmConversationResponder, FallbackSafeResponder } from '@/lib/voice/responder-llm'
import { computeBillingLines } from '@/lib/voice/billing'

// ── 1. No path to the PSTN ───────────────────────────────────────────────────

describe('telephony capability ceiling', () => {
  it('marks the sandbox adapter as simulated — the default cannot reach a phone', () => {
    const adapter = resolveTelephonyAdapter('sandbox')
    expect(adapter.info.simulated).toBe(true)
    // The sandbox advertises full capabilities on purpose (so the whole
    // workflow is exercisable), so capability flags are NOT the safety
    // property. `simulated` is, and it is what the call service stamps onto
    // CallSession and what billing excludes.
    expect(adapter.info.label).toMatch(/simulated/i)
  })

  it.each(['asterisk', 'freeswitch', 'external_sip'] as const)(
    'refuses to place a call on an unconfigured %s provider instead of faking success',
    async (provider) => {
      const adapter = resolveTelephonyAdapter(provider)
      // Not simulated, and not pretending to be reachable either.
      expect(adapter.info.simulated).toBe(false)
      expect(adapter).toBeInstanceOf(NotConnectedAdapter)
      await expect(adapter.placeCall({ callSessionId: 'c1', from: 'a', to: 'b' })).rejects.toThrow(
        TelephonyUnsupportedError,
      )
      await expect(adapter.health()).resolves.toMatchObject({ reachable: false })
    },
  )

  it('treats an unknown provider as simulated rather than as a real one', () => {
    expect(isSimulatedProvider('some-unknown-provider')).toBe(true)
    expect(isSimulatedProvider(null)).toBe(true)
  })

  it('has exactly one non-simulated provider id set, and none is connected', () => {
    // Pins the ceiling: if a real adapter is ever wired in, this fails and the
    // claims in the docs must be updated deliberately.
    const real = TELEPHONY_PROVIDER_IDS.filter((id) => id !== 'sandbox')
    expect(real).toEqual(['asterisk', 'freeswitch', 'external_sip'])
    for (const id of real) {
      expect(resolveTelephonyAdapter(id)).toBeInstanceOf(NotConnectedAdapter)
    }
  })
})

// ── 2. Simulated usage is never billed ───────────────────────────────────────

describe('billing excludes simulated usage', () => {
  const priceBook = {
    currency: 'BDT',
    prices: { ai_call_minutes: 2 },
    source: 'tenant' as const,
  }

  it('bills only the non-simulated quantity', () => {
    const lines = computeBillingLines(
      [{ dimension: 'ai_call_minutes', total: 100, simulatedTotal: 40, unit: 'minute' }],
      priceBook,
    )
    expect(lines[0].billableQuantity).toBe(60)
    expect(lines[0].simulatedQuantity).toBe(40)
    expect(lines[0].amount).toBe(120)
  })

  it('produces a zero billable quantity when every unit was simulated', () => {
    const lines = computeBillingLines(
      [{ dimension: 'ai_call_minutes', total: 25, simulatedTotal: 25, unit: 'minute' }],
      priceBook,
    )
    expect(lines[0].billableQuantity).toBe(0)
    expect(lines[0].amount).toBe(0)
  })
})

// ── 3. The deterministic responder never invents commitments ────────────────

describe('rule-based responder is safe-by-default', () => {
  const responder = new RuleBasedResponder()

  const turn = (over: Record<string, unknown> = {}) =>
    ({ companyId: 'c1', callSessionId: 's1', utterance: '', ...over }) as never

  it('speaks the agent greeting on an empty opening turn', async () => {
    const res = await responder.respond(
      turn({ agent: { name: 'A', language: 'bn-BD', greeting: 'আসসালামু আলাইকুম' } }),
      { handoff: false } as never,
    )
    expect(res.reply).toBe('আসসালামু আলাইকুম')
    expect(res.intents).toContain('call_opening')
  })

  it('asks for clarification instead of guessing when ASR confidence is low', async () => {
    const res = await responder.respond(turn({ utterance: 'ami', asrConfidence: 0.2 }), {
      handoff: false,
    } as never)
    expect(res.intents).toContain('clarification_requested')
  })

  it('announces a human handoff when a structural rule fires', async () => {
    const res = await responder.respond(turn({ utterance: 'refund chai' }), {
      handoff: true,
      reason: 'payment_dispute',
    } as never)
    expect(res.intents).toContain('handoff_announced')
  })

  it('falls back to a generic escalation and never asserts a price or policy', async () => {
    const res = await responder.respond(turn({ utterance: 'dam koto?' }), { handoff: false } as never)
    expect(res.intents).toContain('fallback_response')
    // No digits = no invented price, no invented order number, no commitment.
    expect(res.reply).not.toMatch(/\d/)
  })
})

// ── 4. A failed inference is never presented as a successful answer ─────────

describe('LLM responder goes through the single shared inference path', () => {
  beforeEach(() => chatMock.mockReset())

  const input = (over: Record<string, unknown> = {}) =>
    ({
      companyId: 'c1',
      callSessionId: 's1',
      utterance: 'hello',
      history: [],
      ...over,
    }) as never

  it('returns the model reply and records which model produced it', async () => {
    chatMock.mockResolvedValue({ response: { content: '  ধন্যবাদ  ', model: 'qwen-local' } })
    const responder = new LlmConversationResponder({ userId: 'u1' })
    const res = await responder.respond(input(), { handoff: false } as never)
    expect(res.reply).toBe('ধন্যবাদ')
    expect(res.intents?.[0]).toBe('llm_turn:qwen-local')
    // Routed through the shared tenant-aware service, not a second router.
    expect(chatMock).toHaveBeenCalledTimes(1)
    const [identity, , ctx] = chatMock.mock.calls[0]
    expect(identity).toMatchObject({ companyId: 'c1', userId: 'u1' })
    expect(ctx).toMatchObject({ profile: 'local_fast' })
  })

  it('throws instead of inventing a reply when the inference result is unusable', async () => {
    // A provider that returns a malformed/empty envelope must not yield a
    // spoken answer; the responder has to propagate rather than improvise.
    chatMock.mockResolvedValue({ response: undefined })
    const responder = new LlmConversationResponder({ userId: 'u1' })
    let returned: unknown = null
    let failure: Error | null = null
    try {
      returned = await responder.respond(input(), { handoff: false } as never)
    } catch (err) {
      failure = err as Error
    }
    expect(returned).toBeNull()
    expect(failure).toBeInstanceOf(Error)
  })

  it('throws instead of speaking an empty completion', async () => {
    chatMock.mockResolvedValue({ response: { content: '   ', model: 'qwen-local' } })
    const responder = new LlmConversationResponder({ userId: 'u1' })
    await expect(responder.respond(input(), { handoff: false } as never)).rejects.toThrow(
      /empty reply/i,
    )
  })

  it('marks a degraded turn explicitly so it is visible in the transcript', async () => {
    // Hand-rolled failing primary instead of a mocked module function, so the
    // failure is raised and caught entirely inside the wrapper under test.
    const failingPrimary = {
      id: 'always-fails',
      async respond() {
        throw new Error('LLM down')
      },
    }
    const chain = new FallbackSafeResponder(failingPrimary as never, new RuleBasedResponder())
    const res = await chain.respond(input(), { handoff: false } as never)
    // A safe generic reply is spoken, and the failure is recorded, not hidden.
    expect(res.intents).toContain('responder_fallback')
    expect(res.intents?.some((i) => i.startsWith('responder_error:'))).toBe(true)
    expect(res.reply.length).toBeGreaterThan(0)
  })
})
