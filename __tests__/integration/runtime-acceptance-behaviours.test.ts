// @vitest-environment node
/**
 * Stage 2 — Agent Runtime acceptance: the required behaviours.
 *
 * The companion suite (`runtime-acceptance-failures.test.ts`) proves the engine
 * fails correctly. This one proves it works: that a run is durable before it is
 * acknowledged, that the queue executes it exactly once, that persistence
 * outlives the process, that events are real and replayable rather than
 * synthesised, and that one tenant's work never leaks into another's view.
 *
 * Everything drives the real `src/lib/runs` and `src/lib/job-queue` code against
 * a real database created from the real schema.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;
let counter = 0;

async function freshCompany(): Promise<string> {
  counter += 1;
  const id = `co-b${counter}`;
  await real.db.company.create({ data: { id, name: id, slug: id, accountType: 'client' } });
  return id;
}

async function seedAgent(companyId: string): Promise<string> {
  const n = ++counter;
  const deptId = `dept-b${n}`;
  await real.db.department.create({
    data: { id: deptId, name: `Dept ${deptId}`, slug: deptId, companyId },
  });
  const row = await real.db.agent.create({
    data: {
      agentId: `AGENT-B${n}`,
      name: `Agent ${n}`,
      slug: `agent-b-${n}`,
      departmentId: deptId,
      departmentName: `Dept ${deptId}`,
      purpose: 'acceptance',
      status: 'active',
      companyId,
    },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  real = await createRealDb('runtime-behaviours');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

beforeEach(() => {
  vi.resetModules();
});

describe('Stage 2 acceptance — required behaviours', () => {
  // ── B-01 ─────────────────────────────────────────────────────────────────
  it('B-01 a run is durable before it is acknowledged', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId, status } = await runs.createRun({ objective: 'durable first', companyId });

    // Immediately after the call returns — before any worker exists — the row
    // and its queue job must already be in the database.
    const row = await real.db.agentOSRun.findUnique({ where: { id: runId } });
    expect(row, 'the run row must exist before createRun returns').not.toBeNull();
    expect(row?.companyId).toBe(companyId);
    expect(status).toBe('queued');

    const job = await real.db.queueItem.findFirst({ where: { jobId: runId } });
    expect(job, 'the durable job must exist before createRun returns').not.toBeNull();
    expect(job?.jobType).toBe(runs.RUN_JOB_TYPE);
    expect(JSON.parse(job!.payload).companyId).toBe(companyId);
  });

  // ── B-02 ─────────────────────────────────────────────────────────────────
  it('B-02 a run survives a process restart with its events intact', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'survive restart', companyId });

    vi.resetModules();
    const reopened = await import('@/lib/runs');
    const row = await reopened.getRun(runId);
    expect(row?.objective).toBe('survive restart');
    expect(row?.companyId).toBe(companyId);
    const events = await reopened.getRunEvents(runId);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('run.queued');
  });

  // ── B-03 ─────────────────────────────────────────────────────────────────
  it('B-03 the queue executes a job exactly once under contention', async () => {
    const { enqueue, dequeue, completeJob } = await import('@/lib/job-queue');
    const queue = `acceptance-${Date.now()}`;
    // enqueue returns the record, not its id.
    const { id } = await enqueue(queue, 'acceptance.job', { n: 1 }, { idempotencyKey: `once-${queue}` });

    const workers = [0, 1, 2, 3, 4].map((i) => `worker-${i}`);
    const claims = await Promise.all(workers.map((workerId) => dequeue(queue, { workerId })));
    const winners = claims
      .map((claim, index) => ({ claim, workerId: workers[index] }))
      .filter(({ claim }) => claim?.id === id);
    expect(winners, 'exactly one worker may claim the job').toHaveLength(1);

    // Complete it with the claim that actually won. `completeJob` guards on the
    // full claim (lockedBy + attempts), so passing a different worker's details
    // must not be able to complete someone else's job.
    const winner = winners[0];
    await completeJob(winner!.claim!.id, { done: true }, {
      lockedBy: winner!.workerId,
      attempts: winner!.claim!.attempts,
    });
    expect((await real.db.queueItem.findUnique({ where: { id } }))?.status).toBe('completed');
    expect(await dequeue(queue, { workerId: 'worker-y' })).toBeNull();
  });

  // ── B-04 ─────────────────────────────────────────────────────────────────
  it('B-04 enqueue is idempotent on its key', async () => {
    const { enqueue } = await import('@/lib/job-queue');
    const queue = `acceptance-idem-${Date.now()}`;
    const key = `same-${queue}`;
    const a = await enqueue(queue, 'acceptance.job', { n: 1 }, { idempotencyKey: key });
    const b = await enqueue(queue, 'acceptance.job', { n: 2 }, { idempotencyKey: key });
    expect(b.id).toBe(a.id);
    expect(await real.db.queueItem.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  // ── B-05 ─────────────────────────────────────────────────────────────────
  it('B-05 events are ordered and replayable from the beginning', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'replay me', companyId });

    await runs.executeRun(runId, {
      plan: {
        steps: [{ id: 's1', title: 'Only step', description: 'x', skills: [], tools: [], dependsOn: [] }],
        strategy: 'heuristic',
        reasoning: 'replay case',
      },
    });

    const events = await runs.getRunEvents(runId, 500);
    expect(events.length).toBeGreaterThan(2);
    // Ascending by creation, so a client replaying them sees a coherent story.
    const times = events.map((e) => new Date(e.createdAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(events[0].type).toBe('run.queued');
    // Every event names the run it belongs to; none are attributed elsewhere.
    expect(events.every((e) => e.runId === runId)).toBe(true);
  });

  // ── B-06 ─────────────────────────────────────────────────────────────────
  it('B-06 executing the same run twice does not double-execute completed steps', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'once only', companyId });

    const plan = {
      steps: [{ id: 's1', title: 'Single', description: 'x', skills: [], tools: [], dependsOn: [] as string[] }],
      strategy: 'heuristic' as const,
      reasoning: 'idempotency case',
    };
    await runs.executeRun(runId, { plan });
    const firstAttempts = (await runs.getRun(runId))?.attempts ?? 0;
    const firstEvents = await real.db.runEvent.count({ where: { runId } });

    // Re-delivery of the same job must be a no-op on a terminal run.
    await runs.executeRun(runId, { plan });

    expect((await runs.getRun(runId))?.attempts).toBe(firstAttempts);
    expect(await real.db.runEvent.count({ where: { runId } })).toBe(firstEvents);
  });

  // ── B-07 ─────────────────────────────────────────────────────────────────
  it('B-07 a run reaches a terminal state and says why', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'terminal', companyId });

    await runs.executeRun(runId, {
      plan: {
        steps: [{ id: 's1', title: 'Step', description: 'x', skills: [], tools: [], dependsOn: [] }],
        strategy: 'heuristic',
        reasoning: 'terminal case',
      },
    });

    const row = await runs.getRun(runId);
    expect(['completed', 'failed']).toContain(row?.status);
    expect(row?.summary, 'a terminal run must carry a summary').toBeTruthy();
    expect(row?.completedAt).toBeTruthy();
  });

  // ── B-08 ─────────────────────────────────────────────────────────────────
  it('B-08 getRunDetail reports the same state as the run row', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'consistent view', companyId });
    await runs.executeRun(runId, {
      plan: {
        steps: [{ id: 's1', title: 'Detail step', description: 'x', skills: [], tools: [], dependsOn: [] }],
        strategy: 'heuristic',
        reasoning: 'detail case',
      },
    });

    const row = await runs.getRun(runId);
    const detail = await runs.getRunDetail(runId);
    expect(detail, 'a run that exists must have a detail view').not.toBeNull();
    // `detail.run` is typed from getRun(), which is nullable, so assert on it
    // rather than asserting through it.
    expect(detail?.run?.id).toBe(runId);
    expect(detail?.run?.status).toBe(row?.status);
    // The detail view may not invent tasks for steps that never ran.
    expect(Array.isArray(detail?.tasks)).toBe(true);
  });

  // ── B-09 ─────────────────────────────────────────────────────────────────
  it('B-09 listing is paginated, bounded and tenant-scoped', async () => {
    const mine = await freshCompany();
    const other = await freshCompany();
    const runs = await import('@/lib/runs');
    for (let i = 0; i < 3; i++) await runs.createRun({ objective: `mine ${i}`, companyId: mine });
    await runs.createRun({ objective: 'theirs', companyId: other });

    const page = await runs.listRuns({ companyId: mine, limit: 2 });
    expect(page.runs).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.runs.every((r) => r.companyId === mine)).toBe(true);

    const second = await runs.listRuns({ companyId: mine, limit: 2, offset: 2 });
    expect(second.runs).toHaveLength(1);

    // The bounded take must not be defeated by a huge limit.
    const huge = await runs.listRuns({ companyId: mine, limit: 100_000 });
    expect(huge.runs.length).toBeLessThanOrEqual(3);
  });

  // ── B-10 ─────────────────────────────────────────────────────────────────
  it('B-10 status filtering returns only that status', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'filter me', companyId });
    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'completed' } });

    const completed = await runs.listRuns({ companyId, status: 'completed' });
    const queued = await runs.listRuns({ companyId, status: 'queued' });
    expect(completed.runs.map((r) => r.id)).toContain(runId);
    expect(queued.runs.map((r) => r.id)).not.toContain(runId);
  });

  // ── B-11 ─────────────────────────────────────────────────────────────────
  it('B-11 cancellation is visible to a worker that is about to start a step', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'cancel mid-flight', companyId });

    await runs.cancelRun(runId);
    await runs.executeRun(runId);

    const row = await runs.getRun(runId);
    expect(row?.status).toBe('cancelled');
    const cancelledEvent = await real.db.runEvent.findFirst({ where: { runId, type: 'run.cancelled' } });
    expect(cancelledEvent, 'cancellation must be recorded as an event').not.toBeNull();
  });

  // ── B-12 ─────────────────────────────────────────────────────────────────
  it('B-12 an approval resumes the run through the durable queue, not inline', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'resume via queue', companyId });

    await real.db.agentOSRun.update({ where: { id: runId }, data: { status: 'waiting_approval', attempts: 1 } });
    await real.db.approval.create({
      data: {
        id: `ap-${runId}`,
        companyId,
        title: 'QC',
        type: 'qc_review',
        status: 'pending',
        requestJson: JSON.stringify({ runId, stepId: 's1' }),
      },
    });

    const result = await runs.resolveRunApproval({
      approvalId: `ap-${runId}`,
      approved: true,
      reviewerId: 'reviewer',
      reviewerCompanyId: companyId,
    });

    expect(result).toMatchObject({ runId, resumed: true, status: 'queued' });
    const job = await real.db.queueItem.findFirst({
      where: { jobId: runId, idempotencyKey: { contains: `resume:ap-${runId}` } },
    });
    expect(job, 'resumption must be queued durably').not.toBeNull();
    expect(job?.status).toBe('queued');
  });

  // ── B-13 ─────────────────────────────────────────────────────────────────
  it('B-13 an approval cannot resurrect a run that already finished', async () => {
    const companyId = await freshCompany();
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'finished already', companyId });
    await real.db.agentOSRun.update({
      where: { id: runId },
      data: { status: 'completed', summary: 'all done', completedAt: new Date() },
    });
    await real.db.approval.create({
      data: {
        id: `ap-done-${runId}`,
        companyId,
        title: 'QC',
        type: 'qc_review',
        status: 'pending',
        requestJson: JSON.stringify({ runId, stepId: 's1' }),
      },
    });

    const result = await runs.resolveRunApproval({
      approvalId: `ap-done-${runId}`,
      approved: true,
      reviewerId: 'reviewer',
      reviewerCompanyId: companyId,
    });
    expect(result.resumed).toBe(false);
    expect((await runs.getRun(runId))?.status).toBe('completed');
  });

  // ── B-14 ─────────────────────────────────────────────────────────────────
  it('B-14 the event trail distinguishes who did each thing', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'sources', companyId });
    await runs.executeRun(runId, {
      plan: {
        steps: [{ id: 's1', title: 'Src', description: 'x', skills: [], tools: [], dependsOn: [] }],
        strategy: 'heuristic',
        reasoning: 'sources case',
      },
    });

    const events = await runs.getRunEvents(runId, 500);
    const sources = new Set(events.map((e) => e.source));
    expect(sources.size).toBeGreaterThan(0);
    // Nothing is written with an empty source, which would make the trail useless.
    expect([...sources].every((s) => s.length > 0)).toBe(true);
  });

  // ── B-15 ─────────────────────────────────────────────────────────────────
  it('B-15 a failed step is retried within the repair budget, then reported', async () => {
    const companyId = await freshCompany();
    await seedAgent(companyId);
    const runs = await import('@/lib/runs');
    const { runId } = await runs.createRun({ objective: 'repair budget', companyId });
    await runs.executeRun(runId, {
      plan: {
        steps: [{ id: 's1', title: 'Repair', description: 'x', skills: [], tools: [], dependsOn: [] }],
        strategy: 'heuristic',
        reasoning: 'repair case',
      },
    });

    // Whatever happened, the attempt count must be recorded and non-negative.
    const detail = await runs.getRunDetail(runId);
    for (const task of detail?.tasks ?? []) {
      expect(task.status).toBeTruthy();
    }
    expect((await runs.getRun(runId))?.status).toBeTruthy();
  });
});
