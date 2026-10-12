/**
 * Worker System Types
 * ALO Labs AIOS — Background Worker Type Definitions
 */

// ──────────────────────────────────────────────────────────────────────────────
// Core Job Types
// ──────────────────────────────────────────────────────────────────────────────

export type WorkerType = 'ai' | 'email' | 'social' | 'notification' | 'backup' | 'media' | 'custom';

export type WorkerJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export interface WorkerJob {
  id: string;
  type: WorkerType;
  payload: Record<string, unknown>;
  status: WorkerJobStatus;
  priority: number; // 1-10, higher = more important
  attempts: number;
  maxAttempts: number;
  runAt?: number;        // Unix ms — when the job becomes eligible
  startedAt?: number;    // Unix ms — when the job started processing
  completedAt?: number;  // Unix ms — when the job finished
  error?: string;
  result?: Record<string, unknown>;
  createdAt: number;     // Unix ms
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

export interface WorkerConfig {
  concurrency: number;
  retryDelay: number;     // base delay in ms before first retry
  maxRetries: number;
  pollInterval: number;   // ms between poll cycles
  batchSize: number;      // max jobs to dequeue per poll
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  concurrency: 5,
  retryDelay: 1000,
  maxRetries: 5,
  pollInterval: 2000,
  batchSize: 10,
};

// ──────────────────────────────────────────────────────────────────────────────
// Health
// ──────────────────────────────────────────────────────────────────────────────

export interface WorkerHealth {
  workerType: WorkerType;
  status: 'idle' | 'running' | 'paused' | 'stopping' | 'stopped' | 'error';
  jobsProcessed: number;
  jobsFailed: number;
  avgLatency: number;   // ms
  uptime: number;        // seconds
  memoryUsage: {
    rss: number;         // bytes
    heapUsed: number;    // bytes
    heapTotal: number;   // bytes
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Events
// ──────────────────────────────────────────────────────────────────────────────

export type WorkerEvent =
  | 'job:started'
  | 'job:completed'
  | 'job:failed'
  | 'job:retrying'
  | 'worker:ready'
  | 'worker:error';

export interface WorkerEventData {
  job?: WorkerJob;
  error?: string;
  workerType?: WorkerType;
  latency?: number;
}

export type WorkerEventHandler = (data: WorkerEventData) => void;

// ──────────────────────────────────────────────────────────────────────────────
// Cron / Scheduled Jobs
// ──────────────────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  handler: string;
  enabled: boolean;
  lastRun?: number;  // Unix ms
  nextRun?: number;  // Unix ms
}

// ──────────────────────────────────────────────────────────────────────────────
// Enqueue Options
// ──────────────────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  priority?: number;    // 1-10, default 5
  delay?: number;       // ms to wait before job becomes eligible
  maxRetries?: number;  // default 5
}

// ──────────────────────────────────────────────────────────────────────────────
// Queue Statistics
// ──────────────────────────────────────────────────────────────────────────────

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  byType: Map<WorkerType, number>;
}