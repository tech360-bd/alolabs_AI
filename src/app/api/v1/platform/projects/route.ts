/**
 * /api/v1/platform/projects
 *
 * GET  list projects in the caller's workspace
 * POST create a project
 *
 * A project is the unit of API-key scoping and usage attribution. It is not a
 * security boundary by itself — the workspace is — so listing only ever filters
 * by the principal's workspace id.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json } from '@/lib/platform/http';
import { createProject } from '@/lib/platform/workspaces';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export const GET = platformRoute({ scope: 'models:read' }, async ({ principal, requestId }) => {
  const projects = await db.aiProject.findMany({
    where: { workspaceId: principal.workspaceId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, slug: true, description: true, createdAt: true, updatedAt: true,
      _count: { select: { apiKeys: true, conversations: true, files: true } },
    },
  });
  return json({
    projects: projects.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, description: p.description,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
      counts: { apiKeys: p._count.apiKeys, conversations: p._count.conversations, files: p._count.files },
    })),
  }, requestId);
});

export const POST = platformRoute({ scope: 'models:read', body: createSchema }, async ({ principal, body, requestId }) => {
  const project = await createProject(principal.workspaceId, principal.userId, body.name, body.description ?? '');
  return json({ project }, requestId, 201);
});
