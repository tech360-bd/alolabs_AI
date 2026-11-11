/**
 * Integration tests for the voice campaign engine and call service, with the
 * Prisma layer mocked in-memory. Verifies the compliance ordering (DNC →
 * attempts → calling hours), tenant isolation and honest failure marking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory Prisma stub covering the models the campaign/call code touches.
const store = {
  dncEntry: [] as Array<{ phoneNumber: string; reason: string }>,
  campaignCall: [] as Array<Record<string, unknown>>,
  callSession: [] as Array<Record<string, unknown>>,
  callEvent: [] as Array<Record<string, unknown>>,
}
let callSeq = 0

vi.mock('@/lib/db', () => ({
  db: {
    dncEntry: {
      findMany: async () => store.dncEntry,
    },
    campaignCall: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `cc-${store.campaignCall.length + 1}`, ...data }
        store.campaignCall.push(row)
        return { id: row.id }
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> & { attempts?: unknown } }) => {
        const row = store.campaignCall.find((r) => r.id === where.id)
        if (row) {
          const { attempts, ...rest } = data
          if (attempts && typeof attempts === 'object' && 'increment' in (attempts as object)) {
            row.attempts = ((row.attempts as number) ?? 0) + (attempts as { increment: number }).increment
          } else if (attempts !== undefined) {
            row.attempts = attempts
          }
          Object.assign(row, rest)
        }
        return row
      },
      findFirst: async ({ where }: { where: { id?: string; companyId?: string } }) =>
        store.campaignCall.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null,
    },
    callSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `call-${++callSeq}`, ...data }
        store.callSession.push(row)
        return { id: row.id }
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.callSession.find((r) => r.id === where.id)
        if (row) Object.assign(row, data)
        return row
      },
      findFirst: async ({ where }: { where: { id?: string; companyId?: string } }) =>
        store.callSession.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null,
    },
    callEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.callEvent.push(data)
        return { id: `ev-${store.callEvent.length}` }
      },
    },
    voiceUsageEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: `vu-${Math.random()}`, ...data }),
    },
  },
}))

import { dialCampaignCall, parseCallingHours, prepareCampaignCall } from '@/lib/voice/campaigns'
import { endCall, startCall, CallServiceError } from '@/lib/voice/call-service'
import { InvalidCallTransitionError } from '@/lib/voice/call-state'

const CALLING_HOURS_24H = JSON.stringify({
  start: '00:00', end: '23:59', timezone: 'UTC', days: [0, 1, 2, 3, 4, 5, 6],
  weeklySchedule: [{ day: 0, open: '00:00', close: '23:59' }, { day: 1, open: '00:00', close: '23:59' }, { day: 2, open: '00:00', close: '23:59' }, { day: 3, open: '00:00', close: '23:59' }, { day: 4, open: '00:00', close: '23:59' }, { day: 5, open: '00:00', close: '23:59' }, { day: 6, open: '00:00', close: '23:59' }],
})

describe('campaign compliance ordering', () => {
  beforeEach(() => {
    store.dncEntry = []
    store.campaignCall = []
    store.callSession = []
    store.callEvent = []
    callSeq = 0
  })

  it('blocks DNC contacts before anything else and records the reason', async () => {
    store.dncEntry.push({ phoneNumber: '+8801700000000', reason: 'customer_request' })
    const r = await prepareCampaignCall({
      campaignId: 'cmp1', companyId: 'co1', destinationNumber: '+8801700000000',
      respectDnc: true, callingHoursRaw: CALLING_HOURS_24H, maxAttemptsPerContact: 3, minGapMinutesPerContact: 0,
    })
    expect(r.action).toBe('dnc_blocked')
    const row = store.campaignCall.find((c) => c.id === r.campaignCallId)
    expect(row?.status).toBe('dnc_blocked')
    expect(store.callSession).toHaveLength(0)
  })

  it('queues compliant contacts', async () => {
    const r = await prepareCampaignCall({
      campaignId: 'cmp1', companyId: 'co1', destinationNumber: '+8801711111111',
      respectDnc: true, callingHoursRaw: CALLING_HOURS_24H, maxAttemptsPerContact: 3, minGapMinutesPerContact: 0,
      at: new Date('2026-01-05T10:00:00Z'),
    })
    expect(r.action).toBe('queued')
  })

  it('marks outside-hours contacts explicitly', async () => {
    const r = await prepareCampaignCall({
      campaignId: 'cmp1', companyId: 'co1', destinationNumber: '+8801711111111',
      respectDnc: true,
      callingHoursRaw: JSON.stringify({
        timezone: 'UTC',
        weeklySchedule: [{ day: 0, open: '01:00', close: '02:00' }, { day: 1, open: '01:00', close: '02:00' }, { day: 2, open: '01:00', close: '02:00' }, { day: 3, open: '01:00', close: '02:00' }, { day: 4, open: '01:00', close: '02:00' }, { day: 5, open: '01:00', close: '02:00' }, { day: 6, open: '01:00', close: '02:00' }],
        holidays: [],
      }),
      maxAttemptsPerContact: 3, minGapMinutesPerContact: 0,
      at: new Date('2026-01-05T12:00:00Z'),
    })
    expect(r.action).toBe('outside_hours')
  })

  it('reports max_attempts instead of silently skipping', async () => {
    const r = await prepareCampaignCall({
      campaignId: 'cmp1', companyId: 'co1', destinationNumber: '+8801722222222',
      respectDnc: true, callingHoursRaw: CALLING_HOURS_24H, maxAttemptsPerContact: 3,
      minGapMinutesPerContact: 0, attemptsSoFar: 3,
    })
    expect(r.action).toBe('max_attempts')
  })

  it('parseCallingHours falls back safely on corrupt JSON', () => {
    const cfg = parseCallingHours('{broken')
    expect(cfg.timezone).toBe('Asia/Dhaka')
    expect(cfg.weeklySchedule.length).toBe(7)
  })
})

describe('dialing through the call service (sandbox)', () => {
  beforeEach(() => {
    store.campaignCall = [{ id: 'cc-dial', companyId: 'co1', campaignId: 'cmp1', destinationNumber: '+8801733333333', status: 'queued', attempts: 0 }]
    store.callSession = []
    store.callEvent = []
    callSeq = 0
  })

  it('creates a SIMULATED call session when using the sandbox provider', async () => {
    const r = await dialCampaignCall({
      campaignCallId: 'cc-dial', companyId: 'co1', provider: 'sandbox', fromNumber: '+8801900000000',
    })
    expect(r.simulated).toBe(true)
    const session = store.callSession[0]
    expect(session.simulated).toBe(true)
    expect(session.status).toBe('ringing')
    const cc = store.campaignCall[0]
    expect(cc.status).toBe('dialing')
    expect(cc.attempts).toBe(1)
    expect(cc.callSessionId).toBe(r.callSessionId)
  })

  it('refuses to dial a DNC-blocked contact', async () => {
    store.campaignCall[0].status = 'dnc_blocked'
    await expect(dialCampaignCall({
      campaignCallId: 'cc-dial', companyId: 'co1', provider: 'sandbox', fromNumber: 'x',
    })).rejects.toThrow(/DNC/)
  })

  it('endCall meters usage and stamps disposition once', async () => {
    const started = await startCall({
      companyId: 'co1', direction: 'outbound', from: '+8801900000000', to: '+8801733333333',
      provider: 'sandbox', sandboxBehavior: 'answer',
    })
    const { endCall: end } = await import('@/lib/voice/call-service')
    // Answer then complete.
    const { answerCall } = await import('@/lib/voice/call-service')
    await answerCall(started.id, 'co1')
    const res = await end(started.id, 'co1', 'completed')
    expect(res.durationSeconds).toBeGreaterThanOrEqual(0)
    const session = store.callSession[0]
    expect(session.status).toBe('completed')
    expect(session.disposition).toBe('answered')
    // Idempotent: ending again does not re-meter or error.
    const again = await end(started.id, 'co1', 'completed')
    expect(again.metered).toHaveLength(0)
  })

  it('enforces tenant isolation — another tenant cannot touch the call', async () => {
    const started = await startCall({
      companyId: 'co1', direction: 'outbound', from: 'a', to: 'b', provider: 'sandbox',
    })
    await expect(endCall(started.id, 'co-other', 'completed')).rejects.toThrow(CallServiceError)
    await expect(endCall(started.id, 'co-other', 'completed')).rejects.not.toThrow(InvalidCallTransitionError)
  })
})
