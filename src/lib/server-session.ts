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
}

/**
 * Resolve the signed-in user from the session cookie.
 * Returns `null` for a missing, malformed, expired or revoked session, or for a
 * user that has since been deactivated.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await verifySessionToken(token)
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }
}

/**
 * Require a session inside a server component. Redirects to `/login` (carrying
 * the originally requested path) when there is none. Use this in any private
 * page layout; it throws via `redirect`, so the return value is always a real
 * session.
 */
export async function requireServerSession(returnTo?: string): Promise<ServerSession> {
  const session = await getServerSession()
  if (!session) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login'
    redirect(target)
  }
  return session
}
