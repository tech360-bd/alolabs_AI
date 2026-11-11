/**
 * Customer Context Engine (master prompt §12/§15) — inbound caller
 * identification and phone-based CRM matching.
 *
 * DEDUP RULE (hard): customers are matched on NORMALIZED phone number only.
 * We never merge records on name similarity, email heuristics or "weak
 * identity matching". When no exact normalized-phone match exists the caller
 * is treated as unknown — a new CRM contact may be created only via the
 * explicit `ensureContactForCaller` path which records the call as the lead
 * source.
 *
 * Bangladesh normalization: local mobiles "01711xxxxxx" and domestic
 * "8801711xxxxxx" both map to E.164 "+8801711xxxxxx". Numbers that cannot be
 * parsed return null — callers fail honestly instead of guessing.
 */

export interface NormalizedPhone {
  e164: string
  countryCode: string
  nationalNumber: string
}

/**
 * Normalize a phone number to E.164.
 *
 * - "+8801711xxxxxx" → +8801711xxxxxx (international, any country preserved)
 * - "8801711xxxxxx" / "01711xxxxxx" → +8801711xxxxxx (Bangladesh rules)
 * - Anything unparseable → null (callers must fail honestly, never guess).
 */
export function normalizeBdPhoneNumber(raw: string | null | undefined): NormalizedPhone | null {
  if (!raw) return null
  const plus = raw.trim().startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null

  if (plus) {
    if (digits.length < 8) return null
    const cc = digits.startsWith('880') ? '880' : null
    return { e164: `+${digits}`, countryCode: cc ?? '', nationalNumber: cc ? digits.slice(3) : digits }
  }

  // No plus sign — apply BD rules.
  let national: string | null = null
  if (digits.startsWith('880') && digits.length >= 12) national = digits.slice(3)
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1)

  if (!national || !/^\d{10}$/.test(national)) return null
  return { e164: `+880${national}`, countryCode: '880', nationalNumber: national }
}

export interface PhoneMatchableContact {
  id: string
  phone: string | null
  firstName?: string
  lastName?: string
  email?: string
  status?: string
}

export interface CallerMatch {
  matched: boolean
  contactId: string | null
  matchedNumber: string | null
  method: 'exact_normalized_phone' | 'none'
}

/**
 * Identify a caller by exact normalized-phone match. Multiple CRM rows may
 * share a number; the most recently contacted wins (lastContactAt desc),
 * then createdAt desc — deterministic, never a random pick.
 */
export function matchContactByPhone(
  contacts: PhoneMatchableContact[],
  rawNumber: string,
): CallerMatch {
  const normalized = normalizeBdPhoneNumber(rawNumber)
  if (!normalized) return { matched: false, contactId: null, matchedNumber: null, method: 'none' }

  const hit = contacts.filter((c) => {
    const n = normalizeBdPhoneNumber(c.phone)
    return n && n.e164 === normalized.e164
  })[0] // caller's query orders candidates (lastContactAt desc); first wins deterministically

  if (!hit) return { matched: false, contactId: null, matchedNumber: normalized.e164, method: 'none' }
  return { matched: true, contactId: hit.id, matchedNumber: normalized.e164, method: 'exact_normalized_phone' }
}

export interface InboundIdentification {
  contactId: string | null
  e164: string | null
  /** True when the number is on the tenant's suppression list. */
  suppressed: boolean
  suppressionReason?: string
  reason: string
}

/**
 * Assemble everything the inbound flow needs about a caller BEFORE the AI
 * speaks: identity, suppression status. Pure — the DB reads are the caller's
 * job (route/worker), keeping this unit-testable.
 */
export function identifyCaller(params: {
  fromNumber: string
  contacts: PhoneMatchableContact[]
  dncEntries: Array<{ phoneNumber: string; reason?: string }>
}): InboundIdentification {
  const normalized = normalizeBdPhoneNumber(params.fromNumber)
  const match = matchContactByPhone(params.contacts, params.fromNumber)
  const suppressed = params.dncEntries.some((e) => {
    const n = normalizeBdPhoneNumber(e.phoneNumber)
    return n && normalized && n.e164 === normalized.e164
  })
  return {
    contactId: match.contactId,
    e164: normalized?.e164 ?? null,
    suppressed,
    suppressionReason: suppressed ? 'number is on the tenant suppression list' : undefined,
    reason: match.matched
      ? `caller matched to CRM contact ${match.contactId}`
      : 'unknown caller — no exact normalized phone match',
  }
}
