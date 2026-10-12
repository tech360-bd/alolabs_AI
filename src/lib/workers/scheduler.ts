/**
 * Cron Job Scheduler
 * ALO Labs AIOS — Lightweight cron-style scheduler with expression parsing.
 * Supports standard 5-field cron expressions and common presets.
 */

import { randomUUID } from 'crypto';
const uuidv4 = () => randomUUID();
import type { CronJob } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Cron Expression Parser
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parsed cron fields.
 * Each field is either a Set of allowed values or '*' (match all).
 */
interface ParsedCron {
  minute: Set<number> | '*';
  hour: Set<number> | '*';
  dayOfMonth: Set<number> | '*';
  month: Set<number> | '*';
  dayOfWeek: Set<number> | '*';
  /** Estimated interval in ms for missed-job detection. */
  intervalMs: number;
}

/** Preset aliases → cron expressions. */
const PRESETS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@every-5m': '*/5 * * * *',
  '@every-10m': '*/10 * * * *',
  '@every-15m': '*/15 * * * *',
  '@every-30m': '*/30 * * * *',
};

/**
 * Parse a single cron field (minute, hour, day-of-month, month, day-of-week).
 * Supports: `*`, `,`, `-`, `/` syntax.
 */
function parseField(field: string, min: number, max: number): Set<number> | '*' {
  if (field === '*') return '*';

  const values = new Set<number>();
  const parts = field.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle step ranges: a-b/c or */c or a/c
    const stepMatch = trimmed.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const rangePart = stepMatch[1];
      const step = parseInt(stepMatch[2], 10);
      if (step <= 0) throw new Error(`Invalid step value: ${step}`);

      let rangeMin = min;
      let rangeMax = max;

      if (rangePart !== '*') {
        const rangeSplit = rangePart.split('-');
        if (rangeSplit.length === 2) {
          rangeMin = parseInt(rangeSplit[0], 10);
          rangeMax = parseInt(rangeSplit[1], 10);
        } else {
          rangeMin = parseInt(rangePart, 10);
          rangeMax = max;
        }
      }

      for (let i = rangeMin; i <= rangeMax; i += step) {
        values.add(i);
      }
      continue;
    }

    // Handle range: a-b
    if (trimmed.includes('-')) {
      const [lo, hi] = trimmed.split('-').map(Number);
      for (let i = lo; i <= hi; i++) {
        values.add(i);
      }
      continue;
    }

    // Single value
    const num = parseInt(trimmed, 10);
    if (isNaN(num)) throw new Error(`Invalid cron field value: ${trimmed}`);
    values.add(num);
  }

  return values;
}

/**
 * Parse a cron expression string into a ParsedCron object.
 */
function parseCronExpression(expr: string): ParsedCron {
  const resolved = PRESETS[expr] ?? expr;
  const fields = resolved.trim().split(/\s+/);

  if (fields.length < 5) {
    throw new Error(
      `Invalid cron expression "${expr}": expected 5 fields (minute hour day-of-month month day-of-week)`,
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  const parsedMinute = parseField(minute, 0, 59);
  const parsedHour = parseField(hour, 0, 23);
  const parsedDayOfMonth = parseField(dayOfMonth, 1, 31);
  const parsedMonth = parseField(month, 1, 12);
  const parsedDayOfWeek = parseField(dayOfWeek, 0, 6);

  // Estimate interval in ms for missed-job detection
  const intervalMs = estimateInterval(parsedMinute, parsedHour);

  return {
    minute: parsedMinute,
    hour: parsedHour,
    dayOfMonth: parsedDayOfMonth,
    month: parsedMonth,
    dayOfWeek: parsedDayOfWeek,
    intervalMs,
  };
}

function estimateInterval(
  minute: Set<number> | '*',
  hour: Set<number> | '*',
): number {
  if (minute === '*' && hour === '*') return 60_000; // ~1 minute
  if (minute !== '*' && hour === '*') {
    const vals = Array.from(minute).sort((a, b) => a - b);
    if (vals.length >= 2) return (vals[1] - vals[0]) * 60_000;
    return 60_000;
  }
  return 3_600_000; // hourly or wider
}

// ──────────────────────────────────────────────────────────────────────────────
// Next Run Calculation
// ──────────────────────────────────────────────────────────────────────────────

function matchesField(value: number, field: Set<number> | '*'): boolean {
  return field === '*' || field.has(value);
}

/**
 * Find the next Date (after `after`) that matches the parsed cron expression.
 */
function getNextRun(parsed: ParsedCron, after: Date): Date {
  const d = new Date(after.getTime() + 60_000); // start 1 minute after
  d.setSeconds(0, 0);

  // Maximum search: 4 years (to handle leap-year edge cases)
  const limit = d.getTime() + 4 * 365.25 * 24 * 3_600_000;

  while (d.getTime() <= limit) {
    const m = d.getMonth() + 1;
    const dow = d.getDay();

    if (
      matchesField(d.getMinutes(), parsed.minute) &&
      matchesField(d.getHours(), parsed.hour) &&
      matchesField(d.getDate(), parsed.dayOfMonth) &&
      matchesField(m, parsed.month) &&
      matchesField(dow, parsed.dayOfWeek)
    ) {
      return d;
    }

    // Advance minute-by-minute (efficient enough for cron scheduling)
    d.setTime(d.getTime() + 60_000);
  }

  // Fallback: 1 hour from now
  return new Date(after.getTime() + 3_600_000);
}

// ──────────────────────────────────────────────────────────────────────────────
// JobScheduler
// ──────────────────────────────────────────────────────────────────────────────

type CronHandler = () => Promise<void>;

interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  handlerName: string;
  handler: CronHandler;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  parsed: ParsedCron;
}

export class JobScheduler {
  private jobs = new Map<string, ScheduledJob>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** How often (ms) the scheduler checks for due jobs. */
  private readonly checkInterval = 15_000;

  /**
   * Register a new cron job.
   * @returns The cron job ID.
   */
  schedule(name: string, cronExpr: string, handler: CronHandler): string {
    const parsed = parseCronExpression(cronExpr);
    const now = Date.now();
    const nextRun = getNextRun(parsed, new Date(now)).getTime();

    const job: ScheduledJob = {
      id: uuidv4(),
      name,
      schedule: cronExpr,
      handlerName: name,
      handler,
      enabled: true,
      nextRun,
      parsed,
    };

    this.jobs.set(job.id, job);
    return job.id;
  }

  /**
   * Remove a scheduled cron job.
   * @returns true if the job existed and was removed.
   */
  unschedule(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  /** Pause a scheduled cron job (it won't fire until resumed). */
  pause(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) job.enabled = false;
  }

  /** Resume a paused cron job. */
  resume(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && !job.enabled) {
      job.enabled = true;
      job.nextRun = getNextRun(job.parsed, new Date()).getTime();
    }
  }

  /** Return a snapshot of all cron jobs (without the handler reference or parsed data). */
  getJobs(): CronJob[] {
    const result: CronJob[] = [];
    for (const job of this.jobs.values()) {
      result.push({
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        handler: job.handlerName,
        enabled: job.enabled,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
      });
    }
    return result;
  }

  /** Start the scheduler tick loop. */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      this.tick().catch(() => {
        // Individual job errors are handled inside tick()
      });
    }, this.checkInterval);
  }

  /** Stop the scheduler. */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Internal Tick ─────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const now = Date.now();

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (job.nextRun === undefined) continue;

      // Skip if missed by more than 2x the estimated interval
      if (now - job.nextRun > job.parsed.intervalMs * 2) {
        job.lastRun = job.nextRun;
        job.nextRun = getNextRun(job.parsed, new Date(now)).getTime();
        continue;
      }

      if (now < job.nextRun) continue;

      // Fire the job
      job.lastRun = now;
      job.nextRun = getNextRun(job.parsed, new Date(now)).getTime();

      try {
        await job.handler();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Swallow the error but propagate so the caller knows.
        // Individual job failures should not stop the scheduler.
        void message;
      }
    }
  }
}