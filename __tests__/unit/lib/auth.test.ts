import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing auth
vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { hashPassword, verifyPassword } from '@/lib/auth';

describe('auth utilities', () => {
  describe('hashPassword', () => {
    it('should hash a password with bcrypt', async () => {
      const hash = await hashPassword('mySecretPassword123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('mySecretPassword123');
      // bcrypt hashes always start with $2
      expect(hash).toMatch(/^\$2/);
    });

    it('should produce different hashes for the same password (salt)', async () => {
      const hash1 = await hashPassword('samePassword');
      const hash2 = await hashPassword('samePassword');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce hashes of expected length', async () => {
      const hash = await hashPassword('password123');
      expect(hash.length).toBeGreaterThan(20);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for a correct password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for an incorrect password', async () => {
      const hash = await hashPassword('correctPassword');
      const result = await verifyPassword('wrongPassword', hash);
      expect(result).toBe(false);
    });

    it('should return false for an empty password against a hash', async () => {
      const hash = await hashPassword('somePassword');
      const result = await verifyPassword('', hash);
      expect(result).toBe(false);
    });
  });
});