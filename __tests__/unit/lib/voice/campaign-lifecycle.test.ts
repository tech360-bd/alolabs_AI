import { describe, it, expect } from 'vitest'
import {
  campaignTransition,
  InvalidCampaignTransitionError,
  dialGate,
  campaignExpiryCheck,
  isDuplicateDestination,
  campaignStatusForCallState,
  isCampaignStatus,
  CAMPAIGN_STATUSES,
} from '@/lib/voice/campaign-lifecycle'

describe('campaign lifecycle state machine', () => {
  it('allows the approval workflow: draft → pending_approval → approved → running', () => {
    expect(() => campaignTransition('draft', 'pending_approval')).not.toThrow()
    expect(() => campaignTransition('pending_approval', 'approved')).not.toThrow()
    expect(() => campaignTransition('approved', 'running')).not.toThrow()
  })

  it('allows pause/resume of a running campaign', () => {
    expect(() => campaignTransition('running', 'paused')).not.toThrow()
    expect(() => campaignTransition('paused', 'running')).not.toThrow()
  })

  it('rejects dialing from draft without approval', () => {
    expect(() => campaignTransition('draft', 'running')).toThrow(InvalidCampaignTransitionError)
  })

  it('rejects resurrection from terminal states', () => {
    for (const terminal of ['completed', 'cancelled', 'expired'] as const) {
      expect(() => campaignTransition(terminal, 'running')).toThrow(InvalidCampaignTransitionError)
      expect(() => campaignTransition(terminal, 'paused')).toThrow(InvalidCampaignTransitionError)
    }
  })

  it('rejects unknown statuses fail-closed', () => {
    expect(isCampaignStatus('half_done')).toBe(false)
    expect(() => campaignTransition('half_done' as never, 'running')).toThrow(InvalidCampaignTransitionError)
    expect(CAMPAIGN_STATUSES.length).toBeGreaterThan(5)
  })
})

describe('campaign expiry', () => {
  const at = new Date('2026-11-11T10:00:00Z')
  it('expires a campaign whose scheduledEnd has passed', () => {
    expect(campaignExpiryCheck({ status: 'running', scheduledEnd: new Date('2026-11-10T00:00:00Z') }, at).expired).toBe(true)
  })
  it('keeps a live campaign dialing', () => {
    expect(campaignExpiryCheck({ status: 'running', scheduledEnd: new Date('2026-12-01T00:00:00Z') }, at).expired).toBe(false)
    expect(campaignExpiryCheck({ status: 'running', scheduledEnd: null }, at).expired).toBe(false)
  })
})

describe('dial gate (status + expiry + concurrency + quota)', () => {
  const at = new Date('2026-11-11T10:00:00Z')
  const base = {
    campaign: { status: 'running' as const, scheduledEnd: null, maxConcurrentCalls: 2, dailyQuota: 10 },
    facts: { activeCalls: 0, callsStartedToday: 0 },
    at,
  }

  it('allows dialing within limits', () => {
    expect(dialGate(base).allowed).toBe(true)
  })

  it('blocks non-dialing statuses (draft, paused, pending_approval)', () => {
    for (const status of ['draft', 'paused', 'pending_approval', 'completed', 'cancelled', 'expired'] as const) {
      const r = dialGate({ ...base, campaign: { ...base.campaign, status } })
      expect(r.allowed).toBe(false)
      expect(r.reason).toContain(status)
    }
  })

  it('blocks at the concurrency limit', () => {
    const r = dialGate({ ...base, facts: { activeCalls: 2, callsStartedToday: 0 } })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('concurrent_call_limit')
  })

  it('blocks at the daily quota', () => {
    const r = dialGate({ ...base, facts: { activeCalls: 0, callsStartedToday: 10 } })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('daily_quota')
  })

  it('blocks after expiry', () => {
    const r = dialGate({
      ...base,
      campaign: { ...base.campaign, scheduledEnd: new Date('2026-11-01T00:00:00Z') },
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('expired')
  })

  it('treats dailyQuota=0 as unlimited', () => {
    const r = dialGate({
      ...base,
      campaign: { ...base.campaign, dailyQuota: 0 },
      facts: { activeCalls: 0, callsStartedToday: 9999 },
    })
    expect(r.allowed).toBe(true)
  })
})

describe('duplicate destination prevention (§13)', () => {
  it('collides on the same number in any writing format', () => {
    const existing = ['+8801711000000', '01811000000']
    expect(isDuplicateDestination(existing, '+8801711000000')).toBe(true)
    expect(isDuplicateDestination(existing, '8801711000000')).toBe(true)
    expect(isDuplicateDestination(existing, '01811000000')).toBe(true)
    expect(isDuplicateDestination(existing, '+8801900000000')).toBe(false)
  })
})

describe('campaign status mapping from call states', () => {
  it('maps terminal call states to honest campaign outcomes', () => {
    expect(campaignStatusForCallState('completed')).toBe('completed')
    expect(campaignStatusForCallState('no_answer')).toBe('no_answer')
    expect(campaignStatusForCallState('busy')).toBe('busy')
    expect(campaignStatusForCallState('failed')).toBe('failed')
    expect(campaignStatusForCallState('abandoned')).toBe('abandoned')
  })
})
