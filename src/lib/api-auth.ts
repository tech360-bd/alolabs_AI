import type { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { db } from './db'
import { verifySessionToken } from './auth'
import { isInternalRole } from './access/surfaces'

/** Compatibility cookie containing the JWT mirrored for server-rendered pages. */
const SESSION_COOKIE = 'session-token'

export interface AuthenticatedUser {
  userId: string
  role: string
  email: string
  name: string
  companyId?: string
  companyRole?: string
}

export async function getAuthUser(request?: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const headersList = request ? request.headers : await headers()
    const authHeader = headersList.get('authorization')
    let token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''

    // SSR compatibility fallback. Browser API clients use the Bearer token from
    // localStorage; the mirrored httpOnly cookie only supports server-rendered
    // page gates and older same-origin callers during the migration.
    if (!token) {
      if (request) {
        token = request.cookies?.get(SESSION_COOKIE)?.value ?? ''
      } else {
        const cookieStore = await cookies()
        token = cookieStore.get(SESSION_COOKIE)?.value ?? ''
      }
    }
    if (!token) return null

    // Single source of truth for session validity (existence, expiry, idle timeout).
    const session = await verifySessionToken(token)
    if (!session) return null
    const sessionUserId = session.userId

    const user = await db.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    })
    if (!user || !user.isActive) return null
    // `getAuthUser` and everything built on it (`requireAuth`, `requireRole`,
    // `requireCompany*`, `secureRoute`) serve the INTERNAL surface only.
    // `verifySessionToken` above already refuses client sessions; this second
    // check keeps the guarantee even if that default is ever changed.
    if (!isInternalRole(user.role)) return null

    const memberships = await db.companyUser.findMany({
      where: { userId: user.id },
      select: { companyId: true, role: true },
    })
    const requestedCompanyId = headersList.get('x-company-id') ?? undefined
    const requestedCompanySlug = headersList.get('x-company-slug') ?? undefined
    let companyId: string | undefined

    if (requestedCompanyId) {
      const isMember = memberships.some((membership) => membership.companyId === requestedCompanyId)
      if (!isMember && user.role !== 'super_admin') return null
      const selectedCompany = await db.company.findUnique({ where: { id: requestedCompanyId }, select: { id: true } })
      if (!selectedCompany) return null
      companyId = requestedCompanyId
    } else if (requestedCompanySlug) {
      const selectedCompany = await db.company.findUnique({
        where: { slug: requestedCompanySlug },
        select: { id: true },
      })
      const isMember = selectedCompany && memberships.some((membership) => membership.companyId === selectedCompany.id)
      if (!selectedCompany || (!isMember && user.role !== 'super_admin')) return null
      companyId = selectedCompany.id
    } else if (memberships.length === 1) {
      companyId = memberships[0].companyId
    }

    const selectedMembership = companyId
      ? memberships.find((membership) => membership.companyId === companyId)
      : undefined

    return {
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      ...(companyId ? { companyId } : {}),
      ...(selectedMembership ? { companyRole: selectedMembership.role } : {}),
    }
  } catch {
    return null
  }
}

export async function requireAuth(request?: NextRequest): Promise<AuthenticatedUser> {
  const user = await getAuthUser(request)
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireCompanyAuth(): Promise<AuthenticatedUser & { companyId: string }> {
  const user = await requireAuth()
  const companyId = user.companyId
  if (!companyId) throw new Error('Forbidden')
  return { ...user, companyId }
}

export async function requireCompanyRole(...roles: string[]): Promise<AuthenticatedUser & { companyId: string; companyRole: string }> {
  const user = await requireCompanyAuth()
  const companyRole = user.companyRole
  if (!companyRole || !roles.includes(companyRole)) throw new Error('Forbidden')
  return { ...user, companyRole }
}

export function canManageCompany(user: Pick<AuthenticatedUser, 'role' | 'companyRole'>): boolean {
  return user.role === 'super_admin' || user.companyRole === 'owner' || user.companyRole === 'admin'
}

export async function requireCompanyAdmin(): Promise<AuthenticatedUser & { companyId: string }> {
  const user = await requireCompanyAuth()
  if (!canManageCompany(user)) throw new Error('Forbidden')
  return user
}

export async function requireRole(...roles: string[]): Promise<AuthenticatedUser> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) throw new Error('Forbidden')
  return user
}
