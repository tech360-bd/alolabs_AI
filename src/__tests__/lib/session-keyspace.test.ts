import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

/** Shared in-memory Prisma/Settings state exercises auth and lifecycle interop. */
const state = vi.hoisted(() => ({
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
      user: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, role: 'admin', isActive: true })) },
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

import { createSessionToken, verifySessionToken } from '@/lib/auth';
import {
  listActiveSessions,
  revokeOtherSessions,
  revokeSession,
  verifySession,
} from '@/lib/session-manager';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

beforeEach(() => {
  state.sessions.splice(0, state.sessions.length);
  state.settings.clear();
  state.sequence = 0;
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-hmac';
});

describe('auth and session-manager lifecycle interop', () => {
  it('revokes a login JWT across modules so logout invalidates it everywhere', async () => {
    const token = await createSessionToken('user-1', { method: 'password' });
    expect(await verifySessionToken(token)).not.toBeNull();
    expect(await verifySession(token)).not.toBeNull();
    await expect(revokeSession(token)).resolves.toBe(true);
    await expect(verifySessionToken(token)).resolves.toBeNull();
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it('persists only the token digest and never puts JWTs into Settings', async () => {
    const token = await createSessionToken('user-2');
    expect(state.sessions[0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(state.sessions[0])).not.toContain(token);
    for (const row of state.settings.values()) {
      expect(row.key).not.toContain(token);
      expect(row.value).not.toContain(token);
    }
  });

  it('lists sessions minted by the auth module using the Prisma rows', async () => {
    await createSessionToken('user-3');
    const sessions = await listActiveSessions('user-3');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session.userId).toBe('user-3');
    expect(sessions[0].id).toBe(state.sessions[0].id);
  });

  it('honours still-live hashed opaque Settings sessions during migration', async () => {
    const token = 'old-opaque-session';
    const now = new Date();
    const key = `session:${sha256(token)}`;
    state.settings.set(key, {
      id: 'legacy-1',
      key,
      value: JSON.stringify({
        userId: 'legacy-user',
        aud: 'internal',
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(await verifySessionToken(token)).not.toBeNull();
    expect((await listActiveSessions('legacy-user'))[0].session.userId).toBe('legacy-user');
    await expect(revokeSession(token)).resolves.toBe(true);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it('signs out other devices but keeps the caller active', async () => {
    const current = await createSessionToken('user-4');
    const other1 = await createSessionToken('user-4');
    const other2 = await createSessionToken('user-4');
    await expect(revokeOtherSessions('user-4', current)).resolves.toBe(2);
    expect(await verifySessionToken(current)).not.toBeNull();
    expect(await verifySessionToken(other1)).toBeNull();
    expect(await verifySessionToken(other2)).toBeNull();
    expect(await listActiveSessions('user-4')).toHaveLength(1);
  });
});
