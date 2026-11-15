/**
 * Session verification for the internal socket services.
 *
 * The realtime and queue services carry INTERNAL operational data (agent
 * activity, job queues, dashboards). They are part of the internal surface and
 * admit internal personnel only — the same rule the HTTP API enforces in
 * src/lib/access/surfaces.ts. Client-portal sessions are refused.
 *
 * A token is accepted only if ALL of the following hold:
 *   1. it is not a client-class token (client tokens carry CLIENT_TOKEN_PREFIX);
 *   2. its SHA-256 digest matches a stored, unexpired session record
 *      (the raw token is never a storage key — see src/lib/session-token.ts);
 *   3. the session's owner exists, is active, and holds an internal role.
 *
 * Identity (user, role, company) is read from the database. Nothing is taken
 * from the token's own contents: an earlier revision of the realtime service
 * base64-decoded any three-part string as a "JWT" without checking a
 * signature, which let any caller assert an arbitrary user id and role.
 *
 * This file is deliberately self-contained (no `@/` imports) because the
 * services run standalone. A unit test keeps the constants below identical to
 * src/lib/access/surfaces.ts.
 */

import { createHash } from 'crypto'

/** Mirrors CLIENT_TOKEN_PREFIX in src/lib/access/surfaces.ts. */
export const CLIENT_TOKEN_PREFIX = 'alc_'

/** Mirrors INTERNAL_ROLES in src/lib/access/surfaces.ts. */
export const INTERNAL_ROLES: readonly string[] = [
  'super_admin',
  'admin',
  'platform_super_admin',
  'ai_workforce_admin',
  'ai_model_admin',
  'security_admin',
  'infrastructure_admin',
  'account_manager',
]

/** Roles that may subscribe to any company's room. */
export const CROSS_COMPANY_ROLES: readonly string[] = ['super_admin', 'platform_super_admin']

/** Mirrors OPTIONAL_INTERNAL_ROLES / ALO_INTERNAL_EXTRA_ROLES handling in surfaces.ts. */
function extraInternalRoles(): string[] {
  return (process.env.ALO_INTERNAL_EXTRA_ROLES ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r === 'manager' || r === 'operator')
}

export function isInternalRole(role: unknown): boolean {
  return typeof role === 'string' && (INTERNAL_ROLES.includes(role) || extraInternalRoles().includes(role))
}

export interface InternalIdentity {
  userId: string
  role: string
  companyId?: string
}

/** The subset of a Prisma client this module needs. */
export interface SessionDb {
  settings: { findUnique(args: { where: { key: string } }): Promise<{ value: string } | null> }
  user: { findUnique(args: unknown): Promise<{ id: string; role: string; isActive: boolean } | null> }
  companyUser: { findMany(args: unknown): Promise<{ companyId: string }[]> }
}

/**
 * Verify a session token and return the internal user it belongs to.
 * Fails closed: any doubt — including a database error — is a refusal.
 */
export async function verifyInternalSessionToken(db: SessionDb | null, token: unknown): Promise<InternalIdentity | null> {
  try {
    if (!db) return null
    if (typeof token !== 'string' || token.length < 20 || token.length > 512) return null
    if (token.startsWith(CLIENT_TOKEN_PREFIX)) return null

    const key = `session:${createHash('sha256').update(token).digest('hex')}`
    const row = await db.settings.findUnique({ where: { key } })
    if (!row) return null

    const record = JSON.parse(row.value) as { userId?: string; expiresAt?: string; aud?: string }
    if (!record.userId) return null
    if (record.aud && record.aud !== 'internal') return null
    if (!record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) return null

    const user = await db.user.findUnique({
      where: { id: record.userId },
      select: { id: true, role: true, isActive: true },
    })
    if (!user || !user.isActive || !isInternalRole(user.role)) return null

    // Company scope comes from membership, never from the caller.
    const memberships = await db.companyUser.findMany({
      where: { userId: user.id },
      select: { companyId: true },
      take: 2,
    })
    return {
      userId: user.id,
      role: user.role,
      ...(memberships.length === 1 ? { companyId: memberships[0].companyId } : {}),
    }
  } catch {
    return null
  }
}

/** Pull a bearer token out of a Socket.IO handshake. */
export function handshakeToken(handshake: { auth?: Record<string, unknown>; headers?: Record<string, unknown> }): string {
  const fromAuth = handshake.auth?.token
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth
  const header = handshake.headers?.authorization
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
}
