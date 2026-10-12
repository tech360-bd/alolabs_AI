/**
 * DB-Backed Sliding Window Rate Limiter
 *
 * Uses the RateLimitRecord Prisma model for persistence.
 * Each request records a timestamp; the count within the sliding window
 * is compared against the limit.
 *
 * Old records are lazily cleaned up on each check.
 */

import { db } from '@/lib/db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  totalInWindow: number;
}

/**
 * Check if a rate-limited action is allowed.
 *
 * @param key      — Unique identifier for the rate limit bucket (e.g., "ip:127.0.0.1", "user:abc123:api")
 * @param limit    — Maximum number of actions allowed in the window
 * @param windowMs — Sliding window duration in milliseconds
 * @returns RateLimitResult with allowed flag and metadata
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Count records in the current window
  const count = await db.rateLimitRecord.count({
    where: {
      key,
      timestamp: { gte: windowStart },
    },
  });

  const allowed = count < limit;
  const remaining = Math.max(0, limit - count - (allowed ? 1 : 0));
  const resetAt = new Date(windowStart.getTime() + windowMs);

  if (allowed) {
    // Record this request
    await db.rateLimitRecord.create({
      data: {
        key,
        timestamp: now,
      },
    });
  }

  // Lazy cleanup: delete expired records (older than 2x window to be safe)
  const cleanupThreshold = new Date(now.getTime() - windowMs * 2);
  db.rateLimitRecord.deleteMany({
    where: {
      key,
      timestamp: { lt: cleanupThreshold },
    },
  }).catch(() => {
    // Cleanup is best-effort; don't block the request
  });

  return {
    allowed,
    remaining,
    resetAt,
    totalInWindow: count,
  };
}

/**
 * Reset rate limit for a given key (e.g., on user upgrade or admin action).
 */
export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimitRecord.deleteMany({
    where: { key },
  });
}

/**
 * Get current usage for a key without incrementing the counter.
 */
export async function getRateLimitUsage(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ count: number; remaining: number; resetAt: Date }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const count = await db.rateLimitRecord.count({
    where: {
      key,
      timestamp: { gte: windowStart },
    },
  });

  return {
    count,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}
