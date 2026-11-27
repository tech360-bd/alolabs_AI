/**
 * /api/v1/platform/keys/[keyId]
 *
 * DELETE  revoke immediately
 * POST    rotate: revoke this key and issue a replacement with identical scope
 *
 * Both are workspace-scoped at the query level (`workspaceId` is part of the
 * WHERE clause), so an id from another tenant returns 404 rather than 403 —
 * existence itself is tenant data.
 */

import { db } from '@/lib/db';
import { platformRoute, json, forbidden, notFound } from '@/lib/platform/http';
import { revokeApiKey, rotateApiKey } from '@/lib/platform/workspaces';
import { canAdministerWorkspace } from '@/lib/platform/principal';

type Params = { params: Promise<{ keyId: string }> };

async function assertManageable(workspaceId: string, keyId: string) {
  const key = await db.aiApiKey.findFirst({
    where: { id: keyId, workspaceId },
    select: { id: true, name: true },
  });
  if (!key) throw notFound('API key not found');
  return key;
}

export async function DELETE(request: Request, { params }: Params) {
  const { keyId } = await params;
  return platformRoute({ scope: 'usage:read' }, async ({ principal, requestId }) => {
    if (!(await canAdministerWorkspace(principal))) {
      throw forbidden('Only a workspace owner or admin can revoke API keys');
    }
    await assertManageable(principal.workspaceId, keyId);
    const revoked = await revokeApiKey(principal.workspaceId, keyId);
    if (!revoked) throw notFound('API key not found or already revoked');
    return json({ revoked: true, keyId, message: 'This key stops working on its next request.' }, requestId);
  })(request as never);
}

export async function POST(request: Request, { params }: Params) {
  const { keyId } = await params;
  return platformRoute({ scope: 'usage:read' }, async ({ principal, requestId }) => {
    if (!(await canAdministerWorkspace(principal))) {
      throw forbidden('Only a workspace owner or admin can rotate API keys');
    }
    await assertManageable(principal.workspaceId, keyId);
    const rotated = await rotateApiKey(principal.workspaceId, keyId, principal.userId);
    if (!rotated) throw notFound('API key not found or already revoked');
    return json({
      key: { id: rotated.id, keyPrefix: rotated.keyPrefix, keySuffix: rotated.keySuffix, expiresAt: rotated.expiresAt },
      plaintext: rotated.plaintext,
      revokedKeyId: keyId,
      warning: 'The previous key is revoked. Store the new key now; it cannot be shown again.',
    }, requestId, 201);
  })(request as never);
}
