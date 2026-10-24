/**
 * UnoRouter free-lane adapter — the "only free model" contract.
 *
 * UnoRouter (https://unorouter.com) is an OpenAI-compatible gateway whose free
 * lanes carry a `:free` model-id suffix at $0 input and $0 output. These tests
 * pin the product rule end to end: paid lanes are never discovered, never
 * callable, and an upstream change to a lane refuses the call rather than
 * serving it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnoRouterProvider, UNOROUTER_ENDPOINT, UNOROUTER_FREE_MAX_OUTPUT_TOKENS } from '@/lib/ai-router/unorouter-provider'
import { hasFreeModelIdSuffix, isUnoRouterFreeModel, hasExplicitZeroPricing } from '@/lib/ai-router/free-models'
import { providerPreset, defaultProviderBaseUrl } from '@/lib/ai-provider-catalog'
import {
  CONFIGURABLE_PROVIDER_KINDS,
  buildProviderFromConfig,
  describeProviderConfig,
  routerNameForConfig,
  type ProviderConfigRecord,
} from '@/lib/ai-router/provider-registry'

const catalog = {
  data: [
    {
      id: 'deepseek/deepseek-v4-flash:free',
      name: 'DeepSeek V4 Flash',
      context_length: 1_000_000,
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'gemma-4-31b-it:free',
      name: 'Gemma 4 31B IT',
      context_length: 262_144,
      pricing: { prompt: '0', completion: '0' },
    },
    // Free suffix but upstream now reports a rate — must be refused.
    {
      id: 'sneaky:free',
      name: 'Sneaky',
      context_length: 8_192,
      pricing: { prompt: '0.000001', completion: '0' },
    },
    // Paid lane — never eligible, suffix or not.
    {
      id: 'deepseek/deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      context_length: 1_000_000,
      pricing: { prompt: '0.0000009', completion: '0.000002' },
    },
    // No pricing evidence at all — suffix alone is upstream's $0 contract.
    {
      id: 'ling-3.1-flash:free',
      name: 'Ling 3.1 Flash',
      context_length: 262_144,
    },
  ],
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

// ─── The free gate ───────────────────────────────────────────────────────────

describe('UnoRouter free-lane gate', () => {
  it('requires the :free suffix — a paid lane is never eligible', () => {
    expect(hasFreeModelIdSuffix('deepseek-v4-flash:free')).toBe(true)
    expect(hasFreeModelIdSuffix('deepseek/deepseek-v4-pro')).toBe(false)
    expect(hasFreeModelIdSuffix(':free ')).toBe(true)
    expect(hasFreeModelIdSuffix('')).toBe(false)
    expect(hasFreeModelIdSuffix(undefined)).toBe(false)

    expect(isUnoRouterFreeModel({ id: 'deepseek/deepseek-v4-pro', pricing: { prompt: '0', completion: '0' } })).toBe(false)
    expect(isUnoRouterFreeModel({ id: 'deepseek-v4-flash:free', pricing: { prompt: '0', completion: '0' } })).toBe(true)
  })

  it('refuses a :free row whose pricing contradicts the suffix', () => {
    expect(isUnoRouterFreeModel({ id: 'x:free', pricing: { prompt: '0.000001', completion: '0' } })).toBe(false)
    expect(isUnoRouterFreeModel({ id: 'x:free', pricing: { prompt: '0', completion: '0.000002' } })).toBe(false)
    // Suffix plus missing pricing: the suffix is the authoritative marker.
    expect(isUnoRouterFreeModel({ id: 'x:free' })).toBe(true)
    // …but a row with a cost object must still clear the zero gate.
    expect(isUnoRouterFreeModel({ id: 'x:free', cost: { input: '0', output: '0' } })).toBe(true)
    expect(hasExplicitZeroPricing({ id: 'x:free' })).toBe(false)
    expect(isUnoRouterFreeModel(null)).toBe(false)
  })
})

// ─── Discovery ───────────────────────────────────────────────────────────────

describe('UnoRouterProvider discovery', () => {
  it('advertises only free (:free) lanes at $0', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(catalog))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new UnoRouterProvider({ apiKey: 'test-unorouter-key' })
    const models = await provider.listModels()

    expect(provider.name).toBe('unorouter-free')
    expect(provider.freeOnly).toBe(true)
    expect(models.map((m) => m.id).sort()).toEqual([
      'deepseek/deepseek-v4-flash:free',
      'gemma-4-31b-it:free',
      'ling-3.1-flash:free',
    ])
    expect(models.every((m) => m.costPerMillionTokens === 0)).toBe(true)
    expect(models.every((m) => hasFreeModelIdSuffix(m.id))).toBe(true)
  })

  it('initializes against the fixed api.unorouter.com endpoint and refuses when no free lane survives', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'paid/only', pricing: { prompt: '1', completion: '1' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new UnoRouterProvider({ apiKey: 'test-unorouter-key' })
    await expect(provider.initialize()).rejects.toThrow(/no free \(:free\) models/)
    expect(fetchMock.mock.calls[0][0]).toBe(`${UNOROUTER_ENDPOINT}/models`)
    expect(UNOROUTER_ENDPOINT).toBe('https://api.unorouter.com/v1')
  })

  it('requires a key but never leaks one in errors', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const provider = new UnoRouterProvider({ apiKey: '' })
    await expect(provider.initialize()).rejects.toThrow(/UNOROUTER_API_KEY|unorouter\.com/)
  })
})

// ─── Request guard ───────────────────────────────────────────────────────────

describe('UnoRouterProvider request guard', () => {
  it('refuses a non-:free model id before any completion call is made', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(catalog))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new UnoRouterProvider({ apiKey: 'test-unorouter-key' })
    await provider.initialize()
    const callsBefore = fetchMock.mock.calls.length

    await expect(
      provider.chatCompletion({ model: 'deepseek/deepseek-v4-pro', messages: [{ role: 'user', content: 'pay' }] }),
    ).rejects.toThrow(/free models only.*:free/s)
    // No /chat/completions call happened — the guard refuses on the id alone.
    expect(fetchMock.mock.calls.length).toBe(callsBefore)
    expect(fetchMock.mock.calls.every((c) => String(c[0]).endsWith('/models'))).toBe(true)
  })

  it('rechecks the live catalog before chat and refuses a lane that stopped being free', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(catalog)) // initialize → health
      .mockResolvedValueOnce(jsonResponse(catalog)) // initialize → discovery
      .mockResolvedValueOnce(jsonResponse(catalog)) // chat 1 → guard re-check
      .mockResolvedValueOnce(jsonResponse({ id: 'x', model: 'deepseek/deepseek-v4-flash:free', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...catalog.data[0], pricing: { prompt: '0.000001', completion: '0' } }] })) // chat 2 → now paid
    vi.stubGlobal('fetch', fetchMock)

    const provider = new UnoRouterProvider({ apiKey: 'test-unorouter-key' })
    await provider.initialize()

    const ok = await provider.chatCompletion({
      model: 'deepseek/deepseek-v4-flash:free',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(ok.content).toBe('ok')

    await expect(
      provider.chatCompletion({ model: 'deepseek/deepseek-v4-flash:free', messages: [{ role: 'user', content: 'again' }] }),
    ).rejects.toThrow(/no longer confirms this lane as free/)
  })

  it('clamps max_tokens to the free-lane output cap of 8K', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(catalog)) // initialize → health
      .mockResolvedValueOnce(jsonResponse(catalog)) // initialize → discovery
      .mockResolvedValueOnce(jsonResponse(catalog)) // chat → guard re-check
      .mockResolvedValueOnce(jsonResponse({ id: 'x', model: 'gemma-4-31b-it:free', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new UnoRouterProvider({ apiKey: 'test-unorouter-key' })
    await provider.initialize()
    await provider.chatCompletion({
      model: 'gemma-4-31b-it:free',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100_000,
    })

    const chatCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/chat/completions'))
    const body = JSON.parse(chatCall![1].body as string)
    expect(body.max_tokens).toBe(UNOROUTER_FREE_MAX_OUTPUT_TOKENS)
    expect(UNOROUTER_FREE_MAX_OUTPUT_TOKENS).toBe(8_192)
    expect(body.model).toBe('gemma-4-31b-it:free')
  })
})

// ─── Catalog + registry wiring ───────────────────────────────────────────────

describe('UnoRouter catalogue and registry wiring', () => {
  it('is registered as a configurable kind with the official endpoint preset', () => {
    expect(CONFIGURABLE_PROVIDER_KINDS).toContain('unorouter-free')
    const preset = providerPreset('unorouter-free')!
    expect(preset.defaultBaseUrl).toBe('https://api.unorouter.com/v1')
    expect(defaultProviderBaseUrl('unorouter-free')).toBe('https://api.unorouter.com/v1')
    expect(preset.apiKeyRequired).toBe(true)
    expect(preset.local).toBe(false)
    expect(preset.documentationHosts).toContain('unorouter.com')
    expect(preset.docsUrl).toContain('unorouter.com')
  })

  it('builds a free-only provider from a config row with a scoped router identity', () => {
    const record: ProviderConfigRecord = {
      id: 'cfg-1',
      companyId: 'co-1',
      provider: 'unorouter-free',
      name: 'UnoRouter Free',
      baseUrl: null,
      encryptedApiKey: null,
      keyFingerprint: null,
      models: '',
      isEnabled: true,
      isLocal: false,
      fallbackEligible: true,
      priority: 10,
      timeoutMs: 30_000,
      maxRetries: 2,
      lastHealthStatus: null,
      lastHealthAt: null,
      lastHealthLatencyMs: null,
      lastError: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }
    expect(routerNameForConfig(record)).toBe('unorouter-free:co-1.UnoRouter Free')
    const provider = buildProviderFromConfig(record)
    expect(provider).toBeInstanceOf(UnoRouterProvider)
    expect(provider.freeOnly).toBe(true)
    expect(provider.name).toBe('unorouter-free:co-1.UnoRouter Free')

    const view = describeProviderConfig(record)
    expect(view.freeOnly).toBe(true)
    expect(view.routerName).toBe('unorouter-free:co-1.UnoRouter Free')
  })
})
