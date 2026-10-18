import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterProvider } from '@/lib/ai-router/openrouter-provider'

const freeCatalog = {
  data: [
    {
      id: 'meta/llama-free:free',
      name: 'Llama Free',
      context_length: 8192,
      pricing: { prompt: '0', completion: '0' },
      architecture: { modality: 'text->text', tokenizer: 'llama', instruct_type: null },
      top_provider: { max_completion_tokens: 4096 },
    },
    {
      id: 'paid/model',
      name: 'Paid Model',
      context_length: 8192,
      pricing: { prompt: '0.000001', completion: '0.000002' },
      architecture: { modality: 'text->text', tokenizer: 'other', instruct_type: null },
      top_provider: { max_completion_tokens: 4096 },
    },
    {
      id: 'partial-free/model',
      name: 'Partial Free Model',
      context_length: 8192,
      pricing: { prompt: '0', completion: '0.000002' },
      architecture: { modality: 'text->text', tokenizer: 'other', instruct_type: null },
      top_provider: { max_completion_tokens: 4096 },
    },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenRouter free-only adapter', () => {
  it('advertises only models with explicit zero input and output prices', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(freeCatalog), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenRouterProvider({
      apiKey: 'test-openrouter-key',
      providerName: 'openrouter-free',
      freeOnly: true,
    })
    const models = await provider.listModels()

    expect(provider.name).toBe('openrouter-free')
    expect(provider.freeOnly).toBe(true)
    expect(models.map((model) => model.id)).toEqual(['meta/llama-free:free'])
    expect(models[0].costPerMillionTokens).toBe(0)
    expect(models[0].provider).toBe('openrouter-free')
  })

  it('rechecks current upstream pricing before chat and refuses newly-paid models', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(freeCatalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(freeCatalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          {
            id: 'meta/llama-free:free',
            name: 'Llama Free',
            context_length: 8192,
            pricing: { prompt: '0.000001', completion: '0.000002' },
            architecture: { modality: 'text->text', tokenizer: 'llama', instruct_type: null },
            top_provider: { max_completion_tokens: 4096 },
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenRouterProvider({
      apiKey: 'test-openrouter-key',
      providerName: 'openrouter-free',
      freeOnly: true,
    })
    // Initialization discovers the initially free model.
    await provider.initialize()
    await expect(provider.chatCompletion({
      model: 'meta/llama-free:free',
      messages: [{ role: 'user', content: 'never call a paid model' }],
    })).rejects.toThrow(/does not confirm \$0 input and output pricing/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
