import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  users: new Map<string, { id: string; role: string; isActive: boolean } | null>(),
  sessions: [] as Array<Record<string, any>>,
  settings: new Map<string, Record<string, any>>(),
  sequence: 0,
}));

vi.mock('@/lib/db', () => {
  const matchesSession = (row: Record<string, any>, where: Record<string, any> = {}) => {
    if (where.id && typeof where.id === 'string' && row.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    if (where.userId && row.userId !== where.userId) return false;
    if (where.tokenHash && row.tokenHash !== where.tokenHash) return false;
    if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) return false;
    if (where.expiresAt?.lte && row.expiresAt > where.expiresAt.lte) return false;
    if (where.revokedAt === null && row.revokedAt !== null) return false;
    return true;
  };
  const matchesSettings = (row: Record<string, any>, where: Record<string, any> = {}) => {
    if (typeof where.key === 'string' && row.key !== where.key) return false;
    if (where.key?.startsWith && !row.key.startsWith(where.key.startsWith)) return false;
    if (where.key?.in && !where.key.in.includes(row.key)) return false;
    if (where.OR && !where.OR.some((condition: any) => matchesSettings(row, condition))) return false;
    return true;
  };
  return {
    db: {
      user: {
        findUnique: vi.fn(async ({ where }: any) => state.users.has(where.id)
          ? state.users.get(where.id)
          : { id: where.id, role: 'admin', isActive: true }),
      },
      session: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `session-${++state.sequence}`, revokedAt: null, ...data };
          state.sessions.push(row);
          return { id: row.id };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = state.sessions.find((candidate) => candidate.id === where.id);
          if (!row) throw new Error('session not found');
          Object.assign(row, data);
          return row;
        }),
        findUnique: vi.fn(async ({ where }: any) => state.sessions.find((row) => matchesSession(row, where)) ?? null),
        findFirst: vi.fn(async ({ where }: any) => state.sessions.find((row) => matchesSession(row, where)) ?? null),
        findMany: vi.fn(async ({ where }: any = {}) => state.sessions.filter((row) => matchesSession(row, where))),
        delete: vi.fn(async ({ where }: any) => {
          const index = state.sessions.findIndex((row) => row.id === where.id);
          if (index >= 0) state.sessions.splice(index, 1);
          return { count: index >= 0 ? 1 : 0 };
        }),
        deleteMany: vi.fn(async ({ where }: any) => {
          const before = state.sessions.length;
          const kept = state.sessions.filter((row) => !matchesSession(row, where));
          state.sessions.splice(0, state.sessions.length, ...kept);
          return { count: before - kept.length };
        }),
      },
      settings: {
        findUnique: vi.fn(async ({ where }: any) => state.settings.get(where.key) ?? null),
        findMany: vi.fn(async ({ where }: any = {}) => [...state.settings.values()].filter((row) => matchesSettings(row, where))),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const existing = state.settings.get(where.key);
          if (existing) Object.assign(existing, update);
          else state.settings.set(where.key, { id: `setting-${++state.sequence}`, ...create });
          return state.settings.get(where.key);
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = state.settings.get(where.key);
          if (!row) throw new Error('setting not found');
          Object.assign(row, data);
          return row;
        }),
        delete: vi.fn(async ({ where }: any) => {
          const row = state.settings.get(where.key);
          if (row) state.settings.delete(where.key);
          return row ?? {};
        }),
        deleteMany: vi.fn(async ({ where }: any) => {
          let count = 0;
          for (const [key, row] of state.settings) {
            if (matchesSettings(row, where)) {
              state.settings.delete(key);
              count += 1;
            }
          }
          return { count };
        }),
      },
    },
  };
});

import {
  cleanupExpiredSessions,
  createSession,
  listActiveSessions,
  refreshSession,
  revokeOtherSessions,
  revokeSession,
  revokeSessionById,
  verifySession,
} from '@/lib/session-manager';
import { verifySessionToken } from '@/lib/auth';

beforeEach(() => {
  state.users.clear();
  state.sessions.splice(0, state.sessions.length);
  state.settings.clear();
  state.sequence = 0;
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-hmac';
});

describe('Prisma-backed session manager', () => {
  it('creates JWT sessions and verifies them through the shared auth helper', async () => {
    const token = await createSession('user-1', { deviceInfo: 'Firefox/Linux', ipAddress: '10.0.0.1' });
    expect(token.split('.')).toHaveLength(3);
    expect((await verifySession(token))?.userId).toBe('user-1');
    expect(await verifySessionToken(token)).not.toBeNull();
    expect(state.sessions[0].deviceInfo).toBe('Firefox/Linux');
  });

  it('lists active sessions with stable ids and never returns a replayable token', async () => {
    const token = await createSession('user-2', { userAgent: 'Chrome' });
    const sessions = await listActiveSessions('user-2');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(state.sessions[0].id);
    expect(sessions[0].session.userAgent).toBe('Chrome');
    expect(sessions[0].token).not.toContain(token);
    expect(sessions[0].token).toHaveLength(8);
  });

  it('revokes a session and invalidates the JWT', async () => {
    const token = await createSession('user-3');
    await expect(revokeSession(token)).resolves.toBe(true);
    await expect(verifySession(token)).resolves.toBeNull();
    await expect(listActiveSessions('user-3')).resolves.toEqual([]);
  });

  it('revokes a listed session only for its owning user', async () => {
    await createSession('user-4');
    const [session] = await listActiveSessions('user-4');
    await expect(revokeSessionById('somebody-else', session.id)).resolves.toBe(false);
    await expect(revokeSessionById('user-4', session.id)).resolves.toBe(true);
    expect(await listActiveSessions('user-4')).toHaveLength(0);
  });

  it('signs out other devices while preserving the current JWT', async () => {
    const current = await createSession('user-5');
    const other1 = await createSession('user-5');
    const other2 = await createSession('user-5');
    await expect(revokeOtherSessions('user-5', current)).resolves.toBe(2);
    expect(await verifySession(current)).not.toBeNull();
    expect(await verifySession(other1)).toBeNull();
    expect(await verifySession(other2)).toBeNull();
    expect(await listActiveSessions('user-5')).toHaveLength(1);
  });

  it('rotates a session and immediately invalidates the old JWT', async () => {
    const old = await createSession('user-6', { rememberMe: true, deviceInfo: 'Phone' });
    const next = await refreshSession(old);
    expect(next).toBeTruthy();
    expect(next).not.toBe(old);
    expect(await verifySession(old)).toBeNull();
    const session = await verifySession(next!);
    expect(session?.userId).toBe('user-6');
    expect(session?.deviceInfo).toBe('Phone');
    expect(session?.isRefreshToken).toBe(true);
  });

  it('cleans expired JWT-backed rows', async () => {
    const token = await createSession('user-7');
    state.sessions[0].expiresAt = new Date(Date.now() - 1000);
    await expect(cleanupExpiredSessions()).resolves.toBe(1);
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it('includes a still-live hashed legacy session without exposing its token', async () => {
    const opaque = 'legacy-session-token';
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(opaque).digest('hex');
    const now = new Date();
    const key = `session:${tokenHash}`;
    state.settings.set(key, {
      id: 'legacy-row',
      key,
      value: JSON.stringify({
        userId: 'user-8',
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      }),
    });
    const sessions = await listActiveSessions('user-8');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toMatch(/^legacy-/);
    expect(sessions[0].token).not.toContain(opaque);
    expect(sessions[0].session.userId).toBe('user-8');
  });
});
