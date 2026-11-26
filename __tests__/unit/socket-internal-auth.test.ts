// @vitest-environment node
/**
 * The realtime and queue socket services are internal infrastructure. They
 * share one session check (mini-services/shared/internal-auth.ts), which must
 * agree with the HTTP rules in src/lib/access/surfaces.ts.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_TOKEN_PREFIX as SOCKET_PREFIX,
  INTERNAL_ROLES as SOCKET_ROLES,
  handshakeToken,
  verifyInternalSessionToken,
  type SessionDb,
} from '../../mini-services/shared/internal-auth';
import { CLIENT_TOKEN_PREFIX, INTERNAL_ROLES } from '@/lib/access/surfaces';

const key = (token: string) => `session:${createHash('sha256').update(token).digest('hex')}`;
const future = () => new Date(Date.now() + 3_600_000).toISOString();

function fakeDb(options: {
  sessions?: Record<string, object>;
  users?: Record<string, { id: string; role: string; isActive: boolean }>;
  memberships?: Record<string, string[]>;
  fail?: boolean;
}): SessionDb {
  return {
    settings: {
      findUnique: async ({ where }) => {
        if (options.fail) throw new Error('database unavailable');
        const record = options.sessions?.[where.key];
        return record ? { value: JSON.stringify(record) } : null;
      },
    },
    user: { findUnique: async (args) => options.users?.[(args as { where: { id: string } }).where.id] ?? null },
    companyUser: {
      findMany: async (args) =>
        (options.memberships?.[(args as { where: { userId: string } }).where.userId] ?? []).map((companyId) => ({ companyId })),
    },
  };
}

const STAFF_TOKEN = 'a'.repeat(96);
const CLIENT_TOKEN = `${CLIENT_TOKEN_PREFIX}${'b'.repeat(96)}`;

describe('socket services — internal session check', () => {
  it('uses the same roles and token prefix as the HTTP surface rules', () => {
    expect(SOCKET_PREFIX).toBe(CLIENT_TOKEN_PREFIX);
    expect([...SOCKET_ROLES].sort()).toEqual([...INTERNAL_ROLES].sort());
  });

  it('admits an active internal user with a stored, unexpired session', async () => {
    const db = fakeDb({
      sessions: { [key(STAFF_TOKEN)]: { userId: 'u1', expiresAt: future(), aud: 'internal' } },
      users: { u1: { id: 'u1', role: 'admin', isActive: true } },
      memberships: { u1: ['company-1'] },
    });
    expect(await verifyInternalSessionToken(db, STAFF_TOKEN)).toEqual({ userId: 'u1', role: 'admin', companyId: 'company-1' });
  });

  it('refuses a client session, by token class and by stored audience and by role', async () => {
    const users = { c1: { id: 'c1', role: 'client', isActive: true } };
    // Client-class token.
    expect(await verifyInternalSessionToken(
      fakeDb({ sessions: { [key(CLIENT_TOKEN)]: { userId: 'c1', expiresAt: future(), aud: 'client' } }, users }), CLIENT_TOKEN,
    )).toBeNull();
    // Unprefixed token whose record says "client".
    expect(await verifyInternalSessionToken(
      fakeDb({ sessions: { [key(STAFF_TOKEN)]: { userId: 'c1', expiresAt: future(), aud: 'client' } }, users }), STAFF_TOKEN,
    )).toBeNull();
    // Record claims "internal" but the owner's stored role is not internal.
    expect(await verifyInternalSessionToken(
      fakeDb({ sessions: { [key(STAFF_TOKEN)]: { userId: 'c1', expiresAt: future(), aud: 'internal' } }, users }), STAFF_TOKEN,
    )).toBeNull();
  });

  it('refuses a self-asserted "JWT" — identity is never read from the token', async () => {
    const payload = Buffer.from(JSON.stringify({ userId: 'u1', role: 'super_admin', companyId: 'company-1' })).toString('base64url');
    const forged = `eyJhbGciOiJub25lIn0.${payload}.x`;
    const db = fakeDb({ users: { u1: { id: 'u1', role: 'super_admin', isActive: true } } });
    expect(await verifyInternalSessionToken(db, forged)).toBeNull();
  });

  it('refuses expired sessions, deactivated users, raw-token lookups and bad input', async () => {
    const users = { u1: { id: 'u1', role: 'admin', isActive: true } };
    expect(await verifyInternalSessionToken(
      fakeDb({ sessions: { [key(STAFF_TOKEN)]: { userId: 'u1', expiresAt: new Date(Date.now() - 1000).toISOString() } }, users }), STAFF_TOKEN,
    )).toBeNull();
    expect(await verifyInternalSessionToken(
      fakeDb({ sessions: { [key(STAFF_TOKEN)]: { userId: 'u1', expiresAt: future() } }, users: { u1: { ...users.u1, isActive: false } } }), STAFF_TOKEN,
    )).toBeNull();
    // A row keyed by the raw token (the pre-hashing layout) is not honoured.
    expect(await verifyInternalSessionToken(
      fakeDb({ sessions: { [`session:${STAFF_TOKEN}`]: { userId: 'u1', expiresAt: future() } }, users }), STAFF_TOKEN,
    )).toBeNull();
    for (const bad of ['', 'short', undefined, null, 42, 'x'.repeat(600)]) {
      expect(await verifyInternalSessionToken(fakeDb({ users }), bad)).toBeNull();
    }
  });

  it('fails closed when the database is unavailable', async () => {
    expect(await verifyInternalSessionToken(fakeDb({ fail: true }), STAFF_TOKEN)).toBeNull();
    expect(await verifyInternalSessionToken(null, STAFF_TOKEN)).toBeNull();
  });

  it('reads the token from the handshake auth payload or a Bearer header', () => {
    expect(handshakeToken({ auth: { token: 'abc' } })).toBe('abc');
    expect(handshakeToken({ headers: { authorization: 'Bearer xyz' } })).toBe('xyz');
    expect(handshakeToken({ headers: { authorization: 'Basic xyz' } })).toBe('');
    expect(handshakeToken({})).toBe('');
  });
});

describe('socket services are gated', () => {
  const source = (file: string) => readFileSync(join(process.cwd(), 'mini-services', file), 'utf8');

  it('queue service authenticates every connection in the handshake and has no wildcard CORS', () => {
    const queue = source('queue-service/index.ts');
    expect(queue).toMatch(/io\.use\(async \(socket, next\)/);
    expect(queue).toContain('verifyInternalSessionToken');
    expect(queue).not.toMatch(/origin:\s*'\*'/);
    expect(queue.indexOf('io.use(')).toBeLessThan(queue.indexOf("io.on('connection'"));
  });

  it('realtime service verifies sessions through the shared check and decodes no token payloads', () => {
    const realtime = source('realtime-service/index.ts');
    expect(realtime).toContain('verifyInternalSessionToken');
    expect(realtime).not.toMatch(/split\('\.'\)|base64/);
  });
});
