import { afterEach, describe, expect, it } from 'vitest'
import { AIRouter } from '@/lib/ai-router/router'
import { BaseAIProvider } from '@/lib/ai-router/provider-base'
import type { AIModel, AIProvider } from '@/lib/ai-router/types'
import { freeOnlyModeEnabled } from '@/lib/ai-router/model-tiers'
import { isFreeOnlyMode } from '@/lib/ai-router/free-only-mode'

/**
 * Environment-variable alignment for FREE-ONLY mode.
 *
 * Two predicates existed for one concept:
 *   - `free-only-mode.ts#isFreeOnlyMode`  reads `FREE_ONLY_MODE`, else `LOCAL_ONLY`
 *   - `model-tiers.ts#freeOnlyModeEnabled` read `FREE_ONLY`
 *
 * `router.ts` consumed BOTH in the same filter, so an operator who set only
 * `FREE_ONLY_MODE=true` (the variable name in .env.example and in the
 * provider-admin error message) could still be routed to a paid provider when
 * the caller passed `allowPaid: true`, because `freeOnly` stayed false.
 *
 * This file pins the contract: every alias must evaluate identically.
 */

const request = () => ({ messages: [{ role: 'user' as const, content: 'hi' }] });

const PAID_NAME: AIProvider = 'openai'
const FREE_NAME: AIProvider = 'openrouter-free'

class FakeProvider extends BaseAIProvider {
  readonly name: AIProvider
  override readonly freeOnly: boolean
  supportedModels: AIModel[]

  constructor(name: AIProvider, freeOnly: boolean) {
    super()
    this.name = name
    this.freeOnly = freeOnly
    this.supportedModels = [{ id: 'shared-model', provider: name, name: 'm', family: 'f', capabilities: ['chat'], contextLength: 8192, costPerMillionTokens: freeOnly ? 0 : 2 }]
  }
  async initialize() { this.initialized = true }
  async checkHealth() { return { status: 'healthy' as const, lastCheck: new Date(), latencyMs: 1 } }
  async complete() { return { text: 'ok', model: 'shared-model', provider: this.name, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' as const, latencyMs: 1 } }
  async *stream() { yield { type: 'done' as const, finishReason: 'stop' as const } }
}

const ENV_KEYS = ['FREE_ONLY', 'FREE_ONLY_MODE', 'LOCAL_ONLY', 'LOCAL_INFERENCE_URL', 'LOCAL_INFERENCE_ENABLED'] as const
const saved = new Map<string, string | undefined>()

function clearEnv() {
  for (const k of ENV_KEYS) {
    if (!saved.has(k)) saved.set(k, process.env[k])
    delete process.env[k]
  }
}

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  saved.clear()
})

describe('FREE-ONLY env aliases resolve to one predicate', () => {
  it('both predicates agree when only FREE_ONLY_MODE=true is set', () => {
    clearEnv()
    process.env.FREE_ONLY_MODE = 'true'
    expect(isFreeOnlyMode()).toBe(true)
    expect(freeOnlyModeEnabled()).toBe(true)
  })

  it('both predicates agree when only FREE_ONLY=true is set', () => {
    clearEnv()
    process.env.FREE_ONLY = 'true'
    expect(isFreeOnlyMode()).toBe(true)
    expect(freeOnlyModeEnabled()).toBe(true)
  })

  it('both predicates agree when neither is set', () => {
    clearEnv()
    expect(isFreeOnlyMode()).toBe(false)
    expect(freeOnlyModeEnabled()).toBe(false)
  })
})

describe('router refuses a paid provider under FREE_ONLY_MODE alone', () => {
  /**
   * The contract: setting ONLY the documented `FREE_ONLY_MODE=true` must make a
   * paid provider unreachable even when the caller sets `allowPaid: true` and
   * names it in `allowedProviderNames`. With no local/free provider registered
   * the router must fail closed with the FREE-ONLY specific error rather than
   * silently selecting the paid one.
   */
  it('fails closed instead of selecting the paid provider', async () => {
    clearEnv();
    process.env.FREE_ONLY_MODE = 'true';

    const router = new AIRouter();
    const paid = new FakeProvider(PAID_NAME, false);
    router.registerProvider(paid);
    await router.initializeAll?.();

    let selected: unknown;
    try {
      const decision = router.route(request(), {
        allowPaid: true,
        allowVerifiedFree: true,
        allowedProviderNames: [PAID_NAME],
      } as never);
      selected = decision.provider;
    } catch (err) {
      expect(String(err)).toMatch(/FREE-ONLY/i);
    }

    expect(selected).not.toBe(PAID_NAME);
  });
});
