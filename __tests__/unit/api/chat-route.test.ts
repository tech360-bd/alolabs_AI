/**
 * Regression tests for the unified chat API.
 *
 * The properties that matter here are safety, not happy-path formatting:
 *  - tenant isolation: another user's conversation id must 404, never 200;
 *  - honest failure: a model error must return a failure and never a fabricated
 *    reply, and the failed turn must be recorded;
 *  - the user's message is persisted even when inference fails, so work is not
 *    silently lost;
 *  - inference goes through `executeCompanyAIChat` (the single gateway), not a
 *    second router.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const store: Record<string, Row[]> = { conversation: [], conversationMessage: [] }
let seq = 0
const nextId = (p: string) => `${p}_${++seq}`

const dbStub = {
  conversation: {
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      const rows = store.conversation.filter((c) => {
        if (where.id && c.id !== where.id) return false
        const or = where.OR as Array<Record<string, unknown>> | undefined
        if (or) {
          const matched = or.some((cond) =>
            Object.entries(cond).every(([k, v]) => c[k] === v),
          )
          if (!matched) return false
        }
        return true
      })
      return rows[0] ?? null
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: nextId('conv'), createdAt: new Date(), updatedAt: new Date(), status: 'active', ...data }
      store.conversation.push(row)
      return row
    }),
    findMany: vi.fn(async ({ where }: { where: Row }) =>
      store.conversation.filter((c) => c.userId === where.userId && c.companyId === where.companyId),
    ),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = store.conversation.find((c) => c.id === where.id)
      if (row) Object.assign(row, data)
      return row ?? {}
    }),
  },
  conversationMessage: {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: nextId('msg'), createdAt: new Date(), ...data }
      store.conversationMessage.push(row)
      return row
    }),
    findMany: vi.fn(async ({ where, take, orderBy }: { where: Row; take?: number; orderBy?: unknown }) => {
      const rows = store.conversationMessage.filter((m) => m.conversationId === where.conversationId)
      // The route asks for descending order when replaying history into the
      // model, and ascending order when rendering a conversation.
      const ordered = Array.isArray(orderBy)
        ? [...rows]
        : [...rows].reverse()
      const sliced = take ? ordered.slice(0, take) : ordered
      return sliced.map((m) => ({ role: m.role, content: m.content, id: m.id }))
    }),
  },
}

let principal = { userId: 'u1', companyId: 'c1', companyRole: 'member' }
vi.mock('@/lib/db', () => ({ db: dbStub }))
vi.mock('@/lib/api-auth', () => ({
  requireCompanyAuth: vi.fn(async () => principal),
}))
vi.mock('@/lib/security/rate-limiter', () => ({
  checkEndpointLimit: vi.fn(async () => ({ allowed: true })),
}))

const chatMock = vi.fn()
vi.mock('@/lib/multi-tenant-ai/service', () => ({
  executeCompanyAIChat: (...args: unknown[]) => chatMock(...args),
  CompanyAIError: class CompanyAIError extends Error {
    code: string
    status: number
    requestId: string
    constructor(message: string, status = 503, code = 'AI_UNAVAILABLE', requestId = 'req_x') {
      super(message)
      this.code = code
      this.status = status
      this.requestId = requestId
    }
  },
}))

const { GET, POST, DELETE } = await import('@/app/api/chat/route')

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** NextRequest-shape: the route reads `request.nextUrl.searchParams`. */
function getRequest(url: string) {
  const parsed = new URL(url)
  return {
    nextUrl: parsed,
    url,
    method: 'GET',
  } as unknown as Parameters<typeof GET>[0]
}

const okResult = {
  response: {
    id: 'r1',
    content: 'Here is a real answer.',
    model: 'qwen-local',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    finishReason: 'stop',
    latencyMs: 12,
  },
  requestId: 'req_1',
  provider: 'local-gateway',
  profile: 'free_general',
  estimatedCostUsd: 0,
  attempts: 1,
  fallbackUsed: false,
}

beforeEach(() => {
  seq = 0
  store.conversation.length = 0
  store.conversationMessage.length = 0
  principal = { userId: 'u1', companyId: 'c1', companyRole: 'member' }
  vi.clearAllMocks()
  chatMock.mockResolvedValue(okResult)
})

describe('POST /api/chat', () => {
  it('creates a conversation, replies, and persists both turns', async () => {
    const res = await POST(postRequest({ message: 'Hello' }) as never)
    const json = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(json.message).toMatchObject({ role: 'agent', content: 'Here is a real answer.' })
    expect(store.conversation).toHaveLength(1)
    // user turn + agent turn
    expect(store.conversationMessage).toHaveLength(2)
    expect(store.conversationMessage[0]).toMatchObject({ role: 'user', content: 'Hello' })
    expect(store.conversationMessage[1]).toMatchObject({ role: 'agent', content: 'Here is a real answer.' })
  })

  it('routes through the single AI gateway, never a second router', async () => {
    await POST(postRequest({ message: 'Hi' }) as never)
    expect(chatMock).toHaveBeenCalledTimes(1)
    const [, , ctx] = chatMock.mock.calls[0]
    expect(ctx).toMatchObject({ profile: 'free_general' })
  })

  it('rejects an empty message', async () => {
    const res = await POST(postRequest({ message: '   ' }) as never)
    expect(res.status).toBe(400)
  })

  it('404s on another tenant\'s conversation id and does not leak it', async () => {
    // c2's conversation exists in the store...
    store.conversation.push({ id: 'conv_other', userId: 'u9', companyId: 'c2', title: 'secret' })
    const res = await POST(postRequest({ message: 'hi', conversationId: 'conv_other' }) as never)
    expect(res.status).toBe(404)
    expect(chatMock).not.toHaveBeenCalled()
  })

  it('returns a failure — and no fabricated reply — when inference fails', async () => {
    chatMock.mockRejectedValue(new Error('no provider available'))

    const res = await POST(postRequest({ message: 'Hello' }) as never)
    const json = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(json.failed).toBe(true)
    expect(json.message).toBeUndefined() // no assistant message is returned
    expect(String(json.error)).toMatch(/no provider available/)

    // The user's turn survived, and the failure is recorded as a system row.
    const roles = store.conversationMessage.map((m) => m.role)
    expect(roles).toEqual(['user', 'system'])
    const failedRow = store.conversationMessage[1]
    expect(String(failedRow.metadata)).toContain('"status":"failed"')
  })

  it('reuses an owned conversation across turns and replays history', async () => {
    const first = await POST(postRequest({ message: 'first' }) as never)
    const firstJson = (await first.json()) as { conversationId: string }

    await POST(postRequest({ message: 'second', conversationId: firstJson.conversationId }) as never)

    expect(store.conversation).toHaveLength(1)
    const [, request] = chatMock.mock.calls[1]
    const contents = (request as { messages: Array<{ content: string }> }).messages.map((m) => m.content)
    expect(contents).toContain('first')
    expect(contents[contents.length - 1]).toBe('second')
  })

  it('is not usable without an authenticated principal', async () => {
    const auth = await import('@/lib/api-auth')
    ;(auth.requireCompanyAuth as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await POST(postRequest({ message: 'hi' }) as never)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/chat', () => {
  it('lists only this principal\'s conversations', async () => {
    store.conversation.push({ id: 'a', userId: 'u1', companyId: 'c1', title: 'mine' })
    store.conversation.push({ id: 'b', userId: 'u2', companyId: 'c1', title: 'colleague' })

    const res = await GET(getRequest('http://localhost/api/chat') as never)
    const json = (await res.json()) as { conversations: Array<{ id: string }> }
    expect(json.conversations.map((c) => c.id)).toEqual(['a'])
  })

  it('returns messages in chronological order', async () => {
    store.conversation.push({ id: 'a', userId: 'u1', companyId: 'c1', title: 'mine' })
    store.conversationMessage.push({ id: 'm1', conversationId: 'a', role: 'user', content: 'one' })
    store.conversationMessage.push({ id: 'm2', conversationId: 'a', role: 'agent', content: 'two' })

    const res = await GET(getRequest('http://localhost/api/chat?id=a') as never)
    const json = (await res.json()) as { messages: Array<{ content: string }> }
    expect(json.messages.map((m) => m.content)).toEqual(['one', 'two'])
  })

  it('404s a conversation belonging to someone else', async () => {
    store.conversation.push({ id: 'b', userId: 'u2', companyId: 'c2', title: 'theirs' })
    const res = await GET(getRequest('http://localhost/api/chat?id=b') as never)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/chat', () => {
  it('archives an owned conversation without deleting its messages', async () => {
    store.conversation.push({ id: 'a', userId: 'u1', companyId: 'c1', title: 'mine', status: 'active' })
    store.conversationMessage.push({ id: 'm1', conversationId: 'a', role: 'user', content: 'keep me' })

    const res = await DELETE(getRequest('http://localhost/api/chat?id=a') as never)
    expect(res.status).toBe(200)
    expect(store.conversation[0].status).toBe('archived')
    expect(store.conversationMessage).toHaveLength(1)
  })

  it('404s on a foreign conversation', async () => {
    store.conversation.push({ id: 'b', userId: 'u2', companyId: 'c2', title: 'theirs' })
    const res = await DELETE(getRequest('http://localhost/api/chat?id=b') as never)
    expect(res.status).toBe(404)
  })
})
