// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireCompanyAuth: mocks.auth }))
import { GET } from '@/app/api/enterprise/overview/route'

describe('retired global enterprise overview', () => {
  beforeEach(() => vi.resetAllMocks())

  it('rejects unauthenticated and unscoped requests', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('Unauthorized')).mockRejectedValueOnce(new Error('Forbidden'))
    expect((await GET()).status).toBe(401)
    expect((await GET()).status).toBe(403)
  })

  it('does not return global data to an authenticated tenant', async () => {
    mocks.auth.mockResolvedValue({ companyId: 'tenant-a' })
    const response = await GET()
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: expect.stringContaining('/api/enterprise/stats') })
  })
})
