/**
 * Durable store for the Commanding Center (Super Admin / Admin own agent).
 *
 * The agent previously kept its transcript in a module-level `Map`, which meant:
 *
 *   - a restart wiped the operator's history;
 *   - two instances disagreed about the same session;
 *   - a transcript could not be shown again after a page reload;
 *   - nothing was reviewable after an incident.
 *
 * It now uses the `Conversation` / `ConversationMessage` models that already
 * exist, scoped by `userId` + `companyId` + a deterministic session title. Every
 * read carries the tenant filter in the query, so a guessed conversation id
 * cannot cross tenants.
 *
 * Persistence is best-effort but never silent: failures are logged and reported
 * to the caller (`persisted: false`), so the UI can say "history was not saved"
 * instead of pretending.
 */

import { db } from '@/lib/db'

export interface CommandTurn {
  role: 'user' | 'assistant'
  content: string
  model?: string | null
  metadata?: Record<string, unknown>
  createdAt?: string
}

const MAX_REPLAYED_TURNS = 20

/** Distinct prefix keeps command transcripts out of end-user conversations. */
function titleFor(sessionId: string): string {
  return `Command Agent — ${sessionId}`.slice(0, 200)
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Find a conversation without creating one (safe on read paths). */
export async function findCommandConversation(params: {
  userId: string
  companyId: string
  sessionId: string
}): Promise<{ id: string } | null> {
  try {
    return await db.conversation.findFirst({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        status: { not: 'archived' },
        title: titleFor(params.sessionId),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
  } catch (error) {
    console.error('[command-agent] conversation lookup failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/** Resolve (or lazily create) the conversation row for this user + session. */
export async function getOrCreateCommandConversation(params: {
  userId: string
  companyId: string
  sessionId: string
}): Promise<{ id: string } | null> {
  const existing = await findCommandConversation(params)
  if (existing) return existing

  try {
    return await db.conversation.create({
      data: {
        userId: params.userId,
        companyId: params.companyId,
        title: titleFor(params.sessionId),
        status: 'active',
      },
      select: { id: true },
    })
  } catch (error) {
    console.error('[command-agent] conversation create failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Read the most recent turns for replay and/or display.
 *
 * `id` breaks ties when two turns share a millisecond, which wall-clock-only
 * ordering gets wrong.
 */
export async function loadCommandTurns(params: {
  conversationId: string
  companyId: string
  limit?: number
}): Promise<CommandTurn[]> {
  try {
    const rows = await db.conversationMessage.findMany({
      where: {
        conversationId: params.conversationId,
        // Tenant filter is part of the query, not a post-filter.
        conversation: { companyId: params.companyId },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit ?? MAX_REPLAYED_TURNS,
      select: { role: true, content: true, model: true, metadata: true, createdAt: true },
    })

    return rows.reverse().map((row: {
      role: string
      content: string
      model: string | null
      metadata: string
      createdAt: Date
    }) => ({
      role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: row.content,
      model: row.model ?? null,
      metadata: parseMetadata(row.metadata),
      createdAt: new Date(row.createdAt).toISOString(),
    }))
  } catch (error) {
    console.error('[command-agent] history load failed:', error instanceof Error ? error.message : error)
    return []
  }
}

/** Append one turn. Best-effort, but the caller is told whether it persisted. */
export async function appendCommandTurn(params: {
  conversationId: string
  turn: CommandTurn
}): Promise<boolean> {
  try {
    await db.conversationMessage.create({
      data: {
        conversationId: params.conversationId,
        role: params.turn.role === 'user' ? 'user' : 'agent',
        content: params.turn.content,
        model: params.turn.model ?? null,
        metadata: JSON.stringify(params.turn.metadata ?? {}),
      },
    })
    return true
  } catch (error) {
    console.error('[command-agent] turn persist failed:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Clear messages without deleting the conversation row, so "a conversation
 * existed" survives the operator pressing Clear.
 */
export async function clearCommandConversation(params: {
  userId: string
  companyId: string
  sessionId: string
}): Promise<number> {
  const conversation = await findCommandConversation(params)
  if (!conversation) return 0
  try {
    const result = await db.conversationMessage.deleteMany({
      where: { conversationId: conversation.id },
    })
    return result.count
  } catch (error) {
    console.error('[command-agent] clear failed:', error instanceof Error ? error.message : error)
    return 0
  }
}

export { MAX_REPLAYED_TURNS, titleFor }
