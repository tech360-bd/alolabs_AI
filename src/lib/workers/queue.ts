/**
 * Job Queue
 * ALO Labs AIOS — In-memory priority queue with event emission.
 * Jobs are ordered by priority (descending) then FIFO.
 * Supports delayed jobs, expiration, pause/resume, and callback-based events.
 */

import { randomUUID } from 'crypto';
const uuidv4 = () => randomUUID();
import type {
  WorkerJob,
  WorkerType,
  WorkerEvent,
  WorkerEventData,
  WorkerEventHandler,
  EnqueueOptions,
  QueueStats,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Event Emitter Helpers
// ──────────────────────────────────────────────────────────────────────────────

type EventMap = Partial<Record<WorkerEvent, Set<WorkerEventHandler>>>;

function createEventMap(): EventMap {
  const map: Record<string, Set<WorkerEventHandler>> = {};
  const events: WorkerEvent[] = [
    'job:started',
    'job:completed',
    'job:failed',
    'job:retrying',
    'worker:ready',
    'worker:error',
  ];
  for (const e of events) {
    map[e] = new Set();
  }
  return map as EventMap;
}

// ──────────────────────────────────────────────────────────────────────────────
// Job Expiration
// ──────────────────────────────────────────────────────────────────────────────

/** Default TTL for completed/failed jobs before they can be cleared: 1 hour */
const DEFAULT_COMPLETED_TTL_MS = 3_600_000;

// ──────────────────────────────────────────────────────────────────────────────
// JobQueue
// ──────────────────────────────────────────────────────────────────────────────

export class JobQueue {
  private jobs = new Map<string, WorkerJob>();
  private events: EventMap;
  private paused = new Set<WorkerType>();

  constructor() {
    this.events = createEventMap();
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  on(event: WorkerEvent, handler: WorkerEventHandler): void {
    const set = this.events[event];
    if (set) set.add(handler);
  }

  off(event: WorkerEvent, handler: WorkerEventHandler): void {
    const set = this.events[event];
    if (set) set.delete(handler);
  }

  private emit(event: WorkerEvent, data: WorkerEventData): void {
    const set = this.events[event];
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        // Handler errors must not break the queue
      }
    }
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────

  enqueue(
    type: WorkerType,
    payload: Record<string, unknown>,
    options?: EnqueueOptions,
  ): Promise<string> {
    const now = Date.now();
    const priority = Math.max(1, Math.min(10, options?.priority ?? 5));
    const maxRetries = options?.maxRetries ?? 5;
    const delay = options?.delay ?? 0;

    const job: WorkerJob = {
      id: uuidv4(),
      type,
      payload,
      status: 'pending',
      priority,
      attempts: 0,
      maxAttempts: maxRetries + 1, // first attempt + retries
      runAt: delay > 0 ? now + delay : undefined,
      createdAt: now,
    };

    this.jobs.set(job.id, job);
    return Promise.resolve(job.id);
  }

  // ── Dequeue ───────────────────────────────────────────────────────────────

  dequeue(workerType: WorkerType): Promise<WorkerJob | null> {
    if (this.paused.has(workerType)) {
      return Promise.resolve(null);
    }

    const now = Date.now();
    let best: WorkerJob | null = null;

    for (const job of this.jobs.values()) {
      if (job.type !== workerType) continue;
      if (job.status !== 'pending') continue;

      // Skip delayed jobs that haven't reached their runAt time
      if (job.runAt !== undefined && job.runAt > now) continue;

      // Priority ordering: higher priority first, then FIFO (earlier createdAt)
      if (
        !best ||
        job.priority > best.priority ||
        (job.priority === best.priority && job.createdAt < best.createdAt)
      ) {
        best = job;
      }
    }

    if (!best) {
      return Promise.resolve(null);
    }

    best.status = 'running';
    best.startedAt = now;
    this.emit('job:started', { job: best, workerType });
    return Promise.resolve(best);
  }

  // ── Complete ──────────────────────────────────────────────────────────────

  complete(jobId: string, result?: Record<string, unknown>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.completedAt = Date.now();
    job.result = result;

    const latency = job.startedAt ? job.completedAt - job.startedAt : 0;
    this.emit('job:completed', { job, latency, workerType: job.type });
  }

  // ── Fail ──────────────────────────────────────────────────────────────────

  fail(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = error;

    this.emit('job:failed', { job, error, workerType: job.type });
  }

  // ── Retry ─────────────────────────────────────────────────────────────────

  retry(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'retrying';
    job.attempts += 1;

    if (job.attempts >= job.maxAttempts) {
      // Exhausted all retries — mark as failed
      job.status = 'failed';
      job.completedAt = Date.now();
      job.error = job.error ?? 'Max retry attempts exhausted';
      this.emit('job:failed', { job, error: job.error, workerType: job.type });
      return;
    }

    // Schedule next run with exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
    const backoffMs = Math.min(1000 * Math.pow(2, job.attempts - 1), 32_000);
    job.runAt = Date.now() + backoffMs;
    job.status = 'pending';

    this.emit('job:retrying', {
      job,
      error: job.error,
      workerType: job.type,
    });
  }

  // ── Get Job ───────────────────────────────────────────────────────────────

  getJob(jobId: string): WorkerJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  // ── Get Pending Jobs ──────────────────────────────────────────────────────

  getPending(workerType: WorkerType, limit = 50): WorkerJob[] {
    const now = Date.now();
    const pending: WorkerJob[] = [];

    for (const job of this.jobs.values()) {
      if (job.type !== workerType) continue;
      if (job.status !== 'pending') continue;
      if (job.runAt !== undefined && job.runAt > now) continue;

      pending.push(job);
      if (pending.length >= limit) break;
    }

    // Sort: higher priority first, then earlier createdAt
    pending.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

    return pending;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): QueueStats {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    const byType = new Map<WorkerType, number>();

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case 'pending':
        case 'retrying':
          pending++;
          break;
        case 'running':
          running++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }

      byType.set(job.type, (byType.get(job.type) ?? 0) + 1);
    }

    return { pending, running, completed, failed, byType };
  }

  // ── Clear Completed ───────────────────────────────────────────────────────

  clearCompleted(maxAge = DEFAULT_COMPLETED_TTL_MS): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt !== undefined &&
        job.completedAt <= cutoff
      ) {
        this.jobs.delete(id);
        removed++;
      }
    }

    return removed;
  }

  // ── Pause / Resume ────────────────────────────────────────────────────────

  pause(workerType?: WorkerType): void {
    if (workerType) {
      this.paused.add(workerType);
    } else {
      const allTypes: WorkerType[] = ['ai', 'email', 'social', 'notification', 'backup', 'media', 'custom'];
      for (const t of allTypes) {
        this.paused.add(t);
      }
    }
  }

  resume(workerType?: WorkerType): void {
    if (workerType) {
      this.paused.delete(workerType);
    } else {
      this.paused.clear();
    }
  }

  isPaused(workerType: WorkerType): boolean {
    return this.paused.has(workerType);
  }

  // ── Size ──────────────────────────────────────────────────────────────────

  get size(): number {
    return this.jobs.size;
  }
}