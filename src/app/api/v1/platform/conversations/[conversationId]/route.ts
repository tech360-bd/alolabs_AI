/**
 * /api/v1/platform/conversations/[conversationId]
 *
 * GET    full message history
 * DELETE soft-archive (recoverable; hard delete is deliberately not offered)
 *
 * Ownership is `workspaceId AND userId` in the WHERE clause, so another user's
 * conversation id resolves to 404 without a second query and without confirming
 * that the id exists.
 */

import { db } from '@/lib/db';
import { platformRoute, json, notFound } from '@/lib/platform/http';

type Params = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { conversationId } = await params;
  return platformRoute({ scope: 'conversations:read' }, async ({ principal, requestId }) => {
    const conversation = await db.aiConversation.findFirst({
      where: { id: conversationId, workspaceId: principal.workspaceId, userId: principal.userId },
      select: { id: true, title: true, model: true, provider: true, createdAt: true, updatedAt: true },
    });
    if (!conversation) throw notFound('Conversation not found');

    const messages = await db.aiChatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true, role: true, content: true, model: true, provider: true,
        promptTokens: true, completionTokens: true, latencyMs: true,
        fallbackUsed: true, createdAt: true,
      },
    });
    return json({ conversation, messages }, requestId);
  })(request as never);
}

export async function DELETE(request: Request, { params }: Params) {
  const { conversationId } = await params;
  return platformRoute({ scope: 'conversations:write' }, async ({ principal, requestId }) => {
    const result = await db.aiConversation.updateMany({
      where: { id: conversationId, workspaceId: principal.workspaceId, userId: principal.userId },
      data: { archived: true },
    });
    if (!result.count) throw notFound('Conversation not found');
    return json({ archived: true, conversationId }, requestId);
  })(request as never);
}
