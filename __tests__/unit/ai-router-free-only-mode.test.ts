import { afterEach, describe, expect, it } from 'vitest'
import { AIRouter } from '@/lib/ai-router/router'
import { BaseAIProvider } from '@/lib/ai-router/provider-base'
import { AIProviderUnavailableError, AIRouterError } from '@/lib/ai-router/types'
import type {
  AIModel,
  AIProvider,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
} from '@/lib/ai-router/types'

/**
 * Global FREE-ONLY operating mode (`FREE_ONLY` env flag + admin runtime
 * override). While enabled, only local inference and verified free-only
 * adapters are eligible for EVERY request — context.allowPaid cannot override
 * the gate, and failover must never land on a paid endpoint. Default is off,
 * so existing deployments keep their current billing behaviour.
 */

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

const PAID_NAME: AIProvider = 'openai-compatible'
const FREE_NAME: AIProvider = 'openrouter-free'
const BACKUP_FREE_NAME: AIProvider = 'openai-compatible:free-backup'

/** All billing gates opened — only FREE-ONLY itself may now block the paid provider. */
const fullyAuthorized = {
  allowPaid: true,
  allowVerifiedFree: true,
  allowedProviderNames: [PAID_NAME, FREE_NAME, BACKUP_FREE_NAME],
} as const

let savedFreeOnly: string | undefined

afterEach(() => {
  if (savedFreeOnly === undefined) delete process.env.FREE_ONLY
  else process.env.FREE_ONLY = savedFreeOnly
})

function setFreeOnlyEnv(value?: string): void {
  if (savedFreeOnly === undefined && process.env.FREE_ONLY !== undefined) {
    savedFreeOnly = process.env.FREE_ONLY
  }
  if (value === undefined) delete process.env.FREE_ONLY
  else process.env.FREE_ONLY = value
}

async function makeRouter(
  opts: { failPaid?: boolean; failFree?: boolean } = {},
  extra: Array<{ provider: FakeProvider; isLocal?: boolean }> = [],
): Promise<{ router: AIRouter; paid: FakeProvider; free: FakeProvider }> {
  const router = new AIRouter()
  const paid = new FakeProvider({
    name: PAID_NAME,
    models: [{ id: 'shared-model', costPerMillionTokens: 2 }],
    failWithRetryableError: opts.failPaid ?? false,
  })
  const free = new FakeProvider({
    name: FREE_NAME,
    freeOnly: true,
    models: [{ id: 'shared-model', costPerMillionTokens: 0 }],
    failWithRetryableError: opts.failFree ?? false,
  })
  await Promise.all([paid.initialize(), free.initialize()])
  router.registerProvider(paid)
  router.registerProvider(free)
  for (const e of extra) {
    await e.provider.initialize()
    router.registerProvider(e.provider, { isLocal: e.isLocal })
  }
  return { router, paid, free }
}

describe('AIRouter FREE-ONLY operating mode', () => {
  it('blocks a paid provider even when the request context explicitly authorizes paid usage', async () => {
    setFreeOnlyEnv('1')
    const { router } = await makeRouter()

    const decision = router.route(request, undefined, { ...fullyAuthorized, allowFailover: true })
    expect(decision.provider).toBe(FREE_NAME)
  })

  it('is off by default — existing deployments keep their billing behaviour', async () => {
    setFreeOnlyEnv(undefined)
    const { router } = await makeRouter()

    const decision = router.route(request, undefined, {
      ...fullyAuthorized,
      allowedProviderNames: [PAID_NAME],
      allowFailover: true,
    })
    expect(decision.provider).toBe(PAID_NAME)
  })

  it('throws a FREE-ONLY specific error when no local or verified-free provider is eligible', async () => {
    setFreeOnlyEnv('1')
    const router = new AIRouter()
    const paid = new FakeProvider({ name: PAID_NAME, models: [{ id: 'shared-model' }] })
    await paid.initialize()
    router.registerProvider(paid)

    expect(() =>
      router.route(request, undefined, {
        allowPaid: true,
        allowedProviderNames: [PAID_NAME],
      }),
    ).toThrow(AIProviderUnavailableError)
    try {
      router.route(request, undefined, { allowPaid: true, allowedProviderNames: [PAID_NAME] })
    } catch (err) {
    expect((err as Error).message).toMatch(/FREE-ONLY/)
    expect((err as Error).message).toMatch(/will not fall back to paid/i)
    }
  })

  it('keeps local providers eligible even without the freeOnly adapter flag', async () => {
    setFreeOnlyEnv('1')
    const router = new AIRouter()
    const local = new FakeProvider({ name: 'ollama', models: [{ id: 'shared-model' }] })
    await local.initialize()
    router.registerProvider(local, { isLocal: true })

    const decision = router.route(request, undefined, { allowFailover: true })
    expect(decision.provider).toBe('ollama')
  })

  it('admin runtime override forces the mode on without the env flag and off despite it', async () => {
    setFreeOnlyEnv(undefined)
    const { router } = await makeRouter()

    router.setFreeOnlyMode(true)
    expect(router.route(request, undefined, { ...fullyAuthorized }).provider).toBe(FREE_NAME)

    setFreeOnlyEnv('1')
    router.setFreeOnlyMode(false)
    expect(
      router.route(request, undefined, {
        ...fullyAuthorized,
        allowedProviderNames: [PAID_NAME],
      }).provider,
    ).toBe(PAID_NAME)

    // null defers to the environment again.
    router.setFreeOnlyMode(null)
    expect(router.route(request, undefined, { ...fullyAuthorized }).provider).toBe(FREE_NAME)
  })

  it('failover never lands on a paid endpoint while FREE-ONLY is enabled', async () => {
    setFreeOnlyEnv('1')
    const backupFree = new FakeProvider({
      name: BACKUP_FREE_NAME,
      freeOnly: true,
      models: [{ id: 'shared-model', costPerMillionTokens: 0 }],
    })
    const { router, paid, free } = await makeRouter({ failFree: true }, [
      { provider: backupFree },
    ])

    const response = await router.chat(request, undefined, undefined, { ...fullyAuthorized })

    expect(response.content).toBe(`served-by:${BACKUP_FREE_NAME}`)
    expect(free.calls).toEqual(['shared-model'])
    expect(paid.calls).toEqual([])
  })

  it('admin runtime override also protects the failover path', async () => {
    setFreeOnlyEnv(undefined)
    const backupFree = new FakeProvider({
      name: BACKUP_FREE_NAME,
      freeOnly: true,
      models: [{ id: 'shared-model', costPerMillionTokens: 0 }],
    })
    const { router, paid, free } = await makeRouter({ failFree: true }, [
      { provider: backupFree },
    ])
    router.setFreeOnlyMode(true)

    const response = await router.chat(request, undefined, undefined, { ...fullyAuthorized })

    expect(response.content).toBe(`served-by:${BACKUP_FREE_NAME}`)
    expect(paid.calls).toEqual([])
    expect(free.calls).toEqual(['shared-model'])
  })
})
