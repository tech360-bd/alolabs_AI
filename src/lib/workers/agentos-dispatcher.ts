/**
 * AgentOS queue dispatcher — maps durable queue jobs to their executors.
 *
 * Used by the background worker (src/instrumentation.node.ts) and by the
 * manual trigger API (POST /api/queues/[id]/process) so both paths execute
 * jobs identically. Unknown job types are rejected (never "acknowledged").
 */
import type { QueueItemData } from '@/lib/job-queue';

type DbClient = typeof import('@/lib/db')['db'];
type ExecuteRunFn = typeof import('@/lib/runs')['executeRun'];
type ExecuteWorkflowRunFn = typeof import('@/lib/workflow-engine')['executeWorkflowRun'];
type PlanResultT = import('@/lib/runs/planner').PlanResult;

export interface DispatchDeps {
  db: DbClient;
  executeRun: ExecuteRunFn;
  executeWorkflowRun: ExecuteWorkflowRunFn;
}

export const AGENTOS_JOB_TYPES = ['agentos.run', 'agentos.workflow', 'agentos.command'] as const;

/**
 * One run, one executor: if another worker holds an earlier, still-leased
 * job for the same run (QueueItem.jobId), this job yields. The earlier job's
 * executeRun handles resume/approval state itself; if that worker dies, its
 * lease expires and the job is re-queued, so nothing is lost.
 */
async function anotherExecutorHoldsRun(job: QueueItemData, db: DbClient): Promise<boolean> {
  if (!job.jobId) return false;
  const now = new Date();
  const others = await db.queueItem.findMany({
    where: { jobId: job.jobId, status: 'processing', id: { not: job.id }, lockExpiresAt: { gt: now } },
    select: { id: true, startedAt: true },
  });
  const mine = job.startedAt ? new Date(job.startedAt).getTime() : now.getTime();
  return others.some((o) => {
    const theirs = o.startedAt ? new Date(o.startedAt).getTime() : 0;
    return theirs < mine || (theirs === mine && o.id < job.id);
  });
}

export async function dispatchAgentOSJob(
  job: QueueItemData,
  deps: DispatchDeps,
): Promise<unknown> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(job.payload) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (await anotherExecutorHoldsRun(job, deps.db)) {
    return { skipped: true, reason: 'another worker is already executing this run' };
  }

  switch (job.jobType) {
    case 'agentos.run': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      if (!runId) throw new Error('agentos.run job missing runId');
      await deps.executeRun(runId);
      return { runId };
    }
    case 'agentos.workflow': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      const workflowRunId = typeof payload.workflowRunId === 'string' ? payload.workflowRunId : null;
      const taskId = typeof payload.taskId === 'string' ? payload.taskId : null;
      if (!runId || !workflowRunId) throw new Error('agentos.workflow job missing runId/workflowRunId');
      // Load the persisted plan from the run record.
      const run = await deps.db.agentOSRun.findUnique({ where: { id: runId }, select: { plan: true } });
      let plan: PlanResultT = { steps: [], strategy: 'heuristic', reasoning: 'empty' };
      try {
        const parsed = JSON.parse(run?.plan ?? '{}') as Partial<PlanResultT>;
        if (Array.isArray(parsed.steps)) {
          plan = { steps: parsed.steps, strategy: parsed.strategy ?? 'heuristic', reasoning: parsed.reasoning ?? '' };
        }
      } catch { /* keep default empty plan */ }
      await deps.executeWorkflowRun(runId, workflowRunId, plan, taskId ?? undefined);
      return { runId, workflowRunId };
    }
    case 'agentos.command': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      if (!runId) throw new Error('agentos.command job missing runId');
      await deps.executeRun(runId);
      return { runId };
    }
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}


/** Resolve the executor dependencies lazily (Node runtime only). */
export async function loadDispatchDeps(): Promise<DispatchDeps> {
  const [{ db }, { executeRun }, { executeWorkflowRun }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/runs'),
    import('@/lib/workflow-engine'),
  ]);
  return { db, executeRun, executeWorkflowRun };
}
