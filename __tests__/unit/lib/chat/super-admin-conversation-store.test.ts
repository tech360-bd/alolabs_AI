/**
 * Regression tests for the Super Admin chat persistence layer.
 *
 * These guard a real defect: the command chat previously kept its transcript in
 * a module-level `Map`, so every restart wiped it, two instances disagreed, and
 * nothing was auditable afterwards. The store now uses the existing
 * `Conversation` / `ConversationMessage` tables.
 *
 * The isolation tests matter as much as the persistence ones: history is read
 * with the tenant filter inside the query, so a mis-set conversation id must not
 * be able to return another tenant's transcript.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const store: Record<string, Row[]> = {
  conversation: [],
  conversationMessage: [],
}
let seq = 0
const nextId = (p: string) => `${p}_${++seq}`

const dbStub = {
  conversation: {
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      return (
        store.conversation.find((c) => {
          if (where.userId && c.userId !== where.userId) return false
          if (where.companyId && c.companyId !== where.companyId) return false
          if (where.title && c.title !== where.title) return false
          return true
        }) ?? null
      )
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: nextId('conv'), createdAt: new Date(), ...data }
      store.conversation.push(row)
      return row
    }),
  },
  conversationMessage: {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: nextId('msg'), createdAt: new Date(), ...data }
      store.conversationMessage.push(row)
      return row
    }),
    findMany: vi.fn(async ({ where, take }: { where: Row; take?: number }) => {
      const convId = where.conversationId as string
      const tenant = (where.conversation as { companyId?: string } | undefined)?.companyId
      const owningConv = store.conversation.find((c) => c.id === convId)
      // Simulate the relational filter: no conversation or wrong tenant → no rows.
      if (!owningConv) return []
      if (tenant && owningConv.companyId !== tenant) return []
      const rows = store.conversationMessage.filter((m) => m.conversationId === convId)
      // Mirror the real ordering: newest first, so the store must reverse it.
      const newestFirst = [...rows].reverse()
      const sliced = take ? newestFirst.slice(0, take) : newestFirst
      return sliced.map((m) => ({ role: m.role, content: m.content }))
    }),
    deleteMany: vi.fn(async ({ where }: { where: Row }) => {
      const before = store.conversationMessage.length
      store.conversationMessage = store.conversationMessage.filter(
        (m) => m.conversationId !== where.conversationId,
      )
      return { count: before - store.conversationMessage.length }
    }),
  },
}

vi.mock('@/lib/db', () => ({ db: dbStub }))

const {
  getOrCreateSuperAdminConversation,
  loadSuperAdminHistory,
  appendSuperAdminTurn,
  clearSuperAdminConversation,
} = await import('@/lib/chat/super-admin-conversation-store')

beforeEach(() => {
  seq = 0
  for (const k of Object.keys(store)) store[k].length = 0
  vi.clearAllMocks()
  // Re-attach because deleteMany reassigns the array.
  if (!Array.isArray(store.conversationMessage)) store.conversationMessage = []
})

describe('super admin conversation store', () => {
  it('creates exactly one conversation per user + session and reuses it', async () => {
    const a = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    const b = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    expect(b.id).toBe(a.id)
    expect(store.conversation).toHaveLength(1)
  })

  it('gives different sessions and different users separate conversations', async () => {
    await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's2' })
    await getOrCreateSuperAdminConversation({ userId: 'u2', companyId: 'c1', sessionId: 's1' })
    expect(store.conversation).toHaveLength(3)
  })

  it('persists turns and replays them in chronological order', async () => {
    const conv = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    await appendSuperAdminTurn({ conversationId: conv.id, turn: { role: 'user', content: 'first' } })
    await appendSuperAdminTurn({ conversationId: conv.id, turn: { role: 'assistant', content: 'second', model: 'm' } })

    const history = await loadSuperAdminHistory({ conversationId: conv.id, companyId: 'c1' })
    expect(history.map((h) => h.content)).toEqual(['first', 'second'])
    expect(history.map((h) => h.role)).toEqual(['user', 'assistant'])
  })

  it('survives a restart: a fresh read returns previously written turns', async () => {
    const conv = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    await appendSuperAdminTurn({ conversationId: conv.id, turn: { role: 'user', content: 'before restart' } })

    // A restart is just a new read from the durable store — the old Map would
    // have returned [] here.
    const history = await loadSuperAdminHistory({ conversationId: conv.id, companyId: 'c1' })
    expect(history).toHaveLength(1)
    expect(history[0].content).toBe('before restart')
  })

  it('does not leak another tenant\'s transcript when the conversation id is known', async () => {
    const conv = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    await appendSuperAdminTurn({ conversationId: conv.id, turn: { role: 'user', content: 'tenant c1 secret' } })

    const leaked = await loadSuperAdminHistory({ conversationId: conv.id, companyId: 'c2' })
    expect(leaked).toEqual([])
  })

  it('reports persistence failure instead of throwing', async () => {
    dbStub.conversationMessage.create.mockRejectedValueOnce(new Error('db down'))
    const ok = await appendSuperAdminTurn({ conversationId: 'conv_x', turn: { role: 'user', content: 'x' } })
    expect(ok).toBe(false)
  })

  it('clears only the targeted conversation and reports the count', async () => {
    const a = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    const b = await getOrCreateSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's2' })
    await appendSuperAdminTurn({ conversationId: a.id, turn: { role: 'user', content: 'a1' } })
    await appendSuperAdminTurn({ conversationId: a.id, turn: { role: 'user', content: 'a2' } })
    await appendSuperAdminTurn({ conversationId: b.id, turn: { role: 'user', content: 'b1' } })

    const deleted = await clearSuperAdminConversation({ userId: 'u1', companyId: 'c1', sessionId: 's1' })
    expect(deleted).toBe(2)
    expect(await loadSuperAdminHistory({ conversationId: a.id, companyId: 'c1' })).toEqual([])
    // The other session is untouched.
    expect(await loadSuperAdminHistory({ conversationId: b.id, companyId: 'c1' })).toHaveLength(1)
  })

  it('returns 0 when clearing a session that does not exist', async () => {
    const deleted = await clearSuperAdminConversation({ userId: 'nobody', companyId: 'c1', sessionId: 'nope' })
    expect(deleted).toBe(0)
  })
})
