/**
 * POST /api/v1/platform/workspaces/ensure
 *
 * Create the caller's first workspace if they have none.
 *
 * Registration normally provisions a workspace, so this exists for the cases
 * where that did not happen: an account seeded by an operator, an account
 * created before the platform existed, or a provisioning step that failed
 * (registration deliberately does not fail a signup if provisioning fails).
 *
 * Idempotent: if the caller already has a workspace the existing one is
 * returned and nothing is created.
 */

import { db } from '@/lib/db';
import { platformRoute, json, forbidden } from '@/lib/platform/http';
import { provisionDefaultWorkspace } from '@/lib/platform/workspaces';

export const POST = platformRoute({ allowCompanyScope: true }, async ({ principal, requestId }) => {
  if (principal.kind !== 'session') {
    throw forbidden('A workspace can only be created by a signed-in user, not by an API key');
  }
  if (!principal.companyId) {
    throw forbidden('Your account must belong to an active company before creating a workspace');
  }

  const user = await db.user.findUnique({
    where: { id: principal.userId },
    select: { id: true, name: true },
  });
  if (!user) throw forbidden('Account not found');

  const existing = await db.aiWorkspace.findFirst({
    where: { ownerId: user.id, companyId: principal.companyId },
    select: { id: true },
  });
  if (existing) {
    return json({ created: false, workspaceId: existing.id }, requestId);
  }

  // Mint a key here: the response is the only chance to show its plaintext, and
  // an operator who just created a workspace needs one to test the API.
  const provisioned = await provisionDefaultWorkspace(user.id, user.name, {
    withApiKey: true,
    companyId: principal.companyId,
  });

  return json({
    created: true,
    workspaceId: provisioned.workspaceId,
    projectId: provisioned.projectId,
    ...(provisioned.apiKey.plaintext
      ? {
          apiKey: provisioned.apiKey.plaintext,
          warning: 'Store this key now. It is hashed on the server and cannot be shown again.',
        }
      : {}),
  }, requestId, 201);
});
