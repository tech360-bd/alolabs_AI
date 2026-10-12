/**
 * ALO Labs AI-EOS — Conversations API
 * GET  /           — List conversations for current user
 * GET  /?id=…      — Get conversation with messages
 * DELETE /?id=…    — Archive a conversation
 *
 * Previously both handlers fell back to `{ userId: 'anonymous', role: 'viewer' }`
 * when unauthenticated, which made the endpoint public (every anonymous caller
 * shared one identity) and let any caller read or archive any conversation id.
 * Both handlers now require an authenticated principal and verify ownership.
 */

import { z } from 'zod';
import { getAuthUser } from '@/lib/api-auth';
import { getOrchestrator } from '@/lib/orchestrator';
import { db } from '@/lib/db';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

type ConversationLike = { id: string; userId?: unknown; companyId?: unknown };

/**
 * A conversation belongs to the user that created it, or (for shared
 * conversations) to the principal's company. Anything else is reported as
 * 404 — never 403 — so ids cannot be probed.
 */
function assertOwnership(conversation: ConversationLike | null | undefined, userId: string, companyId: string | null): void {
  if (!conversation) throw notFound('Conversation not found');
  const ownsByUser = typeof conversation.userId === 'string' && conversation.userId === userId;
  const ownsByCompany = Boolean(companyId) && conversation.companyId === companyId;
  if (!ownsByUser && !ownsByCompany) throw notFound('Conversation not found');
}

const listQuery = z.object({ id: z.string().min(1).max(128).optional() });

export const GET = secureRoute(
  {
    resource: 'enterprise.conversations',
    action: 'read',
    tenant: 'optional',
    query: listQuery,
    rateLimit: { limit: 300, windowMs: 60_000 },
  },
  async (context) => {
    const { id } = context.query as z.infer<typeof listQuery>;
    const orchestrator = getOrchestrator();
    const user = await getAuthUser();
    const ownerId = user?.userId ?? context.principal.userId;

    if (id) {
      const conversation = (await orchestrator.getConversation(id)) as ConversationLike | null;
      assertOwnership(conversation, ownerId, context.companyId);
      return jsonResponse({ success: true, data: conversation }, context.requestId);
    }

    const conversations = await orchestrator.listConversations(ownerId);
    return jsonResponse(
      {
        success: true,
        data: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          agentId: c.agentId,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          lastMessage: c.messages[0] || null,
          messageCount: undefined,
        })),
      },
      context.requestId,
    );
  },
);

export const DELETE = secureRoute(
  {
    resource: 'enterprise.conversations',
    action: 'delete',
    tenant: 'optional',
    query: z.object({ id: z.string().min(1, 'Conversation ID required').max(128) }),
    rateLimit: { limit: 120, windowMs: 60_000 },
  },
  async (context) => {
    const conversationId = (context.query as { id: string }).id;
    const user = await getAuthUser();
    const ownerId = user?.userId ?? context.principal.userId;

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, companyId: true },
    });
    assertOwnership(conversation, ownerId, context.companyId);

    await db.conversation.update({ where: { id: conversationId }, data: { status: 'archived' } });
    return jsonResponse({ success: true }, context.requestId);
  },
);
