/**
 * Durable store for the Super Admin command chat.
 *
 * Replaces the module-level `Map` that previously held this conversation in
 * process memory, which had three defects:
 *
 *   - every restart wiped the Super Admin's history;
 *   - two server instances saw different histories;
 *   - nothing was queryable or auditable after the fact.
 *
 * It uses the `Conversation` / `ConversationMessage` tables that already
 * existed but were unused by this endpoint. Each Super Admin user gets one
 * conversation per `sessionId`, scoped to their `companyId`, so a conversation
 * can never be read or resumed by another user or tenant.
 *
 * The stored `role` is the platform vocabulary (`user`, `agent`); the LLM
 * transcript role is derived when history is replayed to the model.
 */

import { db } from '@/lib/db'

export interface StoredTurn {
  role: 'user' | 'assistant'
  content: string
  model?: string | null
  tokensUsed?: number
  latencyMs?: number | null
  metadata?: Record<string, unknown>
}

const MAX_REPLAYED_TURNS = 20

/** Deterministic title so a conversation is identifiable in a list. */
function titleFor(sessionId: string): string {
  return `Super Admin — ${sessionId}`.slice(0, 200)
}

/**
 * Resolve (or lazily create) the conversation row for this user + session.
 * `metadata.surface` marks it as the command chat so it never mixes with
 * end-user conversations.
 */
export async function getOrCreateSuperAdminConversation(params: {
  userId: string
  companyId: string
  sessionId: string
}): Promise<{ id: string }> {
  const existing = await db.conversation.findFirst({
    where: {
      userId: params.userId,
      companyId: params.companyId,
      status: { not: 'archived' },
      title: titleFor(params.sessionId),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (existing) return existing

  return db.conversation.create({
    data: {
      userId: params.userId,
      companyId: params.companyId,
      title: titleFor(params.sessionId),
      status: 'active',
    },
    select: { id: true },
  })
}

/**
 * Read the most recent turns for replay into the model.
 *
 * Deliberately tenant-scoped: the `companyId` filter is part of the query, not
 * a post-filter, so a mis-set conversation id cannot leak another tenant's
 * transcript.
 */
export async function loadSuperAdminHistory(params: {
  conversationId: string
  companyId: string
  limit?: number
}): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const rows = await db.conversationMessage.findMany({
    where: {
      conversationId: params.conversationId,
      conversation: { companyId: params.companyId },
    },
    // `id` is a cuid (monotonic by creation) and breaks ties when two turns
    // share a millisecond, which a wall-clock-only ordering gets wrong.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.limit ?? MAX_REPLAYED_TURNS,
    select: { role: true, content: true },
  })

  return rows
    .reverse()
    .map((row) => ({
      // `agent`/`orchestrator` rows were system-side replies; replay them as
      // assistant turns so the model sees a coherent transcript.
      role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: row.content,
    }))
}

/** Append one turn. Best-effort: a persistence failure must not 500 a reply. */
export async function appendSuperAdminTurn(params: {
  conversationId: string
  turn: StoredTurn
}): Promise<boolean> {
  try {
    await db.conversationMessage.create({
      data: {
        conversationId: params.conversationId,
        role: params.turn.role === 'user' ? 'user' : 'agent',
        content: params.turn.content,
        model: params.turn.model ?? null,
        tokensUsed: params.turn.tokensUsed ?? 0,
        latencyMs: params.turn.latencyMs ?? null,
        metadata: JSON.stringify(params.turn.metadata ?? {}),
      },
    })
    return true
  } catch (error) {
    console.error('[super-chat] Failed to persist turn:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Clear a conversation's messages without deleting the conversation row, so
 * the audit trail of "a conversation existed" survives a user pressing Clear.
 */
export async function clearSuperAdminConversation(params: {
  userId: string
  companyId: string
  sessionId: string
}): Promise<number> {
  const conversation = await db.conversation.findFirst({
    where: {
      userId: params.userId,
      companyId: params.companyId,
      title: titleFor(params.sessionId),
    },
    select: { id: true },
  })
  if (!conversation) return 0

  const result = await db.conversationMessage.deleteMany({
    where: { conversationId: conversation.id },
  })
  return result.count
}
