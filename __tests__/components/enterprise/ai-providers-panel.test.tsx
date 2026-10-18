import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ fetchApi: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchApi: mocks.fetchApi }))

import AIProvidersPanel from '@/components/enterprise/panels/ai-providers'

const provider = {
  id: 'provider-1',
  companyId: 'company-1',
  provider: 'openrouter-free',
  name: 'OpenRouter Free',
  baseUrl: null,
  hasApiKey: true,
  freeOnly: true,
  isEnabled: true,
  lastHealthStatus: null,
  lastHealthAt: null,
  lastError: null,
  models: [],
}

describe('AIProvidersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the strict zero-pricing rule and free-provider empty state', async () => {
    mocks.fetchApi.mockResolvedValue({ configs: [], runtime: [] })
    render(<AIProvidersPanel />)

    expect(await screen.findByText('No free-only provider connected')).toBeInTheDocument()
    expect(screen.getByText(/explicitly report zero input and output prices/)).toBeInTheDocument()
    expect(screen.getByText((_, element) =>
      element?.tagName === 'P' && Boolean(element.textContent?.includes('trial credits')),
    )).toBeInTheDocument()
  })

  it('saves the API key through the encrypted provider API and discovers free models', async () => {
    const user = userEvent.setup()
    mocks.fetchApi
      .mockResolvedValueOnce({ configs: [], runtime: [] })
      .mockResolvedValueOnce(provider)
      .mockResolvedValueOnce({
        id: provider.id,
        status: 'healthy',
        models: ['meta/llama-free:free'],
        testedAt: '2026-10-18T12:00:00.000Z',
      })
      .mockResolvedValueOnce({ configs: [provider], runtime: [] })

    render(<AIProvidersPanel />)
    await user.click(await screen.findByRole('button', { name: /add provider/i }))
    expect(await screen.findByRole('heading', { name: 'Connect a free-model provider' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('API key'), 'sk-test-provider-key-123456')
    await user.click(screen.getByRole('button', { name: /save and discover \$0 models/i }))

    await waitFor(() => expect(mocks.fetchApi).toHaveBeenCalledTimes(4))
    expect(mocks.fetchApi).toHaveBeenNthCalledWith(2, '/api/v1/providers', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        provider: 'openrouter-free',
        name: 'OpenRouter Free',
        apiKey: 'sk-test-provider-key-123456',
        isEnabled: true,
        priority: 100,
      }),
    }))
    expect(mocks.fetchApi).toHaveBeenNthCalledWith(3, '/api/v1/providers/provider-1/test', { method: 'POST' })
    expect(await screen.findByText('meta/llama-free:free')).toBeInTheDocument()
    expect(screen.getByText('1 verified free model')).toBeInTheDocument()
  })
})
