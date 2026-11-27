/**
 * /api/v1/platform/conversations
 *
 * GET  list the caller's conversations in this workspace
 * POST create an empty conversation (rarely needed; chat auto-creates)
 *
 * Filtering is by `userId` *and* `workspaceId`. A conversation is personal even
 * inside a workspace: a teammate must not read your chat history, which is why
 * the user filter is never optional.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { platformRoute, json, notFound } from '@/lib/platform/http';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  projectId: z.string().max(64).optional(),
});

export const GET = platformRoute({ scope: 'conversations:read', query: listSchema }, async ({ principal, query, requestId }) => {
  const conversations = await db.aiConversation.findMany({
    where: {
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      archived: false,
      ...(query.projectId ? { projectId: query.projectId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: query.limit,
    select: {
      id: true, title: true, model: true, provider: true, projectId: true,
      createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return json({
    conversations: conversations.map((c) => ({
      id: c.id, title: c.title, model: c.model, provider: c.provider, projectId: c.projectId,
      createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c._count.messages,
    })),
  }, requestId);
});

const createSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  projectId: z.string().max(64).optional(),
  model: z.string().max(120).optional(),
});

export const POST = platformRoute({ scope: 'conversations:write', body: createSchema }, async ({ principal, body, requestId, workspaceId }) => {
  if (body.projectId) {
    const project = await db.aiProject.findFirst({ where: { id: body.projectId, workspaceId }, select: { id: true } });
    if (!project) throw notFound('Project not found');
  }
  const conversation = await db.aiConversation.create({
    data: {
      workspaceId,
      userId: principal.userId,
      projectId: body.projectId ?? null,
      title: (body.title ?? 'New conversation').slice(0, 120),
      model: body.model ?? null,
    },
    select: { id: true, title: true, createdAt: true },
  });
  return json({ conversation }, requestId, 201);
});
