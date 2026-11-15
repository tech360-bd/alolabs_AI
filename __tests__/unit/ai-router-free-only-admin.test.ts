import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseAIProvider } from '@/lib/ai-router/provider-base'
import type {
  AIModel,
  AIProvider,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
} from '@/lib/ai-router/types'

/**
 * FREE-ONLY admin control plane: Settings-backed runtime override, audit
 * history, confirmation for disabling, fail-closed persistence, and
 * end-to-end routing effect through the shared router singleton.
 */

const settingsRows = new Map<string, { key: string; value: string; type: string }>()
const auditEvents: Array<{ id: string; actorUserId: string | null; action: string; resource: string; details: string; createdAt: Date }> = []
let failSettingsWrites = false
let failSettingsReads = false

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        if (failSettingsReads) throw new Error('simulated read outage')
        return settingsRows.get(where.key) ?? null
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string; type: string }; update: { value: string; type: string } }) => {
        if (failSettingsWrites) throw new Error('simulated persistence outage')
        const existing = settingsRows.get(where.key)
        const row = { key: where.key, type: (existing ?? create).type, value: update.value }
        settingsRows.set(where.key, row)
        return row
      }),
    },
    auditEvent: {
      create: vi.fn(async ({ data }: { data: { actorUserId: string | null; action: string; resource: string; details: string } }) => {
        if (failSettingsWrites) throw new Error('simulated persistence outage')
        const row = { id: `audit-${auditEvents.length + 1}`, createdAt: new Date(), ...data }
        auditEvents.push(row)
        return row
      }),
      findMany: vi.fn(async ({ take }: { take?: number }) =>
        [...auditEvents].reverse().slice(0, take ?? 20),
      ),
    },
  },
}))

import {
  FREE_ONLY_SETTINGS_KEY,
  FreeOnlyAdminError,
  applyPersistedFreeOnlyMode,
  getFreeOnlyStatus,
  listFreeOnlyAudit,
  setFreeOnlyMode,
} from '@/lib/ai-router/free-only-admin'
import { getRouter } from '@/lib/ai-router'
import { AIProviderUnavailableError } from '@/lib/ai-router/types'

interface FakeProviderOptions {
  name: AIProvider
  freeOnly?: boolean
}

class FakeProvider extends BaseAIProvider {
  readonly name: AIProvider
  override readonly freeOnly: boolean
  supportedModels: AIModel[]

  constructor(options: FakeProviderOptions) {
    super()
    this.name = options.name
    this.freeOnly = options.freeOnly ?? false
    this.supportedModels = [
      {
        id: 'shared-model',
        name: 'shared-model',
        provider: options.name,
        family: 'custom',
        parameters: {},
        contextLength: 32_000,
        capabilities: ['chat', 'streaming'],
        costPerMillionTokens: this.freeOnly ? 0 : 2,
      },
    ]
  }

  async initialize(): Promise<void> {
    this._initialized = true
  }

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
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

const PAID_NAME: AIProvider = 'openai-compatible'
const request: AIRequest = {
  model: 'shared-model',
  messages: [{ role: 'user', content: 'ping' }],
}

let savedFreeOnly: string | undefined

function setEnvFreeOnly(value?: string): void {
  if (savedFreeOnly === undefined && process.env.FREE_ONLY !== undefined) {
    savedFreeOnly = process.env.FREE_ONLY
  }
  if (value === undefined) delete process.env.FREE_ONLY
  else process.env.FREE_ONLY = value
}

/** Registers a paid provider on the shared singleton for end-to-end checks. */
function registerPaid(router: ReturnType<typeof getRouter>): void {
  try {
    router.removeProvider(PAID_NAME)
  } catch {
    // not registered yet
  }
  const paid = new FakeProvider({ name: PAID_NAME })
  return router.registerProvider(paid, { isLocal: false })
}

async function registerAndInitPaid(): Promise<void> {
  const router = getRouter()
  registerPaid(router)
  const provider = router.getRegisteredProviders().includes(PAID_NAME)
    ? (router as unknown as { providers: Map<string, { provider: FakeProvider }> }).providers.get(PAID_NAME)!.provider
    : null
  await provider?.initialize()
}

beforeEach(() => {
  settingsRows.clear()
  auditEvents.length = 0
  failSettingsWrites = false
  failSettingsReads = false
  setEnvFreeOnly(undefined)
})

afterEach(() => {
  if (savedFreeOnly === undefined) delete process.env.FREE_ONLY
  else process.env.FREE_ONLY = savedFreeOnly
  const router = getRouter()
  try {
    router.removeProvider(PAID_NAME)
  } catch {
    // not registered
  }
  router.setFreeOnlyMode(null)
})

describe('getFreeOnlyStatus', () => {
  it('defaults to environment/default_off when no Settings row exists', async () => {
    const status = await getFreeOnlyStatus()
    expect(status).toEqual({
      effective: false,
      source: 'default_off',
      storedOverride: null,
      environmentEnabled: false,
      configurationDisagreement: false,
    })
  })

  it('reports environment mode when set and no override stored', async () => {
    setEnvFreeOnly('1')
    const status = await getFreeOnlyStatus()
    expect(status.effective).toBe(true)
    expect(status.source).toBe('environment')
  })

  it('runtime override wins over the environment and flags disagreement', async () => {
    setEnvFreeOnly('1')
    settingsRows.set(FREE_ONLY_SETTINGS_KEY, { key: FREE_ONLY_SETTINGS_KEY, value: 'false', type: 'boolean' })
    const status = await getFreeOnlyStatus()
    expect(status.effective).toBe(false)
    expect(status.source).toBe('runtime_override')
    expect(status.configurationDisagreement).toBe(true)
  })

  it('treats an invalid stored value as no override (defer to environment)', async () => {
    setEnvFreeOnly('1')
    settingsRows.set(FREE_ONLY_SETTINGS_KEY, { key: FREE_ONLY_SETTINGS_KEY, value: 'maybe', type: 'boolean' })
    const status = await getFreeOnlyStatus()
    expect(status.effective).toBe(true)
    expect(status.source).toBe('environment')
    expect(status.storedOverride).toBe('invalid')
  })
})

describe('applyPersistedFreeOnlyMode', () => {
  it('applies a stored override to the shared router', async () => {
    setEnvFreeOnly(undefined)
    const router = getRouter()
    router.setFreeOnlyMode(null)
    registerAndInitPaid()

    settingsRows.set(FREE_ONLY_SETTINGS_KEY, { key: FREE_ONLY_SETTINGS_KEY, value: 'true', type: 'boolean' })
    await applyPersistedFreeOnlyMode(router)

    expect(() =>
      router.route(request, undefined, { allowPaid: true, allowedProviderNames: [PAID_NAME] }),
    ).toThrow(AIProviderUnavailableError)
  })

  it('leaves the router untouched when the Settings read fails (fail-closed)', async () => {
    const router = getRouter()
    router.setFreeOnlyMode(true)
    await registerAndInitPaid()

    failSettingsReads = true
    await applyPersistedFreeOnlyMode(router)

    // Mode still in force — paid routing remains blocked.
    expect(() =>
      router.route(request, undefined, { allowPaid: true, allowedProviderNames: [PAID_NAME] }),
    ).toThrow(AIProviderUnavailableError)
  })
})

describe('setFreeOnlyMode (Super Admin)', () => {
  it('enables the mode, persists it, audits it, and blocks paid routing end-to-end', async () => {
    await registerAndInitPaid()
    const { status } = await setFreeOnlyMode({ userId: 'admin-1' }, true)

    expect(status.effective).toBe(true)
    expect(status.source).toBe('runtime_override')
    expect(settingsRows.get(FREE_ONLY_SETTINGS_KEY)?.value).toBe('true')

    const router = getRouter()
    expect(() =>
      router.route(request, undefined, { allowPaid: true, allowedProviderNames: [PAID_NAME] }),
    ).toThrow(AIProviderUnavailableError)

    const audit = await listFreeOnlyAudit()
    expect(audit).toHaveLength(1)
    expect(audit[0].actorUserId).toBe('admin-1')
    const details = JSON.parse(audit[0].details)
    expect(details.previous).toBe(false)
    expect(details.next).toBe(true)
  })

  it('refuses to disable without explicit confirmation', async () => {
    await expect(setFreeOnlyMode({ userId: 'admin-1' }, false)).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      status: 400,
    })
    expect(settingsRows.has(FREE_ONLY_SETTINGS_KEY)).toBe(false)
  })

  it('disables with confirmation and re-opens paid routing', async () => {
    settingsRows.set(FREE_ONLY_SETTINGS_KEY, { key: FREE_ONLY_SETTINGS_KEY, value: 'true', type: 'boolean' })
    await registerAndInitPaid()

    await setFreeOnlyMode({ userId: 'admin-2' }, false, { confirm: true })

    expect(settingsRows.get(FREE_ONLY_SETTINGS_KEY)?.value).toBe('false')
    const router = getRouter()
    expect(
      router.route(request, undefined, { allowPaid: true, allowedProviderNames: [PAID_NAME] }),
    ).toBeTruthy()
    const audit = await listFreeOnlyAudit()
    const details = JSON.parse(audit[0].details)
    expect(details.previous).toBe(true)
    expect(details.next).toBe(false)
  })

  it('keeps the mode ENABLED when persistence fails during a disable (fail-closed)', async () => {
    settingsRows.set(FREE_ONLY_SETTINGS_KEY, { key: FREE_ONLY_SETTINGS_KEY, value: 'true', type: 'boolean' })
    await registerAndInitPaid()
    const router = getRouter()
    router.setFreeOnlyMode(true)

    failSettingsWrites = true
    await expect(setFreeOnlyMode({ userId: 'admin-1' }, false, { confirm: true })).rejects.toThrow()

    // Runtime override unchanged — paid routing is still blocked.
    expect(() =>
      router.route(request, undefined, { allowPaid: true, allowedProviderNames: [PAID_NAME] }),
    ).toThrow(AIProviderUnavailableError)
    expect(settingsRows.get(FREE_ONLY_SETTINGS_KEY)?.value).toBe('true')
    expect(auditEvents).toHaveLength(0)
  })

  it('skips the audit write when the stored value already matches (idempotent)', async () => {
    settingsRows.set(FREE_ONLY_SETTINGS_KEY, { key: FREE_ONLY_SETTINGS_KEY, value: 'true', type: 'boolean' })
    await setFreeOnlyMode({ userId: 'admin-1' }, true)
    expect(auditEvents).toHaveLength(0)
  })

  it('rejects FreeOnlyAdminError shape for wrong confirmation type', async () => {
    await expect(setFreeOnlyMode({ userId: 'admin-1' }, false, { confirm: false })).rejects.toBeInstanceOf(
      FreeOnlyAdminError,
    )
  })
})
