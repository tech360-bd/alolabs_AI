// @vitest-environment node
/**
 * Run Engine Runtime Acceptance Suite — 20 Production Behaviours (Real SQLite)
 *
 * Verifies against an isolated SQLite database:
 *  1. Untenanted / placeholder-tenant run creation fails closed before DB write
 *  2. Durable run creation persists `queued` status, `run.queued` event, and queue item
 *  3. Inline / direct execution drives run end-to-end with durable events
 *  4. Multi-step plan execution persists `Task`, `Output`, and `Artifact` rows
 *  5. Checkpoint durability skips already-completed steps on resume without re-running step engine
 *  6. Failed run retry (`retryRun` + `POST /api/runs/:id`) preserves completed checkpoint steps and re-runs failed steps
 *  7. Cancellation (`cancelRun` + `DELETE /api/runs/:id`) transitions active/queued runs to `cancelled` and cancels queued items
 *  8. Mid-flight cancellation between plan steps halts remaining steps cleanly
 *  9. Terminal-state runs reject duplicate cancellation (409 / `false`)
 * 10. Step timeout / provider error marks step failed and transitions run to `failed` with diagnostic error
 * 11. QC gate failure triggers automated repair pass (`repair.started` + `qc.passed`) and increments `Output.version`
 * 12. Exhausted QC escalates to `waiting_approval`, creates tenant-scoped `Approval`, and resumes to `completed` on `resolveRunApproval(approved: true)`
 * 13. Rejection via `resolveRunApproval(approved: false)` transitions run to `failed` with reviewer note
 * 14. Expiry of pending approval (`expireStaleApprovals`) transitions run to `failed` with `approval.expired` event
 * 15. Duplicate worker / concurrent `executeRun` calls do not re-execute terminal runs
 * 16. SSE `/api/runs/:id/events` replays persisted history with `id:` frames and closes cleanly on terminal status
 * 17. SSE `/api/runs/:id/events` honours `Last-Event-ID` reconnect header without duplicating prior events
 * 18. SSE `/api/runs/:id/events` enforces tenant isolation (403 on foreign company)
 * 19. `getRunDetail` returns tenant-scoped tasks (`Task.companyId` + `Task.runId`), QC scores, artifacts, and run-specific approvals
 * 20. Cross-tenant `retryRun` and `cancelRun` fail closed (403 via HTTP, Error via library)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, seedAgent, type RealDb } from '../helpers/real-db';

const authState = vi.hoisted(() => ({
  userId: 'user-alpha',
  companyId: 'comp-alpha' as string | undefined,
  role: 'admin',
}));

const QC_FAILING_TEXT = 'error: failed to produce output';
const VALID_STEP_OUTPUT = [
  '## Verified Architecture & Execution Deliverable',
  '',
  '1. Validated multi-tenant boundary invariants across SQLite and MySQL schemas.',
  '2. Verified durable checkpoint persistence, QC scoring, and versioned outputs.',
  '3. Documented operational runbook and automated verification checks.',
].join('\n');

const engineState = vi.hoisted(() => ({
  mode: 'healthy' as 'healthy' | 'fail_step_2' | 'qc_repair_once' | 'qc_always_fail' | 'timeout_all',
  executeCalls: [] as string[],
  repairCalls: 0,
  onStepHook: null as null | ((stepTitle: string) => Promise<void>),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: vi.fn(async () => ({
      userId: authState.userId,
      email: `${authState.userId}@test.local`,
      role: authState.role,
      companyId: authState.companyId,
    })),
    requireCompanyAuth: vi.fn(async () => ({
      userId: authState.userId,
      email: `${authState.userId}@test.local`,
      role: authState.role,
      companyId: authState.companyId ?? '',
    })),
  };
});

vi.mock('@/lib/orchestrator', () => ({
  getOrchestrator: () => ({
    routeTask: vi.fn(async (task: string) => ({
      selectedAgent: {
        agentId: 'AGENT-BEHAVIOUR-001',
        agentName: 'Behaviour Test Specialist',
        role: 'researcher',
        score: 0.95,
      },
      reasoning: 'matched deterministic test specialist',
      task,
    })),
  }),
}));

vi.mock('@/lib/agent-runtime', () => ({
  getExecutionEngine: () => ({
    execute: vi.fn(async (params: { task: string; agentId: string }) => {
      const stepTitle = /STEP: (.*)/.exec(params.task)?.[1]?.trim() ?? 'unknown';
      engineState.executeCalls.push(stepTitle);

      if (engineState.onStepHook) {
        await engineState.onStepHook(stepTitle);
      }

      if (engineState.mode === 'timeout_all') {
        throw new Error('Provider request timed out after 30000ms');
      }

      if (engineState.mode === 'fail_step_2' && stepTitle === 'Step Two Implementation') {
        return {
          id: `exec-fail-${Date.now()}`,
          status: 'failed',
          error: { code: 'PROVIDER_DOWN', message: 'Upstream model provider unavailable for Step Two' },
        };
      }

      if (
        (engineState.mode === 'qc_repair_once' || engineState.mode === 'qc_always_fail') &&
        stepTitle === 'Step One Research'
      ) {
        return {
          id: `exec-qc-${Date.now()}`,
          status: 'completed',
          result: { content: QC_FAILING_OUTPUT_FOR_GATE(), metadata: { model: 'worker-test-model' } },
          tokenUsage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
        };
      }

      return {
        id: `exec-ok-${Date.now()}`,
        status: 'completed',
        result: { content: `${VALID_STEP_OUTPUT}\n\nCompleted step: ${stepTitle}`, metadata: { model: 'worker-test-model' } },
        tokenUsage: { promptTokens: 40, completionTokens: 80, totalTokens: 120 },
      };
    }),
  }),
}));

function QC_FAILING_OUTPUT_FOR_GATE(): string {
  return QC_FAILING_TEXT;
}

vi.mock('@/lib/multi-tenant-ai/service', () => ({
  executeCompanyAIChat: vi.fn(async () => {
    engineState.repairCalls += 1;
    const content = engineState.mode === 'qc_always_fail'
      ? QC_FAILING_TEXT
      : `${VALID_STEP_OUTPUT}\n\nRepaired output verified against quality gate.`;
    return {
      response: { content, model: 'repair-test-model' },
      requestId: `req-repair-${engineState.repairCalls}`,
      provider: 'ollama',
      profile: 'free_general',
      estimatedCostUsd: 0,
      attempts: 1,
      fallbackUsed: false,
    };
  }),
}));

const TWO_STEP_PLAN = {
  strategy: 'llm' as const,
  reasoning: 'Deterministic two-step acceptance plan',
  steps: [
    {
      id: 'step-1',
      title: 'Step One Research',
      description: 'Gather verified domain requirements and architecture constraints.',
      skills: [],
      tools: [],
      dependsOn: [],
    },
    {
      id: 'step-2',
      title: 'Step Two Implementation',
      description: 'Produce concrete implementation specification and validation checklist.',
      skills: [],
      tools: [],
      dependsOn: ['step-1'],
    },
  ],
};

let handle: RealDb;

beforeAll(async () => {
  handle = await createRealDb('run-engine-behaviours');
  for (const [id, slug, userId] of [
    ['comp-alpha', 'comp-alpha', 'user-alpha'],
    ['comp-beta', 'comp-beta', 'user-beta'],
  ] as const) {
    await handle.db.company.upsert({
      where: { id },
      update: {},
      create: { id, name: slug, slug, status: 'active' },
    });
    await handle.db.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@test.local`,
        name: userId,
        passwordHash: 'x',
        role: 'admin',
      },
    });
    await handle.db.companyUser.upsert({
      where: { companyId_userId: { companyId: id, userId } },
      update: { role: 'admin' },
      create: { companyId: id, userId, role: 'admin' },
    });
  }
  await seedAgent(handle.db, 'AGENT-BEHAVIOUR-001', { companyId: 'comp-alpha' });
}, 90_000);

afterAll(async () => {
  await handle?.cleanup();
});

beforeEach(() => {
  engineState.mode = 'healthy';
  engineState.executeCalls = [];
  engineState.repairCalls = 0;
  engineState.onStepHook = null;
  authState.userId = 'user-alpha';
  authState.companyId = 'comp-alpha';
  authState.role = 'admin';
});

async function readStreamText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const dec = new TextDecoder();
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

describe('Run Engine 20 Runtime Behaviours (real SQLite)', () => {
  it('1-2. rejects untenanted/sentinel createRun and persists queued run + queue item for valid tenant', async () => {
    const { createRun, getRun, getRunEvents } = await import('@/lib/runs');
    const { db } = await import('@/lib/db');

    await expect(createRun({ objective: 'Untenanted', companyId: '' })).rejects.toThrow(/requires an authenticated company/);
    await expect(createRun({ objective: 'Sentinel', companyId: 'default-company' })).rejects.toThrow(/requires an authenticated company/);

    const created = await createRun({
      objective: 'Build multi-tenant audit report',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    expect(created.status).toBe('queued');

    const run = await getRun(created.runId);
    expect(run?.status).toBe('queued');
    expect(run?.companyId).toBe('comp-alpha');

    const events = await getRunEvents(created.runId);
    expect(events.map((e) => e.type)).toContain('run.queued');

    const qItem = await db.queueItem.findFirst({ where: { jobId: created.runId } });
    expect(qItem?.status).toBe('queued');
    expect(JSON.parse(qItem!.payload)).toMatchObject({ runId: created.runId, companyId: 'comp-alpha' });
  });

  it('3-4 & 15 & 19. executes multi-step plan end-to-end, stamps Task.companyId, ignores duplicate worker claims, and populates getRunDetail', async () => {
    const { createRun, executeRun, getRunDetail } = await import('@/lib/runs');
    const { db } = await import('@/lib/db');

    const { runId } = await createRun({
      objective: 'Design and implement billing reconciliation service',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });

    await executeRun(runId, { plan: TWO_STEP_PLAN });
    expect(engineState.executeCalls).toEqual(['Step One Research', 'Step Two Implementation']);

    // Behaviour 15: duplicate execution on terminal run is a safe no-op
    await executeRun(runId, { plan: TWO_STEP_PLAN });
    expect(engineState.executeCalls).toEqual(['Step One Research', 'Step Two Implementation']);

    const detail = await getRunDetail(runId);
    expect(detail?.run?.status).toBe('completed');
    expect(detail?.tasks).toHaveLength(2);
    expect(detail?.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(detail?.tasks.every((t) => t.qcPassed === true)).toBe(true);

    // Verify Task.companyId is stamped on DB rows
    const dbTasks = await db.task.findMany({ where: { runId } });
    expect(dbTasks).toHaveLength(2);
    expect(dbTasks.every((t) => t.companyId === 'comp-alpha')).toBe(true);
  });

  it('5-6. retries a failed run from checkpoint without re-executing completed step 1', async () => {
    const { createRun, executeRun, getRun } = await import('@/lib/runs');
    const { POST: retryPost } = await import('@/app/api/runs/[id]/route');

    engineState.mode = 'fail_step_2';
    const { runId } = await createRun({
      objective: 'Prepare compliance report and generate Terraform module',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });

    await executeRun(runId, { plan: TWO_STEP_PLAN });
    const failedRun = await getRun(runId);
    expect(failedRun?.status).toBe('failed');
    expect(failedRun?.error).toContain('Step Two');
    expect(engineState.executeCalls.filter((s) => s === 'Step One Research')).toHaveLength(1);
    expect(engineState.executeCalls.filter((s) => s === 'Step Two Implementation')).toHaveLength(1);

    // Switch provider back to healthy and retry via POST /api/runs/:id
    engineState.mode = 'healthy';
    const res = await retryPost(
      new NextRequest(`http://localhost/api/runs/${runId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'retry' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(res.status).toBe(202);

    await executeRun(runId);
    const recovered = await getRun(runId);
    expect(recovered?.status).toBe('completed');
    // Step 1 was already completed in checkpoint and MUST NOT have run again!
    expect(engineState.executeCalls.filter((s) => s === 'Step One Research')).toHaveLength(1);
    expect(engineState.executeCalls.filter((s) => s === 'Step Two Implementation')).toHaveLength(2);
  });

  it('7-9 & 20. cancels queued or mid-flight runs, rejects terminal re-cancel, and blocks cross-tenant cancel/retry', async () => {
    const { createRun, cancelRun, retryRun, executeRun, getRun } = await import('@/lib/runs');
    const { DELETE: deleteRoute, POST: postRoute } = await import('@/app/api/runs/[id]/route');
    const { db } = await import('@/lib/db');

    const { runId: qRunId } = await createRun({
      objective: 'Queued run to cancel',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });

    // Cross-tenant cancel via HTTP -> 403 & library -> throws
    authState.companyId = 'comp-beta';
    authState.userId = 'user-beta';
    const crossDel = await deleteRoute(
      new NextRequest(`http://localhost/api/runs/${qRunId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: qRunId }) },
    );
    expect(crossDel.status).toBe(403);
    await expect(cancelRun(qRunId, 'comp-beta')).rejects.toThrow(/tenant mismatch/);

    // Owner cancels -> 200 and QueueItem becomes cancelled
    authState.companyId = 'comp-alpha';
    authState.userId = 'user-alpha';
    const ownDel = await deleteRoute(
      new NextRequest(`http://localhost/api/runs/${qRunId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: qRunId }) },
    );
    expect(ownDel.status).toBe(200);
    const qItem = await db.queueItem.findFirst({ where: { jobId: qRunId } });
    expect(qItem?.status).toBe('cancelled');

    // Duplicate cancel on terminal run -> 409
    const dupDel = await deleteRoute(
      new NextRequest(`http://localhost/api/runs/${qRunId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: qRunId }) },
    );
    expect(dupDel.status).toBe(409);

    // Cross-tenant retry on cancelled run -> 403 / throws
    authState.companyId = 'comp-beta';
    const crossRetry = await postRoute(
      new NextRequest(`http://localhost/api/runs/${qRunId}`, { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: qRunId }) },
    );
    expect(crossRetry.status).toBe(403);
    await expect(retryRun(qRunId, 'comp-beta')).rejects.toThrow(/tenant mismatch/);

    // Behaviour 8: Mid-flight cancellation between step 1 and step 2
    authState.companyId = 'comp-alpha';
    const { runId: midRunId } = await createRun({
      objective: 'Mid-flight cancel verification',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    engineState.onStepHook = async (stepTitle) => {
      if (stepTitle === 'Step One Research') {
        await cancelRun(midRunId, 'comp-alpha');
      }
    };
    await executeRun(midRunId, { plan: TWO_STEP_PLAN });
    const midRun = await getRun(midRunId);
    expect(midRun?.status).toBe('cancelled');
    expect(engineState.executeCalls.filter((s) => s === 'Step Two Implementation')).toHaveLength(0);
  });

  it('10-11. handles provider timeout gracefully and repairs QC failure with versioned Output rows', async () => {
    const { createRun, executeRun, getRun, getRunEvents } = await import('@/lib/runs');
    const { db } = await import('@/lib/db');

    // Behaviour 10: timeout -> failed with diagnostic error
    engineState.mode = 'timeout_all';
    const { runId: timeoutRunId } = await createRun({
      objective: 'Timeout behaviour test',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    await executeRun(timeoutRunId, { plan: TWO_STEP_PLAN });
    const timedRun = await getRun(timeoutRunId);
    expect(timedRun?.status).toBe('failed');
    expect(timedRun?.error).toContain('timed out');

    // Behaviour 11: QC failure on first pass triggers repair loop and Output version 2
    engineState.mode = 'qc_repair_once';
    const { runId: qcRunId } = await createRun({
      objective: 'QC repair loop test',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    await executeRun(qcRunId, { plan: TWO_STEP_PLAN });
    const qcRun = await getRun(qcRunId);
    expect(qcRun?.status).toBe('completed');
    const events = await getRunEvents(qcRunId);
    expect(events.some((e) => e.type === 'qc.failed')).toBe(true);
    expect(events.some((e) => e.type === 'repair.started')).toBe(true);
    expect(events.some((e) => e.type === 'qc.passed')).toBe(true);

    const step1Task = await db.task.findFirst({ where: { runId: qcRunId, title: 'Step One Research' } });
    const versions = await db.outputVersion.findMany({ where: { taskId: step1Task!.id }, orderBy: { version: 'asc' } });
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0].reason).toBe('initial');
    expect(versions[versions.length - 1].reason).toBe('repair');
    expect(versions[versions.length - 1].version).toBeGreaterThanOrEqual(2);
  });

  it('12-14. escalates exhausted QC to waiting_approval and handles approve, reject, and expiry transitions', async () => {
    const { createRun, executeRun, getRun, getRunEvents, resolveRunApproval, expireStaleApprovals } = await import('@/lib/runs');
    const { db } = await import('@/lib/db');

    // 12. Approve -> resumes and completes remaining step
    engineState.mode = 'qc_always_fail';
    const { runId: approveRunId } = await createRun({
      objective: 'Escalation approve flow',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    await executeRun(approveRunId, { plan: TWO_STEP_PLAN });
    expect((await getRun(approveRunId))?.status).toBe('waiting_approval');

    const pendingApprove = await db.approval.findFirst({
      where: { companyId: 'comp-alpha', status: 'pending', requestJson: { contains: approveRunId } },
    });
    expect(pendingApprove).toBeTruthy();

    await db.approval.update({
      where: { id: pendingApprove!.id },
      data: { status: 'approved', reviewedBy: 'user-alpha', reviewedAt: new Date(), responseNote: 'Accepted with reviewer override' },
    });
    const resolvedApprove = await resolveRunApproval({
      approvalId: pendingApprove!.id,
      approved: true,
      reviewerId: 'user-alpha',
      reviewerCompanyId: 'comp-alpha',
      note: 'Accepted with reviewer override',
    });
    expect(resolvedApprove.resumed).toBe(true);
    expect(resolvedApprove.status).toBe('queued');

    engineState.mode = 'healthy';
    await executeRun(approveRunId);
    expect((await getRun(approveRunId))?.status).toBe('completed');

    // 13. Reject -> failed with reviewer note
    engineState.mode = 'qc_always_fail';
    const { runId: rejectRunId } = await createRun({
      objective: 'Escalation reject flow',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    await executeRun(rejectRunId, { plan: TWO_STEP_PLAN });
    const pendingReject = await db.approval.findFirst({
      where: { companyId: 'comp-alpha', status: 'pending', requestJson: { contains: rejectRunId } },
    });
    await db.approval.update({
      where: { id: pendingReject!.id },
      data: { status: 'rejected', reviewedBy: 'user-alpha', reviewedAt: new Date(), responseNote: 'Output inaccurate' },
    });
    const resolvedReject = await resolveRunApproval({
      approvalId: pendingReject!.id,
      approved: false,
      reviewerId: 'user-alpha',
      reviewerCompanyId: 'comp-alpha',
      note: 'Output inaccurate',
    });
    expect(resolvedReject.resumed).toBe(false);
    const rejectedRun = await getRun(rejectRunId);
    expect(rejectedRun?.status).toBe('failed');
    expect(rejectedRun?.error).toContain('Output inaccurate');

    // 14. Expiry -> expireStaleApprovals fails run and emits approval.expired
    const { runId: expireRunId } = await createRun({
      objective: 'Escalation expiry flow',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    await executeRun(expireRunId, { plan: TWO_STEP_PLAN });
    const pendingExpire = await db.approval.findFirst({
      where: { companyId: 'comp-alpha', status: 'pending', requestJson: { contains: expireRunId } },
    });
    await db.approval.update({
      where: { id: pendingExpire!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredCount = await expireStaleApprovals(new Date());
    expect(expiredCount).toBeGreaterThanOrEqual(1);
    const expiredRun = await getRun(expireRunId);
    expect(expiredRun?.status).toBe('failed');
    expect(expiredRun?.error).toContain('expired');
    const expireEvents = await getRunEvents(expireRunId);
    expect(expireEvents.some((e) => e.type === 'approval.expired')).toBe(true);
  });

  it('16-18. streams SSE replay with id frames, honours Last-Event-ID without duplicates, and enforces tenant boundary', async () => {
    const { createRun, executeRun } = await import('@/lib/runs');
    const { GET: eventsGet } = await import('@/app/api/runs/[id]/events/route');

    const { runId } = await createRun({
      objective: 'Verify SSE replay and Last-Event-ID resume',
      companyId: 'comp-alpha',
      userId: 'user-alpha',
    });
    await executeRun(runId, { plan: TWO_STEP_PLAN });

    // 18. Cross-tenant caller receives 403
    authState.companyId = 'comp-beta';
    authState.userId = 'user-beta';
    const forbidden = await eventsGet(
      new NextRequest(`http://localhost/api/runs/${runId}/events`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(forbidden.status).toBe(403);

    // 16. Same-tenant caller receives full event history + stream.closed
    authState.companyId = 'comp-alpha';
    authState.userId = 'user-alpha';
    const fullRes = await eventsGet(
      new NextRequest(`http://localhost/api/runs/${runId}/events`),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(fullRes.status).toBe(200);
    const fullBody = await readStreamText(fullRes);
    const fullIdMatches = [...fullBody.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(fullIdMatches.length).toBeGreaterThanOrEqual(5);
    expect(fullIdMatches[0]).toBe(1);
    expect(fullBody).toContain('"type":"stream.closed"');

    // 17. Reconnect with Last-Event-ID skips already-delivered events
    const cutPoint = fullIdMatches[2];
    const resumedRes = await eventsGet(
      new NextRequest(`http://localhost/api/runs/${runId}/events`, {
        headers: { 'last-event-id': String(cutPoint) },
      }),
      { params: Promise.resolve({ id: runId }) },
    );
    expect(resumedRes.status).toBe(200);
    const resumedBody = await readStreamText(resumedRes);
    const resumedIds = [...resumedBody.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(resumedIds.every((seq) => seq > cutPoint)).toBe(true);
    expect(resumedIds[0]).toBe(cutPoint + 1);
    expect(resumedBody).toContain('"type":"stream.closed"');
  });
});
