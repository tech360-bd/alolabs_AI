import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockSettingsUpsert = vi.fn().mockResolvedValue({});
const mockSettingsFindUnique = vi.fn().mockResolvedValue(null);
const mockSettingsFindMany = vi.fn().mockResolvedValue([]);
const mockSettingsDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const mockSettingsUpdate = vi.fn().mockResolvedValue({});

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      findMany: (...args: unknown[]) => mockSettingsFindMany(...args),
      deleteMany: (...args: unknown[]) => mockSettingsDeleteMany(...args),
      update: (...args: unknown[]) => mockSettingsUpdate(...args),
    },
  },
}));

import {
  createSession,
  validateSession,
  destroySession,
  destroyAllUserSessions,
  rotateSessionToken,
  getSessionCount,
  listUserSessions,
} from '@/lib/security/session-manager';

describe('Session Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createSession ───────────────────────────────────────────────

  describe('createSession', () => {
    it('should return a 96-char hex token', async () => {
      const token = await createSession('user-1');
      expect(token).toMatch(/^[a-f0-9]{96}$/);
    });

    it('should store two DB records (token + meta)', async () => {
      await createSession('user-1');
      expect(mockSettingsUpsert).toHaveBeenCalledTimes(2);
    });

    it('should store userId in session data', async () => {
      await createSession('user-abc');
      const createCall = mockSettingsUpsert.mock.calls[0][0] as any;
      const data = JSON.parse(createCall.create?.value || createCall.value);
      expect(data.userId).toBe('user-abc');
    });

    it('should accept optional metadata', async () => {
      const token = await createSession('user-1', {
        userAgent: 'Chrome/120',
        ipAddress: '1.2.3.4',
        device: 'Desktop',
      });
      expect(token).toBeDefined();

      const createCall = mockSettingsUpsert.mock.calls[0][0] as any;
      const data = JSON.parse(createCall.create?.value || createCall.value);
      expect(data.userAgent).toBe('Chrome/120');
      expect(data.ipAddress).toBe('1.2.3.4');
      expect(data.device).toBe('Desktop');
    });

    it('should set a future expiresAt', async () => {
      await createSession('user-1');
      const createCall = mockSettingsUpsert.mock.calls[0][0] as any;
      const data = JSON.parse(createCall.create?.value || createCall.value);
      expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate unique tokens', async () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        tokens.add(await createSession('user-1'));
      }
      expect(tokens.size).toBe(10);
    });
  });

  // ─── validateSession ─────────────────────────────────────────────

  describe('validateSession', () => {
    it('should return null when session not found', async () => {
      mockSettingsFindUnique.mockResolvedValue(null);
      const result = await validateSession('nonexistent-token');
      expect(result).toBeNull();
    });

    it('should return null for malformed session value', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:abc',
        value: 'not-json',
      });
      const result = await validateSession('some-token');
      expect(result).toBeNull();
    });

    it('should return session info for a valid session', async () => {
      const futureExpiry = new Date(Date.now() + 3600_000).toISOString();
      mockSettingsFindUnique.mockResolvedValueOnce({
        key: 'session:hash',
        value: JSON.stringify({
          userId: 'user-1',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          expiresAt: futureExpiry,
        }),
      });
      // Second call (for meta record lookup)
      mockSettingsFindUnique.mockResolvedValueOnce(null);

      const result = await validateSession('some-token');
      expect(result).not.toBeNull();
      expect(result!.metadata.userId).toBe('user-1');
      expect(result!.isActive).toBe(true);
    });

    it('should return null when session is expired', async () => {
      const pastExpiry = new Date(Date.now() - 3600_000).toISOString();
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:hash',
        value: JSON.stringify({
          userId: 'user-1',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          expiresAt: pastExpiry,
        }),
      });

      const result = await validateSession('expired-token');
      expect(result).toBeNull();
    });

    it('should update lastActivityAt on valid session', async () => {
      const futureExpiry = new Date(Date.now() + 3600_000).toISOString();
      mockSettingsFindUnique.mockResolvedValueOnce({
        key: 'session:hash',
        value: JSON.stringify({
          userId: 'user-1',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          expiresAt: futureExpiry,
        }),
      });
      mockSettingsFindUnique.mockResolvedValueOnce(null);

      await validateSession('some-token');
      expect(mockSettingsUpdate).toHaveBeenCalled();
    });
  });

  // ─── destroySession ──────────────────────────────────────────────

  describe('destroySession', () => {
    it('should return false when session not found', async () => {
      mockSettingsFindUnique.mockResolvedValue(null);
      const result = await destroySession('nonexistent');
      expect(result).toBe(false);
    });

    it('should return true and delete records for a valid session', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        key: 'session:hash',
        value: JSON.stringify({ userId: 'user-1' }),
      });
      mockSettingsDeleteMany.mockResolvedValue({ count: 2 });

      const result = await destroySession('some-token');
      expect(result).toBe(true);
      expect(mockSettingsDeleteMany).toHaveBeenCalled();
    });
  });

  // ─── destroyAllUserSessions ──────────────────────────────────────

  describe('destroyAllUserSessions', () => {
    it('should return 0 when user has no sessions', async () => {
      mockSettingsFindMany.mockResolvedValue([]);
      const result = await destroyAllUserSessions('user-no-sessions');
      expect(result).toBe(0);
    });

    it('should delete all session records', async () => {
      mockSettingsFindMany.mockResolvedValue([
        { key: 'session:meta:user-1:hash1', value: JSON.stringify({ tokenHash: 'hash1' }) },
        { key: 'session:meta:user-1:hash2', value: JSON.stringify({ tokenHash: 'hash2' }) },
      ]);
      mockSettingsDeleteMany.mockResolvedValue({ count: 4 });

      const result = await destroyAllUserSessions('user-1');
      expect(result).toBe(4);
    });
  });

  // ─── rotateSessionToken ──────────────────────────────────────────

  describe('rotateSessionToken', () => {
    it('should return null for invalid old token', async () => {
      mockSettingsFindUnique.mockResolvedValue(null);
      const result = await rotateSessionToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return a new token for a valid session', async () => {
      const futureExpiry = new Date(Date.now() + 3600_000).toISOString();
      // validateSession will find the session
      mockSettingsFindUnique.mockResolvedValueOnce({
        key: 'session:hash',
        value: JSON.stringify({
          userId: 'user-1',
          userAgent: 'Chrome',
          ipAddress: '1.2.3.4',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          expiresAt: futureExpiry,
        }),
      });
      mockSettingsFindUnique.mockResolvedValueOnce(null); // meta record

      // destroySession will find the session again
      mockSettingsFindUnique.mockResolvedValueOnce({
        key: 'session:hash',
        value: JSON.stringify({ userId: 'user-1' }),
      });

      const result = await rotateSessionToken('old-token');
      expect(result).not.toBeNull();
      expect(result).not.toBe('old-token');
    });
  });

  // ─── getSessionCount ──────────────────────────────────────────────

  describe('getSessionCount', () => {
    it('should return 0 for user with no sessions', async () => {
      mockSettingsFindMany.mockResolvedValue([]);
      expect(await getSessionCount('user-new')).toBe(0);
    });

    it('should count only non-expired sessions', async () => {
      const futureExpiry = new Date(Date.now() + 3600_000).toISOString();
      const pastExpiry = new Date(Date.now() - 3600_000).toISOString();

      mockSettingsFindMany.mockResolvedValue([
        { value: JSON.stringify({ expiresAt: futureExpiry }) },
        { value: JSON.stringify({ expiresAt: pastExpiry }) },
        { value: JSON.stringify({ expiresAt: futureExpiry }) },
        { value: 'invalid-json' },
      ]);

      expect(await getSessionCount('user-1')).toBe(2);
    });
  });

  // ─── listUserSessions ────────────────────────────────────────────

  describe('listUserSessions', () => {
    it('should return empty array for user with no sessions', async () => {
      mockSettingsFindMany.mockResolvedValue([]);
      const sessions = await listUserSessions('user-new');
      expect(sessions).toEqual([]);
    });

    it('should not expose raw tokens', async () => {
      const futureExpiry = new Date(Date.now() + 3600_000).toISOString();
      mockSettingsFindMany.mockResolvedValue([
        {
          value: JSON.stringify({
            userId: 'user-1',
            expiresAt: futureExpiry,
            createdAt: new Date().toISOString(),
          }),
        },
      ]);

      const sessions = await listUserSessions('user-1');
      expect(sessions[0].token).toBe('');
    });

    it('should skip expired sessions', async () => {
      const pastExpiry = new Date(Date.now() - 3600_000).toISOString();
      mockSettingsFindMany.mockResolvedValue([
        { value: JSON.stringify({ expiresAt: pastExpiry }) },
      ]);

      const sessions = await listUserSessions('user-1');
      expect(sessions).toEqual([]);
    });
  });
});