/**
 * Base Worker
 * ALO Labs AIOS — Abstract base class for all worker implementations.
 * Handles polling, concurrency, exponential backoff retries, and graceful shutdown.
 */

import type {
  WorkerType,
  WorkerConfig,
  WorkerEvent,
  WorkerEventData,
  WorkerEventHandler,
  WorkerHealth,
  WorkerJob,
} from './types';
import { DEFAULT_WORKER_CONFIG } from './types';
import type { JobQueue } from './queue';

// ──────────────────────────────────────────────────────────────────────────────
// BaseWorker
// ──────────────────────────────────────────────────────────────────────────────

export abstract class BaseWorker {
  protected readonly type: WorkerType;
  protected readonly config: WorkerConfig;
  protected queue: JobQueue | null = null;
  protected pollTimer: ReturnType<typeof setTimeout> | null = null;
  protected runningCount = 0;
  protected _status: WorkerHealth['status'] = 'stopped';
  protected startedAt = 0;
  protected jobsProcessed = 0;
  protected jobsFailed = 0;
  protected totalLatency = 0;

  private eventHandlers = new Map<WorkerEvent, Set<WorkerEventHandler>>();
  private shutdownResolvers: Array<() => void> = [];
  private sigtermHandler: (() => void) | null = null;
  private sigintHandler: (() => void) | null = null;

  constructor(type: WorkerType, config?: Partial<WorkerConfig>) {
    this.type = type;
    this.config = {
      ...DEFAULT_WORKER_CONFIG,
      ...config,
    };
  }

  // ── Abstract ──────────────────────────────────────────────────────────────

  /** Subclasses must implement the actual job processing logic. */
  abstract process(job: WorkerJob): Promise<Record<string, unknown>>;

  // ── Queue Binding ─────────────────────────────────────────────────────────

  connectQueue(queue: JobQueue): void {
    this.queue = queue;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the polling loop and register signal handlers. */
  start(): void {
    if (this._status === 'running') return;

    this._status = 'running';
    this.startedAt = Date.now();

    this.emitEvent('worker:ready', { workerType: this.type });

    this._poll();

    this.sigtermHandler = () => this.stop();
    this.sigintHandler = () => this.stop();
    process.on('SIGTERM', this.sigtermHandler);
    process.on('SIGINT', this.sigintHandler);
  }

  /** Graceful shutdown — waits for in-flight jobs, then resolves. */
  async stop(): Promise<void> {
    if (this._status === 'stopping' || this._status === 'stopped') {
      return this._awaitShutdown();
    }

    this._status = 'stopping';

    // Stop polling
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Remove signal handlers
    if (this.sigtermHandler) {
      process.off('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }
    if (this.sigintHandler) {
      process.off('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }

    // Wait for in-flight jobs
    await this._awaitInFlight();

    this._status = 'stopped';

    // Resolve all pending stop() callers
    const resolvers = this.shutdownResolvers;
    this.shutdownResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  private _awaitInFlight(): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = (): void => {
        if (this.runningCount === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private _awaitShutdown(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this._status === 'stopped') {
        resolve();
      } else {
        this.shutdownResolvers.push(resolve);
      }
    });
  }

  // ── Event Subscription ────────────────────────────────────────────────────

  onEvent(event: WorkerEvent, handler: WorkerEventHandler): void {
    let set = this.eventHandlers.get(event);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(event, set);
    }
    set.add(handler);
  }

  offEvent(event: WorkerEvent, handler: WorkerEventHandler): void {
    const set = this.eventHandlers.get(event);
    if (set) set.delete(handler);
  }

  protected emitEvent(event: WorkerEvent, data: WorkerEventData): void {
    const set = this.eventHandlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        // Handler errors must not break the worker loop
      }
    }
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  health(): WorkerHealth {
    const mem = process.memoryUsage();
    return {
      workerType: this.type,
      status: this._status,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      avgLatency: this.jobsProcessed > 0 ? this.totalLatency / this.jobsProcessed : 0,
      uptime: this.startedAt > 0 ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      memoryUsage: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
    };
  }

  // ── Polling Loop ──────────────────────────────────────────────────────────

  protected _poll(): void {
    if (this._status !== 'running') return;

    this._pollLoop()
      .catch(() => {
        // Errors are handled inside the loop
      })
      .finally(() => {
        if (this._status === 'running') {
          this.pollTimer = setTimeout(() => this._poll(), this.config.pollInterval);
        }
      });
  }

  private async _pollLoop(): Promise<void> {
    if (!this.queue) return;
    if (this.queue.isPaused(this.type)) return;

    const remaining = this.config.concurrency - this.runningCount;
    if (remaining <= 0) return;

    const batch = Math.min(this.config.batchSize, remaining);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < batch; i++) {
      promises.push(this._tryDequeueAndExecute());
    }
    await Promise.allSettled(promises);
  }

  private async _tryDequeueAndExecute(): Promise<void> {
    if (!this.queue) return;

    const job = await this.queue.dequeue(this.type);
    if (!job) return;

    this.runningCount++;
    try {
      await this._executeJob(job);
    } finally {
      this.runningCount--;
    }
  }

  // ── Job Execution ─────────────────────────────────────────────────────────

  protected async _executeJob(job: WorkerJob): Promise<void> {
    const startMs = Date.now();

    try {
      const result = await this.process(job);
      const latency = Date.now() - startMs;

      this.jobsProcessed++;
      this.totalLatency += latency;

      if (this.queue) {
        this.queue.complete(job.id, result);
      }
      this.emitEvent('job:completed', { job, latency, workerType: this.type });
    } catch (err: unknown) {
      await this._handleError(job, err);
    }
  }

  // ── Error Handling ────────────────────────────────────────────────────────

  protected async _handleError(job: WorkerJob, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    job.error = message;

    if (job.attempts < job.maxAttempts - 1) {
      // Still has retries remaining
      this._scheduleRetry(job);
    } else {
      // Exhausted
      this.jobsFailed++;
      if (this.queue) {
        this.queue.fail(job.id, message);
      }
      this.emitEvent('job:failed', { job, error: message, workerType: this.type });
    }
  }

  // ── Retry Scheduling ──────────────────────────────────────────────────────

  protected _scheduleRetry(job: WorkerJob): void {
    if (!this.queue) return;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (capped)
    const backoffMs = Math.min(
      this.config.retryDelay * Math.pow(2, job.attempts),
      32_000,
    );

    job.runAt = Date.now() + backoffMs;
    this.queue.retry(job.id);

    this.emitEvent('job:retrying', {
      job,
      error: job.error,
      workerType: job.type,
    });
  }
}