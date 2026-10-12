import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing auth
const mockSettingsUpsert = vi.fn().mockResolvedValue({});
const mockSettingsFindUnique = vi.fn().mockResolvedValue(null);
const mockSettingsDelete = vi.fn().mockResolvedValue({});

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
    },
  },
}));

import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  deleteSessionToken,
} from '@/lib/auth';

describe('auth utilities — expanded v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── hashPassword ────────────────────────────────────────────────

  describe('hashPassword', () => {
    it('should hash a password with bcrypt', async () => {
      const hash = await hashPassword('mySecretPassword123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('mySecretPassword123');
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

    it('should hash a very short password', async () => {
      const hash = await hashPassword('x');
      expect(hash).toMatch(/^\$2/);
    });

    it('should hash a very long password', async () => {
      const longPassword = 'a'.repeat(1000);
      const hash = await hashPassword(longPassword);
      expect(hash).toMatch(/^\$2/);
    });

    it('should hash passwords with special characters', async () => {
      const hash = await hashPassword('p@$$w0rd!#$%^&*()');
      expect(hash).toMatch(/^\$2/);
    });

    it('should hash unicode passwords', async () => {
      const hash = await hashPassword('пароль123');
      expect(hash).toMatch(/^\$2/);
    });

    it('should hash passwords with newlines', async () => {
      const hash = await hashPassword('password\nwith\nnewlines');
      expect(hash).toMatch(/^\$2/);
    });
  });

  // ─── verifyPassword ──────────────────────────────────────────────

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

    it('should be case-sensitive', async () => {
      const hash = await hashPassword('Password');
      expect(await verifyPassword('Password', hash)).toBe(true);
      expect(await verifyPassword('password', hash)).toBe(false);
    });

    it('should handle whitespace differences', async () => {
      const hash = await hashPassword('password');
      expect(await verifyPassword('password ', hash)).toBe(false);
      expect(await verifyPassword(' password', hash)).toBe(false);
    });
  });

  // ─── createSessionToken ──────────────────────────────────────────

  describe('createSessionToken', () => {
    it('should generate a hex token of correct length (96 chars)', async () => {
      const token = await createSessionToken('user-1');
      expect(token).toMatch(/^[a-f0-9]+$/);
      expect(token.length).toBe(96); // 48 bytes * 2 hex chars
    });

    it('should store the session in the database', async () => {
      await createSessionToken('user-42');
      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: expect.stringMatching(/^session:[a-f0-9]+$/) },
        }),
      );
    });

    it('should store the userId in the session data', async () => {
      await createSessionToken('user-abc');
      const call = mockSettingsUpsert.mock.calls[0][0];
      const createData = call.create || call;
      const parsed = JSON.parse(createData.value);
      expect(parsed.userId).toBe('user-abc');
    });

    it('should generate unique tokens each time', async () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        tokens.add(await createSessionToken('user-1'));
      }
      expect(tokens.size).toBe(10);
    });
  });

  // ─── verifySessionToken ──────────────────────────────────────────

  describe('verifySessionToken', () => {
    it('should return null for empty string', async () => {
      const result = await verifySessionToken('');
      expect(result).toBeNull();
    });

    it('should return null for undefined/null-like', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await verifySessionToken(null);
      expect(result).toBeNull();
    });

    it('should return null when no session exists in DB', async () => {
      mockSettingsFindUnique.mockResolvedValue(null);
      const result = await verifySessionToken('nonexistent-token');
      expect(result).toBeNull();
    });

    it('should return userId when a non-expired session exists', async () => {
      const now = Date.now();
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:sometoken',
        value: JSON.stringify({
          userId: 'user-123',
          createdAt: new Date(now - 60_000).toISOString(),
          expiresAt: new Date(now + 60 * 60_000).toISOString(),
          lastUsedAt: new Date(now - 1_000).toISOString(),
        }),
      });
      const result = await verifySessionToken('sometoken');
      expect(result).toMatchObject({ userId: 'user-123' });
      expect(result?.session.expiresAt).toBeDefined();
    });

    it('should reject (and delete) legacy sessions that carry no expiry', async () => {
      // Sessions created before expiry enforcement cannot be trusted
      // indefinitely: the user signs in once more and gets a bounded session.
      mockSettingsDelete.mockClear();
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:sometoken',
        value: JSON.stringify({ userId: 'user-123' }),
      });
      const result = await verifySessionToken('sometoken');
      expect(result).toBeNull();
      expect(mockSettingsDelete).toHaveBeenCalled();
    });

    it('should reject an expired session', async () => {
      const now = Date.now();
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:sometoken',
        value: JSON.stringify({
          userId: 'user-123',
          createdAt: new Date(now - 48 * 3600_000).toISOString(),
          expiresAt: new Date(now - 1_000).toISOString(),
          lastUsedAt: new Date(now - 1_000).toISOString(),
        }),
      });
      expect(await verifySessionToken('sometoken')).toBeNull();
    });

    it('should return null when session value has no userId', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:sometoken',
        value: JSON.stringify({ something: 'else' }),
      });
      const result = await verifySessionToken('sometoken');
      expect(result).toBeNull();
    });

    it('should return null when session value is malformed JSON', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:sometoken',
        value: 'not-json{{',
      });
      const result = await verifySessionToken('sometoken');
      expect(result).toBeNull();
    });
  });

  // ─── deleteSessionToken ──────────────────────────────────────────

  describe('deleteSessionToken', () => {
    it('should call db.settings.delete with correct key', async () => {
      await deleteSessionToken('some-token-here');
      expect(mockSettingsDelete).toHaveBeenCalledWith({
        where: { key: 'session:some-token-here' },
      });
    });

    it('should not throw if session does not exist', async () => {
      mockSettingsDelete.mockRejectedValue(new Error('Record not found'));
      await expect(deleteSessionToken('nonexistent')).resolves.not.toThrow();
    });

    it('should resolve even if DB throws', async () => {
      mockSettingsDelete.mockRejectedValue(new Error('Any error'));
      await expect(deleteSessionToken('any-token')).resolves.toBeUndefined();
    });
  });
});