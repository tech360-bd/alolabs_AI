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
 * Signed JWTs use the same signature, revocation, idle/absolute expiry and
 * audience checks as HTTP. Legacy sockets accept only the hashed storage key.
 */
import { createHash } from 'node:crypto'
import { verifySessionToken } from '../../src/lib/auth'
import { CLIENT_TOKEN_PREFIX, isInternalRole } from '../../src/lib/access/surfaces'
export { CLIENT_TOKEN_PREFIX, INTERNAL_ROLES, isInternalRole } from '../../src/lib/access/surfaces'
export const CROSS_COMPANY_ROLES: readonly string[] = ['super_admin', 'platform_super_admin']

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
export async function verifyInternalSessionToken(db: SessionDb | null, token: unknown, touch = true): Promise<InternalIdentity | null> {
  try {
    if (!db) return null
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null
    if (token.startsWith(CLIENT_TOKEN_PREFIX)) return null

    let userId: string
    if (token.split('.').length === 3) {
      const verified = await verifySessionToken(token, { audience: 'internal', touch })
      if (!verified) return null
      userId = verified.userId
    } else {
      if (!/^[a-f0-9]{96}$/.test(token)) return null
      const key = `session:${createHash('sha256').update(token).digest('hex')}`
      const row = await db.settings.findUnique({ where: { key } })
      if (!row) return null
      const record = JSON.parse(row.value)
      if (typeof record.userId !== 'string' || !record.userId || (record.aud && record.aud !== 'internal')) return null
      const expiry = Date.parse(record.expiresAt)
      if (!Number.isFinite(expiry) || expiry <= Date.now()) return null
      userId = record.userId
    }

    const user = await db.user.findUnique({
      where: { id: userId },
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

export { handshakeToken } from '../../src/lib/realtime/handshake'
