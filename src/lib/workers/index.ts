/**
 * Worker System — Public API
 * ALO Labs AIOS — Exports all worker classes, types, and the WorkerManager.
 */

// Types
export type {
  WorkerJob,
  WorkerType,
  WorkerJobStatus,
  WorkerConfig,
  WorkerHealth,
  WorkerEvent,
  WorkerEventData,
  WorkerEventHandler,
  CronJob,
  EnqueueOptions,
  QueueStats,
} from './types';

export { DEFAULT_WORKER_CONFIG } from './types';

// Queue
export { JobQueue } from './queue';

// Base Worker
export { BaseWorker } from './worker';

// Scheduler
export { JobScheduler } from './scheduler';

// Handlers
export {
  AIWorker,
  EmailWorker,
  SocialWorker,
  NotificationWorker,
  BackupWorker,
  MediaWorker,
  CustomWorker,
  createWorker,
} from './handlers';
export type { WorkerClassMap } from './handlers';

// ──────────────────────────────────────────────────────────────────────────────
// WorkerManager
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkerType, WorkerConfig, WorkerHealth } from './types';
import { JobQueue } from './queue';
import { JobScheduler } from './scheduler';
import { createWorker } from './handlers';
import type { BaseWorker } from './worker';

/** Per-worker-type configuration overrides. */
type WorkerConfigs = Partial<Record<WorkerType, Partial<WorkerConfig>>>;

export class WorkerManager {
  readonly queue: JobQueue;
  readonly scheduler: JobScheduler;
  private workers = new Map<WorkerType, BaseWorker>();
  private configs: WorkerConfigs;
  private started = false;

  constructor(configs?: WorkerConfigs) {
    this.queue = new JobQueue();
    this.scheduler = new JobScheduler();
    this.configs = configs ?? {};
  }

  /**
   * Initialize a single worker by type. If already initialized, returns the
   * existing instance.
   */
  initWorker(type: WorkerType): BaseWorker {
    const existing = this.workers.get(type);
    if (existing) return existing;

    const worker = createWorker(type, this.configs[type]);
    worker.connectQueue(this.queue);
    this.workers.set(type, worker);
    return worker;
  }

  /**
   * Initialize all built-in worker types.
   */
  initAll(): void {
    const types: WorkerType[] = [
      'ai',
      'email',
      'social',
      'notification',
      'backup',
      'media',
      'custom',
    ];
    for (const t of types) {
      this.initWorker(t);
    }
  }

  /**
   * Start all initialized workers, the scheduler, and default cron jobs.
   */
  startAll(): void {
    if (this.started) return;
    this.started = true;

    // Start all workers
    for (const worker of this.workers.values()) {
      worker.start();
    }

    // Start the scheduler
    this.scheduler.start();

    // Default cron: health check every 5 minutes
    this.scheduler.schedule(
      'worker-health-check',
      '@every-5m',
      async () => {
        const health = this.healthAll();
        // Health data is available for external consumers (monitoring, etc.)
        void health;
      },
    );

    // Default cron: metrics collection every 1 minute
    this.scheduler.schedule(
      'metrics-collection',
      '@every-1m',
      async () => {
        const stats = this.queue.getStats();
        // Stats data available for external consumers
        void stats;
      },
    );
  }

  /**
   * Gracefully stop all workers and the scheduler.
   */
  async stopAll(): Promise<void> {
    this.started = false;

    this.scheduler.stop();

    const stops: Promise<void>[] = [];
    for (const worker of this.workers.values()) {
      stops.push(worker.stop());
    }
    await Promise.allSettled(stops);
  }

  /**
   * Collect health from all initialized workers.
   */
  healthAll(): WorkerHealth[] {
    const results: WorkerHealth[] = [];
    for (const worker of this.workers.values()) {
      results.push(worker.health());
    }
    return results;
  }

  /**
   * Get a specific worker by type (must be initialized first).
   */
  getWorker(type: WorkerType): BaseWorker | undefined {
    return this.workers.get(type);
  }

  /**
   * Get the current queue stats.
   */
  getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Get all scheduled cron jobs.
   */
  getScheduledJobs() {
    return this.scheduler.getJobs();
  }
}