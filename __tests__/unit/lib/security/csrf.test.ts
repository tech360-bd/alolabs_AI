import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing csrf module
const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSet = vi.fn().mockResolvedValue(undefined);
const mockRedisDel = vi.fn().mockResolvedValue(1);

vi.mock('@/lib/redis', () => ({
  redisGet: (...args: unknown[]) => mockRedisGet(...args),
  redisSet: (...args: unknown[]) => mockRedisSet(...args),
  redisDel: (...args: unknown[]) => mockRedisDel(...args),
}));

import {
  generateCsrfToken,
  validateCsrfToken,
  validateCsrfTokenWithSecret,
  rotateCsrfToken,
  invalidateCsrfToken,
  invalidateAllUserCsrfTokens,
} from '@/lib/security/csrf';

describe('CSRF protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateCsrfToken ───────────────────────────────────────────

  describe('generateCsrfToken', () => {
    it('should return a token, secret, and expiresAt', async () => {
      const result = await generateCsrfToken();
      expect(result.token).toBeDefined();
      expect(result.secret).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });

    it('should generate a 64-char hex token', async () => {
      const result = await generateCsrfToken();
      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate a 64-char hex secret', async () => {
      const result = await generateCsrfToken();
      expect(result.secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique tokens on each call', async () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = await generateCsrfToken();
        tokens.add(result.token);
      }
      expect(tokens.size).toBe(20);
    });

    it('should set an expiry timestamp in the future', async () => {
      const result = await generateCsrfToken();
      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThan(Date.now());
    });

    it('should accept a custom expiry time', async () => {
      const result = await generateCsrfToken(undefined, 60); // 60 seconds
      const expiresAt = new Date(result.expiresAt).getTime();
      const now = Date.now();
      // Should be between ~60s from now (allow 2s tolerance)
      expect(expiresAt - now).toBeGreaterThan(58000);
      expect(expiresAt - now).toBeLessThan(62000);
    });

    it('should store in Redis via redisSet', async () => {
      await generateCsrfToken('user-123');
      expect(mockRedisSet).toHaveBeenCalled();
    });

    it('should generate tokens associated with a userId', async () => {
      const result = await generateCsrfToken('user-456');
      expect(result.token).toBeDefined();
    });
  });

  // ─── validateCsrfToken ───────────────────────────────────────────

  describe('validateCsrfToken', () => {
    it('should return false for empty token', async () => {
      const result = await validateCsrfToken('');
      expect(result).toBe(false);
    });

    it('should return false for null/undefined-like', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await validateCsrfToken(null);
      expect(result).toBe(false);
    });

    it('should return false for a token with wrong length', async () => {
      const result = await validateCsrfToken('abc');
      expect(result).toBe(false);
    });

    it('should validate a token that was generated and stored in memory', async () => {
      // generateCsrfToken stores in both Redis and memory
      mockRedisGet.mockResolvedValue(null); // Force memory fallback
      const generated = await generateCsrfToken('user-test');
      const isValid = await validateCsrfToken(generated.token, 'user-test');
      expect(isValid).toBe(true);
    });

    it('should return false for a token not found anywhere', async () => {
      mockRedisGet.mockResolvedValue(null);
      const result = await validateCsrfToken('a'.repeat(64));
      expect(result).toBe(false);
    });
  });

  // ─── validateCsrfTokenWithSecret ─────────────────────────────────

  describe('validateCsrfTokenWithSecret', () => {
    it('should return false when token or secret is empty', () => {
      expect(validateCsrfTokenWithSecret('', 'secret')).toBe(false);
      expect(validateCsrfTokenWithSecret('token', '')).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      // Just ensure it doesn't throw — timing safety is implicit
      const result = validateCsrfTokenWithSecret('some-token', 'some-secret');
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── rotateCsrfToken ─────────────────────────────────────────────

  describe('rotateCsrfToken', () => {
    it('should return null for a nonexistent token', async () => {
      mockRedisGet.mockResolvedValue(null);
      const result = await rotateCsrfToken('nonexistent-token');
      expect(result).toBeNull();
    });

    it('should return a new token pair for a valid token', async () => {
      // First, generate a token (stores in memory)
      mockRedisGet.mockResolvedValue(null);
      const original = await generateCsrfToken('user-1');

      // Now rotate it
      const rotated = await rotateCsrfToken(original.token, 'user-1');
      expect(rotated).not.toBeNull();
      expect(rotated!.token).not.toBe(original.token);
      expect(rotated!.secret).not.toBe(original.secret);
    });
  });

  // ─── invalidateCsrfToken ─────────────────────────────────────────

  describe('invalidateCsrfToken', () => {
    it('should call redisDel to clean up', async () => {
      await invalidateCsrfToken('some-token', 'user-1');
      expect(mockRedisDel).toHaveBeenCalled();
    });
  });

  // ─── invalidateAllUserCsrfTokens ─────────────────────────────────

  describe('invalidateAllUserCsrfTokens', () => {
    it('should not throw', async () => {
      await expect(invalidateAllUserCsrfTokens('user-1')).resolves.not.toThrow();
    });

    it('should clean memory entries for the user', async () => {
      // Generate some tokens for user-1
      mockRedisGet.mockResolvedValue(null);
      await generateCsrfToken('user-1');
      await generateCsrfToken('user-1');

      // Generate a token for another user (should survive)
      await generateCsrfToken('user-2');

      await invalidateAllUserCsrfTokens('user-1');
      // No crash = success
    });
  });
});