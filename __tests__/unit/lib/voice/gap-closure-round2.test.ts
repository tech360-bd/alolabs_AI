import { describe, it, expect } from 'vitest'
import { agentConfigSnapshot, versionConfigsDiffer, VOICE_AGENT_CONFIG_FIELDS } from '@/lib/voice/agent-versions'
import { customerNumberForCallback, isCallbackDue } from '@/lib/voice/callbacks'
import { localDayStartUtc } from '@/lib/voice/campaigns'

describe('agentConfigSnapshot', () => {
  it('projects only auditable fields', () => {
    const snap = agentConfigSnapshot({
      id: 'a1', companyId: 'c1', name: 'Sales Agent', language: 'bn-BD',
      internalSecret: 'should-not-leak', createdAt: new Date(),
    })
    expect(snap.name).toBe('Sales Agent')
    expect(snap.id).toBeUndefined()
    expect(snap.companyId).toBeUndefined()
    expect(snap.internalSecret).toBeUndefined()
    expect(snap.createdAt).toBeUndefined()
    expect(Object.keys(snap).every((k) => (VOICE_AGENT_CONFIG_FIELDS as readonly string[]).includes(k))).toBe(true)
  })
})

describe('versionConfigsDiffer', () => {
  it('detects changed fields and ignores identical snapshots', () => {
    const a = { name: 'A', language: 'bn-BD', maxCallSeconds: 600 }
    expect(versionConfigsDiffer(a, { ...a })).toBe(false)
    expect(versionConfigsDiffer(a, { ...a, name: 'B' })).toBe(true)
    expect(versionConfigsDiffer(a, { ...a, greeting: 'hello' })).toBe(true)
    // absent vs null are the SAME semantic ("no greeting") — not a change
    expect(versionConfigsDiffer(a, { ...a, greeting: null })).toBe(false)
  })
})

describe('callback helpers', () => {
  it('callback targets the customer: caller for inbound, callee for outbound', () => {
    expect(customerNumberForCallback({ direction: 'inbound', fromNumber: '+8801711', toNumber: '+88096xx' })).toBe('+8801711')
    expect(customerNumberForCallback({ direction: 'outbound', fromNumber: '+88096xx', toNumber: '+8801811' })).toBe('+8801811')
  })

  it('isCallbackDue requires callback_scheduled status and a past deadline', () => {
    const now = new Date('2026-11-11T10:00:00Z')
    expect(isCallbackDue({ status: 'callback_scheduled', callbackDueAt: new Date('2026-11-11T09:59:00Z') }, now)).toBe(true)
    expect(isCallbackDue({ status: 'callback_scheduled', callbackDueAt: new Date('2026-11-11T10:01:00Z') }, now)).toBe(false)
    expect(isCallbackDue({ status: 'callback_scheduled', callbackDueAt: null }, now)).toBe(false)
    expect(isCallbackDue({ status: 'resolved', callbackDueAt: new Date('2026-11-11T09:00:00Z') }, now)).toBe(false)
  })
})

describe('localDayStartUtc (campaign-timezone daily quota window)', () => {
  it('computes local midnight for Asia/Dhaka (UTC+6, no DST)', () => {
    // 2026-11-11 10:00 UTC = 16:00 BDT → local day started 2026-11-10T18:00:00Z
    const start = localDayStartUtc(new Date('2026-11-11T10:00:00Z'), 'Asia/Dhaka')
    expect(start.toISOString()).toBe('2026-11-10T18:00:00.000Z')
  })

  it('handles DST timezones correctly (America/New_York, November = UTC-5)', () => {
    const start = localDayStartUtc(new Date('2026-11-11T10:00:00Z'), 'America/New_York')
    expect(start.toISOString()).toBe('2026-11-11T05:00:00.000Z')
  })

  it('handles summer DST (July = UTC-4)', () => {
    const start = localDayStartUtc(new Date('2026-07-11T10:00:00Z'), 'America/New_York')
    expect(start.toISOString()).toBe('2026-07-11T04:00:00.000Z')
  })

  it('falls back to UTC midnight for an unknown timezone (fail-closed)', () => {
    const start = localDayStartUtc(new Date('2026-11-11T10:00:00Z'), 'Mars/Olympus')
    expect(start.toISOString()).toBe('2026-11-11T00:00:00.000Z')
  })
})
