import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/** Session tokens are indexed and stored by this digest, never in plaintext. */
const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

// Mock @/lib/db before importing session-manager
vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import {
  createSession,
  verifySession,
  revokeSession,
  revokeAllSessions,
  cleanupExpiredSessions,
  refreshSession,
  type SessionData,
} from '@/lib/session-manager';
import { db } from '@/lib/db';

const mockedDb = vi.mocked(db);

// Helper to build a valid session data object
function makeSessionData(overrides: Partial<SessionData> = {}): SessionData {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    expiresAt: future,
    lastUsedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Session Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: findUnique returns null, upsert/update succeed
    mockedDb.settings.findUnique.mockResolvedValue(null);
    mockedDb.settings.upsert.mockResolvedValue({});
    mockedDb.settings.update.mockResolvedValue({});
    mockedDb.settings.delete.mockResolvedValue({});
    mockedDb.settings.deleteMany.mockResolvedValue({ count: 0 });
  });

  // ─── createSession ─────────────────────────────────────────────

  describe('createSession', () => {
    it('should return a 96-char hex token (48 bytes)', async () => {
      const token = await createSession('user-1');
      expect(token).toBeDefined();
      expect(token).toMatch(/^[a-f0-9]{96}$/);
    });

    it('should call upsert with default 1-hour TTL', async () => {
      await createSession('user-1');
      const calls = mockedDb.settings.upsert.mock.calls;
      // First call is the session record
      const sessionCall = calls[0][0];
      expect(sessionCall?.where.key).toMatch(/^session:[a-f0-9]+$/);
      const data = JSON.parse(sessionCall!.create.value as string);
      const expiresAtDate = new Date(data.expiresAt);
      const now = new Date();
      const diffMs = expiresAtDate.getTime() - now.getTime();
      // Should be roughly 1 hour (allow 2s tolerance for test execution)
      expect(diffMs).toBeGreaterThan(59 * 60 * 1000);
      expect(diffMs).toBeLessThan(61 * 60 * 1000);
    });

    it('should call upsert with 30-day TTL when rememberMe is true', async () => {
      await createSession('user-1', { rememberMe: true });
      const calls = mockedDb.settings.upsert.mock.calls;
      const sessionCall = calls[0][0];
      const data = JSON.parse(sessionCall!.create.value as string);
      const expiresAtDate = new Date(data.expiresAt);
      const now = new Date();
      const diffMs = expiresAtDate.getTime() - now.getTime();
      // Should be roughly 30 days
      const expected30d = 30 * 24 * 60 * 60 * 1000;
      expect(diffMs).toBeGreaterThan(expected30d - 2000);
      expect(diffMs).toBeLessThan(expected30d + 2000);
    });

    it('should store deviceInfo and ipAddress when provided', async () => {
      await createSession('user-1', {
        deviceInfo: 'Chrome/MacOS',
        ipAddress: '10.0.0.1',
      });
      const calls = mockedDb.settings.upsert.mock.calls;
      const data = JSON.parse(calls[0][0]!.create.value as string);
      expect(data.deviceInfo).toBe('Chrome/MacOS');
      expect(data.ipAddress).toBe('10.0.0.1');
    });

    it('should upsert the session record AND add to user session list', async () => {
      await createSession('user-1');
      // First call: session record, second call: user sessions index
      expect(mockedDb.settings.upsert).toHaveBeenCalledTimes(2);
      const secondCall = mockedDb.settings.upsert.mock.calls[1][0];
      expect(secondCall?.where.key).toBe('user:sessions:user-1');
    });
  });

  // ─── verifySession ─────────────────────────────────────────────

  describe('verifySession', () => {
    it('should return null for empty token', async () => {
      const result = await verifySession('');
      expect(result).toBeNull();
    });

    it('should return null when session not found', async () => {
      mockedDb.settings.findUnique.mockResolvedValue(null);
      const result = await verifySession('nonexistent');
      expect(result).toBeNull();
    });

    it('should return session data for valid non-expired session', async () => {
      const sessionData = makeSessionData();
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'session:abc',
        value: JSON.stringify(sessionData),
      });
      const result = await verifySession('abc');
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
    });

    it('should return null and revoke expired session', async () => {
      const expiredData = makeSessionData({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      // verifySession: findUnique → session record
      // revokeSession: findUnique → session record (to get userId)
      // removeUserSessionToken: findUnique → null (no user session list)
      mockedDb.settings.findUnique
        .mockResolvedValueOnce({ key: 'session:expired', value: JSON.stringify(expiredData) })
        .mockResolvedValueOnce({ key: 'session:expired', value: JSON.stringify(expiredData) })
        .mockResolvedValueOnce(null);
      const result = await verifySession('expired');
      expect(result).toBeNull();
      // Should have attempted to revoke (delete)
      expect(mockedDb.settings.delete).toHaveBeenCalled();
    });

    it('should return null for corrupted JSON', async () => {
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'session:bad',
        value: 'not-json{{',
      });
      const result = await verifySession('bad');
      expect(result).toBeNull();
    });

    it('should extend TTL on verification (sliding expiry)', async () => {
      const sessionData = makeSessionData();
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'session:slide',
        value: JSON.stringify(sessionData),
      });
      const result = await verifySession('slide');
      expect(result).not.toBeNull();
      // Should call update to save new expiry
      expect(mockedDb.settings.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─── revokeSession ──────────────────────────────────────────────

  describe('revokeSession', () => {
    it('should return false when session not found', async () => {
      mockedDb.settings.findUnique.mockResolvedValue(null);
      const result = await revokeSession('nonexistent');
      expect(result).toBe(false);
    });

    it('should return true and delete session when found', async () => {
      mockedDb.settings.findUnique
        .mockResolvedValueOnce({
          key: 'session:tok1',
          value: JSON.stringify(makeSessionData({ userId: 'user-X' })),
        })
        .mockResolvedValueOnce(null); // removeUserSessionToken: no user session list
      mockedDb.settings.update.mockResolvedValue({});
      const result = await revokeSession('tok1');
      expect(result).toBe(true);
      expect(mockedDb.settings.delete).toHaveBeenCalledWith({
        where: { key: 'session:tok1' },
      });
    });
  });

  // ─── revokeAllSessions ──────────────────────────────────────────

  describe('revokeAllSessions', () => {
    it('should return 0 when user has no session record', async () => {
      mockedDb.settings.findUnique.mockResolvedValue(null);
      const result = await revokeAllSessions('user-no-sessions');
      expect(result).toBe(0);
    });

    it('should return 0 for empty token list', async () => {
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'user:sessions:user-1',
        value: JSON.stringify([]),
      });
      const result = await revokeAllSessions('user-1');
      expect(result).toBe(0);
    });

    it('should delete all session records and return count', async () => {
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'user:sessions:user-1',
        value: JSON.stringify(['tok1', 'tok2', 'tok3']),
      });
      const result = await revokeAllSessions('user-1');
      expect(result).toBe(3);

      // These index entries are legacy plaintext, so revocation must target
      // BOTH the hashed row (current format) and the plaintext row (pre-hashing
      // format). Targeting only one would leave a valid session behind.
      const arg = mockedDb.settings.deleteMany.mock.calls[0][0];
      const keys: string[] = arg.where.key.in;
      for (const t of ['tok1', 'tok2', 'tok3']) {
        expect(keys).toContain(`session:${sha256(t)}`);
        expect(keys).toContain(`session:${t}`);
      }
      expect(keys).toHaveLength(6);
    });

    it('should not double-hash index entries that are already digests', async () => {
      const digest = sha256('real-token');
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'user:sessions:user-2',
        value: JSON.stringify([digest]),
      });
      await revokeAllSessions('user-2');
      const keys: string[] = mockedDb.settings.deleteMany.mock.calls[0][0].where.key.in;
      // A digest entry maps to exactly one key — hashing it again would produce
      // a key that matches no row and silently revoke nothing.
      expect(keys).toEqual([`session:${digest}`]);
      expect(keys).not.toContain(`session:${sha256(digest)}`);
    });

    it('should handle corrupted JSON gracefully', async () => {
      mockedDb.settings.findUnique.mockResolvedValue({
        key: 'user:sessions:user-1',
        value: 'not-valid-json',
      });
      const result = await revokeAllSessions('user-1');
      expect(result).toBe(0);
    });
  });

  // ─── cleanupExpiredSessions ─────────────────────────────────────

  describe('cleanupExpiredSessions', () => {
    it('should return 0 when no sessions exist', async () => {
      mockedDb.settings.findMany.mockResolvedValue([]);
      const result = await cleanupExpiredSessions();
      expect(result).toBe(0);
    });

    it('should clean up expired sessions and return count', async () => {
      const expiredSession = makeSessionData({
        userId: 'user-cleanup',
        expiresAt: new Date(Date.now() - 10000).toISOString(),
      });
      mockedDb.settings.findMany.mockResolvedValue([
        { key: 'session:expired1', value: JSON.stringify(expiredSession) },
      ]);
      // For removeUserSessionToken: findUnique for user session list
      mockedDb.settings.findUnique.mockResolvedValue(null);

      const result = await cleanupExpiredSessions();
      expect(result).toBe(1);
      expect(mockedDb.settings.deleteMany).toHaveBeenCalledWith({
        where: { key: { in: ['session:expired1'] } },
      });
    });

    it('should also clean up corrupted session records', async () => {
      mockedDb.settings.findMany.mockResolvedValue([
        { key: 'session:corrupt', value: 'bad-json' },
      ]);
      mockedDb.settings.findUnique.mockResolvedValue(null);

      const result = await cleanupExpiredSessions();
      expect(result).toBe(1);
    });

    it('should skip non-expired sessions', async () => {
      const activeSession = makeSessionData();
      mockedDb.settings.findMany.mockResolvedValue([
        { key: 'session:active', value: JSON.stringify(activeSession) },
      ]);

      const result = await cleanupExpiredSessions();
      expect(result).toBe(0);
      expect(mockedDb.settings.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── refreshSession ─────────────────────────────────────────────

  describe('refreshSession', () => {
    it('should return null for invalid token', async () => {
      mockedDb.settings.findUnique.mockResolvedValue(null);
      const result = await refreshSession('invalid');
      expect(result).toBeNull();
    });

    it('should return a new token and revoke the old one', async () => {
      const sessionData = makeSessionData({
        deviceInfo: 'Firefox/Linux',
        ipAddress: '192.168.1.1',
      });

      // verifySession: findUnique for session → return session record
      // verifySession: update to extend TTL → ok
      // createSession (via refreshSession): upsert session → ok
      // addUserSessionToken: findUnique for user:sessions → return null (first time)
      // addUserSessionToken: upsert user sessions index → ok
      // findUnique for new session (to mark as refresh) → return new session data
      // update new session to set isRefreshToken → ok
      // revokeSession: findUnique for old session → return session record
      // revokeSession: delete old session → ok
      // removeUserSessionToken: findUnique for user:sessions → return token list
      // removeUserSessionToken: update user sessions list → ok
      mockedDb.settings.findUnique
        .mockResolvedValueOnce({ key: 'session:old', value: JSON.stringify(sessionData) }) // verifySession lookup
        .mockResolvedValueOnce(null) // addUserSessionToken: no existing user session list
        .mockResolvedValueOnce({ key: 'session:new', value: JSON.stringify({ ...sessionData, isRefreshToken: false }) }) // refreshSession: find new session
        .mockResolvedValueOnce({ key: 'session:old', value: JSON.stringify(sessionData) }) // revokeSession: find old session
        .mockResolvedValueOnce({ key: 'user:sessions:user-1', value: JSON.stringify(['new-token-placeholder']) }); // removeUserSessionToken

      mockedDb.settings.update.mockResolvedValue({});

      const newToken = await refreshSession('old');
      expect(newToken).not.toBeNull();
      expect(typeof newToken).toBe('string');
      expect(newToken!.length).toBe(96);

      // Should have deleted the old session
      expect(mockedDb.settings.delete).toHaveBeenCalledWith({
        where: { key: 'session:old' },
      });
    });
  });
});
