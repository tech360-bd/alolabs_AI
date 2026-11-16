import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const state = vi.hoisted(() => ({
  users: new Map<string, { id: string; role: string; isActive: boolean } | null>(),
  sessions: [] as Array<Record<string, any>>,
  settings: new Map<string, Record<string, any>>(),
  sequence: 0,
}));

vi.mock('@/lib/db', () => {
  const findSession = (where: Record<string, any>) => state.sessions.find((row) =>
    (where.id === undefined || row.id === where.id)
    && (where.tokenHash === undefined || row.tokenHash === where.tokenHash),
  ) ?? null;
  const matchesSettings = (row: Record<string, any>, where: Record<string, any> = {}) => {
    if (where.key?.in && !where.key.in.includes(row.key)) return false;
    if (where.key?.startsWith && !row.key.startsWith(where.key.startsWith)) return false;
    if (where.OR && !where.OR.some((condition: Record<string, any>) => matchesSettings(row, condition))) return false;
    return where.key === undefined || typeof where.key === 'string' || where.key.in || where.key.startsWith || where.OR;
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
          const row = findSession(where);
          if (!row) throw new Error('session not found');
          Object.assign(row, data);
          return row;
        }),
        findUnique: vi.fn(async ({ where }: any) => findSession(where)),
        findFirst: vi.fn(async ({ where }: any) => findSession(where)),
        findMany: vi.fn(async ({ where }: any = {}) => state.sessions.filter((row) => {
          if (where?.userId && row.userId !== where.userId) return false;
          if (where?.id?.in && !where.id.in.includes(row.id)) return false;
          if (where?.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) return false;
          if (where?.expiresAt?.lte && row.expiresAt > where.expiresAt.lte) return false;
          if (where?.revokedAt === null && row.revokedAt !== null) return false;
          return true;
        })),
        delete: vi.fn(async ({ where }: any) => {
          const index = state.sessions.findIndex((row) => row.id === where.id);
          if (index >= 0) state.sessions.splice(index, 1);
          return { count: index >= 0 ? 1 : 0 };
        }),
        deleteMany: vi.fn(async ({ where }: any) => {
          const before = state.sessions.length;
          const kept = state.sessions.filter((row) => {
            if (where?.userId && row.userId !== where.userId) return true;
            if (where?.id && typeof where.id === 'string' && row.id !== where.id) return true;
            if (where?.id?.in && !where.id.in.includes(row.id)) return true;
            if (where?.id?.not && row.id === where.id.not) return true;
            return false;
          });
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
  comparePassword,
  createSessionToken,
  deleteSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from '@/lib/auth';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

beforeEach(() => {
  state.users.clear();
  state.sessions.splice(0, state.sessions.length);
  state.settings.clear();
  state.sequence = 0;
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-hmac';
});

describe('Auth Library', () => {
  describe('password hashing', () => {
    it('uses bcrypt and verifies only the matching password', async () => {
      const hash = await hashPassword('correct-password');
      expect(hash).toMatch(/^\$2/);
      await expect(comparePassword('correct-password', hash)).resolves.toBe(true);
      await expect(verifyPassword('incorrect-password', hash)).resolves.toBe(false);
    });
  });

  describe('JWT-backed sessions', () => {
    it('issues a signed JWT and stores only its SHA-256 digest in Prisma', async () => {
      const token = await createSessionToken('staff-user', { method: 'password' });
      expect(token.split('.')).toHaveLength(3);
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].tokenHash).toBe(digest(token));
      expect(state.sessions[0].tokenHash).toHaveLength(64);
      expect(JSON.stringify(state.sessions[0])).not.toContain(token);

      const session = await verifySessionToken(token);
      expect(session?.userId).toBe('staff-user');
      expect(session?.session.id).toBe(state.sessions[0].id);
      expect(session?.audience).toBe('internal');
    });

    it('rejects altered JWTs before looking up their session row', async () => {
      const token = await createSessionToken('staff-user');
      const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
      await expect(verifySessionToken(altered)).resolves.toBeNull();
    });

    it('rejects and deletes a session whose database expiry has passed', async () => {
      const token = await createSessionToken('staff-user');
      state.sessions[0].expiresAt = new Date(Date.now() - 1000);
      await expect(verifySessionToken(token)).resolves.toBeNull();
      expect(state.sessions).toHaveLength(0);
    });

    it('invalidates the JWT immediately when the session row is revoked', async () => {
      const token = await createSessionToken('staff-user');
      await deleteSessionToken(token);
      await expect(verifySessionToken(token)).resolves.toBeNull();
    });

    it('rechecks the stored account role and active status', async () => {
      state.users.set('staff-user', { id: 'staff-user', role: 'admin', isActive: true });
      const token = await createSessionToken('staff-user');
      state.users.set('staff-user', { id: 'staff-user', role: 'client', isActive: true });
      await expect(verifySessionToken(token)).resolves.toBeNull();
    });

    it('retains compatibility with valid hashed Settings-backed opaque sessions', async () => {
      const token = 'legacy-opaque-session-token';
      const now = new Date();
      const key = `session:${digest(token)}`;
      state.settings.set(key, {
        id: 'legacy-setting',
        key,
        value: JSON.stringify({
          userId: 'staff-user',
          aud: 'internal',
          createdAt: now.toISOString(),
          lastUsedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      });
      const session = await verifySessionToken(token);
      expect(session?.userId).toBe('staff-user');
      expect(session?.audience).toBe('internal');
    });
  });
});
