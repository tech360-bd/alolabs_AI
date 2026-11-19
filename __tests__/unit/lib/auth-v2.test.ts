import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB modules before importing auth. New sessions are persisted in the
// Prisma Session model; Settings is retained below for the opaque-token bridge.
const mockUserFindUnique = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionUpdate = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockSessionDelete = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockSettingsDelete = vi.fn();
const mockSettingsUpdate = vi.fn();
let sessionSequence = 0;

vi.mock('@/lib/db', () => ({
  db: {
    // Sessions are bound to the owner's stored role: these suites exercise the
    // internal (staff) path. The client path is covered in session-audience.test.ts.
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    session: {
      create: (...args: unknown[]) => mockSessionCreate(...args),
      update: (...args: unknown[]) => mockSessionUpdate(...args),
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      delete: (...args: unknown[]) => mockSessionDelete(...args),
    },
    settings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
      // A pre-separation session is stamped with its audience on first use.
      update: (...args: unknown[]) => mockSettingsUpdate(...args),
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
import { hashSessionToken, legacySessionKey, sessionKey } from '@/lib/session-token';

describe('auth utilities — expanded v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionSequence = 0;
    mockUserFindUnique.mockReset().mockResolvedValue({ id: 'staff-user', role: 'admin', isActive: true });
    mockSessionCreate.mockReset().mockImplementation(async () => ({ id: `prisma-session-${++sessionSequence}` }));
    mockSessionUpdate.mockReset().mockResolvedValue({});
    mockSessionFindUnique.mockReset().mockResolvedValue(null);
    mockSessionDelete.mockReset().mockResolvedValue({});
    mockSettingsFindUnique.mockReset().mockResolvedValue(null);
    mockSettingsDelete.mockReset().mockResolvedValue({});
    mockSettingsUpdate.mockReset().mockResolvedValue({});
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
    it('issues a compact signed JWT', async () => {
      const token = await createSessionToken('user-1');
      expect(token.split('.')).toHaveLength(3);
      expect(token).not.toMatch(/^[a-f0-9]+$/);
    });

    it('stores only a SHA-256 digest in the Prisma session row', async () => {
      const token = await createSessionToken('user-42');
      const createArgs = mockSessionCreate.mock.calls[0][0];
      expect(createArgs).toMatchObject({
        data: {
          userId: 'user-42',
          audience: 'internal',
          method: 'password',
          tokenHash: expect.stringMatching(/^pending:/),
          expiresAt: expect.any(Date),
        },
        select: { id: true },
      });
      expect(mockSessionUpdate).toHaveBeenCalledWith({
        where: { id: 'prisma-session-1' },
        data: { tokenHash: hashSessionToken(token) },
      });
      expect(createArgs.data.tokenHash).not.toBe(token);
      expect(mockSessionUpdate.mock.calls[0][0].data.tokenHash).not.toBe(token);
    });

    it('includes the database session id and owner identity in the JWT claims', async () => {
      const token = await createSessionToken('user-abc');
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      expect(payload).toMatchObject({
        userId: 'user-abc',
        role: 'admin',
        jti: 'prisma-session-1',
        aud: 'internal',
      });
    });

    it('generates unique JWTs tied to distinct session rows', async () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        tokens.add(await createSessionToken('user-1'));
      }
      expect(tokens.size).toBe(10);
      expect(mockSessionCreate).toHaveBeenCalledTimes(10);
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
    it('revokes a Prisma session by the stored token digest', async () => {
      const token = 'some-jwt-token';
      mockSessionFindUnique.mockResolvedValue({ id: 'db-session-1', userId: 'user-1' });
      await deleteSessionToken(token);
      expect(mockSessionFindUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashSessionToken(token) },
        select: { id: true, userId: true },
      });
      expect(mockSessionDelete).toHaveBeenCalledWith({ where: { id: 'db-session-1' } });
    });

    it('also removes hashed and raw-key Settings records from the compatibility path', async () => {
      const token = 'legacy-token-here';
      mockSettingsFindUnique.mockResolvedValue({ value: '{}' });
      await deleteSessionToken(token);
      expect(mockSettingsDelete).toHaveBeenCalledWith({ where: { key: sessionKey(token) } });
      expect(mockSettingsDelete).toHaveBeenCalledWith({ where: { key: legacySessionKey(token) } });
    });

    it('should not throw if session does not exist', async () => {
      mockSettingsDelete.mockRejectedValue(new Error('Record not found'));
      await expect(deleteSessionToken('nonexistent')).resolves.not.toThrow();
    });

    it('must not report successful revocation when the database is unavailable', async () => {
      mockSessionFindUnique.mockRejectedValue(new Error('DB error'));
      mockSettingsFindUnique.mockRejectedValue(new Error('DB error'));
      mockSettingsDelete.mockRejectedValue(new Error('DB error'));
      await expect(deleteSessionToken('any-token')).rejects.toThrow('DB error');
    });
  });
});