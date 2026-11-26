// @vitest-environment node
/**
 * The legacy `/api/*` routes shared one defect: they verified a session token
 * and then queried without any tenant filter. Authentication was mistaken for
 * authorisation across dozens of endpoints.
 *
 * These tests pin the replacement helper, `legacyTenant`, which is the piece
 * every migrated route now depends on.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

beforeAll(async () => {
  real = await createRealDb('legacy-tenant');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

beforeAll(async () => {
  const { db } = real;
  await db.company.create({ data: { id: 'co-a', name: 'A', slug: 'co-a', accountType: 'client' } });
  await db.company.create({ data: { id: 'co-b', name: 'B', slug: 'co-b', accountType: 'client' } });
  await db.user.create({ data: { id: 'u-a', email: 'a@t.test', name: 'a', passwordHash: 'x', role: 'admin' } });
  await db.user.create({ data: { id: 'u-b', email: 'b@t.test', name: 'b', passwordHash: 'x', role: 'admin' } });
  await db.user.create({ data: { id: 'u-none', email: 'n@t.test', name: 'n', passwordHash: 'x', role: 'admin' } });
  await db.companyUser.create({ data: { userId: 'u-a', companyId: 'co-a', role: 'admin' } });
  await db.companyUser.create({ data: { userId: 'u-b', companyId: 'co-b', role: 'admin' } });
}, 60_000);

/** Minimal request stub: the helper only reads the Authorization header. */
const req = (token?: string) =>
  ({ headers: { get: (h: string) => (h.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null) } }) as never;

describe('legacyTenant', () => {
  it('refuses a request with no bearer token', async () => {
    const { legacyTenant } = await import('@/lib/api/legacy-session');
    await expect(legacyTenant(req())).rejects.toThrow(/unauthori/i);
  });

  it('refuses a malformed token', async () => {
    const { legacyTenant } = await import('@/lib/api/legacy-session');
    await expect(legacyTenant(req('not-a-real-token'))).rejects.toThrow(/invalid/i);
  });

  it('resolves the caller company from CompanyUser, not from the request', async () => {
    const { legacyTenant } = await import('@/lib/api/legacy-session');
    const { createSessionToken } = await import('@/lib/auth');

    const token = await createSessionToken('u-a');
    const tenant = await legacyTenant(req(token));

    expect(tenant.userId).toBe('u-a');
    expect(tenant.companyId).toBe('co-a');
    expect(tenant.companyRole).toBe('admin');
  });

  it('refuses a user who belongs to no company', async () => {
    const { legacyTenant } = await import('@/lib/api/legacy-session');
    const { createSessionToken } = await import('@/lib/auth');

    const token = await createSessionToken('u-none');
    await expect(legacyTenant(req(token))).rejects.toThrow(/company/i);
  });
});

describe('tenantWhere', () => {
  it('produces a filter that never contains a client-supplied company', async () => {
    const { tenantWhere } = await import('@/lib/api/legacy-session');
    const tenant = { userId: 'u-a', companyId: 'co-a', companyRole: 'admin' };
    expect(tenantWhere(tenant)).toEqual({ companyId: 'co-a' });
    expect(tenantWhere(tenant, { status: 'active' })).toEqual({ companyId: 'co-a', status: 'active' });
  });

  it('supports models whose tenant column has another name', async () => {
    const { tenantWhere } = await import('@/lib/api/legacy-session');
    const tenant = { userId: 'u-a', companyId: 'co-a', companyRole: 'admin' };
    expect(tenantWhere(tenant, {}, 'ownerCompanyId')).toEqual({ ownerCompanyId: 'co-a' });
  });
});

describe('the filter actually isolates rows', () => {
  it('company A cannot read company B usage rows through the helper', async () => {
    const { db } = real;
    await db.usageLog.create({
      data: { id: 'u-1', companyId: 'co-a', userId: 'u-a', status: 'completed' },
    });
    await db.usageLog.create({
      data: { id: 'u-2', companyId: 'co-b', userId: 'u-b', status: 'completed' },
    });

    const { tenantWhere } = await import('@/lib/api/legacy-session');
    const tenantA = { userId: 'u-a', companyId: 'co-a', companyRole: 'admin' };
    const rows = await db.usageLog.findMany({ where: tenantWhere(tenantA) });

    expect(rows.map((r) => r.id)).toEqual(['u-1']);
  });
});
