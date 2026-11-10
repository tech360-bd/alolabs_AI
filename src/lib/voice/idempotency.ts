/**
 * Request-level idempotency for voice POSTs (master prompt §22).
 *
 * Adapters and clients retry. A retried "place call" must never create a
 * second PSTN call — that would be a real customer called twice and real
 * money spent twice. Clients pass an `Idempotency-Key` header; the first
 * successful response is stored and replayed for 24h.
 *
 * Storage: `VoiceIdempotencyKey` (unique per tenant+scope+key). Expired rows
 * are cleaned lazily. A key that is still `pending` (request in flight)
 * returns 409-style conflict instead of double-executing.
 */

import { db } from '@/lib/db'

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`idempotency key "${key}" is already in flight — retry with the same key or a new one`)
    this.name = 'IdempotencyConflictError'
  }
}

export interface IdempotentOutcome<T> {
  replayed: boolean
  result: T
}

/**
 * Execute `fn` under an idempotency key. The fn's result must be
 * JSON-serializable. On key hit with a stored response, replay it.
 */
export async function withIdempotency<T>(params: {
  companyId: string
  scope: string
  key: string
  fn: () => Promise<T>
}): Promise<IdempotentOutcome<T>> {
  const normalized = params.key.trim()
  if (!normalized) {
    // No key provided: execute directly (idempotency is opt-in per request).
    return { replayed: false, result: await params.fn() }
  }
  if (normalized.length > 255) throw new Error('Idempotency-Key too long (max 255)')

  const unique = { companyId_scope_key: { companyId: params.companyId, scope: params.scope, key: normalized } }
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS)

  try {
    await db.voiceIdempotencyKey.create({
      data: { companyId: params.companyId, scope: params.scope, key: normalized, status: 'pending', expiresAt },
      select: { id: true },
    })
  } catch {
    // Unique violation — the key exists.
    const existing = await db.voiceIdempotencyKey.findUnique({ where: unique })
    if (!existing) throw new Error('idempotency key collision could not be resolved')
    if (existing.status === 'pending' && existing.expiresAt && existing.expiresAt.getTime() > Date.now()) {
      throw new IdempotencyConflictError(normalized)
    }
    if (existing.status === 'succeeded' && existing.responseJson !== null) {
      return { replayed: true, result: JSON.parse(existing.responseJson) as T }
    }
    // Failed/expired → allow retry by resetting.
    await db.voiceIdempotencyKey.update({
      where: unique,
      data: { status: 'pending', responseJson: null, expiresAt },
    })
  }

  try {
    const result = await params.fn()
    await db.voiceIdempotencyKey.update({
      where: unique,
      data: { status: 'succeeded', responseJson: JSON.stringify(result) },
    })
    return { replayed: false, result }
  } catch (err) {
    await db.voiceIdempotencyKey
      .update({ where: unique, data: { status: 'failed', responseJson: null } })
      .catch(() => undefined)
    throw err
  }
}

/** Lazy cleanup of expired keys (safe to call from any voice POST). */
export async function pruneIdempotencyKeys(): Promise<void> {
  await db.voiceIdempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
}
