/**
 * Multi-agent orchestration — server wiring.
 *
 * Binds the coordinator to the durable Run Engine:
 *
 * - the parent run is an ordinary `AgentOSRun` queued with job type
 *   `agentos.orchestrate`, so a worker restart resumes it like any other run;
 * - every subtask becomes a real child run (`parentRunId` set), executed inline by
 *   the engine so a child does not need a second worker;
 * - the parent's status and summary are written from the reconciliation verdict, so
 *   "completed" means every child completed, never "dispatched".
 */

import { db } from '@/lib/db';
import { createRun, cancelRun, getRun, recordRunEvent, type RunStatus } from '@/lib/runs';
import { enqueue } from '@/lib/job-queue';
import { classifyInstruction } from '@/lib/super-admin/operator';
import { isUsableTenantId } from '@/lib/tenancy/policy';
import { notifyOperator } from '@/lib/notifications/operator';
import { buildOrchestrationPlan, type AgentDescriptor, type Subtask } from './plan';
import { orchestrate, type RunPort, type ChildResult, type ChildStatus } from './coordinator';
import { discoverAgents } from './registry';

export const ORCHESTRATE_JOB = 'agentos.orchestrate';
export const ORCHESTRATE_QUEUE = 'agentos';

const TERMINAL: ChildStatus[] = ['completed', 'failed', 'cancelled', 'timed_out', 'blocked'];

function mapStatus(status: string): ChildStatus {
  return (TERMINAL as string[]).includes(status) ? (status as ChildStatus) : status === 'queued' ? 'queued' : 'running';
}

/** Create the parent run and queue the orchestration job. */
export async function createOrchestratedRun(input: {
  objective: string;
  companyId: string;
  userId?: string;
  projectId?: string;
  commandId?: string;
}): Promise<{ parentRunId: string; plan: ReturnType<typeof buildOrchestrationPlan> }> {
  if (!isUsableTenantId(input.companyId)) {
    throw new Error('An orchestrated run requires a resolvable company.');
  }

  const instructionPlan = classifyInstruction(input.objective);
  const agents = await discoverAgents(input.companyId);
  const plan = buildOrchestrationPlan(input.objective, instructionPlan, agents, input.companyId);

  const { runId } = await createRun({
    objective: input.objective,
    companyId: input.companyId,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.commandId ? { commandId: input.commandId } : {}),
    priority: 'high',
  });

  await db.agentOSRun.update({ where: { id: runId }, data: { status: 'planning' } });
  await recordRunEvent({
    runId,
    type: 'run.orchestration.queued',
    source: 'orchestrator',
    data: {
      intent: instructionPlan.intent.id,
      subtasks: plan.assignments.length,
      assigned: plan.assignments.filter((assignment) => assignment.agent).length,
      notes: plan.notes,
    },
  });

  await enqueue(
    ORCHESTRATE_QUEUE,
    ORCHESTRATE_JOB,
    { runId, companyId: input.companyId },
    { priority: 9, maxRetries: 1, idempotencyKey: `orchestrate:${runId}`, jobId: runId },
  );

  return { parentRunId: runId, plan };
}

/** A port over the real run engine, scoped to one parent run. */
export function createEnginePort(parent: { id: string; companyId: string; userId: string | null; projectId: string | null }): RunPort {
  return {
    async createChild({ parentRunId, subtask, agent }) {
      const { runId } = await createRun({
        objective: subtask.instruction,
        companyId: parent.companyId,
        ...(parent.userId ? { userId: parent.userId } : {}),
        ...(parent.projectId ? { projectId: parent.projectId } : {}),
        parentRunId,
        priority: 'high',
        // Children execute inline on the orchestrating worker: a second queue hop
        // would make "wait for the children" depend on a second worker being alive.
        executeInline: true,
      });
      // The coordinator emits `run.fanout.dispatched` for this subtask; emitting a
      // second event here would double every dispatch on the parent timeline.
      return runId;
    },
    async status(childRunId): Promise<ChildResult> {
      const run = await getRun(childRunId);
      if (!run) return { status: 'failed', error: 'Child run not found', retryable: false };
      return {
        status: mapStatus(run.status),
        ...(run.summary ? { summary: run.summary } : {}),
        ...(run.error ? { error: run.error } : {}),
        // Transient engine failures are worth another attempt; a tenant or
        // configuration error is not.
        retryable: !/tenant|forbidden|unauthori[sz]ed|permission/i.test(run.error ?? ''),
      };
    },
    async cancel(childRunId) {
      await cancelRun(childRunId, parent.companyId).catch(() => false);
    },
    async parentStopped(parentRunId) {
      const run = await getRun(parentRunId);
      return !run || TERMINAL.includes(mapStatus(run.status));
    },
    async emit(parentRunId, type, data) {
      await recordRunEvent({ runId: parentRunId, type, source: 'orchestrator', data });
    },
  };
}

/**
 * Execute one orchestrated run. Called by the worker for `agentos.orchestrate`.
 *
 * Idempotent: re-running after a worker restart re-derives the plan, skips children
 * that already completed (their subtask id is matched through the child runs), and
 * reconciles whatever is left.
 */
export async function orchestrateRunFromDb(runId: string): Promise<{ outcome: string; verdict: string }> {
  const parent = await db.agentOSRun.findUnique({ where: { id: runId } });
  if (!parent) throw new Error(`Orchestrated run ${runId} not found`);
  if (!isUsableTenantId(parent.companyId)) throw new Error(`Run ${runId} has no tenant`);

  const terminalStatuses: RunStatus[] = ['completed', 'failed', 'cancelled', 'blocked', 'timed_out'];
  if (terminalStatuses.includes(parent.status as RunStatus)) {
    return { outcome: parent.status, verdict: 'Run already reached a terminal state; nothing to do.' };
  }

  const instructionPlan = classifyInstruction(parent.objective);
  const agents = await discoverAgents(parent.companyId ?? undefined);
  const plan = buildOrchestrationPlan(parent.objective, instructionPlan, agents, parent.companyId ?? undefined);
  const assignments = new Map<string, AgentDescriptor>();
  for (const assignment of plan.assignments) {
    if (assignment.agent) assignments.set(assignment.subtask.id, assignment.agent);
  }

  // Reuse children created by a previous attempt of this same parent.
  const existing = await db.agentOSRun.findMany({ where: { parentRunId: runId }, select: { id: true, objective: true, status: true } });
  const reusable = new Map<string, string>();
  for (const child of existing) {
    const match = plan.assignments.find((assignment) => child.objective.startsWith(assignment.subtask.instruction));
    if (match && (child.status === 'completed' || child.status === 'running' || child.status === 'queued')) {
      reusable.set(match.subtask.id, child.id);
    }
  }

  const port = createEnginePort({
    id: parent.id,
    companyId: parent.companyId,
    userId: parent.userId,
    projectId: parent.projectId,
  });
  const portWithReuse: RunPort = {
    ...port,
    async createChild(input) {
      const reused = reusable.get(input.subtask.id);
      if (reused) return reused;
      return port.createChild(input);
    },
  };

  await db.agentOSRun.update({ where: { id: runId }, data: { status: 'running' } });

  const result = await orchestrate({
    parentRunId: runId,
    subtasks: plan.assignments.map((assignment) => assignment.subtask) as Subtask[],
    agents,
    assignments,
    port: portWithReuse,
    concurrency: plan.concurrency,
    pollIntervalMs: 250,
    childTimeoutMs: 15 * 60_000,
    maxAttempts: 2,
  });

  await db.agentOSRun.update({
    where: { id: runId },
    data: {
      status: result.outcome,
      summary: result.verdict,
      ...(result.summary ? { summary: `${result.verdict}\n\n${result.summary}` } : {}),
      ...(result.outcome === 'failed'
        ? { error: result.contradictions.length ? result.contradictions.join('; ') : result.verdict }
        : {}),
      completedAt: new Date(),
    },
  });

  await notifyOperator({
    companyId: parent.companyId,
    ...(parent.userId ? { userId: parent.userId } : {}),
    type:
      result.outcome === 'completed'
        ? 'run.completed'
        : result.outcome === 'cancelled'
          ? 'run.cancelled'
          : 'run.failed',
    title: `Orchestration ${result.outcome}: ${parent.objective.slice(0, 120)}`,
    message: `${result.verdict}${result.contradictions.length ? ` Contradictions: ${result.contradictions.join('; ')}` : ''}`,
    runId,
    link: `/dashboard?panel=super-admin-operator`,
    evidence: { children: result.children.length, contradictions: result.contradictions.length },
  }).catch(() => undefined);

  return { outcome: result.outcome, verdict: result.verdict };
}
