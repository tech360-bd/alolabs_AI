/**
 * Sessions are bound to one audience: internal staff or the client portal.
 * JWT claims provide a routing hint only; the signed token and database row,
 * plus the owner's current role, are authoritative in the route auth helper.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  users: new Map<string, { id: string; role: string; isActive: boolean }>(),
  sessions: [] as Array<Record<string, any>>,
  sequence: 0,
}));

vi.mock('@/lib/db', () => {
  const findSession = (where: Record<string, any>) => state.sessions.find((row) =>
    (where.id === undefined || row.id === where.id)
    && (where.tokenHash === undefined || row.tokenHash === where.tokenHash),
  ) ?? null;
  return {
    db: {
      user: {
        findUnique: vi.fn(async ({ where }: any) => state.users.get(where.id) ?? null),
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
        findMany: vi.fn(async ({ where }: any = {}) => state.sessions.filter((row) => !where?.userId || row.userId === where.userId)),
        delete: vi.fn(async ({ where }: any) => {
          const index = state.sessions.findIndex((row) => row.id === where.id);
          if (index >= 0) state.sessions.splice(index, 1);
          return { count: index >= 0 ? 1 : 0 };
        }),
        deleteMany: vi.fn(async ({ where }: any) => {
          const before = state.sessions.length;
          const kept = state.sessions.filter((row) => {
            if (where?.userId && row.userId !== where.userId) return true;
            if (where?.id?.in && !where.id.in.includes(row.id)) return true;
            return false;
          });
          state.sessions.splice(0, state.sessions.length, ...kept);
          return { count: before - kept.length };
        }),
      },
      settings: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      securityEvent: { create: vi.fn().mockResolvedValue({}) },
    },
  };
});

import { createSessionToken, verifySessionToken } from '@/lib/auth';
import { CLIENT_TOKEN_PREFIX, audienceForToken } from '@/lib/access/surfaces';

beforeEach(() => {
  state.sessions.splice(0, state.sessions.length);
  state.users.clear();
  state.sequence = 0;
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-hmac';
  state.users.set('staff', { id: 'staff', role: 'admin', isActive: true });
  state.users.set('client', { id: 'client', role: 'client', isActive: true });
  state.users.set('viewer', { id: 'viewer', role: 'viewer', isActive: true });
});

describe('session audience', () => {
  it('mints signed JWTs whose audience matches the owner role', async () => {
    const clientToken = await createSessionToken('client');
    const staffToken = await createSessionToken('staff');
    expect(clientToken.split('.')).toHaveLength(3);
    expect(staffToken.split('.')).toHaveLength(3);
    expect(audienceForToken(clientToken)).toBe('client');
    expect(audienceForToken(staffToken)).toBe('internal');
  });

  it('treats every role outside the internal allow-list as a client', async () => {
    const token = await createSessionToken('viewer');
    await expect(verifySessionToken(token)).resolves.toBeNull();
    expect((await verifySessionToken(token, { audience: 'client' }))?.audience).toBe('client');
  });

  it('refuses to mint a session for an unknown account', async () => {
    await expect(createSessionToken('nobody')).rejects.toThrow('missing or inactive user');
  });

  it('refuses a client session wherever an internal one is required (the default)', async () => {
    const token = await createSessionToken('client');
    await expect(verifySessionToken(token)).resolves.toBeNull();
    await expect(verifySessionToken(token, { audience: 'internal' })).resolves.toBeNull();
    const session = await verifySessionToken(token, { audience: 'client' });
    expect(session?.userId).toBe('client');
    expect(session?.audience).toBe('client');
  });

  it('refuses a staff session on the client surface', async () => {
    const token = await createSessionToken('staff');
    await expect(verifySessionToken(token, { audience: 'client' })).resolves.toBeNull();
    expect((await verifySessionToken(token))?.audience).toBe('internal');
  });

  it('reports the true audience when a route accepts either', async () => {
    expect((await verifySessionToken(await createSessionToken('client'), { audience: 'any' }))?.audience).toBe('client');
    expect((await verifySessionToken(await createSessionToken('staff'), { audience: 'any' }))?.audience).toBe('internal');
  });

  it('stops honouring an internal session the moment the owner is demoted', async () => {
    const token = await createSessionToken('staff');
    expect(await verifySessionToken(token)).not.toBeNull();
    state.users.set('staff', { id: 'staff', role: 'client', isActive: true });
    await expect(verifySessionToken(token)).resolves.toBeNull();
    await expect(verifySessionToken(token, { audience: 'client' })).resolves.toBeNull();
    await expect(verifySessionToken(token, { audience: 'any' })).resolves.toBeNull();
  });

  it('does not let a promoted client reuse their client token on the internal surface', async () => {
    const token = await createSessionToken('client');
    state.users.set('client', { id: 'client', role: 'admin', isActive: true });
    await expect(verifySessionToken(token)).resolves.toBeNull();
    await expect(verifySessionToken(token, { audience: 'client' })).resolves.toBeNull();
  });

  it('rejects a session whose stored audience was tampered to internal', async () => {
    const token = await createSessionToken('client');
    state.sessions[0].audience = 'internal';
    await expect(verifySessionToken(token)).resolves.toBeNull();
    await expect(verifySessionToken(token, { audience: 'any' })).resolves.toBeNull();
  });

  it('rejects a deactivated owner on every surface', async () => {
    const token = await createSessionToken('client');
    state.users.set('client', { id: 'client', role: 'client', isActive: false });
    await expect(verifySessionToken(token, { audience: 'client' })).resolves.toBeNull();
    await expect(verifySessionToken(token, { audience: 'any' })).resolves.toBeNull();
  });

  it('keeps the alc_ prefix only for old opaque client-session routing', () => {
    expect(audienceForToken(`${CLIENT_TOKEN_PREFIX}${'b'.repeat(96)}`)).toBe('client');
  });
});
