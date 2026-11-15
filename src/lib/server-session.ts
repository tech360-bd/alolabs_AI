/**
 * Server-side session resolution for React Server Components.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard needs to be blocked *before* any HTML is sent. `src/proxy.ts`
 * runs on the edge and can only check that a cookie is present — it cannot
 * reach Prisma to validate the session. This module performs the authoritative
 * check in the Node.js runtime: the `session-token` cookie must correspond to a
 * live, unexpired session row (see `verifySessionToken`) whose user still exists
 * and is active.
 *
 * SURFACES
 * --------
 * A session belongs to exactly one surface (see src/lib/access/surfaces.ts).
 * `requireServerSession` admits ALO Labs personnel to the internal pages and
 * sends a client to the portal; `requireClientServerSession` does the reverse.
 * Neither renders a single byte of the other surface's HTML.
 *
 * The same cookie is set by `POST /api/auth/login` and cleared by
 * `POST /api/auth/logout`, so there is exactly one credential the server trusts
 * for page rendering.
 *
 * This file imports Prisma and must only be used from server components,
 * route handlers, or server actions — never from a client component and never
 * from `src/proxy.ts` (edge runtime).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from './db'
import { verifySessionToken } from './auth'
import { audienceForRole, type Audience } from './access/surfaces'
import { recordAccessViolation } from './access/audit'

/** Name of the httpOnly cookie that carries the opaque session token. */
export const SESSION_COOKIE = 'session-token'

export interface ServerSessionUser {
  id: string
  email: string
  name: string
  role: string
}

export interface ServerSession {
  user: ServerSessionUser
  token: string
  /** The surface this session belongs to. */
  audience: Audience
}

/** Where a signed-in user of each surface lands. */
export function homeForAudience(audience: Audience): string {
  return audience === 'client' ? '/portal' : '/dashboard'
}

/**
 * Resolve the signed-in user from the session cookie, whichever surface they
 * belong to. Returns `null` for a missing, malformed, expired or revoked
 * session, or for a user that has since been deactivated.
 *
 * This only identifies the caller. It grants nothing: pages must use
 * `requireServerSession` / `requireClientServerSession` to admit them.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await verifySessionToken(token, { audience: 'any' })
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null

  // Derived from the role just read, never from the cookie.
  const audience = audienceForRole(user.role)
  if (audience !== session.audience) return null

  return {
    token,
    audience,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }
}

function loginTarget(returnTo?: string): string {
  return returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login'
}

/**
 * Require an INTERNAL session inside a server component. Redirects to `/login`
 * (carrying the originally requested path) when there is none, and to the
 * client portal when the caller is a client. It throws via `redirect`, so the
 * return value is always a real internal session.
 */
export async function requireServerSession(returnTo?: string): Promise<ServerSession> {
  const session = await getServerSession()
  if (!session) redirect(loginTarget(returnTo))
  if (session.audience !== 'internal') {
    await recordAccessViolation({
      type: 'client_to_internal_denied',
      userId: session.user.id,
      role: session.user.role,
      resource: 'page',
      path: returnTo ?? null,
      method: 'GET',
      reason: 'client session requested an internal page',
    })
    redirect(homeForAudience(session.audience))
  }
  return session
}

/**
 * Require a CLIENT session inside a server component — the gate for every
 * `/portal/**` page. ALO Labs personnel are sent to their own workspace: staff
 * manage client work from the internal tools, never by entering the portal.
 */
export async function requireClientServerSession(returnTo?: string): Promise<ServerSession> {
  const session = await getServerSession()
  if (!session) redirect(loginTarget(returnTo))
  if (session.audience !== 'client') redirect(homeForAudience(session.audience))
  return session
}
