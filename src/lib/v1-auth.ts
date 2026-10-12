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

export interface V1Identity {
  kind: 'session' | 'apiKey';
  userId: string;
  role: string;
  email: string;
  name: string;
  companyId: string;
  scopes: string[];
  keyId?: string;
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

  // Resolve company: explicit slug/id not available on raw tokens, so use the
  // user's first membership (v1 session identity is single-tenant by design).
  const membership = await db.companyUser.findFirst({
    where: { userId: user.id },
    select: { companyId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!membership) return null;

  return {
    kind: 'session',
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    companyId: membership.companyId,
    scopes: ['*'],
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
    select: { id: true, status: true },
  });
  if (!company || company.status !== 'active') return null;

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
  };
}

/**
 * Authenticate a v1 request. Returns the identity or null.
 * Checks X-API-Key first, then Authorization Bearer (API key or session token).
 */
export async function authenticateV1(request: NextRequest): Promise<V1Identity | null> {
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader) {
    // Explicit but invalid API key is a hard denial, not a fallback to a
    // potentially unrelated bearer token in the same request.
    return identityFromApiKey(apiKeyHeader.trim());
  }

  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
  if (!bearer) return null;

  // API keys start with "alo_"
  if (bearer.startsWith('alo_')) {
    const identity = await identityFromApiKey(bearer);
    if (identity) return identity;
  }

  // Fall back to a session token
  return identityFromSession(bearer);
}

export async function requireV1(request: NextRequest): Promise<V1Identity> {
  const identity = await authenticateV1(request);
  if (!identity) throw new Error('Unauthorized');
  return identity;
}

/** Scope check: '*' or explicit scope match. */
export function hasScope(identity: V1Identity, scope: string): boolean {
  return identity.scopes.includes('*') || identity.scopes.includes(scope);
}
