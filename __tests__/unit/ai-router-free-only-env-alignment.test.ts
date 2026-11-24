import { afterEach, describe, expect, it } from 'vitest'
import { AIRouter } from '@/lib/ai-router/router'
import type { AIRequestContext } from '@/lib/ai-router/router'
import { BaseAIProvider } from '@/lib/ai-router/provider-base'
import type {
  AIModel,
  AIProvider,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderHealth,
} from '@/lib/ai-router/types'
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
 * This file pins the contract: every alias must evaluate identically, and the
 * router must fail closed rather than select a paid provider.
 */

const PROBE_MODEL = 'paid-probe-model'

function request(): AIRequest {
  return { model: PROBE_MODEL, messages: [{ role: 'user', content: 'hi' }] }
}

/** A paid provider: no free-tier claim, so FREE-ONLY must exclude it. */
class PaidProvider extends BaseAIProvider {
  readonly name: AIProvider = 'openai-compatible:paid-probe'
  supportedModels: AIModel[] = [
    {
      id: PROBE_MODEL,
      provider: this.name,
      name: 'paid-probe-model',
      family: 'custom',
      parameters: {},
      capabilities: ['chat'],
      contextLength: 8192,
      costPerMillionTokens: 2,
    },
  ]

  async initialize(): Promise<void> {
    this._initialized = true
  }

  async chatCompletion(_request: AIRequest): Promise<AIResponse> {
    return {
      id: this.generateResponseId(),
      content: 'paid-response',
      model: PROBE_MODEL,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
      latencyMs: 1,
    }
  }

  async *streamChatCompletion(_request: AIRequest): AsyncGenerator<AIStreamChunk> {
    yield { id: this.generateResponseId(), content: 'paid', model: PROBE_MODEL, finishReason: 'stop' }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return {
      provider: this.name,
      isHealthy: true,
      latencyMs: 1,
      errorRate: 0,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      circuitOpen: false,
    }
  }

  async listModels(): Promise<AIModel[]> {
    return this.supportedModels
  }
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
   * the router must fail closed rather than silently selecting the paid one.
   */
  it('fails closed instead of selecting the paid provider', async () => {
    clearEnv()
    process.env.FREE_ONLY_MODE = 'true'

    const router = new AIRouter()
    const paid = new PaidProvider()
    // Initialize first: `getAvailableProviders()` also filters on
    // `provider.initialized`, so an uninitialized probe would be excluded for
    // the wrong reason and the assertion below would pass vacuously.
    await paid.initialize()
    router.registerProvider(paid)

    const context: AIRequestContext = {
      allowPaid: true,
      allowVerifiedFree: true,
      allowedProviderNames: [paid.name],
    }

    let selectedProvider: string | null = null
    try {
      selectedProvider = router.route(request(), undefined, context).provider
    } catch (err) {
      expect(String(err)).toMatch(/FREE-ONLY|no (eligible|provider)|unavailable|No providers/i)
    }

    // The security property: the paid provider is never the selection.
    expect(selectedProvider).not.toBe(paid.name)
  })

  it('does select the paid provider when FREE-ONLY is off and the caller allows it', async () => {
    clearEnv()

    const router = new AIRouter()
    const paid = new PaidProvider()
    await paid.initialize()
    router.registerProvider(paid)

    const decision = router.route(request(), undefined, {
      allowPaid: true,
      allowedProviderNames: [paid.name],
    })

    // Control case: proves the test above is not passing merely because
    // routing is broken for this provider under every configuration.
    expect(decision.provider).toBe(paid.name)
  })
})
