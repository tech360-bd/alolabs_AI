import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  verify: vi.fn(),
  findUser: vi.fn(),
  violation: vi.fn(async () => undefined),
  redirect: vi.fn((target: string): never => { throw new Error(`redirect:${target}`) }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => mocks.cookie ? { value: mocks.cookie } : undefined }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/auth', () => ({ verifySessionToken: mocks.verify }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: mocks.findUser } } }))
vi.mock('@/lib/access/audit', () => ({ recordAccessViolation: mocks.violation }))

import { getServerSession, homeForAudience, requireClientServerSession, requireServerSession } from '@/lib/server-session'

const staff = { id: 'u1', email: 'x@example.test', name: 'Example', role: 'admin', isActive: true }
const client = { id: 'c1', email: 'c@example.test', name: 'Client', role: 'client', isActive: true }

describe('private page session gate', () => {
  beforeEach(() => { mocks.cookie = undefined; mocks.verify.mockReset(); mocks.findUser.mockReset(); mocks.violation.mockClear() })
  it('redirects a visitor without a session before user lookup', async () => {
    await expect(requireServerSession('/dashboard')).rejects.toThrow('redirect:/login?next=%2Fdashboard')
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('rejects forged, expired, or revoked sessions returned as invalid', async () => {
    mocks.cookie = 'forged'; mocks.verify.mockResolvedValue(null)
    await expect(requireServerSession('/dashboard')).rejects.toThrow('redirect:/login?next=%2Fdashboard')
    expect(mocks.findUser).not.toHaveBeenCalled()
  })
  it('rejects a deactivated user and accepts only an active user', async () => {
    mocks.cookie = 'live'; mocks.verify.mockResolvedValue({ userId: 'u1', audience: 'internal', role: 'admin' })
    mocks.findUser.mockResolvedValue({ ...staff, isActive: false })
    expect(await getServerSession()).toBeNull()
    mocks.findUser.mockResolvedValue(staff)
    const session = await getServerSession()
    expect(session?.user.id).toBe('u1')
    expect(session?.audience).toBe('internal')
  })
})

describe('surface separation at the page gate', () => {
  beforeEach(() => { mocks.cookie = 'live'; mocks.verify.mockReset(); mocks.findUser.mockReset(); mocks.violation.mockClear() })

  it('sends each audience to its own home', () => {
    expect(homeForAudience('client')).toBe('/portal')
    expect(homeForAudience('internal')).toBe('/dashboard')
  })

  it('never renders an internal page for a client session, and records the attempt', async () => {
    mocks.verify.mockResolvedValue({ userId: 'c1', audience: 'client', role: 'client' })
    mocks.findUser.mockResolvedValue(client)
    await expect(requireServerSession('/dashboard')).rejects.toThrow('redirect:/portal')
    expect(mocks.violation).toHaveBeenCalledWith(expect.objectContaining({ type: 'client_to_internal_denied', userId: 'c1' }))
  })

  it('trusts the stored role over the session: a mismatch is no session at all', async () => {
    // Even if the session layer were to report "internal", a role outside the
    // internal allow-list does not get an internal page.
    mocks.verify.mockResolvedValue({ userId: 'c1', audience: 'internal', role: 'viewer' })
    mocks.findUser.mockResolvedValue({ ...client, role: 'viewer' })
    expect(await getServerSession()).toBeNull()
    await expect(requireServerSession('/dashboard')).rejects.toThrow('redirect:/login?next=%2Fdashboard')
  })

  it('admits a client to the portal and keeps staff out of it', async () => {
    mocks.verify.mockResolvedValue({ userId: 'c1', audience: 'client', role: 'client' })
    mocks.findUser.mockResolvedValue(client)
    expect((await requireClientServerSession('/portal')).user.id).toBe('c1')

    mocks.verify.mockResolvedValue({ userId: 'u1', audience: 'internal', role: 'admin' })
    mocks.findUser.mockResolvedValue(staff)
    await expect(requireClientServerSession('/portal')).rejects.toThrow('redirect:/dashboard')
  })

  it('redirects an anonymous visitor of the portal to sign in', async () => {
    mocks.cookie = undefined
    await expect(requireClientServerSession('/portal')).rejects.toThrow('redirect:/login?next=%2Fportal')
  })
})
