/**
 * Enhanced Rate Limiter
 * ALO Labs AIOS — Sliding window rate limiting with per-IP and per-user
 * limits, configurable per-endpoint, Redis-backed with in-memory fallback.
 */

import { redisGet, redisSet, redisIncr, redisDel } from '@/lib/redis';

// ─── Configuration ──────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_LOCKOUT_WINDOW_MS = 15 * 60_000; // 15 minutes
const DEFAULT_LOCKOUT_THRESHOLD = 5; // failed attempts before lockout
const KEY_PREFIX = 'rl:';

// ─── Types ──────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface LockoutStatus {
  isLockedOut: boolean;
  attempts: number;
  lockoutUntil: number | null;
  remainingAttempts: number;
}

export interface EndpointConfig {
  maxRequests: number;
  windowMs: number;
  lockoutThreshold?: number;
  lockoutWindowMs?: number;
}

// ─── Endpoint-specific limits ───────────────────────────────────────

const endpointConfigs = new Map<string, EndpointConfig>([
  ['/api/auth/login', { maxRequests: 5, windowMs: 60_000, lockoutThreshold: 5, lockoutWindowMs: 900_000 }],
  ['/api/auth/mfa/verify', { maxRequests: 5, windowMs: 60_000, lockoutThreshold: 5, lockoutWindowMs: 900_000 }],
  ['/api/auth/mfa/resend', { maxRequests: 3, windowMs: 60_000 }],
  ['/api/auth/sso', { maxRequests: 10, windowMs: 60_000 }],
  ['/api/backups/create', { maxRequests: 5, windowMs: 300_000 }],
  ['/api/db/migrate', { maxRequests: 2, windowMs: 300_000 }],
  ['/api/db/restore', { maxRequests: 2, windowMs: 300_000 }],
  ['/api/security/secrets', { maxRequests: 20, windowMs: 60_000 }],
  ['/api/super-admin', { maxRequests: 30, windowMs: 60_000 }],
]);

// ─── In-memory fallback storage ─────────────────────────────────────

interface MemorySlidingWindow {
  timestamps: number[];
}

const memoryWindows = new Map<string, MemorySlidingWindow>();
const memoryLockouts = new Map<string, { attempts: number; lockoutUntil: number | null }>();

// Cleanup expired entries every 30 seconds
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();

    // Clean sliding windows
    for (const [key, window] of memoryWindows.entries()) {
      const cutoff = now - DEFAULT_WINDOW_MS;
      window.timestamps = window.timestamps.filter((t) => t > cutoff);
      if (window.timestamps.length === 0) {
        memoryWindows.delete(key);
      }
    }

    // Clean expired lockouts
    for (const [key, lockout] of memoryLockouts.entries()) {
      if (lockout.lockoutUntil && now > lockout.lockoutUntil) {
        memoryLockouts.delete(key);
      }
    }
  }, 30_000);
}

// ─── Helpers ────────────────────────────────────────────────────────

function getWindowKey(key: string, windowMs: number): string {
  const windowSizeSec = Math.ceil(windowMs / 1000);
  return `${KEY_PREFIX}${key}:${Math.floor(Date.now() / (windowSizeSec * 1000))}`;
}

// ─── Sliding Window Rate Limit ──────────────────────────────────────

/**
 * Check rate limit using sliding window algorithm.
 *
 * @param key - Unique identifier (IP address, userId, or combination)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit result with allowed, remaining, and resetAt
 */
export async function checkLimit(
  key: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  const now = Date.now();

  // Try Redis first
  const redisKey = `${KEY_PREFIX}sliding:${key}`;
  const stored = await redisGet(redisKey);

  if (stored) {
    try {
      const data = JSON.parse(stored) as { timestamps: number[] };
      // Filter to current window
      const cutoff = now - windowMs;
      const recentTimestamps = data.timestamps.filter((t) => t > cutoff);

      if (recentTimestamps.length >= maxRequests) {
        const oldestInWindow = recentTimestamps[0];
        const resetAt = oldestInWindow + windowMs;
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          limit: maxRequests,
        };
      }

      // Add current request
      recentTimestamps.push(now);
      await redisSet(
        redisKey,
        JSON.stringify({ timestamps: recentTimestamps }),
        Math.ceil(windowMs / 1000) + 1,
      );

      return {
        allowed: true,
        remaining: maxRequests - recentTimestamps.length,
        resetAt: now + windowMs,
        limit: maxRequests,
      };
    } catch {
      // Fall through to memory fallback
    }
  }

  // Memory fallback — sliding window
  const memKey = `${KEY_PREFIX}${key}`;
  let window = memoryWindows.get(memKey);

  if (!window) {
    window = { timestamps: [] };
    memoryWindows.set(memKey, window);
  }

  const cutoff = now - windowMs;
  window.timestamps = window.timestamps.filter((t) => t > cutoff);

  if (window.timestamps.length >= maxRequests) {
    const oldestInWindow = window.timestamps[0];
    const resetAt = oldestInWindow + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit: maxRequests,
    };
  }

  window.timestamps.push(now);

  return {
    allowed: true,
    remaining: maxRequests - window.timestamps.length,
    resetAt: now + windowMs,
    limit: maxRequests,
  };
}

// ─── Endpoint-aware limit check ─────────────────────────────────────

/**
 * Check rate limit for a specific endpoint, using endpoint-specific config
 * if defined, otherwise using defaults.
 */
export async function checkEndpointLimit(
  endpoint: string,
  identifier: string,
): Promise<RateLimitResult> {
  const config = endpointConfigs.get(endpoint);
  return checkLimit(
    `${endpoint}:${identifier}`,
    config?.maxRequests ?? DEFAULT_MAX_REQUESTS,
    config?.windowMs ?? DEFAULT_WINDOW_MS,
  );
}

// ─── Brute Force Tracking ───────────────────────────────────────────

/**
 * Track a failed attempt for brute force protection.
 * Increments the attempt counter and potentially locks out the key.
 */
export async function trackAttempt(key: string): Promise<void> {
  const now = Date.now();
  const lockoutKey = `${KEY_PREFIX}lockout:${key}`;

  // Try Redis
  const stored = await redisGet(lockoutKey);
  let attempts = 0;
  let lockoutUntil: number | null = null;

  if (stored) {
    try {
      const data = JSON.parse(stored) as { attempts: number; lockoutUntil: number | null };
      attempts = data.attempts;
      lockoutUntil = data.lockoutUntil;

      // If already locked out, don't increment
      if (lockoutUntil && now < lockoutUntil) {
        return;
      }
    } catch {
      // Fall through to memory
    }
  }

  // Memory fallback: check existing attempts when Redis is unavailable
  if (!stored) {
    const memEntry = memoryLockouts.get(lockoutKey);
    if (memEntry) {
      attempts = memEntry.attempts;
      lockoutUntil = memEntry.lockoutUntil;

      // If already locked out in memory, don't increment
      if (lockoutUntil && now < lockoutUntil) {
        return;
      }
    }
  }

  attempts++;

  if (attempts >= DEFAULT_LOCKOUT_THRESHOLD) {
    lockoutUntil = now + DEFAULT_LOCKOUT_WINDOW_MS;
  }

  await redisSet(
    lockoutKey,
    JSON.stringify({ attempts, lockoutUntil }),
    Math.ceil(DEFAULT_LOCKOUT_WINDOW_MS / 1000) + 1,
  );

  // Memory fallback
  const memEntry = memoryLockouts.get(lockoutKey) ?? { attempts: 0, lockoutUntil: null };
  memEntry.attempts = attempts;
  if (attempts >= DEFAULT_LOCKOUT_THRESHOLD) {
    memEntry.lockoutUntil = now + DEFAULT_LOCKOUT_WINDOW_MS;
  }
  memoryLockouts.set(lockoutKey, memEntry);
}

/**
 * Reset failed attempts for a key (e.g., after successful login).
 */
export async function resetAttempts(key: string): Promise<void> {
  const lockoutKey = `${KEY_PREFIX}lockout:${key}`;
  await redisDel(lockoutKey);
  memoryLockouts.delete(lockoutKey);
}

// ─── Lockout Status ─────────────────────────────────────────────────

/**
 * Check if a key (IP/user) is currently locked out.
 */
export async function getLockoutStatus(key: string): Promise<LockoutStatus> {
  const now = Date.now();
  const lockoutKey = `${KEY_PREFIX}lockout:${key}`;

  // Try Redis
  const stored = await redisGet(lockoutKey);
  if (stored) {
    try {
      const data = JSON.parse(stored) as { attempts: number; lockoutUntil: number | null };
      if (data.lockoutUntil && now < data.lockoutUntil) {
        return {
          isLockedOut: true,
          attempts: data.attempts,
          lockoutUntil: data.lockoutUntil,
          remainingAttempts: 0,
        };
      }

      return {
        isLockedOut: false,
        attempts: data.attempts,
        lockoutUntil: null,
        remainingAttempts: DEFAULT_LOCKOUT_THRESHOLD - data.attempts,
      };
    } catch {
      // Fall through
    }
  }

  // Memory fallback
  const memEntry = memoryLockouts.get(lockoutKey);
  if (memEntry) {
    if (memEntry.lockoutUntil && now < memEntry.lockoutUntil) {
      return {
        isLockedOut: true,
        attempts: memEntry.attempts,
        lockoutUntil: memEntry.lockoutUntil,
        remainingAttempts: 0,
      };
    }

    return {
      isLockedOut: false,
      attempts: memEntry.attempts,
      lockoutUntil: null,
      remainingAttempts: DEFAULT_LOCKOUT_THRESHOLD - memEntry.attempts,
    };
  }

  return {
    isLockedOut: false,
    attempts: 0,
    lockoutUntil: null,
    remainingAttempts: DEFAULT_LOCKOUT_THRESHOLD,
  };
}