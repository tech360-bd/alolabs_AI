// @vitest-environment node
/**
 * Migration safety tests for `AiWorkspace.companyId`.
 *
 * The MySQL DDL files cannot execute here (no MySQL server), so these tests
 * verify the part that actually decides correctness: the *backfill rule*. It is
 * expressed once in SQL (step 2) and mirrored here so the rule itself is pinned
 * by a test rather than trusted by inspection.
 *
 * The cases below are the ones that caused the exceptions documented in
 * `docs/security/canonical-tenant-model.md`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

beforeAll(async () => {
  real = await createRealDb('tenant-migration');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

/**
 * The deterministic backfill rule, in JavaScript, mirroring step 2 SQL:
 * assign a workspace's company only when its owner has EXACTLY ONE membership.
 */
async function backfill(real: RealDb): Promise<{ assigned: number; left: number }> {
  const { db } = real;
  const unowned = await db.aiWorkspace.findMany({
    where: { companyId: null },
    select: { id: true, ownerId: true },
  });

  let assigned = 0;
  for (const ws of unowned) {
    const memberships = await db.companyUser.findMany({
      where: { userId: ws.ownerId },
      select: { companyId: true },
    });
    if (memberships.length === 1) {
      await db.aiWorkspace.update({
        where: { id: ws.id },
        data: { companyId: memberships[0].companyId },
      });
      assigned += 1;
    }
  }

  const left = await db.aiWorkspace.count({ where: { companyId: null } });
  return { assigned, left };
}

beforeAll(async () => {
  const { db } = real;

  const users = [
    ['u-single', 'single@example.test'],
    ['u-multi', 'multi@example.test'],
    ['u-none', 'none@example.test'],
  ] as const;
  for (const [id, email] of users) {
    await db.user.create({ data: { id, email, name: id, passwordHash: 'x', role: 'user' } });
  }

  for (const [id, slug] of [['co-1', 'co-1'], ['co-2', 'co-2']] as const) {
    await db.company.create({ data: { id, name: id, slug, accountType: 'client' } });
  }

  // u-single belongs to exactly one company → deterministic
  await db.companyUser.create({ data: { userId: 'u-single', companyId: 'co-1', role: 'admin' } });
  // u-multi belongs to two → AMBIGUOUS, must NOT be guessed
  await db.companyUser.create({ data: { userId: 'u-multi', companyId: 'co-1', role: 'member' } });
  await db.companyUser.create({ data: { userId: 'u-multi', companyId: 'co-2', role: 'member' } });
  // u-none belongs to none → ORPHAN

  await db.aiWorkspace.create({ data: { id: 'ws-single', name: 'w', slug: 'w1', ownerId: 'u-single' } });
  await db.aiWorkspace.create({ data: { id: 'ws-multi', name: 'w', slug: 'w2', ownerId: 'u-multi' } });
  await db.aiWorkspace.create({ data: { id: 'ws-none', name: 'w', slug: 'w3', ownerId: 'u-none' } });
}, 60_000);

describe('AiWorkspace companyId backfill', () => {
  it('starts with every workspace unowned (the live production shape)', async () => {
    expect(await real.db.aiWorkspace.count({ where: { companyId: null } })).toBe(3);
  });

  it('assigns only the unambiguous owner', async () => {
    const { assigned } = await backfill(real);
    expect(assigned).toBe(1);

    const single = await real.db.aiWorkspace.findUnique({ where: { id: 'ws-single' } });
    expect(single?.companyId).toBe('co-1');
  });

  it('refuses to guess an owner in two companies', async () => {
    const multi = await real.db.aiWorkspace.findUnique({ where: { id: 'ws-multi' } });
    // This is the important assertion: NULL is the correct outcome. Picking
    // either company would silently place a workspace in the wrong tenant.
    expect(multi?.companyId).toBeNull();
  });

  it('refuses to guess an owner with no membership', async () => {
    const none = await real.db.aiWorkspace.findUnique({ where: { id: 'ws-none' } });
    expect(none?.companyId).toBeNull();
  });

  it('leaves exactly two explicit exceptions for human resolution', async () => {
    expect(await real.db.aiWorkspace.count({ where: { companyId: null } })).toBe(2);
  });

  it('is idempotent — a second run changes nothing', async () => {
    const before = await real.db.aiWorkspace.findMany({ select: { id: true, companyId: true }, orderBy: { id: 'asc' } });
    const { assigned } = await backfill(real);
    const after = await real.db.aiWorkspace.findMany({ select: { id: true, companyId: true }, orderBy: { id: 'asc' } });
    expect(assigned).toBe(0);
    expect(after).toEqual(before);
  });

  it('step 3 would refuse to run while exceptions remain', async () => {
    const unresolved = await real.db.aiWorkspace.count({ where: { companyId: null } });
    // The guard in step3_require.sql asserts this is 0. It is 2, so the
    // migration would abort — which is the whole point of the guard.
    expect(unresolved).toBeGreaterThan(0);
  });

  it('a resolved exception lets the constraint be satisfied', async () => {
    // Simulate a human resolving both: owner goes to co-2, orphan gets a home.
    await real.db.aiWorkspace.update({ where: { id: 'ws-multi' }, data: { companyId: 'co-2' } });
    await real.db.aiWorkspace.update({ where: { id: 'ws-none' }, data: { companyId: 'co-2' } });
    expect(await real.db.aiWorkspace.count({ where: { companyId: null } })).toBe(0);
  });

  it('the FK refuses a workspace pointing at a non-existent company', async () => {
    await expect(
      real.db.aiWorkspace.create({
        data: { id: 'ws-bad', name: 'w', slug: 'w4', ownerId: 'u-single', companyId: 'does-not-exist' },
      }),
    ).rejects.toThrow();
  });

  it('ON DELETE RESTRICT prevents deleting a company that owns workspaces', async () => {
    // Foreign keys are ON in the harness; this is the exact protection we asked
    // for in step 1. A Cascade here would delete every workspace, run and
    // conversation belonging to a company in one statement.
    await expect(real.db.company.delete({ where: { id: 'co-1' } })).rejects.toThrow();
  });
});
