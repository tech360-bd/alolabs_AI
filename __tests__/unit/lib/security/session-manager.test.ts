import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, any>>,
  settings: new Map<string, Record<string, any>>(),
  sequence: 0,
}));

vi.mock('@/lib/db', () => {
  const matchesSession = (row: Record<string, any>, where: Record<string, any> = {}) => {
    if (typeof where.id === 'string' && row.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    if (where.userId && row.userId !== where.userId) return false;
    if (where.tokenHash && row.tokenHash !== where.tokenHash) return false;
    if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) return false;
    return true;
  };
  return {
    db: {
      user: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, role: 'admin', isActive: true })) },
      session: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `sid-${++state.sequence}`, revokedAt: null, ...data };
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
        findMany: vi.fn(async ({ where }: any = {}) => [...state.settings.values()].filter((row) => !where?.key?.startsWith || row.key.startsWith(where.key.startsWith))),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const old = state.settings.get(where.key);
          if (old) Object.assign(old, update);
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
            if (!where?.key?.startsWith || row.key.startsWith(where.key.startsWith)) {
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
  createSession,
  destroyAllUserSessions,
  destroySession,
  getSessionCount,
  listUserSessions,
  rotateSessionToken,
  validateSession,
} from '@/lib/security/session-manager';
import { verifySessionToken } from '@/lib/auth';

beforeEach(() => {
  state.sessions.splice(0, state.sessions.length);
  state.settings.clear();
  state.sequence = 0;
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-hmac';
});

describe('security session-manager compatibility facade', () => {
  it('creates signed, Prisma-backed JWTs with metadata', async () => {
    const token = await createSession('user-1', {
      userAgent: 'Chrome/120',
      ipAddress: '1.2.3.4',
      device: 'Desktop',
    });
    expect(token.split('.')).toHaveLength(3);
    expect(state.sessions[0]).toMatchObject({
      userId: 'user-1',
      userAgent: 'Chrome/120',
      ipAddress: '1.2.3.4',
      deviceInfo: 'Desktop',
    });
  });

  it('validates the DB-backed session and maps metadata for the security UI', async () => {
    const token = await createSession('user-2', { userAgent: 'Chrome', device: 'Laptop' });
    const session = await validateSession(token);
    expect(session?.metadata).toMatchObject({
      userId: 'user-2',
      userAgent: 'Chrome',
      device: 'Laptop',
    });
    expect(session?.isActive).toBe(true);
    expect(session?.token).toBe('');
  });

  it('rejects invalid and expired sessions', async () => {
    await expect(validateSession('not-a-session')).resolves.toBeNull();
    const token = await createSession('user-3');
    state.sessions[0].expiresAt = new Date(Date.now() - 1000);
    await expect(validateSession(token)).resolves.toBeNull();
  });

  it('destroys only the session belonging to the authenticated owner', async () => {
    const token = await createSession('user-4');
    await expect(destroySession(token, 'other-user')).resolves.toBe(false);
    await expect(destroySession(token, 'user-4')).resolves.toBe(true);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it('revokes all user sessions', async () => {
    const first = await createSession('user-5');
    const second = await createSession('user-5');
    expect(await destroyAllUserSessions('user-5')).toBe(2);
    await expect(verifySessionToken(first)).resolves.toBeNull();
    await expect(verifySessionToken(second)).resolves.toBeNull();
  });

  it('rotates a live session and invalidates the old token', async () => {
    const old = await createSession('user-6', { userAgent: 'Mobile Safari', ipAddress: '1.1.1.1' });
    const next = await rotateSessionToken(old);
    expect(next).toBeTruthy();
    expect(next).not.toBe(old);
    await expect(verifySessionToken(old)).resolves.toBeNull();
    const refreshed = await validateSession(next!);
    expect(refreshed?.metadata.userAgent).toBe('Mobile Safari');
    expect(refreshed?.metadata.ipAddress).toBe('1.1.1.1');
  });

  it('counts and lists active sessions without replayable bearer tokens', async () => {
    const token = await createSession('user-7');
    expect(await getSessionCount('user-7')).toBe(1);
    const sessions = await listUserSessions('user-7');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token).not.toContain(token);
    expect(sessions[0].id).toBe(state.sessions[0].id);
  });
});
