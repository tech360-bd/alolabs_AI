/**
 * /api/v1/platform/workspaces
 *
 * GET  workspaces the caller owns or is a member of
 * POST create an additional workspace
 *
 * `POST` is how a user gets a second (team) workspace without an administrator.
 * Creating one also creates its first project so the workspace is immediately
 * usable; no key is minted — the user is expected to create one with the scopes
 * they actually need.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json } from '@/lib/platform/http';
import { createProject, slugify } from '@/lib/platform/workspaces';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(['personal', 'team', 'organisation']).default('team'),
});

export const GET = platformRoute({}, async ({ principal, requestId }) => {
  const memberships = await db.aiWorkspaceMember.findMany({
    where: { userId: principal.userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true, kind: true, plan: true, createdAt: true } },
    },
  });
  // A workspace created before membership rows existed still has an owner.
  const owned = await db.aiWorkspace.findMany({
    where: { ownerId: principal.userId },
    select: { id: true, name: true, slug: true, kind: true, plan: true, createdAt: true },
  });
  const byId = new Map<string, { id: string; name: string; slug: string; kind: string; plan: string; createdAt: Date; role: string }>();
  for (const membership of memberships) {
    byId.set(membership.workspace.id, { ...membership.workspace, role: membership.role });
  }
  for (const workspace of owned) {
    if (!byId.has(workspace.id)) byId.set(workspace.id, { ...workspace, role: 'owner' });
  }

  return json({
    workspaces: [...byId.values()].map((w) => ({ ...w, current: w.id === principal.workspaceId })),
  }, requestId);
});

export const POST = platformRoute({ body: createSchema }, async ({ principal, body, requestId }) => {
  const base = slugify(body.name);
  let slug = base;
  for (let attempt = 0; attempt < 10; attempt++) {
    const taken = await db.aiWorkspace.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const workspace = await db.aiWorkspace.create({
    data: {
      name: body.name.slice(0, 120),
      slug,
      kind: body.kind,
      ownerId: principal.userId,
      members: { create: { userId: principal.userId, role: 'owner' } },
    },
    select: { id: true, name: true, slug: true, kind: true, createdAt: true },
  });
  const project = await createProject(workspace.id, principal.userId, 'Default project');
  return json({ workspace, project }, requestId, 201);
});
