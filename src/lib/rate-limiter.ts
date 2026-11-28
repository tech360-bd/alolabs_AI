/**
 * Rate limiting — single implementation.
 *
 * This module used to implement its own sliding window with a read-then-write
 * pair against the `RateLimitRecord` table:
 *
 *     const count = await db.rateLimitRecord.count({ where: {...} });   // read
 *     if (count < limit) await db.rateLimitRecord.create({ ... });      // write
 *
 * Two round trips with no transaction or unique constraint, so N concurrent
 * requests all observed the same `count`, all passed, and all wrote. The limit
 * was therefore advisory under exactly the traffic pattern that matters — a
 * burst — while still paying a database round trip (and a deleteMany) per
 * request on the hot path.
 *
 * It now delegates to `src/lib/security/rate-limiter.ts#checkLimit`, which is
 * the single authoritative limiter:
 *   - Redis: one atomic Lua script (EVAL) per check.
 *   - No Redis: an in-process sliding window, documented as single-instance
 *     only, which is correct for dev/test and never silently drops the limit.
 *
 * The public signature is unchanged so existing call sites keep working.
 */

import { checkLimit, peekLimit, resetLimit } from '@/lib/security/rate-limiter';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  totalInWindow: number;
}

/** Prefix kept distinct from other limiters so buckets cannot collide. */
const KEY_PREFIX = 'alo:rl:';

/**
 * Check if a rate-limited action is allowed.
 *
 * @param key      — Unique identifier for the rate limit bucket (e.g. "ip:127.0.0.1", "user:abc123:api")
 * @param limit    — Maximum number of actions allowed in the window
 * @param windowMs — Sliding window duration in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const result = await checkLimit(`${KEY_PREFIX}${key}`, limit, windowMs);
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: new Date(result.resetAt),
    // `remaining` is computed as limit - (count + this request), so the count
    // observed in the window is derivable without another query.
    totalInWindow: Math.max(0, limit - result.remaining - (result.allowed ? 1 : 0)),
  };
}

/**
 * Clear a bucket (e.g. after a successful login, or an admin unlock).
 */
export async function resetRateLimit(key: string): Promise<void> {
  await resetLimit(`${KEY_PREFIX}${key}`);
}

/** Current usage for a key, without consuming a slot. */
export async function getRateLimitUsage(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ count: number; remaining: number; resetAt: Date }> {
  const result = await peekLimit(`${KEY_PREFIX}${key}`, limit, windowMs);
  return {
    count: result.count,
    remaining: result.remaining,
    resetAt: new Date(result.resetAt),
  };
}
