/**
 * Enhanced Rate Limiter
 * ALO Labs AIOS — Sliding window rate limiting with per-IP and per-user
 * limits, configurable per-endpoint, Redis-backed with in-memory fallback.
 */

import { evalLimitScript, redisDel } from '@/lib/redis';

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

// One Redis operation must both admit AND record a request. GET + SET loses
// counts when two server instances handle requests concurrently. Keep at most
// `limit` timestamps per key, expiring the list after its real window.
const SLIDING = `
  local key, now, window, limit = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
  local head = redis.call('LINDEX', key, 0)
  while head and tonumber(head) <= now-window do
    redis.call('LPOP', key)
    head = redis.call('LINDEX', key, 0)
  end
  local count = redis.call('LLEN', key)
  if count >= limit then return {0, 0, tonumber(head)+window} end
  redis.call('RPUSH', key, now)
  redis.call('PEXPIRE', key, window)
  return {1, limit-count-1, tonumber(head or now)+window}`;

// Five *failed* credentials start a fixed lockout. Reads and attempts during
// lockout do not extend it; sub-threshold buckets also expire.
const FAILURE = `
  local n = tonumber(redis.call('GET', KEYS[1]) or '0')
  if ARGV[1]=='1' and n<tonumber(ARGV[2]) then
    n = redis.call('INCR', KEYS[1]); redis.call('PEXPIRE', KEYS[1],ARGV[3])
  end
  return {n, redis.call('PTTL', KEYS[1])}`;

type Window = { timestamps: number[]; expires: number };
type Attempts = { count: number; expires: number };
const windows = new Map<string, Window>();
const failures = new Map<string, Attempts>();
let nextSweep = 0;
function sweep(now: number) {
  if (now < nextSweep) return;
  nextSweep = now + 30_000;
  for (const [k, v] of windows) if (v.expires <= now) windows.delete(k);
  for (const [k, v] of failures) if (v.expires <= now) failures.delete(k);
}

export async function checkLimit(key: string, limit = DEFAULT_MAX_REQUESTS, windowMs = DEFAULT_WINDOW_MS): Promise<RateLimitResult> {
  const now = Date.now();
  const shared = await evalLimitScript(SLIDING, `${KEY_PREFIX}window:v2:${key}`, now, windowMs, limit);
  if (shared) return { allowed: shared[0] === 1, remaining: shared[1], resetAt: shared[2], limit };
  sweep(now);
  const timestamps = (windows.get(key)?.timestamps ?? []).filter(t => t > now - windowMs);
  const allowed = timestamps.length < limit;
  if (allowed) timestamps.push(now);
  windows.set(key, { timestamps, expires: timestamps[timestamps.length-1] + windowMs });
  return { allowed, remaining: Math.max(0, limit - timestamps.length), resetAt: timestamps[0] + windowMs, limit };
}

export function checkEndpointLimit(endpoint: string, identifier: string): Promise<RateLimitResult> {
  const config = endpointConfigs.get(endpoint);
  return checkLimit(`${endpoint}:${identifier}`, config?.maxRequests, config?.windowMs);
}

const failureKey = (key: string) => `${KEY_PREFIX}failure:v2:${key}`;
async function failureState(key: string, increment: boolean): Promise<Attempts> {
  const now = Date.now(), storageKey = failureKey(key);
  const shared = await evalLimitScript(FAILURE, storageKey, Number(increment), DEFAULT_LOCKOUT_THRESHOLD, DEFAULT_LOCKOUT_WINDOW_MS);
  if (shared) return { count: shared[0], expires: now + Math.max(0, shared[1]) };
  sweep(now);
  let state = failures.get(storageKey);
  if (!state || state.expires <= now) state = { count: 0, expires: 0 };
  if (increment && state.count < DEFAULT_LOCKOUT_THRESHOLD) {
    state = { count: state.count + 1, expires: now + DEFAULT_LOCKOUT_WINDOW_MS };
    failures.set(storageKey, state);
  }
  return state;
}

export async function trackAttempt(key: string): Promise<void> {
  await failureState(key, true);
}
export async function resetAttempts(key: string): Promise<void> {
  await redisDel(failureKey(key));
  failures.delete(failureKey(key));
}
export async function getLockoutStatus(key: string): Promise<LockoutStatus> {
  const { count, expires } = await failureState(key, false);
  const isLockedOut = count >= DEFAULT_LOCKOUT_THRESHOLD;
  return { isLockedOut, attempts: count, lockoutUntil: isLockedOut ? expires : null, remainingAttempts: Math.max(0, DEFAULT_LOCKOUT_THRESHOLD - count) };
}
