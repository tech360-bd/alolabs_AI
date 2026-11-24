/**
 * Regression tests for the Bangla voice-agent seed.
 *
 * These are MOCKED unit tests (in-memory Prisma stub) — they verify the seed's
 * contract, not model inference. They exist because the seed writes to a
 * tenant's real configuration, so its safety properties must be pinned:
 *
 *  1. Idempotent — running twice creates no duplicate profiles and bumps no
 *     version when nothing changed.
 *  2. No fabricated activity — it must never touch CallSession,
 *     CallTranscript, CallSummary or VoiceUsageEntry. Dashboards must only ever
 *     show real calls.
 *  3. Tenant-scoped — agents are created for exactly the requested company, and
 *     an unknown company writes nothing.
 *  4. Real Bangla configuration — every profile carries genuine Bangla greeting
 *     and instructions, and a language of bn-BD.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const store: Record<string, Row[]> = {
  company: [],
  voiceAgent: [],
  voiceAgentVersion: [],
  // Tracked but must remain empty — any write here is a test failure.
  callSession: [],
  callTranscript: [],
  callSummary: [],
  voiceUsageEntry: [],
}

let seq = 0
const nextId = (p: string) => `${p}_${++seq}`

const dbStub = {
  company: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      store.company.find((c) => c.id === where.id) ?? null,
    ),
  },
  voiceAgent: {
    findMany: vi.fn(async ({ where }: { where: { companyId: string; metadata?: { contains: string } } }) =>
      store.voiceAgent.filter((a) => {
        if (a.companyId !== where.companyId) return false
        if (where.metadata?.contains && !String(a.metadata).includes(where.metadata.contains)) return false
        return true
      }),
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: nextId('agent'), createdAt: new Date(), ...data }
      store.voiceAgent.push(row)
      return row
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = store.voiceAgent.find((a) => a.id === where.id)
      if (!row) throw new Error('not found')
      Object.assign(row, data)
      return row
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = store.voiceAgent.find((a) => a.id === where.id)
      if (!row) throw new Error('not found')
      return row
    }),
  },
  voiceAgentVersion: {
    findFirst: vi.fn(async ({ where }: { where: { agentId: string } }) => {
      const rows = store.voiceAgentVersion
        .filter((v) => v.agentId === where.agentId)
        .sort((a, b) => Number(b.version) - Number(a.version))
      return rows[0] ?? null
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      store.voiceAgentVersion.push({ id: nextId('ver'), ...data })
      return data
    }),
  },
  $disconnect: vi.fn(async () => undefined),
}

// Fail loudly if the seed ever reaches for call data.
for (const forbidden of ['callSession', 'callTranscript', 'callSummary', 'voiceUsageEntry'] as const) {
  ;(dbStub as unknown as Record<string, unknown>)[forbidden] = new Proxy(
    {},
    {
      get() {
        throw new Error(`Seed must not touch ${forbidden}`)
      },
    },
  )
}

vi.mock('@prisma/client', () => ({
  // A class (not vi.fn) because the seed calls `new PrismaClient()`.
  PrismaClient: class {
    constructor() {
      return dbStub as unknown as object
    }
  },
}))

const originalEnv = { ...process.env }

async function runSeed(env: Record<string, string> = {}) {
  process.env = { ...originalEnv, ...env }
  vi.resetModules()
  const mod = await import('../../../../scripts/seed-bangla-voice-agents')
  // The script runs main() at import time; allow microtasks to settle.
  await new Promise((r) => setTimeout(r, 30))
  return mod
}

beforeEach(() => {
  seq = 0
  for (const k of Object.keys(store)) store[k].length = 0
  store.company.push({ id: 'cmp_a', name: 'Tenant A' })
  vi.clearAllMocks()
})

afterEach(() => {
  process.env = originalEnv
})

describe('Bangla voice-agent seed', () => {
  it('refuses to run without COMPANY_ID and writes nothing', async () => {
    delete process.env.COMPANY_ID
    await runSeed({ COMPANY_ID: '' })
    expect(store.voiceAgent).toHaveLength(0)
  })

  it('writes nothing for an unknown tenant', async () => {
    await runSeed({ COMPANY_ID: 'cmp_missing' })
    expect(store.voiceAgent).toHaveLength(0)
    expect(store.voiceAgentVersion).toHaveLength(0)
  })

  it('creates the three Bangla profiles with real configuration', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a' })
    expect(store.voiceAgent).toHaveLength(3)

    const names = store.voiceAgent.map((a) => a.name)
    expect(names).toEqual([
      'Bangla Customer Support Agent',
      'Bangla Admissions Information Agent',
      'Bangla General Inquiry Agent',
    ])

    for (const a of store.voiceAgent) {
      expect(a.companyId).toBe('cmp_a')
      expect(a.language).toBe('bn-BD')
      // Real Bangla script, not latin transliteration.
      expect(String(a.greeting)).toMatch(/[\u0980-\u09FF]/)
      expect(String(a.systemInstructions)).toMatch(/[\u0980-\u09FF]/)
      // Model config is recorded per agent and forbids hosted fallback.
      const meta = JSON.parse(String(a.metadata))
      expect(meta.modelConfig).toMatchObject({ profile: 'local_fast', requireLocal: true, allowHostedFallback: false })
      expect(meta.permissions.telephonyConnected).toBe(false)
      expect(meta.permissions.denied).toContain('claim_to_be_human')
    }
  })

  it('records version 1 for every created agent', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a' })
    expect(store.voiceAgentVersion).toHaveLength(3)
    for (const v of store.voiceAgentVersion) expect(v.version).toBe(1)
  })

  it('is idempotent: a second run creates no duplicates and bumps no version', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a' })
    expect(store.voiceAgent).toHaveLength(3)
    const versionsAfterFirst = store.voiceAgentVersion.length

    await runSeed({ COMPANY_ID: 'cmp_a' })
    expect(store.voiceAgent).toHaveLength(3) // still three
    expect(store.voiceAgentVersion).toHaveLength(versionsAfterFirst) // no new version
  })

  it('records a new version only when the configuration actually changed', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a' })
    const before = store.voiceAgentVersion.length

    // Change the requested status — that IS a config change.
    await runSeed({ COMPANY_ID: 'cmp_a', AGENT_STATUS: 'active' })
    expect(store.voiceAgent).toHaveLength(3)
    expect(store.voiceAgentVersion.length).toBe(before + 3)
    expect(store.voiceAgent.every((a) => a.status === 'active')).toBe(true)
  })

  it('never writes call, transcript, summary or usage rows', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a' })
    expect(store.callSession).toHaveLength(0)
    expect(store.callTranscript).toHaveLength(0)
    expect(store.callSummary).toHaveLength(0)
    expect(store.voiceUsageEntry).toHaveLength(0)
  })

  it('writes nothing in DRY_RUN mode', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a', DRY_RUN: '1' })
    expect(store.voiceAgent).toHaveLength(0)
    expect(store.voiceAgentVersion).toHaveLength(0)
  })

  it('rejects an invalid AGENT_STATUS instead of writing it', async () => {
    await runSeed({ COMPANY_ID: 'cmp_a', AGENT_STATUS: 'production-ready' })
    expect(store.voiceAgent).toHaveLength(0)
  })

  it('keeps two tenants isolated', async () => {
    store.company.push({ id: 'cmp_b', name: 'Tenant B' })
    await runSeed({ COMPANY_ID: 'cmp_a' })
    await runSeed({ COMPANY_ID: 'cmp_b' })

    const a = store.voiceAgent.filter((x) => x.companyId === 'cmp_a')
    const b = store.voiceAgent.filter((x) => x.companyId === 'cmp_b')
    expect(a).toHaveLength(3)
    expect(b).toHaveLength(3)
    // Re-running tenant A must not disturb tenant B's rows.
    const bIds = b.map((x) => x.id)
    await runSeed({ COMPANY_ID: 'cmp_a' })
    expect(store.voiceAgent.filter((x) => x.companyId === 'cmp_b').map((x) => x.id)).toEqual(bIds)
  })
})
