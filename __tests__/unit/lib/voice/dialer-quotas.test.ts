import { describe, it, expect } from 'vitest'
import { parseQuotaConfig, quotaDecision } from '@/lib/voice/quotas'
import { pickDialableContacts } from '@/lib/voice/dialer'

describe('quota config parsing', () => {
  it('reads voiceQuota from company metadata', () => {
    const c = parseQuotaConfig(JSON.stringify({ voiceQuota: { monthlyAiMinutes: 500 } }))
    expect(c.monthlyAiMinutes).toBe(500)
  })

  it('falls back to unlimited when nothing is configured', () => {
    expect(parseQuotaConfig(null).monthlyAiMinutes).toBeNull()
    expect(parseQuotaConfig('not-json').monthlyAiMinutes).toBeNull()
    expect(parseQuotaConfig(JSON.stringify({})).monthlyAiMinutes).toBeNull()
  })

  it('ignores invalid values (negative, zero, non-numeric)', () => {
    const c = parseQuotaConfig(JSON.stringify({ voiceQuota: { monthlyAiMinutes: -5, alertThresholdRatio: 2 } }))
    expect(c.monthlyAiMinutes).toBeNull()
    expect(c.alertThresholdRatio).toBe(0.8)
  })
})

describe('quota decision (pure thresholds)', () => {
  const config = { monthlyAiMinutes: 100, monthlyPstnMinutes: null, alertThresholdRatio: 0.8 }

  it('allows within quota', () => {
    const r = quotaDecision({ config, usage: [{ dimension: 'ai_call_minutes', total: 50 }], dimension: 'ai_call_minutes', requestedMinutes: 10 })
    expect(r.allowed).toBe(true)
    expect(r.alertTriggered).toBe(false)
  })

  it('triggers the alert at 80% usage', () => {
    const r = quotaDecision({ config, usage: [{ dimension: 'ai_call_minutes', total: 80 }], dimension: 'ai_call_minutes', requestedMinutes: 5 })
    expect(r.allowed).toBe(true)
    expect(r.alertTriggered).toBe(true)
  })

  it('blocks when the projection exceeds the limit (fail-closed)', () => {
    const r = quotaDecision({ config, usage: [{ dimension: 'ai_call_minutes', total: 95 }], dimension: 'ai_call_minutes', requestedMinutes: 10 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('quota exhausted')
  })

  it('never limits unconfigured dimensions', () => {
    const r = quotaDecision({ config, usage: [{ dimension: 'pstn_minutes', total: 10_000 }], dimension: 'pstn_minutes', requestedMinutes: 100 })
    expect(r.allowed).toBe(true)
    expect(r.limitMinutes).toBeNull()
  })
})

describe('dialer contact picking (concurrency + quota + attempts + schedule)', () => {
  const now = new Date('2026-11-11T10:00:00Z')
  const contact = (over: Partial<Parameters<typeof pickDialableContacts>[0]['candidates'][number]>) => ({
    id: 'cc1', destinationNumber: '+8801711000000', status: 'queued', attempts: 0,
    nextAttemptAt: null, lastAttemptAt: null, contactId: null, ...over,
  })

  it('fills concurrency slots in order', () => {
    const candidates = [contact({ id: 'a' }), contact({ id: 'b' }), contact({ id: 'c' })]
    const { dialable, skipped } = pickDialableContacts({
      candidates, now, maxConcurrentCalls: 2, activeCalls: 0, dailyQuota: 10, callsStartedToday: 0, maxAttemptsPerContact: 3,
    })
    expect(dialable.map((c) => c.id)).toEqual(['a', 'b'])
    expect(skipped.find((s) => s.id === 'c')?.reason).toBe('concurrent_call_limit')
  })

  it('respects the daily quota', () => {
    const { dialable } = pickDialableContacts({
      candidates: [contact({ id: 'a' }), contact({ id: 'b' })], now,
      maxConcurrentCalls: 5, activeCalls: 0, dailyQuota: 3, callsStartedToday: 2, maxAttemptsPerContact: 3,
    })
    expect(dialable.map((c) => c.id)).toEqual(['a'])
  })

  it('skips contacts whose next attempt is in the future', () => {
    const { dialable, skipped } = pickDialableContacts({
      candidates: [contact({ id: 'a', nextAttemptAt: new Date('2026-11-11T11:00:00Z') })], now,
      maxConcurrentCalls: 2, activeCalls: 0, dailyQuota: 10, callsStartedToday: 0, maxAttemptsPerContact: 3,
    })
    expect(dialable).toHaveLength(0)
    expect(skipped[0].reason).toContain('scheduled')
  })

  it('skips maxed-out contacts and non-dialable statuses', () => {
    const { dialable, skipped } = pickDialableContacts({
      candidates: [contact({ id: 'a', attempts: 3 }), contact({ id: 'b', status: 'completed' })], now,
      maxConcurrentCalls: 5, activeCalls: 0, dailyQuota: 10, callsStartedToday: 0, maxAttemptsPerContact: 3,
    })
    expect(dialable).toHaveLength(0)
    expect(skipped.find((s) => s.id === 'a')?.reason).toBe('max_attempts')
    expect(skipped.find((s) => s.id === 'b')?.reason).toContain('not dialable')
  })

  it('counts already-active calls against concurrency', () => {
    const { dialable } = pickDialableContacts({
      candidates: [contact({ id: 'a' })], now,
      maxConcurrentCalls: 2, activeCalls: 2, dailyQuota: 10, callsStartedToday: 0, maxAttemptsPerContact: 3,
    })
    expect(dialable).toHaveLength(0)
  })
})
