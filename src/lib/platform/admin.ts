/**
 * Platform administrator authorisation.
 *
 * Two different things are called "admin" in this codebase and conflating them
 * is a privilege-escalation bug:
 *
 *   · a **workspace** admin — owns or administers one tenant's data.
 *   · a **platform** administrator — may see every tenant's topology, change
 *     routing policy, and enable paid providers.
 *
 * A workspace owner is common (every signup creates one); a platform admin is a
 * `super_admin`/`admin` User. Every `/admin/**` route calls `requirePlatformAdmin`
 * before touching anything, and it fails closed.
 */

import { db } from '@/lib/db';
import type { NextRequest } from 'next/server';
import { PlatformError, forbidden, unauthorized } from './http';
import { resolvePrincipal, type PlatformPrincipal } from './principal';

export const PLATFORM_ADMIN_ROLES = ['super_admin', 'admin'] as const;

export interface PlatformAdmin {
  principal: PlatformPrincipal;
  user: { id: string; email: string; name: string; role: string };
}

/**
 * Resolve a platform administrator, or throw.
 *
 * Returns 401 when unauthenticated and 403 when authenticated but not an
 * administrator — never 404, because the caller's own identity is not a secret
 * from the caller.
 */
export async function requirePlatformAdmin(request: NextRequest): Promise<PlatformAdmin> {
  const principal = await resolvePrincipal(request);
  if (!principal) throw unauthorized();

  // An API key is a tenant credential. Even if it were minted by an
  // administrator, it must not confer platform-wide powers: that would let a
  // leaked project key read every workspace's topology.
  if (principal.kind !== 'session') {
    throw forbidden(
      'Platform administration requires a signed-in administrator session, not an API key',
      'Open the Super Admin panel in a browser signed in as an administrator.',
    );
  }

  const user = await db.user.findUnique({
    where: { id: principal.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw unauthorized('Account is disabled');
  if (!PLATFORM_ADMIN_ROLES.includes(user.role as (typeof PLATFORM_ADMIN_ROLES)[number])) {
    throw forbidden(
      `Platform administration requires one of: ${PLATFORM_ADMIN_ROLES.join(', ')}`,
      'Ask an existing administrator to grant the role.',
    );
  }

  return { principal, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

/** Provider configuration as the admin panel needs it — never the secret value. */
export interface ProviderConfigView {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string | null;
  enabled: boolean;
  isLocal: boolean;
  priority: number;
  hasApiKey: boolean;
  keyHint: string | null;
  fallbackEligible: boolean;
  lastHealthStatus: string | null;
  lastHealthAt: string | null;
  lastHealthLatencyMs: number | null;
  createdAt: string;
}

/**
 * Read provider configuration without ever returning a credential.
 *
 * The encrypted key column is deliberately not selected, and `hasApiKey` is
 * derived from its presence in a separate projection — so a future `select *`
 * refactor cannot leak it.
 */
export async function listProviderConfigs(): Promise<ProviderConfigView[]> {
  const rows = await db.aIProviderConfig.findMany({
    orderBy: [{ isLocal: 'desc' }, { priority: 'asc' }],
    select: {
      id: true,
      provider: true,
      name: true,
      baseUrl: true,
      isEnabled: true,
      isLocal: true,
      priority: true,
      fallbackEligible: true,
      lastHealthStatus: true,
      lastHealthAt: true,
      lastHealthLatencyMs: true,
      keyFingerprint: true,
      createdAt: true,
      encryptedApiKey: true,
    },
  }).catch(() => []);

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    displayName: row.name,
    baseUrl: row.baseUrl,
    enabled: row.isEnabled,
    isLocal: row.isLocal,
    priority: row.priority,
    fallbackEligible: row.fallbackEligible,
    lastHealthStatus: row.lastHealthStatus,
    lastHealthAt: row.lastHealthAt ? row.lastHealthAt.toISOString() : null,
    lastHealthLatencyMs: row.lastHealthLatencyMs,
    hasApiKey: Boolean(row.encryptedApiKey),
    // Show the shape of the key, never the key. A fingerprint or the last four
    // characters is enough for an operator to tell which credential is installed.
    keyHint: row.keyFingerprint
      ? `fp:${row.keyFingerprint.slice(0, 8)}`
      : row.encryptedApiKey
        ? '••••••••'
        : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Enable or disable a provider. Local providers cannot be disabled via this path. */
export async function setProviderEnabled(configId: string, enabled: boolean): Promise<{ id: string; enabled: boolean }> {
  const existing = await db.aIProviderConfig.findUnique({
    where: { id: configId },
    select: { id: true, isLocal: true, provider: true },
  });
  if (!existing) throw new PlatformError(404, 'not_found', 'Provider configuration not found');
  if (!enabled && existing.isLocal) {
    throw new PlatformError(
      409, 'conflict',
      'A local provider cannot be disabled: it is the fallback that keeps the platform working without a paid API',
      'Remove the configuration or change its priority instead.',
    );
  }
  const updated = await db.aIProviderConfig.update({
    where: { id: configId },
    data: { isEnabled: enabled },
    select: { id: true, isEnabled: true },
  });
  return { id: updated.id, enabled: updated.isEnabled };
}
