/**
 * Integration test: the AI conversation loop end-to-end over an in-memory
 * Prisma stub — conversation open (disclosure), turns, structural handoff
 * (Bangla trigger), callback-task creation when no human is available, and
 * end-of-call artifacts (transcript + summary + outcome). Also proves
 * tenant isolation at every read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

// ── In-memory store ──────────────────────────────────────────────────────────
const store = {
  callSession: [] as Row[],
  callEvent: [] as Row[],
  voiceAgent: [] as Row[],
  user: [] as Row[],
  agentPresence: [] as Row[],
  callQueue: [] as Row[],
  queueMember: [] as Row[],
  escalation: [] as Row[],
  task: [] as Row[],
  callTranscript: [] as Row[],
  callSummary: [] as Row[],
  campaignCall: [] as Row[],
  voiceUsageEntry: [] as Row[],
}
let seq = 0
const nextId = (p: string) => `${p}_${++seq}`

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as object)) {
      return (v as { in: unknown[] }).in.includes(row[k])
    }
    return row[k] === v
  })
}

vi.mock('@/lib/db', () => ({
  db: {
    callSession: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('call'), durationSeconds: 0, outcome: '{}', ...data }
        store.callSession.push(row)
        return { ...row }
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = store.callSession.find((r) => r.id === where.id)!
        Object.assign(row, data)
        return { ...row }
      },
      findFirst: async ({ where }: { where: Row }) =>
        store.callSession.find((r) => matches(r, where)) ?? null,
      count: async () => store.callSession.length,
    },
    callEvent: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('ev'), ...data }
        store.callEvent.push(row)
        return { ...row }
      },
      findMany: async ({ where, orderBy }: { where: Row; orderBy?: string[] }) => {
        let rows = store.callEvent.filter((r) => matches(r, where))
        if (orderBy?.[0] === 'createdAt') rows = [...rows].reverse()
        return rows
      },
    },
    voiceAgent: {
      findFirst: async ({ where }: { where: Row }) => store.voiceAgent.find((r) => matches(r, where)) ?? null,
    },
    user: {
      findFirst: async () => null, // no attribution user → deterministic rule-based responder
    },
    agentPresence: {
      upsert: async ({ where }: { where: { companyId_userId: { companyId: string; userId: string } } }) => {
        const { companyId, userId } = where.companyId_userId
        let row = store.agentPresence.find((r) => r.companyId === companyId && r.userId === userId)
        if (!row) {
          row = { id: nextId('pres'), companyId, userId, status: 'offline' }
          store.agentPresence.push(row)
        }
        return row
      },
      findFirst: async ({ where }: { where: Row }) => store.agentPresence.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => store.agentPresence.filter((r) => matches(r, where)),
    },
    callQueue: { findFirst: async () => null },
    queueMember: { findMany: async () => [] },
    escalation: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('esc'), ...data }
        store.escalation.push(row)
        return { ...row }
      },
      findFirst: async ({ where }: { where: Row }) => store.escalation.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => store.escalation.filter((r) => matches(r, where)),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0
        for (const r of store.escalation) {
          if (matches(r, where)) {
            Object.assign(r, data)
            count += 1
          }
        }
        return { count }
      },
    },
    task: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('task'), ...data }
        store.task.push(row)
        return { ...row }
      },
    },
    callTranscript: {
      upsert: async ({ where, create }: { where: Row; create: Row }) => {
        let row = store.callTranscript.find((r) => r.callSessionId === where.callSessionId)
        if (!row) {
          row = { id: nextId('tr'), ...create }
          store.callTranscript.push(row)
        } else {
          Object.assign(row, create)
        }
        return { ...row }
      },
      findUnique: async ({ where }: { where: Row }) =>
        store.callTranscript.find((r) => r.callSessionId === where.callSessionId) ?? null,
    },
    callSummary: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('sum'), ...data }
        store.callSummary.push(row)
        return { ...row }
      },
      findUnique: async ({ where }: { where: Row }) =>
        store.callSummary.find((r) => r.callSessionId === where.callSessionId) ?? null,
    },
    campaignCall: {
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        let n = 0
        for (const r of store.campaignCall) {
          if (matches(r, where)) {
            Object.assign(r, data)
            n++
          }
        }
        return { count: n }
      },
    },
    voiceUsageEntry: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('usage'), ...data }
        store.voiceUsageEntry.push(row)
        return { ...row }
      },
    },
    crmContact: { findMany: async () => [] },
    dncEntry: { findMany: async () => [] },
  },
}))

// The LLM module is never exercised here (no attribution user), but it is a
// static import of the conversation service — stub it to keep the graph small.
vi.mock('@/lib/multi-tenant-ai/service', () => ({
  CompanyAIError: class extends Error {},
  executeCompanyAIChat: vi.fn(async () => {
    throw new Error('LLM not available in test')
  }),
}))

import { beginConversation, handleConversationTurn } from '@/lib/voice/conversation-service'
import { endCall } from '@/lib/voice/call-service'
import { db } from '@/lib/db'

const COMPANY = 'company_A'
const OTHER = 'company_B'

async function seedInboundCall(companyId = COMPANY, voiceAgentId = 'agent_1'): Promise<string> {
  const call = await db.callSession.create({
    data: {
      companyId,
      direction: 'inbound',
      channel: 'sandbox',
      fromNumber: '+8801711000000',
      toNumber: '+8801900000000',
      status: 'ringing',
      voiceAgentId,
      agentType: 'ai',
      simulated: true,
      startedAt: new Date(),
    },
  })
  return call.id
}

beforeEach(() => {
  for (const key of Object.keys(store) as Array<keyof typeof store>) {
    store[key].length = 0
  }
  store.voiceAgent.push({
    id: 'agent_1',
    companyId: COMPANY,
    name: 'Receptionist',
    language: 'bn-BD',
    greeting: 'আসসালামু আলাইকুম! কীভাবে সাহায্য করতে পারি?',
    fallbackMessage: null,
    systemInstructions: null,
    maxCallSeconds: 600,
    status: 'active',
    humanFallbackUserId: null,
  })
})

describe('conversation open (AI identity disclosure)', () => {
  it('answers the call and speaks a greeting carrying the disclosure', async () => {
    const callId = await seedInboundCall()
    const r = await beginConversation({ companyId: COMPANY, callSessionId: callId })
    expect(r.greeting).toContain('এআই')
    expect(r.language).toBe('bn-BD')
    const call = store.callSession.find((c) => c.id === callId)!
    expect(call.status).toBe('in_progress')
    // Opening turn persisted as an agent conversation event.
    const turns = store.callEvent.filter((e) => e.type === 'conversation_turn')
    expect(turns).toHaveLength(1)
    expect((JSON.parse(turns[0].payload as string) as { role: string }).role).toBe('agent')
  })

  it('is idempotent on double-answer (returns the recorded opening)', async () => {
    const callId = await seedInboundCall()
    const first = await beginConversation({ companyId: COMPANY, callSessionId: callId })
    const second = await beginConversation({ companyId: COMPANY, callSessionId: callId })
    expect(second.greeting).toBe(first.greeting)
    expect(store.callEvent.filter((e) => e.type === 'conversation_turn')).toHaveLength(1)
  })

  it('refuses cross-tenant access (tenant isolation)', async () => {
    const callId = await seedInboundCall()
    await expect(beginConversation({ companyId: OTHER, callSessionId: callId })).rejects.toThrow(/not found for this tenant/)
  })
})

describe('conversation turns + structural handoff', () => {
  it('runs a normal turn: customer utterance persisted, agent reply persisted', async () => {
    const callId = await seedInboundCall()
    await beginConversation({ companyId: COMPANY, callSessionId: callId })
    const r = await handleConversationTurn({
      companyId: COMPANY,
      callSessionId: callId,
      utterance: 'আমার অর্ডার কবে পৌঁছাবে?',
      asrConfidence: 0.9,
    })
    expect(r.reply.length).toBeGreaterThan(0)
    const turns = store.callEvent.filter((e) => e.type === 'conversation_turn')
    expect(turns).toHaveLength(3) // opening + customer + agent
    expect((JSON.parse(turns[1].payload as string) as { language: string }).language).toBe('bn-BD')
  })

  it('executes a MANDATORY handoff on the Bangla human request and schedules a callback task when nobody is available', async () => {
    const callId = await seedInboundCall()
    await beginConversation({ companyId: COMPANY, callSessionId: callId })
    const r = await handleConversationTurn({
      companyId: COMPANY,
      callSessionId: callId,
      utterance: 'আমি একজন মানুষের সাথে কথা বলতে চাই',
    })
    expect(r.handoff.handoff).toBe(true)
    expect(r.handoff.mandatory).toBe(true)
    expect(r.endCall).toBe(true)
    // Escalation persisted with a callback task (no available human agent).
    expect(store.escalation).toHaveLength(1)
    expect(store.escalation[0].status).toBe('callback_scheduled')
    // Round-2 gap closure: the callback promise now carries a DEADLINE that
    // the voice callback scheduler (voice.callback.due) consumes.
    expect(store.escalation[0].callbackDueAt).toBeInstanceOf(Date)
    expect(store.task).toHaveLength(1)
    expect(String(store.task[0].title)).toContain('Callback')
    // The call was ended honestly and the handoff audited.
    expect(store.callSession.find((c) => c.id === callId)!.status).toBe('completed')
    expect(store.callEvent.some((e) => e.type === 'handoff')).toBe(true)
  })

  it('ends the call with artifacts: transcript, summary, outcome', async () => {
    const callId = await seedInboundCall()
    await beginConversation({ companyId: COMPANY, callSessionId: callId })
    await handleConversationTurn({
      companyId: COMPANY,
      callSessionId: callId,
      utterance: 'ডেলিভারি কখন হবে?',
      asrConfidence: 0.95,
    })
    // End the call — finalizeCallArtifacts runs on EVERY terminal path.
    await endCall(callId, COMPANY, 'completed', 'test completion')
    const transcript = store.callTranscript.find((t) => t.callSessionId === callId)
    expect(transcript).toBeTruthy()
    const segments = JSON.parse(transcript!.segments as string) as Array<{ speaker: string; text: string }>
    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments[0].speaker).toBe('agent')
    const summary = store.callSummary.find((s) => s.callSessionId === callId)
    expect(summary).toBeTruthy()
    expect(String(summary!.summary)).toContain('Inbound')
    const call = store.callSession.find((c) => c.id === callId)!
    const outcome = JSON.parse(call.outcome as string) as { handoff?: unknown; intents: string[]; disposition?: string }
    expect(outcome.intents).toContain('conversation_completed')
    expect(outcome.handoff).toBeFalsy() // this call ended without a handoff
    expect(outcome.disposition).toBe('answered')
  })

  it('rejects cross-tenant turns (tenant isolation)', async () => {
    const callId = await seedInboundCall()
    await expect(
      handleConversationTurn({ companyId: OTHER, callSessionId: callId, utterance: 'hello' }),
    ).rejects.toThrow(/not found for this tenant/)
  })
})
