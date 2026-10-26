/**
 * ALO Labs AgentOS — Server instrumentation (worker bootstrap)
 *
 * Next.js calls `register()` once when the server process starts. We use it
 * to run the durable AgentOS job worker inside the standalone server:
 *
 *  - polls the Prisma-backed `agentos` queue and dispatches jobs
 *    (agentos.run → Master Orchestrator pipeline,
 *     agentos.workflow → Workflow Engine,
 *     agentos.command → command run)
 *  - reclaims expired worker leases on boot and every 30s, so a server
 *    restart never destroys a running workflow (jobs are re-queued, not lost)
 *
 * The queue itself is durable (JobQueue/QueueItem tables); this worker is
 * just the executor. Multiple replicas each poll — queue items are claimed
 * by status transition, and `processQueue` is concurrency-limited.
 *
 * IMPORTANT: this file is bundled for BOTH the nodejs and edge runtimes.
 * All Node-only imports (Prisma, the run pipeline) are therefore loaded
 * lazily inside the worker, never at module top level.
 */

const POLL_INTERVAL_MS = 3000;
const LEASE_RECLAIM_INTERVAL_MS = 30_000;
const WORKER_ID = `agentos-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

type DbClient = typeof import('@/lib/db')['db'];

async function recoverStaleJobs(
  db: DbClient,
  reclaimExpiredLeases: typeof import('@/lib/job-queue')['reclaimExpiredLeases'],
): Promise<void> {
  try {
    // Make sure the durable queue row exists (idempotent).
    await db.jobQueue.upsert({
      where: { name: 'agentos' },
      update: { isActive: true },
      create: { id: 'agentos-queue', name: 'agentos', isActive: true, maxRetries: 3 },
    });
  } catch { /* queue bootstrap is best-effort */ }

  try {
    // Jobs whose worker lease expired (crashed/restarted worker) go back to
    // the queue, or to the dead-letter state when attempts are exhausted.
    const result = await reclaimExpiredLeases();
    if (result.requeued > 0 || result.deadLettered > 0) {
      console.log(`[AgentOS worker] reclaimed expired leases: requeued=${result.requeued} deadLettered=${result.deadLettered}`);
    }
  } catch (error) {
    console.error('[AgentOS worker] stale job recovery failed:', error);
  }
}

function startWorker(): void {
  if (started) return;
  started = true;

  console.log('[AgentOS worker] starting durable queue worker');

  // Lazy Node-only imports — this module is also bundled for the edge
  // runtime, where Prisma/node:crypto must never be loaded.
  void (async () => {
    const [{ db }, { processQueue, reclaimExpiredLeases }, { RUN_QUEUE, executeRun, expireStaleApprovals }, { executeWorkflowRun }, { dispatchAgentOSJob }, { ensureRouterSynced }] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/job-queue'),
      import('@/lib/runs'),
      import('@/lib/workflow-engine'),
      import('@/lib/workers/agentos-dispatcher'),
      import('@/lib/ai-router'),
    ]);

    await recoverStaleJobs(db, reclaimExpiredLeases);
    // Load env + database-configured AI providers before the first job.
    const router = await ensureRouterSynced({ force: true }).catch(() => null);
    if (router) {
      const summaries = router.getProviderSummaries();
      console.log(`[AgentOS worker] AI providers registered: ${summaries.map((p) => p.provider).join(', ') || '(none — configuration required)'}`);
    }
    let lastReclaim = Date.now();

    let polling = false;
    const pollOnce = async (): Promise<void> => {
      if (polling) return; // do not overlap long-running batches
      polling = true;
      try {
        if (Date.now() - lastReclaim > LEASE_RECLAIM_INTERVAL_MS) {
          lastReclaim = Date.now();
          await reclaimExpiredLeases(RUN_QUEUE).catch(() => undefined);
          // Reviews nobody decided in time fail their runs instead of hanging forever.
          await expireStaleApprovals().then((n) => {
            if (n > 0) console.log(`[AgentOS worker] expired ${n} stale approval(s)`);
          }).catch(() => undefined);
          // Pick up provider configs changed through the API by another process.
          await ensureRouterSynced().catch(() => undefined);
        }
        await processQueue(
          RUN_QUEUE,
          (job) => dispatchAgentOSJob(job, { db, executeRun, executeWorkflowRun }),
          { workerId: WORKER_ID },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('not found')) {
          console.error('[AgentOS worker] queue processing error:', error);
        }
      } finally {
        polling = false;
      }
    };

    void pollOnce();
    timer = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
    // Do not keep the process alive solely for the poller.
    if (typeof timer.unref === 'function') timer.unref();
  })().catch((error) => {
    console.error('[AgentOS worker] failed to start:', error);
  });
}

export async function registerNodeWorker(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // In Next.js dev, register() runs per server start — guard with globalThis.
  const globalForWorker = globalThis as unknown as { __agentosWorkerStarted?: boolean };
  if (globalForWorker.__agentosWorkerStarted) return;
  globalForWorker.__agentosWorkerStarted = true;

  // Fail startup, before the worker polls anything, when this process is
  // production and its datasource is not MySQL/MariaDB. Next.js does not call
  // register() during `next build`, so the CI build (which uses a throw-away
  // SQLite URL) is unaffected. The import is dynamic because this file is
  // bundled for the edge runtime as well.
  const { assertProductionDatasource } = await import('@/lib/production-database');
  const { describeDatasource } = await import('@/lib/db');
  const datasource = describeDatasource();
  console.log(
    `[AgentOS] datasource provider=${datasource.provider} url=${datasource.redactedUrl}`,
  );
  // Throws in production unless the datasource is MySQL/MariaDB, so a
  // misconfigured server refuses to boot instead of quietly writing to SQLite.
  assertProductionDatasource();

  startWorker();
}
