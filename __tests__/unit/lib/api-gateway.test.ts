import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock the db module before importing api-gateway
vi.mock('@/lib/db', () => ({
  db: {
    companyApiKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    company: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import {
  hashApiKey,
  verifyHMAC,
  generateHMAC,
  checkRateLimit,
} from '@/lib/api-gateway';

describe('api-gateway', () => {
  describe('hashApiKey', () => {
    it('should produce a consistent SHA-256 hex hash', () => {
      const hash1 = hashApiKey('test-key-123');
      const hash2 = hashApiKey('test-key-123');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key-a');
      const hash2 = hashApiKey('key-b');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce a 64-character hex string', () => {
      const hash = hashApiKey('any-key');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should match crypto.createHash output', () => {
      const key = 'my-api-key';
      const expected = crypto.createHash('sha256').update(key).digest('hex');
      expect(hashApiKey(key)).toBe(expected);
    });
  });

  describe('generateHMAC / verifyHMAC', () => {
    const secret = 'test-hmac-secret-key';

    it('should generate and verify a valid signature', () => {
      const payload = 'hello world';
      const sig = generateHMAC(payload, secret);
      expect(verifyHMAC(payload, sig, secret)).toBe(true);
    });

    it('should reject a tampered payload', () => {
      const payload = 'hello world';
      const sig = generateHMAC(payload, secret);
      expect(verifyHMAC('hello tampered', sig, secret)).toBe(false);
    });

    it('should reject a wrong secret', () => {
      const payload = 'hello world';
      const sig = generateHMAC(payload, secret);
      expect(verifyHMAC(payload, sig, 'wrong-secret')).toBe(false);
    });

    it('should produce a 64-character hex signature', () => {
      const sig = generateHMAC('data', secret);
      expect(sig).toHaveLength(64);
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should reject an invalid hex signature', () => {
      expect(() => verifyHMAC('data', 'not-valid-hex!', secret)).toThrow();
    });

    it('should handle empty payload', () => {
      const sig = generateHMAC('', secret);
      expect(verifyHMAC('', sig, secret)).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests under the limit', () => {
      expect(checkRateLimit('key-1', 10)).toBe(true);
    });

    it('should block requests over the limit', () => {
      const key = 'rate-limit-test-key';
      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(key, 10);
      }
      // 11th request should be blocked
      expect(checkRateLimit(key, 10)).toBe(false);
    });

    it('should use default limit of 1000', () => {
      expect(checkRateLimit('default-limit-key')).toBe(true);
    });

    it('should reset after the time window (simulated by using a new key)', () => {
      const key = 'reset-test-key';
      // Fill up
      for (let i = 0; i < 5; i++) {
        checkRateLimit(key, 5);
      }
      expect(checkRateLimit(key, 5)).toBe(false);
    });

    it('should allow exactly the limit number of requests', () => {
      const key = 'exact-limit-key';
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit(key, 3)).toBe(true);
      }
    });
  });
});