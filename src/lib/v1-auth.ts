/**
 * ALO Labs AgentOS — Versioned API (v1) authentication
 *
 * The /api/v1 surface accepts two credential kinds:
 *  1. Session bearer tokens (Authorization: Bearer <session-token>) — the same
 *     sessions the web Command Center uses.
 *  2. Company API keys (X-API-Key: alo_... or Authorization: Bearer alo_...)
 *     — sha256-hashed at rest, scoped, expirable, with prefix/suffix display.
 *
 * API keys resolve to a company context; every v1 response is tenant-scoped.
 */

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { isInternalRole } from '@/lib/access/surfaces';
import { recordAccessViolation } from '@/lib/access/audit';

export interface V1Identity {
  kind: 'session' | 'apiKey';
  userId: string;
  role: string;
  companyRole?: string;
  email: string;
  name: string;
  companyId: string;
  scopes: string[];
  keyId?: string;
  /**
   * Which surface the credential belongs to. Sessions are always `internal`
   * here. An API key inherits it from its company: a key issued to a client
   * company is confined to the public service plane (`/api/v1/ai/**`).
   */
  audience: 'internal' | 'client';
}

export interface AuthenticateV1Options {
  /**
   * Accept API keys that belong to client companies. Only the sanitised public
   * service plane sets this; everywhere else such a key is refused.
   */
  allowClientKeys?: boolean;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function identityFromSession(token: string): Promise<V1Identity | null> {
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  // Session access to /api/v1 is an internal-surface capability. Clients use
  // the portal route group; their sessions are already refused by
  // verifySessionToken above and this keeps the rule local and explicit.
  if (!isInternalRole(user.role)) return null;

  // Resolve company: explicit slug/id not available on raw tokens, so use the
  // user's first membership (v1 session identity is single-tenant by design).
  const membership = await db.companyUser.findFirst({
    where: { userId: user.id },
    select: { companyId: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!membership) return null;

  return {
    kind: 'session',
    userId: user.id,
    role: user.role,
    companyRole: membership.role,
    email: user.email,
    name: user.name,
    companyId: membership.companyId,
    scopes: ['*'],
    audience: 'internal',
  };
}

async function identityFromApiKey(plainKey: string): Promise<V1Identity | null> {
  const keyHash = sha256(plainKey);
  const apiKey = await db.companyApiKey.findUnique({
    where: { keyHash },
    select: {
      id: true, companyId: true, name: true, scopes: true, isActive: true,
      expiresAt: true, keyType: true, rateLimit: true,
    },
  });
  if (!apiKey || !apiKey.isActive) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  const company = await db.company.findUnique({
    where: { id: apiKey.companyId },
    select: { id: true, status: true, accountType: true },
  });
  if (!company || company.status !== 'active') return null;
  // Only a company explicitly classified as internal may drive the AgentOS
  // control plane with a key. Anything else — a client, or a tenant nobody has
  // classified — is a client.
  const audience: V1Identity['audience'] = company.accountType === 'internal' ? 'internal' : 'client';

  // Fail closed: malformed/empty scope configuration must NEVER grant '*'.
  let scopes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(apiKey.scopes || '[]');
    if (Array.isArray(parsed)) scopes = parsed.filter((s): s is string => typeof s === 'string');
  } catch { /* no permissions */ }

  // Record last use (best-effort)
  db.companyApiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    kind: 'apiKey',
    userId: `apikey:${apiKey.id}`,
    role: 'api',
    email: `apikey@${company.id}.alolabs.net`,
    name: apiKey.name,
    companyId: apiKey.companyId,
    scopes,
    keyId: apiKey.id,
    audience,
  };
}

/**
 * Authenticate a v1 request. Returns the identity or null.
 * Checks X-API-Key first, then Authorization Bearer (API key or session token).
 */
export async function authenticateV1(
  request: NextRequest,
  options: AuthenticateV1Options = {},
): Promise<V1Identity | null> {
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader) {
    // Explicit but invalid API key is a hard denial, not a fallback to a
    // potentially unrelated bearer token in the same request.
    return confineClientKey(await identityFromApiKey(apiKeyHeader.trim()), request, options);
  }

  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
  if (!bearer) return null;

  // API keys start with "alo_"
  if (bearer.startsWith('alo_')) {
    const identity = await identityFromApiKey(bearer);
    if (identity) return confineClientKey(identity, request, options);
  }

  // Fall back to a session token
  return identityFromSession(bearer);
}

/**
 * A client company's API key is valid for the public service plane and nothing
 * else. Everywhere else it is treated as no credential at all, and the attempt
 * is recorded.
 */
async function confineClientKey(
  identity: V1Identity | null,
  request: NextRequest,
  options: AuthenticateV1Options,
): Promise<V1Identity | null> {
  if (!identity || identity.audience !== 'client' || options.allowClientKeys) return identity;
  await recordAccessViolation({
    type: 'client_key_to_internal_denied',
    companyId: identity.companyId,
    role: identity.role,
    resource: 'api-key',
    path: request.nextUrl?.pathname ?? null,
    method: request.method,
    reason: 'client company API key used outside the public service plane',
    details: { keyId: identity.keyId ?? null },
  });
  return null;
}

export async function requireV1(request: NextRequest, options: AuthenticateV1Options = {}): Promise<V1Identity> {
  const identity = await authenticateV1(request, options);
  if (!identity) throw new Error('Unauthorized');
  return identity;
}

/** Scope check: '*' or explicit scope match. */
export function hasScope(identity: V1Identity, scope: string): boolean {
  return identity.scopes.includes('*') || identity.scopes.includes(scope);
}
