// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRealDb, seedAgent, seedCompany, type RealDb } from '../helpers/real-db';

/**
 * Resumable runs against a REAL database.
 *
 * Only the model layer is stubbed (deterministic outputs — no network);
 * planning is supplied explicitly; routing/QC/approvals/artifacts/queue/
 * checkpoints are the real implementations.
 */

const QC_FAILING_OUTPUT = 'error: failed to';
const GOOD_OUTPUT = [
  'Research findings for the requested step.',
  '',
  '1. Objective analysis completed.',
  '2. Sources verified against the knowledge base.',
  '3. Recommendations drafted with citations.',
].join('\n');

type EngineBehaviour = 'ok' | 'hang' | 'qc-fail';
const behaviour: { byStepTitle: Record<string, EngineBehaviour> } = { byStepTitle: {} };
const executeCalls: string[] = [];

const stubExecute = vi.fn(async (params: { task: string; agentId: string }) => {
  const stepTitle = /STEP: (.*)/.exec(params.task)?.[1] ?? 'unknown';
  executeCalls.push(stepTitle);
  const mode = behaviour.byStepTitle[stepTitle] ?? 'ok';
  if (mode === 'hang') {
    await new Promise(() => { /* never resolves: simulates a worker that died mid-step */ });
  }
  return {
    id: `stub-${params.agentId}`,
    status: 'completed',
    result: { content: mode === 'qc-fail' ? QC_FAILING_OUTPUT : GOOD_OUTPUT, metadata: { model: 'stub-model' } },
    tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };
});

const routeTask = vi.fn(async (task: string) => ({
  selectedAgent: { agentId: 'AGENT-RESUME-0001', agentName: 'Resume Agent', role: 'researcher', score: 0.9 },
  reasoning: 'stub routing',
  task,
}));

const repairChat = vi.fn(async () => ({ content: QC_FAILING_OUTPUT, model: 'stub-repair-model' }));

vi.mock('@/lib/orchestrator', () => ({ getOrchestrator: () => ({ routeTask }) }));
vi.mock('@/lib/agent-runtime', () => ({ getExecutionEngine: () => ({ execute: stubExecute }) }));
vi.mock('@/lib/memory', () => ({ getMemoryStore: () => ({ addEpisodic: vi.fn(async () => ({})) }) }));
vi.mock('@/lib/event-bus', () => ({ getEventBus: () => ({ publish: vi.fn(async () => ({})), subscribe: () => () => {}, getHistory: () => [] }) }));
vi.mock('@/lib/ai-router', () => ({ getRouter: () => ({ chat: repairChat }) }));

const PLAN = {
  strategy: 'llm' as const,
  reasoning: 'test plan',
  steps: [
    { id: 'step-1', title: 'Research step', description: 'Research the topic.', skills: [], tools: [], dependsOn: [] },
    { id: 'step-2', title: 'Write step', description: 'Write the report based on the research.', skills: [], tools: [], dependsOn: ['step-1'] },
    { id: 'step-3', title: 'Review step', description: 'Review the report for quality.', skills: [], tools: [], dependsOn: ['step-2'] },
  ],
};

describe('resumable AgentOS runs (real database)', () => {
  let real: RealDb;
  let runs: typeof import('@/lib/runs');
  let queue: typeof import('@/lib/job-queue');
  let companyId: string;

  beforeAll(async () => {
    real = await createRealDb('alo-run-resume');
    runs = await import('@/lib/runs');
    queue = await import('@/lib/job-queue');
    const company = await seedCompany(real.db, 'Resume Co');
    companyId = company.id;
    await seedAgent(real.db, 'AGENT-RESUME-0001');
  }, 90_000);

  afterAll(async () => {
    await real?.cleanup();
  });

  it('continues from the checkpoint after a worker crash instead of repeating finished steps', async () => {
    behaviour.byStepTitle = { 'Write step': 'hang' };
    executeCalls.length = 0;

    const { runId } = await runs.createRun({ objective: 'Crash-resume objective', companyId, userId: 'user-1' });
    // Worker 1 starts the run and "dies" while executing step 2 (never returns).
    const crashed = runs.executeRun(runId, { plan: PLAN as never });
    await vi.waitFor(async () => {
      const row = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
      const checkpoint = JSON.parse(row.checkpoint) as { steps: Record<string, { status: string }> };
      expect(checkpoint.steps['step-1']?.status).toBe('completed');
      expect(executeCalls.filter((t) => t === 'Write step')).toHaveLength(1);
    }, { timeout: 10_000 });

    const midway = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
    expect(midway.status).toBe('running');
    expect(midway.attempts).toBe(1);
    expect(await real.db.task.count({ where: { runId } })).toBe(2);

    // Worker 2 picks the re-queued job up after the lease expired.
    behaviour.byStepTitle = {};
    await runs.executeRun(runId);

    const done = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
    expect(done.status).toBe('completed');
    expect(done.attempts).toBe(2);
    expect(done.summary).toContain('Completed 3/3 steps');
    // step-1 ran exactly once overall; step-2 ran once per worker; step-3 once.
    expect(executeCalls.filter((t) => t === 'Research step')).toHaveLength(1);
    expect(executeCalls.filter((t) => t === 'Write step')).toHaveLength(2);
    expect(executeCalls.filter((t) => t === 'Review step')).toHaveLength(1);

    const events = (await real.db.runEvent.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })).map((e) => e.type);
    expect(events).toContain('run.resumed');
    expect(events.filter((t) => t === 'plan.created')).toHaveLength(1); // never re-planned
    expect(events[events.length - 1]).toBe('run.completed');

    // Every task is linked to the run and has a versioned output.
    const tasks = await real.db.task.findMany({ where: { runId } });
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    for (const task of tasks.filter((t) => t.status === 'completed')) {
      const versions = await real.db.outputVersion.findMany({ where: { taskId: task.id } });
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions[0].reason).toBe('initial');
      expect(versions[0].qcPassed).toBe(true);
    }
    void crashed; // the hung first worker is intentionally abandoned
  }, 30_000);

  it('pauses on QC escalation, keeps every output version, and resumes after human approval', async () => {
    behaviour.byStepTitle = { 'Research step': 'qc-fail' };
    executeCalls.length = 0;
    repairChat.mockClear();

    const { runId } = await runs.createRun({ objective: 'Approval-resume objective', companyId, userId: 'user-1' });
    await runs.executeRun(runId, { plan: PLAN as never });

    const paused = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
    expect(paused.status).toBe('waiting_approval');
    expect(repairChat).toHaveBeenCalledTimes(2); // MAX_REPAIR_ATTEMPTS, then escalate

    const approval = await real.db.approval.findFirstOrThrow({ where: { requestJson: { contains: `"runId":"${runId}"` } } });
    expect(approval.status).toBe('pending');
    expect(approval.type).toBe('qc_review');
    expect(approval.expiresAt).not.toBeNull();
    expect(JSON.parse(approval.requestJson).stepId).toBe('step-1');

    // Output versioning: initial + 2 repairs, all QC-failed, none overwritten.
    const task = await real.db.task.findFirstOrThrow({ where: { runId } });
    const versions = await real.db.outputVersion.findMany({ where: { taskId: task.id }, orderBy: { version: 'asc' } });
    expect(versions.map((v) => [v.version, v.reason, v.qcPassed])).toEqual([[1, 'initial', false], [2, 'repair', false], [3, 'repair', false]]);
    expect(versions.every((v) => v.content === QC_FAILING_OUTPUT)).toBe(true);
    expect(versions.every((v) => JSON.parse(v.qcIssues).length > 0)).toBe(true);

    // Running the job again while the approval is pending must NOT bypass the gate.
    await runs.executeRun(runId);
    expect((await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('waiting_approval');
    expect(executeCalls.filter((t) => t === 'Write step')).toHaveLength(0);

    // Reviewer approves → run is re-queued (idempotently) → worker resumes.
    await real.db.approval.update({ where: { id: approval.id }, data: { status: 'approved', reviewedBy: 'reviewer-1', reviewedAt: new Date() } });
    const resolution = await runs.resolveRunApproval({ approvalId: approval.id, approved: true, reviewerId: 'reviewer-1' });
    expect(resolution).toMatchObject({ runId, resumed: true, status: 'queued' });
    const again = await runs.resolveRunApproval({ approvalId: approval.id, approved: true, reviewerId: 'reviewer-1' });
    expect(again.resumed).toBe(true);
    expect(await real.db.queueItem.count({ where: { idempotencyKey: `run:${runId}:resume:${approval.id}` } })).toBe(1);

    behaviour.byStepTitle = {};
    const job = await real.db.queueItem.findUniqueOrThrow({ where: { idempotencyKey: `run:${runId}:resume:${approval.id}` } });
    expect(job.status).toBe('queued');
    expect(job.jobType).toBe(runs.RUN_JOB_TYPE);
    expect(JSON.parse(job.payload)).toMatchObject({ runId, resumeFromApprovalId: approval.id });
    // The durable worker would now claim this job and call executeRun:
    const claimed = await queue.processQueue(runs.RUN_QUEUE, async (j) => {
      const payload = JSON.parse(j.payload) as { runId: string };
      await runs.executeRun(payload.runId);
      return { runId: payload.runId };
    }, { workerId: 'resume-worker' });
    expect(claimed.find((r) => r.id === job.id)?.status).toBe('completed');

    const finished = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: runId } });
    expect(finished.status).toBe('completed');
    expect(finished.summary).toContain('Completed 3/3 steps');
    expect(executeCalls.filter((t) => t === 'Research step')).toHaveLength(1); // approved output reused, not regenerated
    expect(executeCalls.filter((t) => t === 'Write step')).toHaveLength(1);
    expect((await real.db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('completed');

    const events = (await real.db.runEvent.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })).map((e) => e.type);
    expect(events).toContain('approval.requested');
    expect(events).toContain('run.paused');
    expect(events).toContain('approval.approved');
    expect(events).toContain('run.resumed');
    expect(events[events.length - 1]).toBe('run.completed');
  }, 30_000);

  it('fails the run when the reviewer rejects, and when the approval expires', async () => {
    behaviour.byStepTitle = { 'Research step': 'qc-fail' };

    const rejectedRun = await runs.createRun({ objective: 'Rejected objective', companyId, userId: 'user-1' });
    await runs.executeRun(rejectedRun.runId, { plan: PLAN as never });
    const approval = await real.db.approval.findFirstOrThrow({ where: { requestJson: { contains: `"runId":"${rejectedRun.runId}"` } } });
    await real.db.approval.update({ where: { id: approval.id }, data: { status: 'rejected', reviewedBy: 'reviewer-1' } });
    const res = await runs.resolveRunApproval({ approvalId: approval.id, approved: false, reviewerId: 'reviewer-1', note: 'not good enough' });
    expect(res).toMatchObject({ runId: rejectedRun.runId, resumed: false, status: 'failed' });
    const failed = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: rejectedRun.runId } });
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('not good enough');
    // A later worker invocation never revives a rejected run.
    await runs.executeRun(rejectedRun.runId);
    expect((await real.db.agentOSRun.findUniqueOrThrow({ where: { id: rejectedRun.runId } })).status).toBe('failed');

    const expiredRun = await runs.createRun({ objective: 'Expired objective', companyId, userId: 'user-1' });
    await runs.executeRun(expiredRun.runId, { plan: PLAN as never });
    const pending = await real.db.approval.findFirstOrThrow({ where: { requestJson: { contains: `"runId":"${expiredRun.runId}"` } } });
    await real.db.approval.update({ where: { id: pending.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await runs.expireStaleApprovals()).toBe(1);
    expect((await real.db.approval.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('expired');
    const expired = await real.db.agentOSRun.findUniqueOrThrow({ where: { id: expiredRun.runId } });
    expect(expired.status).toBe('failed');
    expect(expired.error).toContain('expired');
    behaviour.byStepTitle = {};
  }, 30_000);
});
