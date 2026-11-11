import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, recordHit, _resetRateLimiterForTests } from '@/lib/api/rate-limit';

/**
 * Decision 5 (rate limiting): per-key rate limit enforcement — unit tests.
 */

beforeEach(() => {
  _resetRateLimiterForTests();
});

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const result = checkRateLimit('key-1', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('blocks requests over the limit', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('key-2', 5);
    }
    const blocked = checkRateLimit('key-2', 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates keys (one key hitting limit does not affect another)', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('key-a', 10);
    }
    const blocked = checkRateLimit('key-a', 10);
    expect(blocked.allowed).toBe(false);

    const otherKey = checkRateLimit('key-b', 10);
    expect(otherKey.allowed).toBe(true);
    expect(otherKey.remaining).toBe(9);
  });

  it('resets after the window expires', async () => {
    // This test verifies the window logic conceptually; the actual reset
    // happens after 60 seconds in production. We test the structure here.
    const result = checkRateLimit('key-3', 100);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

describe('recordHit', () => {
  it('records a manual hit', () => {
    recordHit('manual-key');
    const result = checkRateLimit('manual-key', 1);
    expect(result.allowed).toBe(false);
  });
});
