// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

let fixture: RealDb;

beforeAll(async () => {
  fixture = await createRealDb('phase10-health-deep');
});

afterAll(async () => {
  await fixture?.cleanup();
});

describe('Phase 10 — /api/health/deep RBAC, cookie auth, and datasource reporting', () => {
  it('requires authentication and restricts deep diagnostics to admin/infra roles', async () => {
    const { createSessionToken } = await import('@/lib/auth');
    const { GET } = await import('@/app/api/health/deep/route');

    const unauth = await GET(new NextRequest('http://localhost/api/health/deep'));
    expect(unauth.status).toBe(401);

    const basicHeader = await GET(
      new NextRequest('http://localhost/api/health/deep', {
        headers: { authorization: 'Basic invalid-token' },
      }),
    );
    expect(basicHeader.status).toBe(401);

    const acctMgr = await fixture.db.user.create({
      data: {
        email: `acct-${Date.now()}@example.test`,
        name: 'Account Manager',
        role: 'account_manager',
        passwordHash: 'hash',
      },
    });
    const opToken = await createSessionToken(acctMgr.id);
    const opRes = await GET(
      new NextRequest('http://localhost/api/health/deep', {
        headers: { authorization: `Bearer ${opToken}` },
      }),
    );
    expect(opRes.status).toBe(403);

    const admin = await fixture.db.user.create({
      data: {
        email: `admin-${Date.now()}@example.test`,
        name: 'Admin',
        role: 'super_admin',
        passwordHash: 'hash',
      },
    });
    const adminToken = await createSessionToken(admin.id);
    const cookieRes = await GET(
      new NextRequest('http://localhost/api/health/deep', {
        headers: { cookie: `session-token=${adminToken}` },
      }),
    );
    expect(cookieRes.status).toBe(200);
    const data = await cookieRes.json();
    expect(data.checks?.database?.status).toBe('healthy');
    expect(data.checks?.database?.detail).toContain('SQLite connected');
  });
});
