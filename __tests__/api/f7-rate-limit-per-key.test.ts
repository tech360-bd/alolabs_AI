import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, _resetRateLimiterForTests } from '@/lib/api/rate-limit';

/**
 * F7: Per-key rate limit enforcement — multiple keys with different limits.
 *
 * Verifies that the actual configured CompanyApiKey.rateLimit is enforced,
 * NOT a hardcoded default of 1000. Two keys with different limits behave
 * independently.
 */

beforeEach(() => {
  _resetRateLimiterForTests();
});

describe('F7: Per-key rate limit with configured values', () => {
  it('enforces a low limit (10/min) on key-A', () => {
    // Simulate a key with rateLimit=10 (as configured in CompanyApiKey)
    for (let i = 0; i < 10; i++) {
      const r = checkRateLimit('key-low-limit', 10);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkRateLimit('key-low-limit', 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(10);
    expect(blocked.remaining).toBe(0);
  });

  it('enforces a different limit (5/min) on key-B independently', () => {
    // key-B has rateLimit=5
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit('key-different-limit', 5);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkRateLimit('key-different-limit', 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(5);
  });

  it('does NOT silently use a default 1000 when a lower limit exists', () => {
    // If the code ignored the configured limit and used 1000, this test would
    // pass 11 times. With the actual limit of 10, the 11th is blocked.
    for (let i = 0; i < 10; i++) {
      checkRateLimit('key-silent-default-check', 10);
    }
    const eleventh = checkRateLimit('key-silent-default-check', 10);
    expect(eleventh.allowed).toBe(false); // proves the limit is 10, not 1000
  });

  it('allows high-limit keys (1000/min) to make many requests', () => {
    for (let i = 0; i < 50; i++) {
      const r = checkRateLimit('key-high-limit', 1000);
      expect(r.allowed).toBe(true);
    }
    const fiftyFirst = checkRateLimit('key-high-limit', 1000);
    expect(fiftyFirst.allowed).toBe(true);
    expect(fiftyFirst.remaining).toBe(949);
  });

  it('isolates keys: key-A exhausted does not affect key-B', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('isolated-a', 3);
    expect(checkRateLimit('isolated-a', 3).allowed).toBe(false);
    expect(checkRateLimit('isolated-b', 3).allowed).toBe(true);
  });

  it('reports the correct limit in the result', () => {
    const r = checkRateLimit('limit-reporting', 42);
    expect(r.limit).toBe(42);
  });
});
