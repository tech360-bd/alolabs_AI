import { describe, it, expect } from 'vitest'
import {
  HANDOFF_RULES,
  evaluateHandoff,
  isDncBlocked,
  normalizePhoneNumber,
  outboundEligibility,
  recordingAllowed,
  voiceCloneAllowed,
} from '@/lib/voice/consent'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/voice/routing'

describe('DNC suppression', () => {
  const entries = [
    { phoneNumber: '+8801712345678', reason: 'customer_request' },
    { phoneNumber: '+8801898765432', reason: 'campaign_frequency' },
  ]

  it('blocks numbers on the DNC list', () => {
    expect(isDncBlocked({ number: '+8801712345678', dncEntries: entries, respectDnc: true }).blocked).toBe(true)
  })

  it('matches across formatting differences', () => {
    expect(isDncBlocked({ number: '+880 1712-345678', dncEntries: entries, respectDnc: true }).blocked).toBe(true)
    expect(normalizePhoneNumber('+880 1712-345678')).toBe('+8801712345678')
  })

  it('allows numbers not on the list', () => {
    expect(isDncBlocked({ number: '+8801999999999', dncEntries: entries, respectDnc: true }).blocked).toBe(false)
  })

  it('ALWAYS honors customer-request opt-outs even if respectDnc is misconfigured', () => {
    const result = isDncBlocked({ number: '+8801712345678', dncEntries: entries, respectDnc: false })
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('dnc_customer_request_opt_out')
  })
})

describe('outbound eligibility (calling hours, attempts, frequency)', () => {
  // Monday 2026-01-05, 10:00 Dhaka = 04:00 UTC
  const inHours = new Date('2026-01-05T04:00:00Z')
  const outHours = new Date('2026-01-05T14:00:00Z') // 20:00 Dhaka

  it('allows a call inside calling hours', () => {
    const r = outboundEligibility({ config: DEFAULT_BUSINESS_HOURS, attemptsSoFar: 0, at: inHours })
    expect(r.allowed).toBe(true)
  })

  it('blocks outside calling hours with a reason', () => {
    const r = outboundEligibility({ config: DEFAULT_BUSINESS_HOURS, attemptsSoFar: 0, at: outHours })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('outside_calling_hours')
  })

  it('enforces the attempt cap', () => {
    const r = outboundEligibility({ config: DEFAULT_BUSINESS_HOURS, attemptsSoFar: 3, at: inHours })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('max_attempts_reached')
  })

  it('enforces per-contact frequency gaps', () => {
    const lastAttempt = new Date('2026-01-05T03:30:00Z') // 30 min ago
    const r = outboundEligibility({
      config: { ...DEFAULT_BUSINESS_HOURS, minGapMinutesPerContact: 1440 },
      attemptsSoFar: 1,
      lastAttemptAt: lastAttempt,
      at: inHours,
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('frequency_limit')
  })
})

describe('recording consent (default-deny)', () => {
  it('blocks when disabled', () => {
    expect(recordingAllowed({ recordingMode: 'disabled', disclosureText: 'x', consentGranted: true }).allowed).toBe(false)
  })
  it('blocks without a disclosure text', () => {
    expect(recordingAllowed({ recordingMode: 'always_with_consent', disclosureText: null, consentGranted: true }).allowed).toBe(false)
  })
  it('blocks without recorded consent', () => {
    expect(recordingAllowed({ recordingMode: 'on_demand', disclosureText: 'Call may be recorded', consentGranted: false }).allowed).toBe(false)
  })
  it('allows only with disclosure + consent', () => {
    const r = recordingAllowed({ recordingMode: 'always_with_consent', disclosureText: 'Call may be recorded', consentGranted: true })
    expect(r.allowed).toBe(true)
  })
})

describe('authorized voice cloning gate', () => {
  it('forbids cloning without a consent record', () => {
    expect(voiceCloneAllowed(null).allowed).toBe(false)
    expect(voiceCloneAllowed(undefined).reason).toContain('forbidden')
  })

  it('forbids unverified, rejected and revoked consent', () => {
    expect(voiceCloneAllowed({ status: 'pending', verificationMethod: 'written', verifiedAt: new Date() }).allowed).toBe(false)
    expect(voiceCloneAllowed({ status: 'rejected', verificationMethod: 'written', verifiedAt: new Date() }).allowed).toBe(false)
    expect(voiceCloneAllowed({ status: 'revoked', verificationMethod: 'written', verifiedAt: new Date() }).allowed).toBe(false)
    expect(voiceCloneAllowed({ status: 'verified', verificationMethod: 'written', verifiedAt: new Date(), revokedAt: new Date() }).allowed).toBe(false)
  })

  it('requires a verification timestamp on verified records', () => {
    expect(voiceCloneAllowed({ status: 'verified', verificationMethod: 'written', verifiedAt: null }).allowed).toBe(false)
  })

  it('allows properly verified consent', () => {
    const r = voiceCloneAllowed({ status: 'verified', verificationMethod: 'identity_verified', verifiedAt: new Date() })
    expect(r.allowed).toBe(true)
  })
})

describe('human handoff rules', () => {
  it('hands off when the customer asks for a human (mandatory)', () => {
    const r = evaluateHandoff({ utterance: 'I want to talk to a human agent please' })
    expect(r.handoff).toBe(true)
    expect(r.mandatory).toBe(true)
    expect(r.trigger).toBe('customer_requested_human')
  })

  it('detects Bangla request for a human', () => {
    const r = evaluateHandoff({ utterance: 'আমি মানুষের সাথে কথা বলতে চাই' })
    expect(r.handoff).toBe(true)
  })

  it('mandatory transfer on payment disputes and legal threats', () => {
    expect(evaluateHandoff({ utterance: 'I demand a refund now' }).trigger).toBe('payment_dispute')
    expect(evaluateHandoff({ utterance: 'আমি আইনজীবীর সাথে কথা বলব' }).trigger).toBe('legal_or_safety')
  })

  it('does not hand off on normal conversation', () => {
    const r = evaluateHandoff({ utterance: 'আমার বিল কত?' })
    expect(r.handoff).toBe(false)
  })

  it('hands off after repeated recognition failures', () => {
    const r = evaluateHandoff({ asrFailureCount: 3 })
    expect(r.handoff).toBe(true)
    expect(r.trigger).toBe('repeated_recognition_failure')
  })

  it('suggests clarification at low ASR confidence before handing off', () => {
    const r = evaluateHandoff({ asrConfidence: 0.3, asrFailureCount: 0 })
    expect(r.handoff).toBe(false)
    expect(r.reason).toContain('clarify')
  })

  it('hands off at max call duration', () => {
    const r = evaluateHandoff({ callDurationSeconds: 700, maxCallSeconds: 600 })
    expect(r.handoff).toBe(true)
    expect(r.trigger).toBe('max_duration')
  })

  it('keeps structural rules non-empty — the AI cannot remove them', () => {
    expect(HANDOFF_RULES.length).toBeGreaterThanOrEqual(4)
    expect(HANDOFF_RULES.filter((r) => r.mandatory).length).toBeGreaterThanOrEqual(3)
  })
})
