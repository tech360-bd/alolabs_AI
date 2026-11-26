/**
 * GET /api/v1/platform/me
 *
 * Who am I, what workspace am I in, what may I do, and what is my remaining
 * quota. The web client calls this once on load; it intentionally does the
 * minimum work and returns no cross-tenant data.
 */

import { db } from '@/lib/db';
import { platformRoute, json } from '@/lib/platform/http';
import { workspaceSummary } from '@/lib/platform/workspaces';
import { canAdministerWorkspace } from '@/lib/platform/principal';
import { anyProviderConfigured } from '@/lib/platform/providers';

export const GET = platformRoute({}, async ({ principal, requestId }) => {
  const [workspace, user, summary] = await Promise.all([
    db.aiWorkspace.findUnique({
      where: { id: principal.workspaceId },
      select: { id: true, name: true, slug: true, kind: true, plan: true, createdAt: true, ownerId: true },
    }),
    db.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    workspaceSummary(principal.workspaceId),
  ]);

  return json({
    principal: {
      kind: principal.kind,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId: principal.projectId ?? null,
      apiKeyId: principal.apiKeyId ?? null,
      scopes: principal.scopes,
      rateLimitPerMinute: principal.rateLimitPerMinute,
    },
    user,
    workspace,
    permissions: {
      canAdministerWorkspace: await canAdministerWorkspace(principal, principal.workspaceId),
      canCreateKeys: principal.kind === 'session',
      canManageProviders: user?.role === 'admin' || user?.role === 'super_admin',
    },
    summary,
    // Honest capability reporting: whether any inference backend exists at all.
    inference: { anyProviderConfigured: anyProviderConfigured() },
  }, requestId);
});
