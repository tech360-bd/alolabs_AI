// @vitest-environment node
/**
 * T-7 — `super_admin` must not implicitly mean "reach every tenant".
 *
 * Cross-company access is a distinct capability that is (a) granted explicitly,
 * (b) requires a reason, and (c) leaves an audit row. These tests pin all three.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

beforeAll(async () => {
  real = await createRealDb('system-op');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

beforeAll(async () => {
  await real.db.user.create({
    data: { id: 'u-admin', email: 'admin@t.test', name: 'admin', passwordHash: 'x', role: 'super_admin' },
  });
}, 60_000);

const env = (list?: string) => ({ ALO_SYSTEM_OPERATORS: list }) as NodeJS.ProcessEnv;

describe('resolveSystemScopes', () => {
  it('grants nothing when the allowlist is unset', async () => {
    const { resolveSystemScopes, SYSTEM_SCOPE } = await import('@/lib/tenancy/policy');
    const scopes = resolveSystemScopes({ id: 'u-admin', email: 'admin@t.test', role: 'super_admin' }, env());
    expect(scopes).not.toContain(SYSTEM_SCOPE);
    expect(scopes).toEqual([]);
  });

  it('grants nothing to a non-super_admin even when allowlisted', async () => {
    const { resolveSystemScopes } = await import('@/lib/tenancy/policy');
    const scopes = resolveSystemScopes({ id: 'u-admin', email: 'admin@t.test', role: 'admin' }, env('u-admin'));
    expect(scopes).toEqual([]);
  });

  it('grants the scope to an allowlisted operator by user id', async () => {
    const { resolveSystemScopes, SYSTEM_SCOPE } = await import('@/lib/tenancy/policy');
    expect(resolveSystemScopes({ id: 'u-admin', email: 'admin@t.test', role: 'super_admin' }, env('u-admin'))).toContain(SYSTEM_SCOPE);
  });

  it('grants the scope to an allowlisted operator by email, case-insensitively', async () => {
    const { resolveSystemScopes, SYSTEM_SCOPE } = await import('@/lib/tenancy/policy');
    expect(
      resolveSystemScopes({ id: 'u-admin', email: 'Admin@T.test', role: 'super_admin' }, env(' admin@t.TEST ')),
    ).toContain(SYSTEM_SCOPE);
  });
});

describe('assertSystemOperation', () => {
  it('refuses a super_admin who does not hold the scope', async () => {
    const { assertSystemOperation, SystemOperationDenied } = await import('@/lib/tenancy/policy');
    await expect(
      assertSystemOperation(
        { db: real.db },
        { userId: 'u-admin', role: 'super_admin', scopes: [] },
        { action: 'ai.usage.read', reason: 'investigating a billing anomaly' },
      ),
    ).rejects.toBeInstanceOf(SystemOperationDenied);
    expect(await real.db.auditLog.count()).toBe(0);
  });

  it('refuses a granted operator who supplies no reason', async () => {
    const { assertSystemOperation, SYSTEM_SCOPE, SystemOperationDenied } = await import('@/lib/tenancy/policy');
    await expect(
      assertSystemOperation(
        { db: real.db },
        { userId: 'u-admin', role: 'super_admin', scopes: [SYSTEM_SCOPE] },
        { action: 'ai.usage.read', reason: '   ' },
      ),
    ).rejects.toBeInstanceOf(SystemOperationDenied);
    expect(await real.db.auditLog.count()).toBe(0);
  });

  it('allows a granted operator with a reason and writes the audit row', async () => {
    const { assertSystemOperation, SYSTEM_SCOPE } = await import('@/lib/tenancy/policy');
    await assertSystemOperation(
      { db: real.db },
      { userId: 'u-admin', role: 'super_admin', scopes: [SYSTEM_SCOPE] },
      { action: 'ai.usage.read', reason: 'investigating a billing anomaly', targetCompanyIds: ['co-a', 'co-b'] },
    );

    const rows = await real.db.auditLog.findMany({ where: { userId: 'u-admin' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('system.ai.usage.read');
    expect(rows[0].resource).toBe('co-a,co-b');
    const details = JSON.parse(rows[0].details);
    expect(details.reason).toBe('investigating a billing anomaly');
    expect(details.scope).toBe(SYSTEM_SCOPE);
  });

  it('records the attempt even when the target list is omitted', async () => {
    const { assertSystemOperation, SYSTEM_SCOPE } = await import('@/lib/tenancy/policy');
    await assertSystemOperation(
      { db: real.db },
      { userId: 'u-admin', role: 'super_admin', scopes: [SYSTEM_SCOPE] },
      { action: 'company.repair', reason: 'repairing an orphaned workspace' },
    );
    const row = await real.db.auditLog.findFirst({ where: { action: 'system.company.repair' } });
    expect(row?.resource).toBe('*');
  });
});
