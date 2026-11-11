/**
 * Telephony webhook signature verification (master prompt §19/§22/§23).
 *
 * Fixes the historical plaintext-secret check, which was vulnerable to
 * copy-the-header replay. The supported scheme is:
 *
 *   signature = hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`))
 *
 * Headers:
 *   x-alolabs-timestamp — unix seconds when the adapter signed the request
 *   x-alolabs-signature — hex HMAC over `${timestamp}.${rawBody}`
 *
 * Verification is constant-time and the timestamp window is bounded, so a
 * captured request cannot be replayed minutes later. The legacy static header
 * (`x-alolabs-webhook-secret`) is accepted ONLY during the migration window
 * and only when no signature headers are present; adapters that send
 * signature headers must present a valid HMAC (a wrong HMAC is rejected even
 * if the static secret matches).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const WEBHOOK_SIGNATURE_HEADER = 'x-alolabs-signature'
export const WEBHOOK_TIMESTAMP_HEADER = 'x-alolabs-timestamp'
export const WEBHOOK_LEGACY_SECRET_HEADER = 'x-alolabs-webhook-secret'

/** Max age of the signed timestamp (replay window). 5 minutes. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

export type WebhookAuthResult =
  | { ok: true; method: 'hmac' | 'legacy_secret'; usedLegacy: boolean }
  | { ok: false; reason: string; status: 401 }

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) {
    // Compare against self to keep timing uniform, then fail.
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

export function verifyWebhookSignature(params: {
  rawBody: string
  headers: Headers | Record<string, string | null | undefined>
  secret: string | null | undefined
  now?: Date
  toleranceMs?: number
}): WebhookAuthResult {
  const now = params.now ?? new Date()
  const tolerance = params.toleranceMs ?? WEBHOOK_TIMESTAMP_TOLERANCE_MS
  const header = (name: string): string | null => {
    const h = params.headers as { get?: (n: string) => string | null; [k: string]: unknown }
    if (typeof h.get === 'function') return h.get(name)
    const direct = h[name]
    return typeof direct === 'string' ? direct : null
  }

  if (!params.secret) {
    return { ok: false, reason: 'tenant has no webhook secret configured', status: 401 }
  }

  const signature = header(WEBHOOK_SIGNATURE_HEADER)
  const timestamp = header(WEBHOOK_TIMESTAMP_HEADER)
  const legacy = header(WEBHOOK_LEGACY_SECRET_HEADER)

  // Signature headers present → HMAC is mandatory.
  if (signature !== null || timestamp !== null) {
    if (!signature || !timestamp) {
      return { ok: false, reason: 'signature and timestamp headers are both required', status: 401 }
    }
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || ts <= 0) {
      return { ok: false, reason: 'invalid signature timestamp', status: 401 }
    }
    const age = now.getTime() - ts * 1000
    if (Math.abs(age) > tolerance) {
      return { ok: false, reason: 'signature timestamp outside replay window', status: 401 }
    }
    const expected = signWebhookPayload(params.secret, timestamp, params.rawBody)
    if (!constantTimeEqual(signature.toLowerCase(), expected)) {
      return { ok: false, reason: 'invalid webhook signature', status: 401 }
    }
    return { ok: true, method: 'hmac', usedLegacy: false }
  }

  // Migration window: no signature headers at all → legacy static secret.
  if (legacy !== null && constantTimeEqual(legacy, params.secret)) {
    return { ok: true, method: 'legacy_secret', usedLegacy: true }
  }
  return { ok: false, reason: 'missing webhook credentials', status: 401 }
}
