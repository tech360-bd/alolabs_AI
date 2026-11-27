// @vitest-environment node
/**
 * Build-request logs must be tenant-scoped.
 *
 * `GET /api/agent-factory/build` listed `AgentBuildRequest` rows with no company
 * filter. The model had no company column at all, so no filter was even
 * possible: every authenticated caller received every tenant's build requests —
 * agent names, department ids, config payloads and result strings — and the
 * route's `where: tenantWhere(tenant)` was rejected by Prisma outright, which is
 * how this surfaced as a CI type error rather than as a leak report.
 *
 * The fix added a nullable `companyId` to the three factory build-request
 * models. Legacy rows stay NULL and are therefore invisible to every tenant:
 * these logs contain no other reference to a company, so any backfill would be a
 * guess, and a wrong guess hands one organisation's build history to another.
 *
 * This test drives the real route handler against a real database. It asserts
 * the behaviour a caller observes, not that a `where` clause exists.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

/** A stateless request; the route only reads the Authorization header. */
function request(token = 'tok'): NextRequest {
  return {
    headers: new Headers({ authorization: `Bearer ${token}` }),
    json: async () => ({}),
  } as unknown as NextRequest;
}

beforeAll(async () => {
  real = await createRealDb('factory-build-tenant');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

describe('factory build-request logs are tenant-scoped', () => {
  let route: typeof import('@/app/api/agent-factory/build/route');

  beforeAll(async () => {
    const { db } = real;
    for (const [id, slug] of [['co-a', 'co-a'], ['co-b', 'co-b']] as const) {
      await db.company.create({ data: { id, name: id, slug, accountType: 'client' } });
    }
    for (const [id, email, companyId] of [
      ['u-a', 'a@factory.test', 'co-a'],
      ['u-b', 'b@factory.test', 'co-b'],
    ] as const) {
      await db.user.create({ data: { id, email, name: id, passwordHash: 'x', role: 'admin' } });
      await db.companyUser.create({ data: { userId: id, companyId, role: 'admin' } });
    }

    // One build request per tenant, plus one legacy row with no owner.
    await db.agentBuildRequest.create({
      data: { companyId: 'co-a', agentName: 'alpha-agent', status: 'generated' },
    });
    await db.agentBuildRequest.create({
      data: { companyId: 'co-b', agentName: 'beta-agent', status: 'generated' },
    });
    await db.agentBuildRequest.create({
      data: { agentName: 'legacy-agent', status: 'generated' },
    });

    // The route resolves its tenant through legacyTenant, which verifies the
    // token through @/lib/auth. Stub only that boundary; everything below it —
    // the route body, the Prisma query and the database — stays real.
    vi.resetModules();
    vi.doMock('@/lib/auth', async () => {
      const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
      return {
        ...actual,
        verifySessionToken: vi.fn(async (token: string) =>
          token === 'token-a'
            ? { userId: 'u-a', email: 'a@factory.test' }
            : token === 'token-b'
              ? { userId: 'u-b', email: 'b@factory.test' }
              : null,
        ),
      };
    });
    route = await import('@/app/api/agent-factory/build/route');
  }, 60_000);

  it("returns only the caller's own build requests", async () => {
    const response = await route.GET(request('token-a'));
    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<{ agentName: string }>;
    expect(rows.map((row) => row.agentName)).toEqual(['alpha-agent']);
  });

  it("never returns another tenant's build requests", async () => {
    const response = await route.GET(request('token-b'));
    const rows = (await response.json()) as Array<{ agentName: string }>;
    expect(rows.map((row) => row.agentName)).toEqual(['beta-agent']);
    expect(rows.map((row) => row.agentName)).not.toContain('alpha-agent');
  });

  it('hides unowned legacy rows from every tenant rather than sharing them', async () => {
    for (const token of ['token-a', 'token-b']) {
      const response = await route.GET(request(token));
      const rows = (await response.json()) as Array<{ agentName: string }>;
      expect(rows.map((row) => row.agentName)).not.toContain('legacy-agent');
    }
  });

  it('refuses a caller with no live company membership', async () => {
    await real.db.companyUser.deleteMany({ where: { userId: 'u-a' } });
    // Authenticated but tenantless: legacyTenant raises 403, not 401 — the
    // caller is known, they simply own nothing to read.
    await expect(route.GET(request('token-a'))).rejects.toMatchObject({ status: 403 });
    // Restore for any later test in this file.
    await real.db.companyUser.create({
      data: { userId: 'u-a', companyId: 'co-a', role: 'admin' },
    });
  });
});
