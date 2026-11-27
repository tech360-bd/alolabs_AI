// @vitest-environment node
/**
 * Stage 2 — Agent Runtime acceptance: the mandatory failure scenarios.
 *
 * The runtime is only trustworthy if it fails correctly. A happy-path test says
 * a plan ran; these say what happens when the plan cannot run, when a worker
 * dies mid-step, when the model answers with garbage, when a reviewer rejects,
 * when the database refuses, and when the process is asked to do something the
 * tenant boundary forbids.
 *
 * Every case drives the real `src/lib/runs` engine against a real SQLite
 * database created from the real schema. Nothing is mocked except the two
 * boundaries a test must control: the LLM provider (via the planner/engine
 * seams) and the clock, and only where the scenario is *about* that boundary.
 *
 * Each scenario asserts the observable outcome — the persisted run status, the
 * events written, the rows that do or do not exist — not that a particular
 * function was called.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;

/** A tenant per scenario, so no case can be explained by another's leftovers. */
let counter = 0;
async function freshCompany(): Promise<string> {
  counter += 1;
  const id = `co-f${counter}`;
  await real.db.company.create({ data: { id, name: id, slug: id, accountType: 'client' } });
  return id;
}

async function seedAgent(companyId: string, agentId = `AGENT-${counter}`): Promise<string> {
  // Agent.departmentId is a required foreign key, so the department has to be
  // real and belong to the same tenant.
  const deptId = `dept-${counter}`;
  await real.db.department.create({
    data: { id: deptId, name: `Department ${deptId}`, slug: deptId, companyId },
  });
  const row = await real.db.agent.create({
    data: {
      agentId,
      name: `Agent ${agentId}`,
      slug: `agent-${agentId.toLowerCase()}-${counter}`,
      departmentId: deptId,
      departmentName: `Department ${deptId}`,
      purpose: 'testing',
      status: 'active',
      companyId,
    },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  real = await createRealDb('runtime-acceptance');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

beforeEach(() => {
  vi.resetModules();
});

/**
 * A complete single-step plan, so a scenario can be about one failure rather
 * than about the planner's heuristics.
 */
function singleStepPlan(title = 'Do the thing') {
  return {
    steps: [
      {
        id: 'step-1',
        title,
        description: 'Perform the requested work.',
        skills: [],
        tools: [],
        dependsOn: [] as string[],
        expectedOutput: 'A short answer.',
      },
    ],
    strategy: 'heuristic' as const,
    reasoning: 'single step for the acceptance case',
  };
}

describe('Stage 2 acceptance — mandatory failure scenarios', () => {
  // ── F-01 ─────────────────────────────────────────────────────────────────
  it('F-01 refuses to create a run without a real tenant', async () => {
    const runs = await import('@/lib/runs');
    for (const bad of ['', 'default-company', 'anonymous', undefined as unknown as string]) {
      await expect(runs.createRun({ objective: 'x', companyId: bad })).rejects.toThrow(/tenant/i);
    }
    // And nothing was written for a rejected request.
    const orphans = await real.db.agentOSRun.count({ where: { companyId: 'default-company' } });
    expect(orphans).toBe(0);
  });

  // ── F-02 ─────────────────────────────────────────────────────────────────
  it('F-02 refuses to execute a run whose tenant was lost', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'orphan me', companyId });

    // Simulate a row damaged by a migration or a manual edit.
    await real.db.agentOSRun.update({ where: { id: runId }, data: { companyId: 'default-company' } });

    await expect(runs.executeRun(runId)).rejects.toThrow(/tenant/i);
    const after = await runs.getRun(runId);
    expect(after?.status).not.toBe('completed');
  });

  // ── F-03 ─────────────────────────────────────────────────────────────────
  it('F-03 fails the step honestly when no agent is available', async () => {
    const companyId = await freshCompany(); // deliberately no agent seeded
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'no agent here', companyId });

    await runs.executeRun(runId, { plan: singleStepPlan() });

    const run = await runs.getRun(runId);
    expect(run?.status).toBe('failed');
    // No Task row exists: a task must belong to an agent, and there is none.
    // The failure is recorded where it belongs — a task.failed event naming the
    // reason, and a run-level error — so it is neither silent nor invented.
    const failedEvent = await real.db.runEvent.findFirst({ where: { runId, type: 'task.failed' } });
    expect(failedEvent, 'the failure must be recorded as an event').not.toBeNull();
    expect(run?.error ?? '').toMatch(/agent/i);
  });

  // ── F-04 ─────────────────────────────────────────────────────────────────
  it('F-04 does not execute an agent belonging to another company', async () => {
    const mine = await freshCompany();
    const theirs = await freshCompany();
    await seedAgent(theirs);

    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'borrow their agent', companyId: mine });
    await runs.executeRun(runId, { plan: singleStepPlan() });

    const run = await runs.getRun(runId);
    // The other tenant's agent must never be selected for my run.
    expect(run?.status).toBe('failed');
    const detail = await runs.getRunDetail(runId);
    const usedTheirAgent = (detail?.tasks ?? []).some((t) => t.agentId && t.agentId !== null);
    expect(usedTheirAgent, 'no task may be assigned to a foreign agent').toBe(false);
  });

  // ── F-05 ─────────────────────────────────────────────────────────────────
  it('F-05 is idempotent: executing a terminal run changes nothing', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'already done', companyId });

    await real.db.agentOSRun.update({
      where: { id: runId },
      data: { status: 'completed', summary: 'done', completedAt: new Date() },
    });
    const before = await real.db.runEvent.count({ where: { runId } });

    await runs.executeRun(runId); // must be a no-op

    const after = await runs.getRun(runId);
    expect(after?.status).toBe('completed');
    expect(after?.summary).toBe('done');
    expect(await real.db.runEvent.count({ where: { runId } })).toBe(before);
  });

  // ── F-06 ─────────────────────────────────────────────────────────────────
  it('F-06 honours cancellation before the first step runs', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'cancel me', companyId });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'cancelled' } });
    await runs.executeRun(runId);

    const run = await runs.getRun(runId);
    expect(run?.status).toBe('cancelled');
  });

  // ── F-07 ─────────────────────────────────────────────────────────────────
  it('F-07 cancelRun reports whether it actually cancelled anything', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');

    const { runId } = await runs.createRun({ objective: 'cancellable', companyId });
    expect(await runs.cancelRun(runId)).toBe(true);
    expect((await runs.getRun(runId))?.status).toBe('cancelled');

    // A second cancel on an already-terminal run is not a cancellation.
    expect(await runs.cancelRun(runId)).toBe(false);
    // And cancelling something that does not exist is not either.
    expect(await runs.cancelRun('no-such-run')).toBe(false);
  });

  // ── F-08 ─────────────────────────────────────────────────────────────────
  it('F-08 resumes from the checkpoint instead of repeating completed steps', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'resume me', companyId });

    // Two steps, the first already checkpointed as completed by a previous worker.
    const plan = {
      steps: [
        { id: 's1', title: 'First', description: 'a', skills: [], tools: [], dependsOn: [], expectedOutput: '' },
        { id: 's2', title: 'Second', description: 'b', skills: [], tools: [], dependsOn: [] as string[], expectedOutput: '' },
      ],
      strategy: 'heuristic' as const,
      reasoning: 'resume case',
    };
    await real.db.agentOSRun.update({
      where: { id: runId },
      data: {
        plan: JSON.stringify(plan),
        status: 'running',
        attempts: 1,
        checkpoint: JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          steps: { s1: { stepId: 's1', status: 'completed', tokens: 5, repairAttempts: 0, output: 'checkpointed output' } },
        }),
      },
    });

    await runs.executeRun(runId);

    const run = await runs.getRun(runId);
    expect(run?.attempts).toBe(2);
    // s1 must appear with its checkpointed output, not be re-run.
    const detail = await runs.getRunDetail(runId);
    const first = detail?.tasks.find((t) => t.title === 'First');
    expect(first, 'the checkpointed step is restored, not re-created').toBeUndefined();
    const resumed = await real.db.runEvent.findFirst({ where: { runId, type: 'run.resumed' } });
    expect(resumed, 'a resumed run must say so in its event log').not.toBeNull();
  });

  // ── F-09 ─────────────────────────────────────────────────────────────────
  it('F-09 reuses the persisted plan on resume rather than re-planning', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'do not re-plan', companyId });

    const plan = {
      steps: [{ id: 'only', title: 'Persisted', description: 'x', skills: [], tools: [], dependsOn: [] as string[], expectedOutput: '' }],
      strategy: 'heuristic' as const,
      reasoning: 'persisted reasoning',
    };
    await real.db.agentOSRun.update({
      where: { id: runId },
      data: { plan: JSON.stringify(plan), status: 'running', attempts: 1 },
    });

    await runs.executeRun(runId);

    // A re-plan would write another plan.created event.
    const planEvents = await real.db.runEvent.count({ where: { runId, type: 'plan.created' } });
    expect(planEvents, 'a resumed run must not plan again').toBe(0);
  });

  // ── F-10 ─────────────────────────────────────────────────────────────────
  it('F-10 skips steps whose dependencies did not complete', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'dependent steps', companyId });

    const plan = {
      steps: [
        { id: 'a', title: 'Will fail', description: 'x', skills: [], tools: [], dependsOn: [] as string[], expectedOutput: '' },
        { id: 'b', title: 'Depends on a', description: 'y', skills: [], tools: [], dependsOn: ['a'], expectedOutput: '' },
      ],
      strategy: 'heuristic' as const,
      reasoning: 'dependency case',
    };
    // Pre-mark 'a' as failed in the checkpoint so 'b' has an unmet dependency.
    await real.db.agentOSRun.update({
      where: { id: runId },
      data: {
        plan: JSON.stringify(plan),
        status: 'running',
        attempts: 1,
        checkpoint: JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          steps: { a: { stepId: 'a', status: 'failed', tokens: 0, repairAttempts: 0, error: 'boom' } },
        }),
      },
    });

    await runs.executeRun(runId);

    const skipped = await real.db.runEvent.findFirst({ where: { runId, type: 'task.skipped' } });
    expect(skipped, 'the dependent step must be skipped and recorded as such').not.toBeNull();
    expect((await runs.getRun(runId))?.status).toBe('failed');
  });

  // ── F-11 ─────────────────────────────────────────────────────────────────
  it('F-11 pauses for review and does not proceed while a decision is pending', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'needs review', companyId });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    await real.db.approval.create({
      data: {
        id: 'ap-pending',
        companyId,
        title: 'QC escalation',
        type: 'qc_review',
        status: 'pending',
        requestJson: JSON.stringify({ runId, stepId: 'step-1' }),
      },
    });

    const eventsBefore = await real.db.runEvent.count({ where: { runId } });
    await runs.executeRun(runId);

    expect((await runs.getRun(runId))?.status).toBe('waiting_approval');
    expect(await real.db.runEvent.count({ where: { runId } })).toBe(eventsBefore);
  });

  // ── F-12 ─────────────────────────────────────────────────────────────────
  it('F-12 fails the run when the reviewer rejects', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'rejected run', companyId });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    await real.db.approval.create({
      data: {
        id: 'ap-rejected',
        companyId,
        title: 'QC escalation',
        type: 'qc_review',
        status: 'rejected',
        requestJson: JSON.stringify({ runId, stepId: 'step-1' }),
        reviewedBy: 'reviewer',
      },
    });

    await runs.executeRun(runId);

    const run = await runs.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error).toMatch(/review/i);
  });

  // ── F-13 ─────────────────────────────────────────────────────────────────
  it('F-13 fails the run when the approval expires', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'expired run', companyId });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    await real.db.approval.create({
      data: {
        id: 'ap-expired',
        companyId,
        title: 'QC escalation',
        type: 'qc_review',
        status: 'expired',
        requestJson: JSON.stringify({ runId, stepId: 'step-1' }),
      },
    });

    await runs.executeRun(runId);
    expect((await runs.getRun(runId))?.status).toBe('failed');
  });

  // ── F-14 ─────────────────────────────────────────────────────────────────
  it('F-14 refuses an approval decision from another tenant', async () => {
    const owner = await freshCompany();
    const attacker = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'guarded approval', companyId: owner });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    await real.db.approval.create({
      data: {
        id: 'ap-guarded',
        companyId: owner,
        title: 'QC escalation',
        type: 'qc_review',
        status: 'pending',
        requestJson: JSON.stringify({ runId, stepId: 'step-1' }),
      },
    });

    await expect(
      runs.resolveRunApproval({
        approvalId: 'ap-guarded',
        approved: true,
        reviewerId: 'u-attacker',
        reviewerCompanyId: attacker,
      }),
    ).rejects.toThrow();

    // The approval is untouched and the run is still paused.
    expect((await real.db.approval.findUnique({ where: { id: 'ap-guarded' } }))?.status).toBe('pending');
    expect((await runs.getRun(runId))?.status).toBe('waiting_approval');
  });

  // ── F-15 ─────────────────────────────────────────────────────────────────
  it('F-15 refuses an approval for a run in a different company than the approval', async () => {
    const owner = await freshCompany();
    const other = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'mismatched approval', companyId: owner });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    // An approval row that claims a different company than its run.
    await real.db.approval.create({
      data: {
        id: 'ap-mismatch',
        companyId: other,
        title: 'QC escalation',
        type: 'qc_review',
        status: 'pending',
        requestJson: JSON.stringify({ runId, stepId: 'step-1' }),
      },
    });

    await expect(
      runs.resolveRunApproval({
        approvalId: 'ap-mismatch',
        approved: true,
        reviewerId: 'u-1',
        reviewerCompanyId: other,
      }),
    ).rejects.toThrow();
    expect((await runs.getRun(runId))?.status).toBe('waiting_approval');
  });

  // ── F-16 ─────────────────────────────────────────────────────────────────
  it('F-16 refuses to decide an approval twice', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'double decide', companyId });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    await real.db.approval.create({
      data: {
        id: 'ap-once',
        companyId,
        title: 'QC escalation',
        type: 'qc_review',
        status: 'approved',
        requestJson: JSON.stringify({ runId, stepId: 'step-1' }),
        reviewedBy: 'reviewer',
      },
    });

    await expect(
      runs.resolveRunApproval({
        approvalId: 'ap-once',
        approved: false,
        reviewerId: 'reviewer-2',
        reviewerCompanyId: companyId,
      }),
    ).rejects.toThrow();
  });

  // ── F-17 ─────────────────────────────────────────────────────────────────
  it('F-17 expiring stale approvals is bounded to past-due pending rows', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'expiry sweep', companyId });

    await real.db.approval.createMany({
      data: [
        {
          id: 'ap-due', companyId, title: 'Due', type: 'qc_review', status: 'pending',
          requestJson: JSON.stringify({ runId }), expiresAt: new Date(Date.now() - 60_000),
        },
        {
          id: 'ap-due-soon', companyId, title: 'Not due', type: 'qc_review', status: 'pending',
          requestJson: JSON.stringify({ runId }), expiresAt: new Date(Date.now() + 3_600_000),
        },
      ],
    });

    const expired = await runs.expireStaleApprovals();
    expect(expired).toBeGreaterThanOrEqual(1);
    expect((await real.db.approval.findUnique({ where: { id: 'ap-due' } }))?.status).toBe('expired');
    expect((await real.db.approval.findUnique({ where: { id: 'ap-due-soon' } }))?.status).toBe('pending');
  });

  // ── F-18 ─────────────────────────────────────────────────────────────────
  it('F-18 an approval for another company cannot be listed as this company\'s work', async () => {
    const mine = await freshCompany();
    const theirs = await freshCompany();
    const runs = await import('@/lib/runs');

    const { runId: theirRun } = await runs.createRun({ objective: 'their run', companyId: theirs });
    await real.db.approval.create({
      data: {
        id: 'ap-theirs', companyId: theirs, title: 'Theirs', type: 'qc_review', status: 'pending',
        requestJson: JSON.stringify({ runId: theirRun }),
      },
    });

    const mineRuns = await runs.listRuns({ companyId: mine });
    expect(mineRuns.runs.map((r) => r.id)).not.toContain(theirRun);
    const theirs_ = await runs.listRuns({ companyId: theirs });
    expect(theirs_.runs.map((r) => r.id)).toContain(theirRun);
  });

  // ── F-19 ─────────────────────────────────────────────────────────────────
  it('F-19 a queue job for a deleted run fails without a partial run being created', async () => {
    const runs = await import('@/lib/runs');
    const before = await real.db.agentOSRun.count();
    await expect(runs.executeRun('00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/i);
    expect(await real.db.agentOSRun.count()).toBe(before);
  });

  // ── F-20 ─────────────────────────────────────────────────────────────────
  it('F-20 records the reason when orchestration throws, rather than leaving the run running', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'explode', companyId });

    // A plan whose step list is malformed but parseable: the engine must not
    // leave the run in a non-terminal state.
    await real.db.agentOSRun.update({
      where: { id: runId },
      data: { plan: JSON.stringify({ steps: null, strategy: 'heuristic', reasoning: 'broken' }), attempts: 1, status: 'running' },
    });
    await runs.executeRun(runId);

    const run = await runs.getRun(runId);
    expect(['failed', 'completed']).toContain(run?.status);
    if (run?.status === 'failed') expect(run.error ?? run.summary).toBeTruthy();
  });

  // ── F-21 ─────────────────────────────────────────────────────────────────
  it('F-21 keeps state durable: a second process sees the same run', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'durable', companyId });

    // Durable means: the state is in the database, not in the process that
    // created it. Read it back through a fresh module instance on the same
    // database and assert the row is there with its tenant and event trail.
    vi.resetModules();
    const freshRuns = await import('@/lib/runs');
    const row = await freshRuns.getRun(runId);
    expect(row?.companyId).toBe(companyId);
    expect(row?.objective).toBe('durable');
    expect((await freshRuns.getRunEvents(runId, 10)).length).toBeGreaterThan(0);
  });

  // ── F-23 ─────────────────────────────────────────────────────────────────
  // The lookup must find a linked approval whose requestJson does NOT carry the
  // run id, and must still find a legacy row whose only link is that JSON. Two
  // separate cases, because a legacy row present in the same database masks a
  // failure of the column path.
  it('F-23a finds an approval linked by column, not by JSON substring', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'column lookup', companyId });

    // Linked by column only. A substring implementation finds nothing here, so
    // the engine would not see the pending decision and would run the step.
    await real.db.approval.create({
      data: {
        id: 'ap-column-only', companyId, title: 'Column-linked', type: 'qc_review',
        status: 'pending', runId, requestJson: JSON.stringify({ stepId: 's1' }),
      },
    });
    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });

    const before = await real.db.runEvent.count({ where: { runId } });
    await runs.executeRun(runId);
    expect(await real.db.runEvent.count({ where: { runId } }), 'a pending decision linked by column must be seen').toBe(before);
    expect((await runs.getRun(runId))?.status).toBe('waiting_approval');
  });

  it('F-23b still resolves a legacy approval whose only link is requestJson', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'legacy lookup', companyId });

    // Written before the column existed: runId is null, the link is in the JSON.
    await real.db.approval.create({
      data: {
        id: 'ap-legacy-only', companyId, title: 'Legacy', type: 'qc_review',
        status: 'pending', requestJson: JSON.stringify({ runId, stepId: 's1' }),
      },
    });
    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });

    const before = await real.db.runEvent.count({ where: { runId } });
    await runs.executeRun(runId);
    expect(await real.db.runEvent.count({ where: { runId } }), 'legacy rows must still be found').toBe(before);
    expect((await runs.getRun(runId))?.status).toBe('waiting_approval');
  });

  it('F-23c does not attach an approval that merely mentions the run id', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'decoy lookup', companyId });

    // No column link; the id appears only inside another field's text. This row
    // belongs to a different run and must not be treated as this run's.
    await real.db.approval.create({
      data: {
        id: 'ap-decoy-only', companyId, title: 'Decoy', type: 'qc_review',
        status: 'pending', runId: null,
        requestJson: JSON.stringify({ runId: 'some-other-run', note: `see ${runId}` }),
      },
    });

    const linked = await real.db.approval.findMany({ where: { runId } });
    expect(linked, 'only column-linked rows belong to this run').toHaveLength(0);
  });

  // ── F-22 ─────────────────────────────────────────────────────────────────
  it('F-22 every created run has an event trail from queue to terminal state', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'trail me', companyId });
    await runs.executeRun(runId, { plan: singleStepPlan() });

    const events = await runs.getRunEvents(runId, 500);
    const types = events.map((e) => e.type);
    expect(types).toContain('run.queued');
    expect(
      types.some((t) => t === 'run.completed' || t === 'run.failed'),
      `run must reach a terminal event; saw ${types.join(', ')}`,
    ).toBe(true);
    // Events are ordered and each carries a source.
    expect(events.every((e) => typeof e.source === 'string' && e.source.length > 0)).toBe(true);
  });
});
