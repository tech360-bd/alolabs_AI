import { describe, it, expect } from 'vitest'
import {
  normalizeBdPhoneNumber,
  matchContactByPhone,
  identifyCaller,
  type PhoneMatchableContact,
} from '@/lib/voice/customers'

describe('BD phone normalization', () => {
  it('normalizes local, domestic and E.164 forms to the same number', () => {
    const forms = ['01711000000', '8801711000000', '+8801711000000', '+880 1711-000000']
    const normalized = forms.map((f) => normalizeBdPhoneNumber(f)?.e164)
    for (const n of normalized) expect(n).toBe('+8801711000000')
  })

  it('preserves non-BD international numbers as-is', () => {
    expect(normalizeBdPhoneNumber('+14155551234')?.e164).toBe('+14155551234')
  })

  it('returns null for garbage instead of guessing', () => {
    expect(normalizeBdPhoneNumber('hello')).toBeNull()
    expect(normalizeBdPhoneNumber('12345')).toBeNull()
    expect(normalizeBdPhoneNumber('')).toBeNull()
    expect(normalizeBdPhoneNumber(null)).toBeNull()
  })
})

describe('customer matching (exact normalized phone only — never weak identity)', () => {
  const contacts: PhoneMatchableContact[] = [
    { id: 'c1', phone: '01711-000000', firstName: 'Rahim' },
    { id: 'c2', phone: '+8801811000000', firstName: 'Karim' },
    { id: 'c3', phone: null },
  ]

  it('matches a caller across number formats', () => {
    expect(matchContactByPhone(contacts, '+8801711000000').contactId).toBe('c1')
    expect(matchContactByPhone(contacts, '8801811000000').contactId).toBe('c2')
  })

  it('returns unmatched for unknown callers', () => {
    const m = matchContactByPhone(contacts, '+8801900000000')
    expect(m.matched).toBe(false)
    expect(m.contactId).toBeNull()
    expect(m.method).toBe('none')
  })

  it('does NOT match on similar-but-different numbers', () => {
    expect(matchContactByPhone(contacts, '+8801711000001').matched).toBe(false)
  })
})

describe('inbound caller identification (Customer Context Engine)', () => {
  const contacts: PhoneMatchableContact[] = [{ id: 'c9', phone: '+8801711000000' }]
  const dnc = [{ phoneNumber: '+8801911000000', reason: 'customer_request' }]

  it('assembles identity, suppression and reason', () => {
    const known = identifyCaller({ fromNumber: '01711000000', contacts, dncEntries: dnc })
    expect(known.contactId).toBe('c9')
    expect(known.e164).toBe('+8801711000000')
    expect(known.suppressed).toBe(false)

    const suppressed = identifyCaller({ fromNumber: '+8801911000000', contacts, dncEntries: dnc })
    expect(suppressed.contactId).toBeNull()
    expect(suppressed.suppressed).toBe(true)
    expect(suppressed.suppressionReason).toBeTruthy()

    const unknown = identifyCaller({ fromNumber: '+8801922000000', contacts, dncEntries: dnc })
    expect(unknown.contactId).toBeNull()
    expect(unknown.reason).toContain('unknown caller')
  })
})
