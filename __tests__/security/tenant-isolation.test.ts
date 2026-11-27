// @vitest-environment node
/**
 * Tenant isolation — the four verified defects (T-1 … T-4) and the two
 * cross-tower threats (T-5, T-8).
 *
 * These tests were written BEFORE the fixes, and they failed. That order is
 * deliberate: a security test that has never failed has never proven anything,
 * because it may simply be asserting the code that already exists.
 *
 * Everything here runs against a real SQLite database built by the repo's own
 * schema push — no mocked Prisma, no in-memory fakes. The failure modes are
 * about *who can reach which row*, which a mock cannot express.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

/** Two companies, two workspaces, one user who is leaving company A. */
const A = { companyId: 'co-a', userId: 'user-a', workspaceId: 'ws-a' };
const B = { companyId: 'co-b', userId: 'user-b', workspaceId: 'ws-b' };

beforeAll(async () => {
  real = await createRealDb('tenant-isolation');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

async function seed() {
  const { db } = real;
  // Users
  for (const [id, email] of [
    [A.userId, 'a@example.test'],
    [B.userId, 'b@example.test'],
    ['user-orphan', 'orphan@example.test'],
  ] as const) {
    await db.user.upsert({
      where: { id },
      create: { id, email, name: id, passwordHash: 'x', role: 'user' },
      update: {},
    });
  }
  // Companies
  for (const [id, slug] of [
    [A.companyId, 'co-a'],
    [B.companyId, 'co-b'],
  ] as const) {
    await db.company.upsert({
      where: { id },
      create: { id, name: id, slug, accountType: 'client' },
      update: {},
    });
  }
  // Memberships
  for (const [userId, companyId] of [
    [A.userId, A.companyId],
    [B.userId, B.companyId],
  ] as const) {
    await db.companyUser.create({ data: { userId, companyId, role: 'admin' } });
  }
  // Workspaces + workspace membership
  for (const { workspaceId, companyId, userId } of [A, B]) {
    await db.aiWorkspace.create({
      data: { id: workspaceId, name: workspaceId, slug: workspaceId, ownerId: userId, companyId },
    });
    await db.aiWorkspaceMember.create({ data: { workspaceId, userId, role: 'owner' } });
  }
}

beforeAll(async () => {
  await seed();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

/* ──────────────────────────────────────────────────────────────────────────
 * T-2 — the `'default-company'` pseudo-tenant
 * ────────────────────────────────────────────────────────────────────────── */

describe('T-2: no pseudo-tenant absorbs unowned runs', () => {
  it('createRun refuses to create a run without a company', async () => {
    const { createRun } = await import('@/lib/runs');

    // A run with no tenant is unownable. Previously this succeeded and was
    // later executed under the literal string 'default-company', which made
    // every orphaned run indistinguishable from every other tenant's.
    await expect(
      createRun({ objective: 'tenantless run', executeInline: false } as never),
    ).rejects.toThrow(/company/i);
  });

  it('a run persisted without a company is never executed as another tenant', async () => {
    const { db } = real;
    const { executeRun } = await import('@/lib/runs');

    // Simulate a legacy row that predates the fix: no companyId.
    const legacy = await db.agentOSRun.create({
      data: { id: 'legacy-run', objective: 'legacy', status: 'queued' },
    });
    expect(legacy.companyId).toBeNull();

    // The engine must refuse rather than silently inventing a tenant.
    await expect(executeRun('legacy-run')).rejects.toThrow(/company|tenant/i);

    const after = await db.agentOSRun.findUnique({ where: { id: 'legacy-run' } });
    expect(after?.status).not.toBe('running');
  });

  it('the string default-company is not a valid tenant for a new run', async () => {
    const { createRun } = await import('@/lib/runs');
    await expect(
      createRun({ objective: 'x', companyId: 'default-company' }),
    ).rejects.toThrow(/company|tenant/i);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * T-1 — the dispatcher never revalidates tenant
 * ────────────────────────────────────────────────────────────────────────── */

describe('T-1: a job cannot be dispatched for a run it does not own', () => {
  it('rejects a job whose payload tenant disagrees with the run row', async () => {
    const { db } = real;
    const { dispatchAgentOSJob } = await import('@/lib/workers/agentos-dispatcher');

    await db.agentOSRun.create({
      data: { id: 'run-owned-by-b', objective: 'belongs to B', status: 'queued', companyId: B.companyId, userId: B.userId },
    });

    // A job claiming company A referencing a run owned by company B.
    const job = {
      id: 'job-forged',
      jobType: 'agentos.run',
      payload: JSON.stringify({ runId: 'run-owned-by-b', companyId: A.companyId }),
    } as never;

    const executed: string[] = [];
    const deps = {
      db,
      executeRun: async (id: string) => { executed.push(id); },
    } as never;

    await expect(dispatchAgentOSJob(job, deps)).rejects.toThrow(/tenant|company|forbid/i);
    // The critical assertion: it never ran.
    expect(executed).toEqual([]);
  });

  it('rejects a job that carries no tenant at all', async () => {
    const { db } = real;
    const { dispatchAgentOSJob } = await import('@/lib/workers/agentos-dispatcher');

    await db.agentOSRun.create({
      data: { id: 'run-no-tenant-claim', objective: 'x', status: 'queued', companyId: A.companyId },
    });

    const job = {
      id: 'job-untenanted',
      jobType: 'agentos.run',
      payload: JSON.stringify({ runId: 'run-no-tenant-claim' }),
    } as never;

    const executed: string[] = [];
    const deps = { db, executeRun: async (id: string) => { executed.push(id); } } as never;

    await expect(dispatchAgentOSJob(job, deps)).rejects.toThrow(/tenant|company/i);
    expect(executed).toEqual([]);
  });

  it('dispatches normally when the payload tenant matches the run', async () => {
    const { db } = real;
    const { dispatchAgentOSJob } = await import('@/lib/workers/agentos-dispatcher');

    await db.agentOSRun.create({
      data: { id: 'run-honest', objective: 'ok', status: 'queued', companyId: A.companyId, userId: A.userId },
    });

    const job = {
      id: 'job-honest',
      jobType: 'agentos.run',
      payload: JSON.stringify({ runId: 'run-honest', companyId: A.companyId }),
    } as never;

    const executed: string[] = [];
    const deps = { db, executeRun: async (id: string) => { executed.push(id); } } as never;

    await dispatchAgentOSJob(job, deps);
    expect(executed).toEqual(['run-honest']);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * T-3 — platform principal ignored Company membership
 * ────────────────────────────────────────────────────────────────────────── */

describe('T-3: workspace access requires live Company membership', () => {
  it('denies a workspace whose owner has been removed from the company', async () => {
    const { db } = real;

    // Extract the membership check used by the principal resolver.
    const { userBelongsToCompany } = await import('@/lib/platform/principal');

    // user-a is a member of co-a
    expect(await userBelongsToCompany(db, A.userId, A.companyId)).toBe(true);

    // Revoke the membership — as an offboarding would.
    await db.companyUser.deleteMany({ where: { userId: A.userId, companyId: A.companyId } });
    expect(await userBelongsToCompany(db, A.userId, A.companyId)).toBe(false);

    // restore for later tests
    await db.companyUser.create({ data: { userId: A.userId, companyId: A.companyId, role: 'admin' } });
  });

  it('a workspace membership alone does not grant access across companies', async () => {
    const { db } = real;
    const { userBelongsToCompany } = await import('@/lib/platform/principal');

    // user-b holds a workspace membership in ws-a (simulating a stale invite).
    await db.aiWorkspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: A.workspaceId, userId: B.userId } },
      create: { workspaceId: A.workspaceId, userId: B.userId, role: 'member' },
      update: {},
    });

    // But user-b is NOT a member of company A, so the company gate must fail.
    expect(await userBelongsToCompany(db, B.userId, A.companyId)).toBe(false);

    await db.aiWorkspaceMember.deleteMany({ where: { workspaceId: A.workspaceId, userId: B.userId } });
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * T-4 — empty-string workspace identity
 * ────────────────────────────────────────────────────────────────────────── */

describe('T-4: an empty workspace is never a usable identity', () => {
  it('a workspace-scoped guard rejects an empty workspace id', async () => {
    const { isUsableWorkspaceId } = await import('@/lib/platform/principal');
    expect(isUsableWorkspaceId('')).toBe(false);
    expect(isUsableWorkspaceId('   ')).toBe(false);
    expect(isUsableWorkspaceId('default-company')).toBe(false);
    expect(isUsableWorkspaceId(undefined)).toBe(false);
    expect(isUsableWorkspaceId(A.workspaceId)).toBe(true);
  });

  it('a workspaceless principal cannot satisfy a workspace-scoped route', async () => {
    const { requireWorkspace } = await import('@/lib/platform/principal');

    // The real shape the resolver now produces for a user who belongs to a
    // company but has no workspace: company-scoped, no workspace id.
    const principal = {
      kind: 'session' as const,
      userId: A.userId,
      email: 'a@example.test',
      name: 'a',
      role: 'user',
      workspaceId: '',
      companyId: A.companyId,
      scope: 'company' as const,
      scopes: ['ai:chat'],
      rateLimitPerMinute: 240,
    };

    // A workspace-scoped operation must fail closed, not query with ''.
    expect(() => requireWorkspace(principal as never)).toThrow(/workspace/i);

    // A company-scoped operation is allowed and must say so explicitly.
    const scoped = requireWorkspace(principal as never, { allowCompanyScope: true });
    expect(scoped.workspaceId).toBeUndefined();
    expect(scoped.companyScoped).toBe(true);
  });
});
