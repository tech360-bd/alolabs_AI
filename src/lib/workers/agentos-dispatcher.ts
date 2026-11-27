/**
 * AgentOS queue dispatcher — maps durable queue jobs to their executors.
 *
 * Used by the background worker (src/instrumentation.node.ts) and by the
 * manual trigger API (POST /api/queues/[id]/process) so both paths execute
 * jobs identically. Unknown job types are rejected (never "acknowledged").
 */
import type { QueueItemData } from '@/lib/job-queue';
import { isUsableTenantId } from '@/lib/tenancy/policy';

type DbClient = typeof import('@/lib/db')['db'];
type ExecuteRunFn = typeof import('@/lib/runs')['executeRun'];
type ExecuteWorkflowRunFn = typeof import('@/lib/workflow-engine')['executeWorkflowRun'];
type ExecuteLeadFollowupFn = typeof import('@/lib/integrations/workflows/lead-followup')['executeLeadFollowupRun'];
type PlanResultT = import('@/lib/runs/planner').PlanResult;

export interface DispatchDeps {
  db: DbClient;
  executeRun: ExecuteRunFn;
  executeWorkflowRun: ExecuteWorkflowRunFn;
  /** Optional so older callers/tests keep compiling; required at runtime for CRM jobs. */
  executeLeadFollowup?: ExecuteLeadFollowupFn;
}

export const AGENTOS_JOB_TYPES = ['agentos.run', 'agentos.workflow', 'agentos.command', 'agentos.crm.lead-followup'] as const;

/**
 * T-1 — a worker must prove it still owns the run it is about to execute.
 *
 * Before this existed the dispatcher loaded a job, read `runId` out of the
 * payload and called `executeRun(runId)` with **no tenant check whatsoever**. A
 * job payload is supplied by whoever enqueued it, so it is untrusted input in
 * exactly the same sense as an HTTP body: it names a run, but it proves nothing
 * about that run.
 *
 * The rule here is deliberately two-sided. The payload must name a tenant (a job
 * that does not know its tenant cannot be authorised), AND that tenant must still
 * match the run row at execution time. Re-checking at execution rather than only
 * at enqueue matters because a run can be re-parented, and because a queue can
 * deliver a job long after the enqueuing context has changed.
 */
async function assertJobTenantMatchesRun(
  db: DbClient,
  payload: Record<string, unknown>,
  runId: string,
): Promise<void> {
  const claimed = typeof payload.companyId === 'string' ? payload.companyId : null;

  if (!isUsableTenantId(claimed)) {
    throw new Error(
      `Refusing to dispatch run ${runId}: the job carries no valid tenant ` +
        `(received ${JSON.stringify(claimed)}). Tenanted work must name its company.`,
    );
  }

  const run = await db.agentOSRun.findUnique({
    where: { id: runId },
    select: { companyId: true },
  });

  if (!run) {
    throw new Error(`Refusing to dispatch run ${runId}: no such run.`);
  }

  if (!isUsableTenantId(run.companyId)) {
    throw new Error(
      `Refusing to dispatch run ${runId}: the run has no resolvable tenant. ` +
        'It must be assigned to a company before it can execute.',
    );
  }

  if (run.companyId !== claimed) {
    // Never log both ids at error level with tenant-identifying detail beyond
    // what an operator needs; the mismatch itself is the actionable fact.
    throw new Error(
      `Refusing to dispatch run ${runId}: tenant mismatch between the job payload and the run record.`,
    );
  }
}

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
      await assertJobTenantMatchesRun(deps.db, payload, runId);
      await deps.executeRun(runId);
      return { runId };
    }
    case 'agentos.workflow': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      const workflowRunId = typeof payload.workflowRunId === 'string' ? payload.workflowRunId : null;
      const taskId = typeof payload.taskId === 'string' ? payload.taskId : null;
      if (!runId || !workflowRunId) throw new Error('agentos.workflow job missing runId/workflowRunId');
      await assertJobTenantMatchesRun(deps.db, payload, runId);
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
    case 'agentos.crm.lead-followup': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      if (!runId) throw new Error('agentos.crm.lead-followup job missing runId');
      if (!deps.executeLeadFollowup) throw new Error('agentos.crm.lead-followup executor is not wired');
      await assertJobTenantMatchesRun(deps.db, payload, runId);
      const result = await deps.executeLeadFollowup(runId);
      return { runId, status: result.status };
    }
    case 'agentos.command': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      if (!runId) throw new Error('agentos.command job missing runId');
      await assertJobTenantMatchesRun(deps.db, payload, runId);
      await deps.executeRun(runId);
      return { runId };
    }
    case 'agentos.orchestrate': {
      const runId = typeof payload.runId === 'string' ? payload.runId : null;
      if (!runId) throw new Error('agentos.orchestrate job missing runId');
      await assertJobTenantMatchesRun(deps.db, payload, runId);
      // Imported lazily: the coordinator pulls in the agent registry and the plan
      // builder, which are not needed for an ordinary run job.
      const { orchestrateRunFromDb } = await import('@/lib/orchestration/service');
      const result = await orchestrateRunFromDb(runId);
      return { runId, ...result };
    }
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}


/** Resolve the executor dependencies lazily (Node runtime only). */
export async function loadDispatchDeps(): Promise<DispatchDeps> {
  const [{ db }, { executeRun }, { executeWorkflowRun }, { executeLeadFollowupRun }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/runs'),
    import('@/lib/workflow-engine'),
    import('@/lib/integrations/workflows/lead-followup'),
  ]);
  return { db, executeRun, executeWorkflowRun, executeLeadFollowup: executeLeadFollowupRun };
}
