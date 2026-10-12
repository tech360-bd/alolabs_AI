/**
 * ALO LABS AgentOS — RUN SERVICE (Master Orchestrator pipeline)
 *
 * This is the "ONE COMMAND" execution path:
 *
 *   USER COMMAND
 *     → createRun (durable AgentOSRun record + queue job)
 *     → PLAN        (LLM planner, heuristic fallback)
 *     → DECOMPOSE   (plan steps → Task + TaskStep records)
 *     → ROUTE       (orchestrator selects the best agent per step)
 *     → EXECUTE     (Agent Execution Engine → Model Router → provider)
 *     → QC GATE     (QualityAssessment; fail → repair → retry)
 *     → ESCALATE    (retries exhausted → human Approval)
 *     → ASSEMBLE    (run report Artifact, versioned, checksummed)
 *     → MEMORY      (episodic write-back)
 *     → EVENTS      (RunEvent rows + event bus, for real-time UI)
 *
 * Runs are durable AND resumable: they live in the DB and are executed by
 * the queue worker. After every step the run persists a checkpoint
 * (AgentOSRun.checkpoint) so a worker crash/restart re-queues the job and
 * execution continues from the last completed step instead of repeating
 * work. A run paused for human review (waiting_approval) is resumed through
 * resolveRunApproval(), which re-enqueues it once the reviewer decides.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getEventBus } from '@/lib/event-bus';
import { getOrchestrator } from '@/lib/orchestrator';
import { getExecutionEngine } from '@/lib/agent-runtime';
import { getMemoryStore } from '@/lib/memory';
import { enqueue } from '@/lib/job-queue';
import { planObjective, type PlanResult, type PlanStep } from './planner';
import {
  runQualityGate,
  repairOutput,
  requestHumanReview,
  isConfigurationError,
  configurationRequiredMessage,
  MAX_REPAIR_ATTEMPTS,
} from '@/lib/qc';
import { buildRunReportArtifact, type ArtifactRecord } from '@/lib/artifacts';
import { recordOutputVersion, attachQcResult } from '@/lib/qc/output-versions';

export const RUN_QUEUE = 'agentos';
export const RUN_JOB_TYPE = 'agentos.run';

export type RunStatus =
  | 'queued' | 'planning' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';

const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

// ─── Events ──────────────────────────────────────────────────────────────────

export type RunEventType =
  | 'run.queued' | 'run.started' | 'plan.created' | 'task.queued' | 'task.started'
  | 'task.completed' | 'task.failed' | 'task.skipped' | 'agent.selected' | 'model.selected'
  | 'tool.started' | 'tool.completed' | 'qc.passed' | 'qc.failed' | 'repair.started'
  | 'approval.requested' | 'approval.approved' | 'approval.rejected' | 'approval.expired'
  | 'artifact.created' | 'run.completed' | 'run.failed' | 'run.cancelled' | 'run.resumed' | 'run.paused';

export interface RunEventRecord {
  id: string;
  runId: string;
  type: string;
  source: string;
  agentId: string | null;
  taskId: string | null;
  data: string;
  createdAt: Date;
}

/** Persist a run event AND publish it on the event bus (for SSE/UI). */
export async function recordRunEvent(params: {
  runId: string;
  type: RunEventType | string;
  source?: string;
  agentId?: string;
  taskId?: string;
  data?: Record<string, unknown>;
}): Promise<RunEventRecord> {
  const event = await db.runEvent.create({
    data: {
      id: randomUUID(),
      runId: params.runId,
      type: params.type,
      source: params.source ?? 'orchestrator',
      data: JSON.stringify(params.data ?? {}),
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.taskId ? { taskId: params.taskId } : {}),
    },
  });

  // Fan out to the in-process bus for real-time subscribers (best-effort).
  try {
    const run = await db.agentOSRun.findUnique({ where: { id: params.runId }, select: { companyId: true, userId: true } });
    getEventBus().publish({
      id: randomUUID(),
      type: `agentos.${params.type}`,
      source: params.source ?? 'orchestrator',
      companyId: run?.companyId ?? 'default-company',
      ...(run?.userId ? { userId: run.userId } : {}),
      data: { ...(params.data ?? {}), runId: params.runId },
      priority: params.type === 'run.failed' || params.type === 'qc.failed' ? 'high' : 'normal',
      timestamp: new Date(),
      correlationId: params.runId,
    }).catch(() => {});
  } catch { /* event fan-out must never break the pipeline */ }

  return event as RunEventRecord;
}

// ─── Run CRUD ────────────────────────────────────────────────────────────────

export interface CreateRunInput {
  objective: string;
  userId?: string;
  companyId?: string;
  projectId?: string;
  commandId?: string;
  workflowId?: string;
  priority?: string;
  /** Skip queueing (execute inline) — used by tests and sync callers. */
  executeInline?: boolean;
}

export async function createRun(input: CreateRunInput): Promise<{ runId: string; status: RunStatus }> {
  const run = await db.agentOSRun.create({
    data: {
      id: randomUUID(),
      objective: input.objective,
      status: 'queued',
      plan: '[]',
      ...(input.commandId ? { commandId: input.commandId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
  });

  await recordRunEvent({
    runId: run.id,
    type: 'run.queued',
    source: 'orchestrator',
    data: { objective: input.objective.slice(0, 500) },
  });

  if (input.executeInline) {
    // Fire-and-forget inline execution (still fully durable via run record).
    void executeRun(run.id).catch(() => { /* run record holds the failure */ });
    return { runId: run.id, status: 'queued' };
  }

  try {
    await enqueue(RUN_QUEUE, RUN_JOB_TYPE, { runId: run.id }, { priority: 10, maxRetries: 2, idempotencyKey: `run:${run.id}`, jobId: run.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.agentOSRun.update({ where: { id: run.id }, data: { status: 'failed', error: `Queue unavailable: ${message}`, completedAt: new Date() } });
    await recordRunEvent({ runId: run.id, type: 'run.failed', source: 'queue', data: { error: 'Unable to enqueue durable run' } });
    throw error;
  }
  return { runId: run.id, status: 'queued' };
}

export async function getRun(runId: string) {
  return db.agentOSRun.findUnique({ where: { id: runId } });
}

export async function listRuns(filter: {
  companyId?: string;
  userId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const where: Record<string, unknown> = {};
  if (filter.companyId) where.companyId = filter.companyId;
  if (filter.userId) where.userId = filter.userId;
  if (filter.projectId) where.projectId = filter.projectId;
  if (filter.status) where.status = filter.status;

  const [runs, total] = await Promise.all([
    db.agentOSRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      skip: filter.offset ?? 0,
    }),
    db.agentOSRun.count({ where }),
  ]);
  return { runs, total };
}

export async function getRunEvents(runId: string, limit = 200): Promise<RunEventRecord[]> {
  const events = await db.runEvent.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 1000),
  });
  return events as RunEventRecord[];
}

export async function cancelRun(runId: string): Promise<boolean> {
  const run = await db.agentOSRun.findUnique({ where: { id: runId } });
  if (!run) return false;
  if (TERMINAL_STATUSES.includes(run.status as RunStatus)) return false;
  await db.agentOSRun.update({
    where: { id: runId },
    data: { status: 'cancelled', completedAt: new Date(), error: 'Cancelled by user' },
  });
  await recordRunEvent({ runId, type: 'run.cancelled', source: 'orchestrator', data: {} });
  return true;
}

// ─── Run detail (aggregated view for the Command Center) ─────────────────────

export interface RunDetail {
  run: Awaited<ReturnType<typeof getRun>>;
  events: RunEventRecord[];
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    agentId: string | null;
    agentName?: string;
    model?: string;
    tokens?: number;
    output?: string | null;
    error?: string | null;
    qcScore?: number;
    qcPassed?: boolean;
    startedAt: Date | null;
    completedAt: Date | null;
  }>;
  artifacts: ArtifactRecord[];
  approvals: Array<{ id: string; title: string; status: string; riskLevel: string; createdAt: Date }>;
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const run = await db.agentOSRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  const [events, tasks, artifacts, agentRuns] = await Promise.all([
    getRunEvents(runId, 500),
    db.task.findMany({
      where: { workflowId: run.workflowId ?? undefined, userId: run.userId ?? undefined },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.artifact.findMany({ where: { runId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.agentRun.findMany({
      where: { companyId: run.companyId ?? undefined, userId: run.userId ?? undefined },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  // Tasks belonging to this run are those created during the run window with
  // matching user; tag them via RunEvent task.* events for precision.
  const taskIdsFromEvents = new Set(
    events.filter((e) => e.taskId && e.type.startsWith('task.')).map((e) => e.taskId as string),
  );
  const runTasks = tasks.filter((t) => taskIdsFromEvents.has(t.id));

  const runTaskIds = new Set(runTasks.map((t) => t.id));
  const relatedAgentRuns = agentRuns.filter((r) => r.taskId && runTaskIds.has(r.taskId));

  const approvals = await db.approval.findMany({
    where: {
      ...(run.companyId ? { companyId: run.companyId } : {}),
      status: 'pending',
      createdAt: { gte: run.createdAt },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Approval rows are only loosely indexed by company/time; verify the
  // persisted requestJson.runId so one project cannot see another run's
  // pending approval merely because they share a tenant.
  const runApprovals = approvals.filter((approval) => {
    try {
      return (JSON.parse(approval.requestJson) as { runId?: string }).runId === runId;
    } catch {
      return false;
    }
  });

  const taskDetails = runTasks.map((task) => {
    const related = relatedAgentRuns.filter((r) => r.taskId === task.id);
    const lastRun = related[0];
    const qcEvents = events.filter((e) => e.taskId === task.id && (e.type === 'qc.passed' || e.type === 'qc.failed'));
    const lastQc = qcEvents[qcEvents.length - 1];
    let qcPassed: boolean | undefined;
    let qcScore: number | undefined;
    if (lastQc) {
      try {
        const data = JSON.parse(lastQc.data) as { passed?: boolean; score?: number };
        qcPassed = data.passed;
        qcScore = data.score;
      } catch { /* ignore malformed event data */ }
    }
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      agentId: task.agentId,
      agentName: lastRun?.agentName ?? undefined,
      model: lastRun?.model ?? undefined,
      tokens: related.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0) || undefined,
      output: lastRun?.output ?? null,
      error: lastRun?.error ?? lastRun?.errorMessage ?? null,
      qcScore,
      qcPassed,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  });

  return {
    run,
    events,
    tasks: taskDetails,
    artifacts: artifacts as ArtifactRecord[],
    approvals: runApprovals.map((a) => ({
      id: a.id, title: a.title, status: a.status, riskLevel: a.riskLevel, createdAt: a.createdAt,
    })),
  };
}

// ─── The Master Orchestrator pipeline ────────────────────────────────────────

interface StepExecutionOutcome {
  step: PlanStep;
  status: 'completed' | 'failed' | 'skipped';
  taskDbId?: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  tokens: number;
  output?: string;
  error?: string;
  qcScore?: number;
  qcPassed?: boolean;
  repairAttempts: number;
  /** Set when a human approved the output after QC escalation. */
  approvedBy?: string;
  /** Approval that paused the run on this step (if any). */
  approvalId?: string;
}

/** Persisted per-step state (AgentOSRun.checkpoint). Outputs are capped. */
interface RunCheckpoint {
  version: 1;
  steps: Record<string, Omit<StepExecutionOutcome, 'step'> & { stepId: string }>;
  updatedAt: string;
}

const CHECKPOINT_OUTPUT_CHARS = 8000;

function parseCheckpoint(raw: string | null | undefined): RunCheckpoint {
  try {
    const parsed = JSON.parse(raw || '{}') as Partial<RunCheckpoint>;
    if (parsed && parsed.version === 1 && parsed.steps && typeof parsed.steps === 'object') {
      return { version: 1, steps: parsed.steps, updatedAt: parsed.updatedAt ?? new Date().toISOString() };
    }
  } catch { /* fall through */ }
  return { version: 1, steps: {}, updatedAt: new Date().toISOString() };
}

async function saveCheckpoint(runId: string, outcomes: StepExecutionOutcome[]): Promise<void> {
  const checkpoint: RunCheckpoint = { version: 1, steps: {}, updatedAt: new Date().toISOString() };
  for (const o of outcomes) {
    const { step, ...rest } = o;
    checkpoint.steps[step.id] = {
      ...rest,
      stepId: step.id,
      output: rest.output !== undefined ? rest.output.slice(0, CHECKPOINT_OUTPUT_CHARS) : undefined,
    };
  }
  await db.agentOSRun.update({ where: { id: runId }, data: { checkpoint: JSON.stringify(checkpoint) } });
}

/** Approvals raised by this run (requestJson carries the runId). */
async function findRunApprovals(runId: string) {
  return db.approval.findMany({
    where: { requestJson: { contains: `"runId":"${runId}"` } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Called by the approval APIs after a reviewer decides. Resumes the paused
 * run (approved → re-queued, the reviewed step counts as completed) or
 * fails it (rejected). Idempotent per approval.
 */
export async function resolveRunApproval(params: {
  approvalId: string;
  approved: boolean;
  reviewerId?: string;
  note?: string;
}): Promise<{ runId: string | null; resumed: boolean; status?: RunStatus }> {
  const approval = await db.approval.findUnique({ where: { id: params.approvalId } });
  if (!approval) return { runId: null, resumed: false };
  let runId: string | null = null;
  try {
    const requestJson = JSON.parse(approval.requestJson || '{}') as { runId?: string };
    runId = typeof requestJson.runId === 'string' ? requestJson.runId : null;
  } catch { /* no run link */ }
  if (!runId) return { runId: null, resumed: false };

  const run = await db.agentOSRun.findUnique({ where: { id: runId }, select: { id: true, status: true } });
  if (!run) return { runId, resumed: false };
  if (TERMINAL_STATUSES.includes(run.status as RunStatus)) return { runId, resumed: false, status: run.status as RunStatus };

  await recordRunEvent({
    runId,
    type: params.approved ? 'approval.approved' : 'approval.rejected',
    source: 'approval',
    data: { approvalId: approval.id, approved: params.approved, reviewerId: params.reviewerId ?? null, note: params.note ?? null },
  });

  if (!params.approved) {
    await db.agentOSRun.update({
      where: { id: runId },
      data: { status: 'failed', error: `Human review rejected: ${params.note ?? 'no note'}`, completedAt: new Date(), summary: 'Run stopped: reviewer rejected the escalated output.' },
    });
    await recordRunEvent({ runId, type: 'run.failed', source: 'approval', data: { approvalId: approval.id, reason: 'rejected' } });
    return { runId, resumed: false, status: 'failed' };
  }

  // Approved: hand the run back to the durable worker. The worker treats the
  // approved step as completed (see executeRun) and continues with the rest.
  await db.agentOSRun.update({ where: { id: runId }, data: { status: 'queued', error: null } });
  // Any older queued job for this run is superseded; one run, one active job.
  const resumeKey = `run:${runId}:resume:${approval.id}`;
  await db.queueItem.updateMany({
    where: { jobId: runId, status: 'queued', NOT: { idempotencyKey: resumeKey } },
    data: { status: 'cancelled', error: `superseded by resume job for approval ${approval.id}`, completedAt: new Date() },
  }).catch(() => undefined);
  await enqueue(RUN_QUEUE, RUN_JOB_TYPE, { runId, resumeFromApprovalId: approval.id }, {
    priority: 10,
    maxRetries: 2,
    idempotencyKey: resumeKey,
    jobId: runId,
  });
  await recordRunEvent({ runId, type: 'run.queued', source: 'approval', data: { approvalId: approval.id, resume: true } });
  return { runId, resumed: true, status: 'queued' };
}

/**
 * Expire pending approvals past their deadline and fail the runs waiting on
 * them. Returns the number of approvals expired. Safe to call periodically.
 */
export async function expireStaleApprovals(now: Date = new Date()): Promise<number> {
  const stale = await db.approval.findMany({
    where: { status: 'pending', expiresAt: { lt: now } },
    select: { id: true, requestJson: true },
  });
  let expired = 0;
  for (const approval of stale) {
    const res = await db.approval.updateMany({
      where: { id: approval.id, status: 'pending' },
      data: { status: 'expired', reviewedAt: now, responseNote: 'Expired: no decision before the deadline' },
    });
    if (res.count === 0) continue;
    expired += 1;
    let runId: string | null = null;
    try { runId = (JSON.parse(approval.requestJson || '{}') as { runId?: string }).runId ?? null; } catch { /* none */ }
    if (runId) {
      const run = await db.agentOSRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (run && !TERMINAL_STATUSES.includes(run.status as RunStatus)) {
        await db.agentOSRun.update({
          where: { id: runId },
          data: { status: 'failed', error: 'Human review expired before a decision was made', completedAt: now },
        });
        await recordRunEvent({ runId, type: 'approval.expired', source: 'approval', data: { approvalId: approval.id } });
        await recordRunEvent({ runId, type: 'run.failed', source: 'approval', data: { approvalId: approval.id, reason: 'approval expired' } });
      }
    }
  }
  return expired;
}

/**
 * Execute a run end-to-end. Called by the queue worker (durable) or inline.
 * Never throws for task-level failures — they are recorded on the run.
 *
 * `options.plan` lets callers (e.g. the workflow engine) supply a pre-built
 * plan instead of LLM/heuristic planning.
 */
export async function executeRun(runId: string, options?: { plan?: PlanResult }): Promise<void> {
  const run = await db.agentOSRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run ${runId} not found`);
  if (TERMINAL_STATUSES.includes(run.status as RunStatus)) return;

  const companyId = run.companyId ?? 'default-company';
  const userId = run.userId ?? 'anonymous';
  const outcomes: StepExecutionOutcome[] = [];

  // ── Resume bookkeeping ──
  // attempts counts worker (re)starts; a checkpoint lets us skip finished steps.
  const attempt = (run.attempts ?? 0) + 1;
  await db.agentOSRun.update({ where: { id: runId }, data: { attempts: attempt } });
  const checkpoint = parseCheckpoint(run.checkpoint);
  const resumedStepIds = new Set(Object.keys(checkpoint.steps));

  // A run paused for human review only proceeds once the reviewer decided.
  let approvedStepId: string | null = null;
  let approvedBy: string | undefined;
  if (run.status === 'waiting_approval' || resumedStepIds.size > 0) {
    const approvals = await findRunApprovals(runId);
    const pending = approvals.find((a) => a.status === 'pending');
    if (run.status === 'waiting_approval' && pending) {
      // Still waiting — nothing to do. The approval API re-queues the run.
      return;
    }
    const rejected = approvals.find((a) => a.status === 'rejected' || a.status === 'expired');
    if (run.status === 'waiting_approval' && rejected && !approvals.some((a) => a.status === 'approved' && a.createdAt > rejected.createdAt)) {
      await db.agentOSRun.update({
        where: { id: runId },
        data: { status: 'failed', error: `Human review ${rejected.status}`, completedAt: new Date() },
      });
      return;
    }
    const approved = approvals.find((a) => a.status === 'approved');
    if (approved) {
      try {
        const req = JSON.parse(approved.requestJson || '{}') as { stepId?: string };
        approvedStepId = typeof req.stepId === 'string' ? req.stepId : null;
      } catch { /* no step link */ }
      approvedBy = approved.reviewedBy ?? 'reviewer';
    }
  }
  if (attempt > 1) {
    await recordRunEvent({
      runId,
      type: 'run.resumed',
      source: 'orchestrator',
      data: { attempt, checkpointedSteps: resumedStepIds.size, previousStatus: run.status, approvedStepId },
    });
  }

  const finish = async (status: RunStatus, summary: string, error?: string) => {
    await db.agentOSRun.update({
      where: { id: runId },
      data: {
        status,
        summary,
        ...(error ? { error } : {}),
        ...(TERMINAL_STATUSES.includes(status) ? { completedAt: new Date() } : {}),
      },
    });
    await recordRunEvent({
      runId,
      type: status === 'completed' ? 'run.completed' : status === 'failed' ? 'run.failed' : 'run.cancelled',
      source: 'orchestrator',
      data: { summary: summary.slice(0, 1000), ...(error ? { error } : {}) },
    });

    // Link back to the originating command, if any.
    if (run.commandId) {
      await db.command.update({
        where: { id: run.commandId },
        data: {
          status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'blocked',
          result: summary.slice(0, 4000),
          ...(TERMINAL_STATUSES.includes(status) ? { completedAt: new Date() } : {}),
        },
      }).catch(() => {});
      await db.task.updateMany({
        where: { commandId: run.commandId, status: { in: ['pending', 'in_progress'] } },
        data: { status: status === 'completed' ? 'completed' : 'failed' },
      }).catch(() => {});
    }

    // Episodic memory write-back (best-effort).
    try {
      const memory = getMemoryStore();
      await memory.addEpisodic({
        agentId: 'master-orchestrator',
        companyId,
        userId,
        content: `Run ${runId} (${status}): ${run.objective.slice(0, 200)} — ${summary.slice(0, 300)}`,
        metadata: { runId, status, steps: outcomes.length },
      });
    } catch { /* memory is best-effort */ }
  };

  try {
    // ── 1. PLAN ── (a resumed run reuses its persisted plan; never re-plans)
    let plan: PlanResult | null = null;
    if (attempt > 1) {
      try {
        const persisted = JSON.parse(run.plan || '{}') as Partial<PlanResult>;
        if (Array.isArray(persisted.steps) && persisted.steps.length > 0) {
          plan = { steps: persisted.steps, strategy: persisted.strategy ?? 'heuristic', reasoning: persisted.reasoning ?? 'resumed' };
        }
      } catch { /* plan below */ }
    }
    if (!plan) {
      await db.agentOSRun.update({ where: { id: runId }, data: { status: 'planning' } });
      plan = options?.plan ?? await planObjective(run.objective, companyId, { runId });
      await db.agentOSRun.update({ where: { id: runId }, data: { plan: JSON.stringify(plan) } });
      await recordRunEvent({
        runId,
        type: 'plan.created',
        source: 'planner',
        data: { strategy: plan.strategy, reasoning: plan.reasoning, stepCount: plan.steps.length, plan: plan.steps },
      });
    }

    // ── 2. RUN ──
    await db.agentOSRun.update({
      where: { id: runId },
      data: { status: 'running', ...(run.startedAt ? {} : { startedAt: new Date() }) },
    });
    await recordRunEvent({ runId, type: 'run.started', source: 'orchestrator', data: { stepCount: plan.steps.length, attempt } });

    const orchestrator = getOrchestrator();
    const engine = getExecutionEngine();
    const stepResults = new Map<string, StepExecutionOutcome>();

    // Restore checkpointed steps (in plan order) so they are not executed twice.
    for (const step of plan.steps) {
      const saved = checkpoint.steps[step.id];
      if (!saved) continue;
      const { stepId: _stepId, ...rest } = saved;
      const restored: StepExecutionOutcome = { ...rest, step };
      // The step that paused the run for review is now approved by a human.
      if (approvedStepId === step.id && restored.status !== 'completed') {
        restored.status = 'completed';
        restored.error = undefined;
        restored.qcPassed = true;
        restored.approvedBy = approvedBy;
        if (restored.taskDbId) {
          await db.task.update({ where: { id: restored.taskDbId }, data: { status: 'completed', completedAt: new Date() } }).catch(() => {});
          await db.taskStep.updateMany({ where: { taskId: restored.taskDbId }, data: { status: 'completed', completedAt: new Date() } }).catch(() => {});
        }
        await recordRunEvent({
          runId, type: 'task.completed', source: 'approval', taskId: restored.taskDbId, agentId: restored.agentId,
          data: { stepId: step.id, title: step.title, approvedBy, note: 'Output accepted by human reviewer after QC escalation' },
        });
      }
      outcomes.push(restored);
      stepResults.set(step.id, restored);
    }

    for (const step of plan.steps) {
      if (stepResults.has(step.id)) continue; // restored from checkpoint

      // Check cancellation
      const current = await db.agentOSRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (current?.status === 'cancelled') {
        await finish('cancelled', 'Run cancelled by user.');
        return;
      }

      // Dependency check
      const depsFailed = step.dependsOn.some((depId) => {
        const dep = stepResults.get(depId);
        return !dep || dep.status !== 'completed';
      });
      if (depsFailed) {
        const skipped: StepExecutionOutcome = { step, status: 'skipped', tokens: 0, repairAttempts: 0, error: 'Skipped: dependencies did not complete' };
        outcomes.push(skipped);
        stepResults.set(step.id, skipped);
        await saveCheckpoint(runId, outcomes);
        await recordRunEvent({ runId, type: 'task.skipped', source: 'orchestrator', data: { stepId: step.id, title: step.title } });
        continue;
      }

      // ── 3. ROUTE (select agent) ──
      let selectedAgent: { agentId: string; agentName: string; dbId: string; role: string } | null = null;
      try {
        const routing = await orchestrator.routeTask(
          `${step.title}. ${step.description}${step.agentHint ? ` (needs a ${step.agentHint} specialist)` : ''}`,
          companyId,
        );
        const agentRecord = await db.agent.findUnique({ where: { agentId: routing.selectedAgent.agentId }, select: { id: true } });
        if (agentRecord) {
          selectedAgent = {
            agentId: routing.selectedAgent.agentId,
            agentName: routing.selectedAgent.agentName,
            dbId: agentRecord.id,
            role: routing.selectedAgent.role,
          };
        }
        await recordRunEvent({
          runId,
          type: 'agent.selected',
          source: 'orchestrator',
          agentId: selectedAgent?.agentId,
          data: {
            stepId: step.id,
            agentId: selectedAgent?.agentId,
            agentName: selectedAgent?.agentName,
            score: routing.selectedAgent.score,
            reasoning: routing.reasoning,
          },
        });
      } catch (error) {
        const failed: StepExecutionOutcome = {
          step, status: 'failed', tokens: 0, repairAttempts: 0,
          error: `Agent routing failed: ${error instanceof Error ? error.message : String(error)}`,
        };
        outcomes.push(failed);
        stepResults.set(step.id, failed);
        await saveCheckpoint(runId, outcomes);
        await recordRunEvent({ runId, type: 'task.failed', source: 'orchestrator', data: { stepId: step.id, title: step.title, error: 'Agent routing failed' } });
        continue;
      }

      if (!selectedAgent) {
        const failed: StepExecutionOutcome = {
          step, status: 'failed', tokens: 0, repairAttempts: 0, agentId: undefined,
          error: 'No active agent is available to this company for this step.',
        };
        outcomes.push(failed);
        stepResults.set(step.id, failed);
        await saveCheckpoint(runId, outcomes);
        await recordRunEvent({ runId, type: 'task.failed', source: 'orchestrator', data: { stepId: step.id, title: step.title, error: 'No available agent' } });
        continue;
      }

      // ── 4. DECOMPOSE (persist task + step) ──
      const previousOutputs = outcomes
        .filter((o) => o.status === 'completed' && o.output)
        .slice(-3)
        .map((o) => `--- ${o.step.title} ---\n${(o.output ?? '').slice(0, 1500)}`)
        .join('\n\n');

      const stepInput = [
        `OBJECTIVE: ${run.objective}`,
        `STEP: ${step.title}`,
        `INSTRUCTION: ${step.description}`,
        step.skills.length > 0 ? `SKILLS TO APPLY: ${step.skills.join(', ')}` : '',
        step.tools.length > 0 ? `TOOLS YOU MAY USE: ${step.tools.join(', ')}` : '',
        previousOutputs ? `CONTEXT FROM PREVIOUS STEPS:\n${previousOutputs}` : '',
      ].filter(Boolean).join('\n\n');

      const task = await db.task.create({
        data: {
          id: randomUUID(),
          title: step.title.slice(0, 200),
          description: step.description.slice(0, 2000),
          status: 'pending',
          priority: run.priority ?? 'medium',
          agentId: selectedAgent.dbId,
          runId,
          ...(run.workflowId ? { workflowId: run.workflowId } : {}),
          ...(run.userId ? { userId: run.userId } : {}),
        },
      });
      await db.taskStep.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          stepNumber: outcomes.length + 1,
          agentId: selectedAgent.dbId,
          action: step.title.slice(0, 200),
          input: JSON.stringify({ objective: run.objective, step: stepInput.slice(0, 4000) }),
          status: 'pending',
        },
      });
      await recordRunEvent({ runId, type: 'task.queued', source: 'orchestrator', taskId: task.id, agentId: selectedAgent.agentId, data: { stepId: step.id, title: step.title } });

      // ── 5. EXECUTE → 6. QC → REPAIR ──
      const outcome = await executeStepWithQC({
        runId,
        taskDbId: task.id,
        step,
        stepInput,
        selectedAgent,
        engine,
        companyId,
        userId,
      });
      outcomes.push(outcome);
      stepResults.set(step.id, outcome);
      await saveCheckpoint(runId, outcomes);

      // Escalation: human review requested → pause the pipeline. The run is
      // resumed by resolveRunApproval() once a reviewer decides.
      const latest = await db.agentOSRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (latest?.status === 'waiting_approval') {
        await assembleAndFinish(run, outcomes, 'waiting_approval', 'Run paused: human review required (see Approvals).');
        await recordRunEvent({ runId, type: 'run.paused', source: 'orchestrator', data: { stepId: step.id, approvalId: outcome.approvalId ?? null } });
        return;
      }
    }

    // ── 7. ASSEMBLE + FINISH ──
    const failedCount = outcomes.filter((o) => o.status === 'failed').length;
    const completedCount = outcomes.filter((o) => o.status === 'completed').length;
    const summary = completedCount === outcomes.length
      ? `Completed ${completedCount}/${outcomes.length} steps. Deliverable assembled.`
      : `Completed ${completedCount}/${outcomes.length} steps; ${failedCount} failed. See run report for details.`;

    const firstFailure = outcomes.find((o) => o.status === 'failed');
    await assembleAndFinish(
      run,
      outcomes,
      failedCount === 0 ? 'completed' : 'failed',
      summary,
      firstFailure?.error,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish('failed', 'Run failed during orchestration.', message);
  }
}

/** Execute one planned step through the engine, with the QC repair loop. */
async function executeStepWithQC(params: {
  runId: string;
  taskDbId: string;
  step: PlanStep;
  stepInput: string;
  selectedAgent: { agentId: string; agentName: string; dbId: string; role: string };
  engine: ReturnType<typeof getExecutionEngine>;
  companyId: string;
  userId: string;
}): Promise<StepExecutionOutcome> {
  const { runId, taskDbId, step, stepInput, selectedAgent, engine, companyId, userId } = params;
  const base: StepExecutionOutcome = {
    step,
    status: 'failed',
    taskDbId,
    agentId: selectedAgent.agentId,
    agentName: selectedAgent.agentName,
    tokens: 0,
    repairAttempts: 0,
  };

  await db.task.update({ where: { id: taskDbId }, data: { status: 'in_progress', startedAt: new Date() } });
  await db.taskStep.updateMany({ where: { taskId: taskDbId }, data: { status: 'in_progress', startedAt: new Date() } });
  await recordRunEvent({ runId, type: 'task.started', source: 'orchestrator', taskId: taskDbId, agentId: selectedAgent.agentId, data: { stepId: step.id, title: step.title } });

  let lastOutput = '';
  let lastModel: string | undefined;
  let totalTokens = 0;
  let repairAttempts = 0;
  let qcScore: number | undefined;
  let qcPassed: boolean | undefined;
  let lastError: string | undefined;

  const attemptExecution = async (): Promise<{ ok: boolean; output?: string; model?: string; tokens?: number; error?: string }> => {
    try {
      const result = await engine.execute({
        agentId: selectedAgent.agentId,
        companyId,
        userId,
        task: stepInput,
        mode: 'sync',
        priority: 'normal',
        timeoutMs: 240_000,
        maxTokens: 4096,
      });

      if (result.status === 'failed' || !result.result) {
        return { ok: false, error: result.error?.message ?? 'Agent execution failed' };
      }

      const content = result.result.content;
      const metadata = (result.result.metadata ?? {}) as Record<string, unknown>;
      const model = typeof metadata.model === 'string' ? metadata.model : undefined;
      const tokens = result.tokenUsage?.totalTokens ?? 0;

      return { ok: true, output: content, model, tokens };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  // Every generated/repaired output is stored as an immutable version.
  let currentVersionId: string | undefined;
  const versionOutput = async (content: string, model: string | undefined, reason: 'initial' | 'repair') => {
    try {
      const v = await recordOutputVersion({ taskId: taskDbId, runId, content, model, reason });
      currentVersionId = v.id;
    } catch (error) {
      console.error('[AgentOS] output versioning failed:', error);
      currentVersionId = undefined;
    }
  };
  const versionQc = async (gate: { passed: boolean; score: number; issues: string[]; assessmentId?: string }) => {
    if (!currentVersionId) return;
    await attachQcResult(currentVersionId, gate).catch(() => undefined);
  };

  // GENERATE
  const execution = await attemptExecution();
  if (execution.ok && execution.output !== undefined) {
    lastOutput = execution.output;
    lastModel = execution.model;
    totalTokens += execution.tokens ?? 0;
    await versionOutput(lastOutput, lastModel, 'initial');
    await recordRunEvent({
      runId, type: 'model.selected', source: 'model-router', taskId: taskDbId, agentId: selectedAgent.agentId,
      data: { stepId: step.id, model: lastModel, tokens: execution.tokens ?? 0, outputVersionId: currentVersionId },
    });
  } else {
    lastError = execution.error ?? 'Agent execution failed';
  }

  // VALIDATE → REPAIR → RETRY
  if (lastOutput) {
    let gate = await runQualityGate({
      output: lastOutput,
      taskInput: stepInput,
      agentRole: selectedAgent.role,
      agentDbId: selectedAgent.dbId,
      agentId: selectedAgent.agentId,
      runId,
      taskDbId,
    });
    qcScore = gate.score;
    qcPassed = gate.passed;
    await versionQc(gate);
    await recordRunEvent({
      runId, type: gate.passed ? 'qc.passed' : 'qc.failed', source: 'qc', taskId: taskDbId, agentId: selectedAgent.agentId,
      data: { stepId: step.id, passed: gate.passed, score: gate.score, issues: gate.issues, assessmentId: gate.assessmentId, outputVersionId: currentVersionId },
    });

    while (!gate.passed && repairAttempts < MAX_REPAIR_ATTEMPTS) {
      repairAttempts += 1;
      await recordRunEvent({
        runId, type: 'repair.started', source: 'qc', taskId: taskDbId, agentId: selectedAgent.agentId,
        data: { stepId: step.id, attempt: repairAttempts, issues: gate.issues },
      });

      try {
        const repair = await repairOutput({
          taskInput: stepInput,
          output: lastOutput,
          issues: gate.issues,
          model: lastModel,
          companyId,
          agentId: selectedAgent.agentId,
          attempt: repairAttempts,
          runId,
        });
        lastOutput = repair.repaired;
        lastModel = repair.model;
        await versionOutput(lastOutput, lastModel, 'repair');

        gate = await runQualityGate({
          output: lastOutput,
          taskInput: stepInput,
          agentRole: selectedAgent.role,
          agentDbId: selectedAgent.dbId,
          agentId: selectedAgent.agentId,
          runId,
          taskDbId,
        });
        qcScore = gate.score;
        qcPassed = gate.passed;
        await versionQc(gate);
        await recordRunEvent({
          runId, type: gate.passed ? 'qc.passed' : 'qc.failed', source: 'qc', taskId: taskDbId, agentId: selectedAgent.agentId,
          data: { stepId: step.id, attempt: repairAttempts, passed: gate.passed, score: gate.score, issues: gate.issues, assessmentId: gate.assessmentId, outputVersionId: currentVersionId },
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        break;
      }
    }
  }

  // OUTCOME
  if (lastOutput && qcPassed) {
    await db.task.update({ where: { id: taskDbId }, data: { status: 'completed', completedAt: new Date() } });
    await db.taskStep.updateMany({ where: { taskId: taskDbId }, data: { status: 'completed', output: lastOutput.slice(0, 8000), completedAt: new Date() } });
    await recordRunEvent({
      runId, type: 'task.completed', source: 'orchestrator', taskId: taskDbId, agentId: selectedAgent.agentId,
      data: { stepId: step.id, title: step.title, model: lastModel, tokens: totalTokens, qcScore, repairAttempts },
    });
    return { ...base, status: 'completed', model: lastModel, tokens: totalTokens, output: lastOutput, qcScore, qcPassed, repairAttempts };
  }

  // QC exhausted → human review (mandatory escalation, no endless loop)
  if (lastOutput && !qcPassed) {
    const approval = await requestHumanReview({
      runId,
      taskDbId,
      stepId: step.id,
      agentDbId: selectedAgent.dbId,
      title: `Human review required: step "${step.title}" failed quality control`,
      reason: `Quality control failed after ${repairAttempts} repair attempt(s). Issues: ${(qcPassed === false ? 'see QC events' : '')} ${lastError ?? 'output did not pass validation'}`,
      output: lastOutput,
      issues: [`QC score ${Math.round((qcScore ?? 0) * 100)}% below threshold after ${repairAttempts} repair attempt(s)`],
      requestedBy: userId !== 'anonymous' ? userId : undefined,
      companyId,
    });
    await recordRunEvent({
      runId, type: 'approval.requested', source: 'qc', taskId: taskDbId, agentId: selectedAgent.agentId,
      data: { stepId: step.id, approvalId: approval.approvalId, reason: 'QC retries exhausted' },
    });
    await db.task.update({ where: { id: taskDbId }, data: { status: 'blocked', completedAt: new Date() } });
    return { ...base, status: 'failed', model: lastModel, tokens: totalTokens, output: lastOutput, error: 'Quality control failed; human review requested', qcScore, qcPassed, repairAttempts, approvalId: approval.approvalId };
  }

  // Execution itself failed
  const errorMessage = lastError ?? 'Agent execution failed';
  const honest = isConfigurationError(new Error(errorMessage)) ? configurationRequiredMessage(new Error(errorMessage)) : errorMessage;
  await db.task.update({ where: { id: taskDbId }, data: { status: 'failed', completedAt: new Date() } });
  await db.taskStep.updateMany({ where: { taskId: taskDbId }, data: { status: 'failed', error: honest.slice(0, 1000), completedAt: new Date() } });
  await recordRunEvent({
    runId, type: 'task.failed', source: 'orchestrator', taskId: taskDbId, agentId: selectedAgent.agentId,
    data: { stepId: step.id, title: step.title, error: honest.slice(0, 1000), configurationRequired: isConfigurationError(new Error(errorMessage)) },
  });
  return { ...base, status: 'failed', model: lastModel, tokens: totalTokens, error: honest, qcScore, qcPassed, repairAttempts };
}

/** Assemble the run report artifact and finalize the run record. */
async function assembleAndFinish(
  run: { id: string; objective: string; projectId: string | null; companyId: string | null; userId: string | null },
  outcomes: StepExecutionOutcome[],
  status: RunStatus,
  summary: string,
  error?: string,
): Promise<void> {
  // Assemble artifact (report of everything that happened — including failures).
  let artifactId: string | undefined;
  try {
    const plan = await loadPlan(run.id);
    const artifact = await buildRunReportArtifact({
      runId: run.id,
      objective: run.objective,
      plan: plan.map((s) => ({ title: s.title, description: s.description, status: outcomes.find((o) => o.step.id === s.id)?.status })),
      tasks: outcomes.map((o) => ({
        title: o.step.title,
        status: o.status,
        agentName: o.agentName,
        model: o.model,
        tokens: o.tokens,
        output: o.output,
        error: o.error,
        qcScore: o.qcScore,
        qcPassed: o.qcPassed,
      })),
      summary,
      ...(run.companyId ? { companyId: run.companyId } : {}),
      ...(run.projectId ? { projectId: run.projectId } : {}),
      ...(run.userId ? { userId: run.userId } : {}),
      generatedBy: 'master-orchestrator',
    });
    artifactId = artifact.id;
    await recordRunEvent({
      runId: run.id, type: 'artifact.created', source: 'artifact-system',
      data: { artifactId, name: artifact.name, type: artifact.type, size: artifact.size, checksum: artifact.checksum },
    });
  } catch (error) {
    // Artifact assembly is best-effort; the run result must still finalize.
    console.error('[AgentOS] artifact assembly failed:', error);
  }

  await db.agentOSRun.update({
    where: { id: run.id },
    data: {
      status,
      summary,
      ...(error ? { error: error.slice(0, 2000) } : {}),
      ...(TERMINAL_STATUSES.includes(status) ? { completedAt: new Date() } : {}),
    },
  });
  await recordRunEvent({
    runId: run.id,
    type: status === 'completed' ? 'run.completed' : status === 'failed' ? 'run.failed' : status === 'waiting_approval' ? 'approval.requested' : 'run.cancelled',
    source: 'orchestrator',
    data: { summary: summary.slice(0, 1000), ...(error ? { error: error.slice(0, 1000) } : {}), artifactId, stepCount: outcomes.length, status },
  });

  // Episodic memory (best-effort)
  try {
    const memory = getMemoryStore();
    await memory.addEpisodic({
      agentId: 'master-orchestrator',
      companyId: run.companyId ?? 'default-company',
      userId: run.userId ?? 'anonymous',
      content: `Run ${run.id} (${status}): ${run.objective.slice(0, 200)} — ${summary.slice(0, 300)}`,
      metadata: { runId: run.id, status, artifactId },
    });
  } catch { /* best-effort */ }
}

async function loadPlan(runId: string): Promise<PlanStep[]> {
  const run = await db.agentOSRun.findUnique({ where: { id: runId }, select: { plan: true } });
  if (!run) return [];
  try {
    const parsed = JSON.parse(run.plan) as { steps?: PlanStep[] };
    return Array.isArray(parsed.steps) ? parsed.steps : [];
  } catch {
    return [];
  }
}

// ─── Command entry point ─────────────────────────────────────────────────────

/**
 * Create a run from a Command record (the classic /api/commands flow).
 */
export async function createRunFromCommand(commandId: string): Promise<{ runId: string } | null> {
  const command = await db.command.findUnique({ where: { id: commandId } });
  if (!command) return null;
  const { runId } = await createRun({
    objective: command.rawCommand,
    ...(command.userId ? { userId: command.userId } : {}),
    commandId: command.id,
  });
  await db.command.update({ where: { id: commandId }, data: { status: 'processing' } });
  return { runId };
}
