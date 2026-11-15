/**
 * Sessions are bound to a surface.
 *
 * A session is minted for exactly one audience — `internal` (ALO Labs
 * personnel) or `client` (a customer of the portal) — decided from the owner's
 * stored role at sign-in. `verifySessionToken` admits a token only on the
 * surface it was minted for, and re-checks the stored role on every call so a
 * role change takes effect immediately.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, { key: string; value: string }>();
const users = new Map<string, { id: string; role: string; isActive: boolean }>();

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
    settings: {
      findUnique: async ({ where }: { where: { key: string } }) => store.get(where.key) ?? null,
      findMany: async () => [...store.values()],
      upsert: async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }) => {
        const existing = store.get(where.key);
        if (existing) existing.value = update.value;
        else store.set(where.key, { key: create.key, value: create.value });
        return store.get(where.key);
      },
      update: async ({ where, data }: { where: { key: string }; data: { value: string } }) => {
        const existing = store.get(where.key);
        if (!existing) throw Object.assign(new Error('not found'), { code: 'P2025' });
        existing.value = data.value;
        return existing;
      },
      delete: async ({ where }: { where: { key: string } }) => {
        store.delete(where.key);
        return {};
      },
      deleteMany: async () => ({ count: 0 }),
    },
  },
}));

import { createSessionToken, verifySessionToken } from '@/lib/auth';
import { CLIENT_TOKEN_PREFIX, audienceForToken } from '@/lib/access/surfaces';

beforeEach(() => {
  store.clear();
  users.clear();
  users.set('staff', { id: 'staff', role: 'admin', isActive: true });
  users.set('client', { id: 'client', role: 'client', isActive: true });
  users.set('viewer', { id: 'viewer', role: 'viewer', isActive: true });
});

describe('session audience', () => {
  it('mints a client-class token for a client and a plain one for staff', async () => {
    const clientToken = await createSessionToken('client');
    const staffToken = await createSessionToken('staff');
    expect(clientToken.startsWith(CLIENT_TOKEN_PREFIX)).toBe(true);
    expect(staffToken.startsWith(CLIENT_TOKEN_PREFIX)).toBe(false);
    expect(audienceForToken(clientToken)).toBe('client');
    expect(audienceForToken(staffToken)).toBe('internal');
  });

  it('treats every role outside the internal allow-list as a client', async () => {
    const token = await createSessionToken('viewer');
    expect(token.startsWith(CLIENT_TOKEN_PREFIX)).toBe(true);
    expect(await verifySessionToken(token)).toBeNull();
    expect((await verifySessionToken(token, { audience: 'client' }))?.audience).toBe('client');
  });

  it('gives an unknown account a client session, never an internal one', async () => {
    const token = await createSessionToken('nobody');
    expect(token.startsWith(CLIENT_TOKEN_PREFIX)).toBe(true);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('refuses a client session wherever an internal one is required (the default)', async () => {
    const token = await createSessionToken('client');
    expect(await verifySessionToken(token)).toBeNull();
    expect(await verifySessionToken(token, { audience: 'internal' })).toBeNull();
    const session = await verifySessionToken(token, { audience: 'client' });
    expect(session?.userId).toBe('client');
    expect(session?.audience).toBe('client');
  });

  it('refuses a staff session on the client surface', async () => {
    const token = await createSessionToken('staff');
    expect(await verifySessionToken(token, { audience: 'client' })).toBeNull();
    expect((await verifySessionToken(token))?.audience).toBe('internal');
  });

  it('reports the true audience when a route accepts either', async () => {
    expect((await verifySessionToken(await createSessionToken('client'), { audience: 'any' }))?.audience).toBe('client');
    expect((await verifySessionToken(await createSessionToken('staff'), { audience: 'any' }))?.audience).toBe('internal');
  });

  it('stops honouring an internal session the moment the owner is demoted', async () => {
    const token = await createSessionToken('staff');
    expect(await verifySessionToken(token)).not.toBeNull();
    users.set('staff', { id: 'staff', role: 'client', isActive: true });
    expect(await verifySessionToken(token)).toBeNull();
    // …and the stale internal token does not become a client session either.
    expect(await verifySessionToken(token, { audience: 'client' })).toBeNull();
    expect(await verifySessionToken(token, { audience: 'any' })).toBeNull();
  });

  it('does not let a promoted client reuse their client token on the internal surface', async () => {
    const token = await createSessionToken('client');
    users.set('client', { id: 'client', role: 'admin', isActive: true });
    expect(await verifySessionToken(token)).toBeNull();
    expect(await verifySessionToken(token, { audience: 'client' })).toBeNull();
  });

  it('rejects a session whose stored audience was tampered to "internal"', async () => {
    const token = await createSessionToken('client');
    for (const row of store.values()) {
      if (!row.key.startsWith('session:')) continue;
      const record = JSON.parse(row.value);
      if (record.userId === 'client') row.value = JSON.stringify({ ...record, aud: 'internal' });
    }
    expect(await verifySessionToken(token)).toBeNull();
    expect(await verifySessionToken(token, { audience: 'any' })).toBeNull();
  });

  it('rejects a deactivated owner on every surface', async () => {
    const token = await createSessionToken('client');
    users.set('client', { id: 'client', role: 'client', isActive: false });
    expect(await verifySessionToken(token, { audience: 'client' })).toBeNull();
    expect(await verifySessionToken(token, { audience: 'any' })).toBeNull();
  });
});
