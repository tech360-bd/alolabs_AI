// @vitest-environment node
/**
 * T-8 — approval, retry and cancel must be authorised against the run's tenant,
 * not merely against a run id the caller happens to know.
 *
 * The API routes already check `approval.companyId`. These tests target the
 * engine layer beneath them, so the invariant survives a new caller being added
 * later. Knowing an id is not authorisation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

beforeAll(async () => {
  real = await createRealDb('approval-tenant');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

beforeAll(async () => {
  const { db } = real;
  for (const [id, slug] of [['co-a', 'co-a'], ['co-b', 'co-b']] as const) {
    await db.company.create({ data: { id, name: id, slug, accountType: 'client' } });
  }
  for (const [id, email] of [['u-a', 'a@t.test'], ['u-b', 'b@t.test']] as const) {
    await db.user.create({ data: { id, email, name: id, passwordHash: 'x', role: 'admin' } });
    await db.companyUser.create({
      data: { userId: id, companyId: id === 'u-a' ? 'co-a' : 'co-b', role: 'admin' },
    });
  }
  // A run belonging to company A, paused for human review.
  await db.agentOSRun.create({
    data: { id: 'run-a', objective: 'needs review', status: 'waiting_approval', companyId: 'co-a', userId: 'u-a' },
  });
  await db.approval.create({
    data: {
      id: 'approval-a',
      type: 'qc_review',
      title: 'Review output',
      companyId: 'co-a',
      requestedBy: 'u-a',
      requestJson: JSON.stringify({ runId: 'run-a' }),
      status: 'pending',
    },
  });
}, 60_000);

describe('T-8: approval resolution is tenant-scoped', () => {
  it('refuses when the reviewer belongs to a different company', async () => {
    const { resolveRunApproval } = await import('@/lib/runs');

    // Company B's admin knows approval-a's id. That must not be enough.
    await expect(
      resolveRunApproval({
        approvalId: 'approval-a',
        approved: true,
        reviewerId: 'u-b',
        reviewerCompanyId: 'co-b',
      }),
    ).rejects.toThrow(/tenant|company|forbid|cross/i);

    // And nothing happened to the approval or the run.
    const approval = await real.db.approval.findUnique({ where: { id: 'approval-a' } });
    expect(approval?.status).toBe('pending');
    const run = await real.db.agentOSRun.findUnique({ where: { id: 'run-a' } });
    expect(run?.status).toBe('waiting_approval');
  });

  it('refuses when the approval has no company but a tenant is asserted', async () => {
    await real.db.approval.create({
      data: {
        id: 'approval-legacy',
        type: 'qc_review',
        title: 'legacy',
        companyId: null,
        requestJson: JSON.stringify({ runId: 'run-a' }),
        status: 'pending',
      },
    });
    const { resolveRunApproval } = await import('@/lib/runs');

    await expect(
      resolveRunApproval({
        approvalId: 'approval-legacy',
        approved: true,
        reviewerId: 'u-a',
        reviewerCompanyId: 'co-a',
      }),
    ).rejects.toThrow(/tenant|company/i);
  });

  it('allows the reviewer from the owning company', async () => {
    const { resolveRunApproval } = await import('@/lib/runs');

    const result = await resolveRunApproval({
      approvalId: 'approval-a',
      approved: false, // reject, so no queue job is required in the test
      reviewerId: 'u-a',
      reviewerCompanyId: 'co-a',
      note: 'not good enough',
    });

    expect(result.runId).toBe('run-a');
    const run = await real.db.agentOSRun.findUnique({ where: { id: 'run-a' } });
    expect(run?.status).toBe('failed');
  });

  it('refuses when the approval points at a run owned by another company', async () => {
    // A misconfigured approval whose requestJson names another tenant's run.
    await real.db.agentOSRun.create({
      data: { id: 'run-b', objective: 'b work', status: 'waiting_approval', companyId: 'co-b', userId: 'u-b' },
    });
    await real.db.approval.create({
      data: {
        id: 'approval-cross',
        type: 'qc_review',
        title: 'cross-linked',
        companyId: 'co-a',
        requestJson: JSON.stringify({ runId: 'run-b' }),
        status: 'pending',
      },
    });

    const { resolveRunApproval } = await import('@/lib/runs');

    // The approval says company A, the run says company B. Both cannot be right;
    // the engine must refuse rather than let A decide B's run.
    await expect(
      resolveRunApproval({
        approvalId: 'approval-cross',
        approved: true,
        reviewerId: 'u-a',
        reviewerCompanyId: 'co-a',
      }),
    ).rejects.toThrow(/tenant|company|mismatch/i);

    const run = await real.db.agentOSRun.findUnique({ where: { id: 'run-b' } });
    expect(run?.status).toBe('waiting_approval');
  });
});
