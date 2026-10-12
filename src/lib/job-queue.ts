/**
 * Job Queue Manager — P8
 * ALO Labs AISMH
 *
 * Durable, in-process job queue backed by Prisma (JobQueue + QueueItem models).
 * No external dependencies (Bull/BullMQ).
 *
 * Guarantees (all enforced in the database, verified by
 * __tests__/integration/job-queue-durability.test.ts against a real DB):
 *
 *  - At-most-one active worker per job: a job is claimed with an atomic
 *    compare-and-set (`status = queued` → `processing`) that also records a
 *    lease (`lockedBy`, `lockExpiresAt`). Two workers can never both run it.
 *  - Crash recovery: a worker that dies stops heartbeating; once its lease
 *    expires `reclaimExpiredLeases()` returns the job to `queued` (or to the
 *    dead-letter state when attempts are exhausted). Nothing is lost.
 *  - Bounded retries with exponential backoff: `attempts` is incremented
 *    exactly once per claim (never again on failure), so `maxAttempts` means
 *    what it says. Retries are scheduled with jittered exponential backoff.
 *  - Idempotent enqueue: an optional `idempotencyKey` (unique) makes repeated
 *    enqueues return the existing job instead of creating a duplicate.
 *  - Results never overwrite inputs: handler output is stored in `result`;
 *    `payload` is preserved for audit and replay.
 *  - Cancellation: `cancelJob()` moves queued/processing jobs to `cancelled`;
 *    long-running handlers can poll `isJobCancelled()`.
 */

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  priority?: number;
  delayMs?: number;
  maxRetries?: number;
  /** Unique key; a second enqueue with the same key returns the first job. */
  idempotencyKey?: string;
  /** Optional external correlation id (run id, workflow id …). */
  jobId?: string;
}

export interface JobResult {
  id: string;
  status: string;
  result?: string;
  error?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface JobContext {
  /** Extends the lease; call periodically from long-running handlers. */
  heartbeat: () => Promise<void>;
  /** True once cancelJob() was called for this job. */
  isCancelled: () => Promise<boolean>;
  workerId: string;
}

export type JobHandler = (job: QueueItemData, ctx: JobContext) => Promise<unknown>;

export interface QueueItemData {
  id: string;
  queueId: string;
  jobId: string | null;
  jobType: string;
  priority: number;
  payload: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  result?: string | null;
  idempotencyKey?: string | null;
  lockedBy?: string | null;
  lockExpiresAt?: Date | null;
  heartbeatAt?: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
}

export interface ProcessOptions {
  /** Identifies this worker in leases. Defaults to a per-process id. */
  workerId?: string;
  /** Lease duration; expired leases are reclaimable. Default 60s. */
  leaseMs?: number;
  /** Heartbeat interval while a handler runs. Default leaseMs / 3. */
  heartbeatMs?: number;
  /** Override retry backoff (tests / special queues). */
  backoffMs?: (attempt: number) => number;
}

export interface FailOptions {
  backoffMs?: (attempt: number) => number;
  /** Mark failed immediately regardless of remaining attempts. */
  fatal?: boolean;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_LEASE_MS = Number(process.env.QUEUE_LEASE_MS ?? 60_000);
const RETRY_BASE_MS = Number(process.env.QUEUE_RETRY_BASE_MS ?? 5_000);
const RETRY_MAX_MS = Number(process.env.QUEUE_RETRY_MAX_MS ?? 5 * 60_000);

const processWorkerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** Jittered exponential backoff: base * 2^(attempt-1), capped, ±20% jitter. */
export function defaultBackoffMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = exp * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toQueueItemData(item: Record<string, unknown>): QueueItemData {
  return item as unknown as QueueItemData;
}

/**
 * Ensure a JobQueue row exists for the given queueName.
 * If it doesn't exist yet, creates it.
 */
async function ensureQueue(queueName: string, maxRetries?: number): Promise<string> {
  let queue = await db.jobQueue.findUnique({ where: { name: queueName } });
  if (!queue) {
    queue = await db.jobQueue.create({
      data: {
        name: queueName,
        maxRetries: maxRetries ?? 3,
      },
    });
  }
  return queue.id;
}

/**
 * Atomically claim a queued job for a worker. Returns false when another
 * worker won the race (or the job was cancelled in between).
 */
async function claimJob(jobId: string, workerId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const claim = await db.queueItem.updateMany({
    where: { id: jobId, status: 'queued' },
    data: {
      status: 'processing',
      startedAt: now,
      attempts: { increment: 1 },
      lockedBy: workerId,
      lockExpiresAt: new Date(now.getTime() + leaseMs),
      heartbeatAt: now,
    },
  });
  return claim.count > 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a job to a queue. With `idempotencyKey`, a duplicate enqueue returns the
 * existing job (whatever its status) instead of creating a second one.
 */
export async function enqueue(
  queueName: string,
  jobType: string,
  payload: Record<string, unknown> | unknown[] | string | number | boolean | null,
  options?: EnqueueOptions,
): Promise<QueueItemData> {
  const queueId = await ensureQueue(queueName, options?.maxRetries);

  if (options?.idempotencyKey) {
    const existing = await db.queueItem.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) return toQueueItemData(existing);
  }

  const scheduledAt = options?.delayMs
    ? new Date(Date.now() + options.delayMs)
    : null;

  try {
    const item = await db.queueItem.create({
      data: {
        queueId,
        jobId: options?.jobId ?? null,
        jobType,
        priority: options?.priority ?? 0,
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
        maxAttempts: options?.maxRetries ?? 3,
        scheduledAt,
        status: 'queued',
        idempotencyKey: options?.idempotencyKey ?? null,
      },
    });
    return toQueueItemData(item);
  } catch (err) {
    // Unique violation on idempotencyKey from a concurrent enqueue: return the winner.
    if (options?.idempotencyKey && (err as { code?: string })?.code === 'P2002') {
      const existing = await db.queueItem.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
      if (existing) return toQueueItemData(existing);
    }
    throw err;
  }
}

/**
 * Get the next available job from a queue (by priority desc, then FIFO) and
 * claim it for `workerId` with a lease. Returns null if no jobs are available.
 */
export async function dequeue(
  queueName: string,
  options: { workerId?: string; leaseMs?: number } = {},
): Promise<QueueItemData | null> {
  const queue = await db.jobQueue.findUnique({ where: { name: queueName } });
  if (!queue) return null;

  const workerId = options.workerId ?? processWorkerId;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const now = new Date();

  // A few attempts absorb races with other workers selecting the same row.
  for (let i = 0; i < 3; i += 1) {
    const item = await db.queueItem.findFirst({
      where: {
        queueId: queue.id,
        status: 'queued',
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });
    if (!item) return null;

    if (await claimJob(item.id, workerId, leaseMs)) {
      const updated = await db.queueItem.findUnique({ where: { id: item.id } });
      return updated ? toQueueItemData(updated) : null;
    }
  }
  return null;
}

/** Extend the lease of a running job (no-op if the worker no longer holds it). */
export async function heartbeat(jobId: string, workerId: string, leaseMs: number = DEFAULT_LEASE_MS): Promise<boolean> {
  const now = new Date();
  const res = await db.queueItem.updateMany({
    where: { id: jobId, status: 'processing', lockedBy: workerId },
    data: { heartbeatAt: now, lockExpiresAt: new Date(now.getTime() + leaseMs) },
  });
  return res.count > 0;
}

/**
 * Mark a job as completed. The handler result is stored in `result`; the
 * original `payload` is preserved.
 */
export async function completeJob(
  jobId: string,
  result?: Record<string, unknown> | unknown[] | string | number | boolean | null,
): Promise<QueueItemData> {
  const updateData: Record<string, unknown> = {
    status: 'completed',
    completedAt: new Date(),
    error: null,
    lockedBy: null,
    lockExpiresAt: null,
  };

  if (result !== undefined) {
    updateData.result = typeof result === 'string' ? result : JSON.stringify(result);
  }

  const item = await db.queueItem.update({
    where: { id: jobId },
    data: updateData,
  });

  return toQueueItemData(item);
}

/**
 * Mark a job as failed. `attempts` was already incremented when the job was
 * claimed, so this never double-counts. When attempts remain the job is
 * re-queued with exponential backoff; otherwise it moves to the dead-letter
 * state (`status = failed`).
 */
export async function failJob(
  jobId: string,
  error: string,
  options: FailOptions = {},
): Promise<QueueItemData> {
  const existing = await db.queueItem.findUnique({ where: { id: jobId } });
  if (!existing) {
    throw new Error(`QueueItem ${jobId} not found`);
  }
  if (existing.status === 'cancelled') return toQueueItemData(existing);

  const attempts = Math.max(existing.attempts, 1);
  const isExhausted = options.fatal === true || attempts >= existing.maxAttempts;
  const backoff = options.backoffMs ?? defaultBackoffMs;

  const item = await db.queueItem.update({
    where: { id: jobId },
    data: {
      status: isExhausted ? 'failed' : 'queued',
      error: error.slice(0, 4000),
      lockedBy: null,
      lockExpiresAt: null,
      startedAt: isExhausted ? existing.startedAt : null,
      completedAt: isExhausted ? new Date() : null,
      scheduledAt: isExhausted ? existing.scheduledAt : new Date(Date.now() + backoff(attempts)),
    },
  });

  return toQueueItemData(item);
}

/**
 * Cancel a job. Queued jobs are cancelled immediately; processing jobs are
 * flagged so a cooperative handler (`ctx.isCancelled()`) can stop, and are
 * not retried afterwards. Completed/failed jobs are left untouched.
 */
export async function cancelJob(jobId: string, reason = 'cancelled'): Promise<QueueItemData | null> {
  const res = await db.queueItem.updateMany({
    where: { id: jobId, status: { in: ['queued', 'processing'] } },
    data: { status: 'cancelled', error: reason, completedAt: new Date(), lockedBy: null, lockExpiresAt: null },
  });
  if (res.count === 0) return null;
  const item = await db.queueItem.findUnique({ where: { id: jobId } });
  return item ? toQueueItemData(item) : null;
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const item = await db.queueItem.findUnique({ where: { id: jobId }, select: { status: true } });
  return item?.status === 'cancelled';
}

/**
 * Return jobs whose worker lease expired to the queue (or to the dead-letter
 * state when attempts are exhausted). Call on worker start and periodically.
 */
export async function reclaimExpiredLeases(queueName?: string): Promise<{ requeued: number; deadLettered: number }> {
  const now = new Date();
  const queueFilter = queueName
    ? { queue: { name: queueName } }
    : {};

  const expired = await db.queueItem.findMany({
    where: {
      ...queueFilter,
      status: 'processing',
      OR: [
        { lockExpiresAt: { lt: now } },
        // Legacy rows claimed before leases existed: fall back to a 10 minute startedAt heuristic.
        { lockExpiresAt: null, startedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      ],
    },
    select: { id: true, attempts: true, maxAttempts: true, lockedBy: true },
  });

  let requeued = 0;
  let deadLettered = 0;
  for (const item of expired) {
    const exhausted = item.attempts >= item.maxAttempts;
    const res = await db.queueItem.updateMany({
      where: { id: item.id, status: 'processing' },
      data: exhausted
        ? { status: 'failed', error: `worker lease expired (${item.lockedBy ?? 'unknown worker'}); attempts exhausted`, completedAt: now, lockedBy: null, lockExpiresAt: null }
        : { status: 'queued', error: `worker lease expired (${item.lockedBy ?? 'unknown worker'}); re-queued`, startedAt: null, lockedBy: null, lockExpiresAt: null, scheduledAt: now },
    });
    if (res.count > 0) {
      if (exhausted) deadLettered += 1; else requeued += 1;
    }
  }
  return { requeued, deadLettered };
}

/**
 * Get the current status of a job.
 */
export async function getJobStatus(jobId: string): Promise<QueueItemData | null> {
  const item = await db.queueItem.findUnique({ where: { id: jobId } });
  return item ? toQueueItemData(item) : null;
}

/**
 * Process pending jobs in a queue using the provided handler, up to the
 * queue's concurrency. Each job is claimed atomically with a lease that is
 * heart-beaten while the handler runs.
 */
export async function processQueue(
  queueName: string,
  handler: JobHandler,
  options: ProcessOptions = {},
): Promise<JobResult[]> {
  const queue = await db.jobQueue.findUnique({ where: { name: queueName } });
  if (!queue) throw new Error(`Queue '${queueName}' not found`);
  if (!queue.isActive) throw new Error(`Queue '${queueName}' is not active`);

  const workerId = options.workerId ?? processWorkerId;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const heartbeatMs = options.heartbeatMs ?? Math.max(1000, Math.floor(leaseMs / 3));
  const results: JobResult[] = [];
  const concurrency = Math.max(1, queue.concurrency);

  const jobs = await db.queueItem.findMany({
    where: {
      queueId: queue.id,
      status: 'queued',
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: concurrency,
  });

  await Promise.all(jobs.map(async (job) => {
    // Atomic compare-and-set prevents two workers/replicas (or overlapping
    // polls) from executing the same job concurrently.
    if (!(await claimJob(job.id, workerId, leaseMs))) {
      results.push({ id: job.id, status: 'skipped', error: 'Job already claimed by another worker' });
      return;
    }
    const claimed = await db.queueItem.findUnique({ where: { id: job.id } });
    if (!claimed) return;

    const timer = setInterval(() => {
      void heartbeat(job.id, workerId, leaseMs).catch(() => undefined);
    }, heartbeatMs);
    if (typeof timer.unref === 'function') timer.unref();

    const ctx: JobContext = {
      workerId,
      heartbeat: async () => { await heartbeat(job.id, workerId, leaseMs); },
      isCancelled: () => isJobCancelled(job.id),
    };

    try {
      const result = await handler(toQueueItemData(claimed), ctx);
      // If the job was cancelled while running, keep the cancelled state.
      const current = await db.queueItem.findUnique({ where: { id: job.id }, select: { status: true } });
      if (current?.status === 'cancelled') {
        results.push({ id: job.id, status: 'cancelled' });
        return;
      }
      const completed = await completeJob(job.id, result === undefined ? undefined : (result as Record<string, unknown>));
      results.push({
        id: completed.id,
        status: 'completed',
        result: completed.result ?? undefined,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const updated = await failJob(job.id, errorMsg, { backoffMs: options.backoffMs });
      results.push({
        id: updated.id,
        status: updated.status,
        error: errorMsg,
      });
    } finally {
      clearInterval(timer);
    }
  }));

  return results;
}

/**
 * List all failed (dead letter) jobs for a queue.
 */
export async function getDeadLetterQueue(queueName: string): Promise<QueueItemData[]> {
  const queue = await db.jobQueue.findUnique({ where: { name: queueName } });
  if (!queue) return [];

  const items = await db.queueItem.findMany({
    where: {
      queueId: queue.id,
      status: 'failed',
    },
    orderBy: { completedAt: 'desc' },
  });

  return items.map(toQueueItemData);
}

/**
 * Re-enqueue a dead letter (failed) job for retry.
 */
export async function retryDeadLetterJob(jobId: string): Promise<QueueItemData> {
  const item = await db.queueItem.findUnique({ where: { id: jobId } });
  if (!item) throw new Error(`QueueItem ${jobId} not found`);
  if (item.status !== 'failed') {
    throw new Error(`Job ${jobId} is not in the dead letter queue (status: ${item.status})`);
  }

  const updated = await db.queueItem.update({
    where: { id: jobId },
    data: {
      status: 'queued',
      attempts: 0,
      error: null,
      startedAt: null,
      completedAt: null,
      scheduledAt: null,
      lockedBy: null,
      lockExpiresAt: null,
    },
  });

  return toQueueItemData(updated);
}

/**
 * Get queue statistics: pending/completed/failed/cancelled counts.
 */
export async function getQueueStats(queueName: string): Promise<QueueStats> {
  const queue = await db.jobQueue.findUnique({ where: { name: queueName } });
  if (!queue) {
    return { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
  }

  const counts = await db.queueItem.groupBy({
    by: ['status'],
    where: { queueId: queue.id },
    _count: true,
  });

  const countMap: Record<string, number> = {};
  for (const c of counts) {
    countMap[c.status] = c._count;
  }

  const pending = countMap['queued'] ?? 0;
  const processing = countMap['processing'] ?? 0;
  const completed = countMap['completed'] ?? 0;
  const failed = countMap['failed'] ?? 0;
  const cancelled = countMap['cancelled'] ?? 0;
  const total = pending + processing + completed + failed + cancelled;

  return { pending, processing, completed, failed, cancelled, total };
}
