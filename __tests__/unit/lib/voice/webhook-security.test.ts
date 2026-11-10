import { describe, it, expect } from 'vitest'
import {
  verifyWebhookSignature,
  signWebhookPayload,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_LEGACY_SECRET_HEADER,
} from '@/lib/voice/webhook-security'

const SECRET = 'whsec_test_secret_value'
const BODY = '{"event":"answered","callSessionId":"call_1"}'

function headers(map: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(map)) h.set(k, v)
  return h
}

describe('telephony webhook signature verification (security tests)', () => {
  it('accepts a valid HMAC signature', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = signWebhookPayload(SECRET, ts, BODY)
    const r = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: sig, [WEBHOOK_TIMESTAMP_HEADER]: ts }),
      secret: SECRET,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.method).toBe('hmac')
  })

  it('rejects a spoofed signature', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const r = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: 'deadbeef'.repeat(8), [WEBHOOK_TIMESTAMP_HEADER]: ts }),
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects a valid signature for a TAMPERED body', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = signWebhookPayload(SECRET, ts, BODY)
    const r = verifyWebhookSignature({
      rawBody: BODY.replace('answered', 'ended'),
      headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: sig, [WEBHOOK_TIMESTAMP_HEADER]: ts }),
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects REPLAYED signatures outside the timestamp window', () => {
    const oldTs = String(Math.floor((Date.now() - 30 * 60 * 1000) / 1000)) // 30 min old
    const sig = signWebhookPayload(SECRET, oldTs, BODY)
    const r = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: sig, [WEBHOOK_TIMESTAMP_HEADER]: oldTs }),
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('replay window')
  })

  it('rejects a signature made with the WRONG secret', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = signWebhookPayload('attacker_secret', ts, BODY)
    const r = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: sig, [WEBHOOK_TIMESTAMP_HEADER]: ts }),
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('requires BOTH signature headers when one is present', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    expect(verifyWebhookSignature({ rawBody: BODY, headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: 'x' }), secret: SECRET }).ok).toBe(false)
    expect(verifyWebhookSignature({ rawBody: BODY, headers: headers({ [WEBHOOK_TIMESTAMP_HEADER]: ts }), secret: SECRET }).ok).toBe(false)
  })

  it('rejects a non-numeric timestamp', () => {
    const r = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({ [WEBHOOK_SIGNATURE_HEADER]: 'x', [WEBHOOK_TIMESTAMP_HEADER]: 'not-a-time' }),
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('accepts the legacy static secret only when NO signature headers are present', () => {
    const legacy = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({ [WEBHOOK_LEGACY_SECRET_HEADER]: SECRET }),
      secret: SECRET,
    })
    expect(legacy.ok).toBe(true)
    if (legacy.ok) expect(legacy.usedLegacy).toBe(true)

    // A wrong HMAC must be rejected even if the legacy secret also matches.
    const forced = verifyWebhookSignature({
      rawBody: BODY,
      headers: headers({
        [WEBHOOK_SIGNATURE_HEADER]: 'bad-signature',
        [WEBHOOK_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
        [WEBHOOK_LEGACY_SECRET_HEADER]: SECRET,
      }),
      secret: SECRET,
    })
    expect(forced.ok).toBe(false)
  })

  it('fails closed when the tenant has no secret configured', () => {
    const r = verifyWebhookSignature({ rawBody: BODY, headers: headers({}), secret: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('no webhook secret')
  })
})
