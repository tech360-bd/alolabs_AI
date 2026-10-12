import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis
const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSet = vi.fn().mockResolvedValue(undefined);
const mockRedisDel = vi.fn().mockResolvedValue(1);

vi.mock('@/lib/redis', () => ({
  redisGet: (...args: unknown[]) => mockRedisGet(...args),
  redisSet: (...args: unknown[]) => mockRedisSet(...args),
  redisDel: (...args: unknown[]) => mockRedisDel(...args),
}));

import {
  checkLimit,
  checkEndpointLimit,
  trackAttempt,
  resetAttempts,
  getLockoutStatus,
} from '@/lib/security/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // Force memory fallback
  });

  afterEach(() => {
    vi.useFakeTimers?.restore?.();
  });

  // ─── checkLimit ─────────────────────────────────────────────────

  describe('checkLimit (sliding window)', () => {
    it('should allow the first request', async () => {
      const result = await checkLimit('rl-test-first:user-1', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should allow requests within the limit', async () => {
      // Use a unique key to avoid state leak from other tests
      const key = 'rl-test-within:user-abc';
      for (let i = 0; i < 4; i++) {
        const result = await checkLimit(key, 5, 60_000);
        expect(result.allowed).toBe(true);
      }
      const last = await checkLimit(key, 5, 60_000);
      expect(last.allowed).toBe(true);
      expect(last.remaining).toBe(0);
    });

    it('should block requests that exceed the limit', async () => {
      const key = 'rl-test-exceed:user-xyz';
      for (let i = 0; i < 5; i++) {
        await checkLimit(key, 5, 60_000);
      }
      const result = await checkLimit(key, 5, 60_000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should return correct limit and resetAt', async () => {
      const result = await checkLimit('rl-test-reset:user-1', 10, 60_000);
      expect(result.limit).toBe(10);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('should track requests independently per key', async () => {
      for (let i = 0; i < 5; i++) {
        await checkLimit('rl-test-indep:user-a', 3, 60_000);
      }
      const userB = await checkLimit('rl-test-indep:user-b', 3, 60_000);
      expect(userB.allowed).toBe(true);
      expect(userB.remaining).toBe(2);
    });
  });

  // ─── checkEndpointLimit ─────────────────────────────────────────

  describe('checkEndpointLimit', () => {
    it('should use login endpoint config (5/min)', async () => {
      const result = await checkEndpointLimit('/api/auth/login', 'ep-test-user-1');
      expect(result.limit).toBe(5);
    });

    it('should use default config for unknown endpoints', async () => {
      const result = await checkEndpointLimit('/api/unknown', 'ep-test-user-2');
      expect(result.limit).toBe(100);
    });

    it('should use MFA verify endpoint config (5/min)', async () => {
      const result = await checkEndpointLimit('/api/auth/mfa/verify', 'ep-test-user-3');
      expect(result.limit).toBe(5);
    });
  });

  // ─── Brute Force Tracking ────────────────────────────────────────

  describe('trackAttempt / getLockoutStatus', () => {
    it('should start with 0 attempts', async () => {
      const status = await getLockoutStatus('bf-test-zero:ip-1.2.3.4');
      expect(status.attempts).toBe(0);
      expect(status.isLockedOut).toBe(false);
      expect(status.remainingAttempts).toBe(5);
    });

    it('should increment attempts on each trackAttempt', async () => {
      const key = 'bf-test-increment:ip-1.2.3.4';
      await trackAttempt(key);
      let status = await getLockoutStatus(key);
      expect(status.attempts).toBe(1);
      expect(status.remainingAttempts).toBe(4);

      await trackAttempt(key);
      status = await getLockoutStatus(key);
      expect(status.attempts).toBe(2);
    });

    it('should lock out after 5 failed attempts', async () => {
      const key = 'bf-test-lockout:attacker-ip';
      for (let i = 0; i < 5; i++) {
        await trackAttempt(key);
      }
      const status = await getLockoutStatus(key);
      expect(status.isLockedOut).toBe(true);
      expect(status.remainingAttempts).toBe(0);
      expect(status.lockoutUntil).not.toBeNull();
    });

    it('should not increment attempts while already locked out', async () => {
      const key = 'bf-test-no-inc:locked-user';
      for (let i = 0; i < 6; i++) {
        await trackAttempt(key);
      }
      // After 5 attempts, lockout kicks in. 6th call should not increment.
      const status = await getLockoutStatus(key);
      expect(status.attempts).toBe(5);
    });

    it('should reset attempts on resetAttempts', async () => {
      const key = 'bf-test-reset:user-reset';
      for (let i = 0; i < 3; i++) {
        await trackAttempt(key);
      }
      await resetAttempts(key);
      const status = await getLockoutStatus(key);
      expect(status.attempts).toBe(0);
      expect(status.remainingAttempts).toBe(5);
    });
  });

  // ─── Lockout Expiry ──────────────────────────────────────────────

  describe('lockout expiry', () => {
    it('should report not locked out after lockout expires', async () => {
      const key = 'bf-test-expiry:expiry-test-user';

      // Create lockout with real timers
      for (let i = 0; i < 5; i++) {
        await trackAttempt(key);
      }

      // Verify locked out
      let status = await getLockoutStatus(key);
      expect(status.isLockedOut).toBe(true);

      // Advance time past lockout (15 minutes)
      vi.useFakeTimers();
      vi.advanceTimersByTime(16 * 60 * 1000);

      status = await getLockoutStatus(key);
      expect(status.isLockedOut).toBe(false);

      vi.useRealTimers();
    });
  });
});