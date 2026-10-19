import { describe, expect, it } from 'vitest'
import { AIRouter } from '@/lib/ai-router/router'
import { BaseAIProvider } from '@/lib/ai-router/provider-base'
import { AIRouterError } from '@/lib/ai-router/types'
import type {
  AIModel,
  AIProvider,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
} from '@/lib/ai-router/types'

interface FakeProviderOptions {
  name: AIProvider
  models: Array<{ id: string; costPerMillionTokens?: number }>
  freeOnly?: boolean
  failWithRetryableError?: boolean
}

class FakeProvider extends BaseAIProvider {
  readonly name: AIProvider
  override readonly freeOnly: boolean
  supportedModels: AIModel[]
  calls: string[] = []
  private readonly failWithRetryableError: boolean

  constructor(options: FakeProviderOptions) {
    super()
    this.name = options.name
    this.freeOnly = options.freeOnly ?? false
    this.failWithRetryableError = options.failWithRetryableError ?? false
    this.supportedModels = options.models.map((model) => ({
      id: model.id,
      name: model.id,
      provider: options.name,
      family: 'custom',
      parameters: {},
      contextLength: 32_000,
      capabilities: ['chat', 'streaming'],
      costPerMillionTokens: model.costPerMillionTokens,
    }))
  }

  async initialize(): Promise<void> {
    this._initialized = true
  }

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.calls.push(request.model)
    if (this.failWithRetryableError) {
      throw new AIRouterError('temporary upstream failure', this.name, 503, true)
    }
    return {
      id: `${this.name}-response`,
      content: `served-by:${this.name}`,
      model: request.model,
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      finishReason: 'stop',
      latencyMs: 1,
    }
  }

  async *streamChatCompletion(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    this.calls.push(request.model)
    yield { id: `${this.name}-stream`, content: 'ok', model: request.model, finishReason: 'stop' }
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

const request: AIRequest = {
  model: 'shared-model',
  messages: [{ role: 'user', content: 'route this request' }],
}

describe('AIRouter free-only routing', () => {
  it('prefers a verified free-only provider when an exact model is also available from a paid provider', async () => {
    const router = new AIRouter()
    const paid = new FakeProvider({
      name: 'openai-compatible',
      models: [{ id: 'shared-model', costPerMillionTokens: 2 }],
    })
    const free = new FakeProvider({
      name: 'openrouter-free',
      freeOnly: true,
      models: [{ id: 'shared-model', costPerMillionTokens: 0 }],
    })
    await Promise.all([paid.initialize(), free.initialize()])
    router.registerProvider(paid)
    router.registerProvider(free)

    expect(router.route(request, undefined, { allowVerifiedFree: true })).toEqual({
      provider: 'openrouter-free',
      model: 'shared-model',
      reason: 'quality',
    })
  })

  it('limits failover from a free-only provider to other free-only providers', async () => {
    const router = new AIRouter()
    const paid = new FakeProvider({
      name: 'openai-compatible',
      models: [{ id: 'shared-model', costPerMillionTokens: 1 }],
    })
    const primaryFree = new FakeProvider({
      name: 'openrouter-free',
      freeOnly: true,
      models: [{ id: 'shared-model', costPerMillionTokens: 0 }],
      failWithRetryableError: true,
    })
    const fallbackFree = new FakeProvider({
      name: 'openai-compatible:free-backup',
      freeOnly: true,
      models: [{ id: 'backup-free-model', costPerMillionTokens: 0 }],
    })
    await Promise.all([paid.initialize(), primaryFree.initialize(), fallbackFree.initialize()])
    // The paid provider appears first, so an unrestricted failover would use it.
    router.registerProvider(paid)
    router.registerProvider(primaryFree)
    router.registerProvider(fallbackFree)

    const response = await router.chat(request, undefined, undefined, { allowVerifiedFree: true })

    expect(response.content).toBe('served-by:openai-compatible:free-backup')
    expect(primaryFree.calls).toEqual(['shared-model'])
    expect(fallbackFree.calls).toEqual(['backup-free-model'])
    expect(paid.calls).toEqual([])
  })
})
