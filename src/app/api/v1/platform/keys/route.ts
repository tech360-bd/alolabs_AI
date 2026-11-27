/**
 * /api/v1/platform/keys
 *
 * GET  list keys for the workspace (never returns a hash or a plaintext key)
 * POST create a key — plaintext returned exactly once, in this response
 *
 * PATCH/DELETE per-key operations live in ./[keyId]/route.ts.
 *
 * SECURITY
 * --------
 * The list projection is explicit: it selects `keyPrefix`/`keySuffix` and never
 * `keyHash`, so a future `include:` cannot accidentally leak the verifier.
 * Only the workspace owner/admin may mint keys, because a key is a durable
 * credential for the whole workspace.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json, forbidden, PlatformError } from '@/lib/platform/http';
import { createApiKey } from '@/lib/platform/workspaces';
import { canAdministerWorkspace } from '@/lib/platform/principal';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  projectId: z.string().min(1).max(64).optional(),
  scopes: z.array(z.string().max(40)).max(20).optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  rateLimit: z.number().int().min(1).max(10_000).optional(),
});

export const GET = platformRoute({ scope: 'usage:read' }, async ({ principal, requestId }) => {
  const keys = await db.aiApiKey.findMany({
    where: { workspaceId: principal.workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, keyPrefix: true, keySuffix: true, scopes: true,
      projectId: true, isActive: true, revokedAt: true, expiresAt: true,
      lastUsedAt: true, rateLimit: true, createdAt: true, rotatedFrom: true,
    },
  });
  return json({
    keys: keys.map((key) => ({
      ...key,
      scopes: safeScopes(key.scopes),
      // The only time a caller needs to know it is masked is here.
      maskedKey: `${key.keyPrefix}${'•'.repeat(12)}${key.keySuffix}`,
      status: key.revokedAt ? 'revoked' : key.expiresAt && key.expiresAt < new Date() ? 'expired' : key.isActive ? 'active' : 'inactive',
    })),
  }, requestId);
});

export const POST = platformRoute({ scope: 'usage:read', body: createSchema }, async ({ principal, body, requestId }) => {
  const canManage = await canAdministerWorkspace(principal);
  if (!canManage) throw forbidden('Only a workspace owner or admin can create API keys');

  if (body.projectId) {
    const project = await db.aiProject.findFirst({
      where: { id: body.projectId, workspaceId: principal.workspaceId },
      select: { id: true },
    });
    if (!project) throw new PlatformError(404, 'not_found', 'Project not found');
  }

  const created = await createApiKey(principal.workspaceId, body.projectId ?? null, principal.userId, {
    name: body.name,
    scopes: body.scopes,
    expiresInDays: body.expiresInDays ?? null,
    rateLimit: body.rateLimit,
  });

  return json({
    key: {
      id: created.id,
      name: body.name,
      keyPrefix: created.keyPrefix,
      keySuffix: created.keySuffix,
      expiresAt: created.expiresAt,
      scopes: body.scopes ?? ['ai:chat', 'models:read', 'usage:read'],
    },
    // Shown once. Not recoverable afterwards.
    plaintext: created.plaintext,
    warning: 'Store this key now. It is hashed on the server and cannot be shown again.',
  }, requestId, 201);
});

function safeScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
