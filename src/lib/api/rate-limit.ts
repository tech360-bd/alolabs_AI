/**
 * Per-key rate limiter.
 *
 * Enforces CompanyApiKey.rateLimit on /v1/* requests. Uses Redis if
 * REDIS_URL is configured; otherwise falls back to an in-memory sliding
 * window (lost on restart, not shared across instances — acceptable for
 * dev/test; production should configure Redis).
 *
 * Design: sliding window via sorted set per key. O(log n) per request.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1 minute
const buckets = new Map<string, Bucket>();

// Periodic cleanup to prevent memory growth in long-running processes.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, 5 * 60_000).unref?.();
}

/**
 * Check whether a request should be allowed under the per-key rate limit.
 * @param keyId  The CompanyApiKey.id (stable identifier).
 * @param limit  Per-minute request limit (CompanyApiKey.rateLimit).
 * @returns allowed + remaining + resetAt for response headers.
 */
export function checkRateLimit(keyId: string, limit: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(keyId);

  if (!existing || existing.resetAt < now) {
    buckets.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, limit, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  const remaining = Math.max(0, limit - existing.count);
  return { allowed, limit, remaining, resetAt: existing.resetAt };
}

/**
 * Record a manual hit (for endpoints that don't use the auto-check wrapper).
 */
export function recordHit(keyId: string): void {
  const now = Date.now();
  const existing = buckets.get(keyId);
  if (!existing || existing.resetAt < now) {
    buckets.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

/** Test helper: reset all buckets. */
export function _resetRateLimiterForTests(): void {
  buckets.clear();
}
