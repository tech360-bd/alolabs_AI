/**
 * Cron Job Scheduler — P8
 * ALO Labs AISMH
 *
 * Simple in-process cron scheduler using setInterval with
 * cron expression parsing. No external dependencies.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CronJob {
  name: string;
  schedule: string;
  handler: () => Promise<unknown>;
  /** NodeJS.Timer or null when stopped */
  timer: ReturnType<typeof setInterval> | null;
  /** Computed interval in ms */
  intervalMs: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}

// ─── Cron Expression Parser ───────────────────────────────────────────────────

/*
 * Parse a simple cron expression and return the interval in milliseconds.
 * Supports 5-field (min hour dom month dow) and 6-field (sec ...) expressions.
 *
 * Returns the interval in ms, or throws if unsupported.
 */
export function parseCronToInterval(cron: string): number {
  const parts = cron.trim().split(/\s+/);

  // 6-field: sec min hour dom month dow
  if (parts.length === 6) {
    // Every N seconds: `*/N * * * * *`
    const secMatch = parts[0].match(/^\*\/(\d+)$/);
    if (secMatch && parts[1] === '*' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*' && parts[5] === '*') {
      return parseInt(secMatch[1], 10) * 1000;
    }
    throw new Error(`Unsupported 6-field cron expression: ${cron}`);
  }

  // 5-field: min hour dom month dow
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression (expected 5 or 6 fields): ${cron}`);
  }

  const [min, hour, dom, month, dow] = parts;

  // Every N minutes: `*/N * * * *`
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return parseInt(minStep[1], 10) * 60 * 1000;
  }

  // Every hour: `0 * * * *`
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 60 * 60 * 1000;
  }

  // Every hour at minute N: `N * * * *`
  const fixedMin = min.match(/^(\d+)$/);
  if (fixedMin && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 60 * 60 * 1000;
  }

  // Every minute: `* * * * *`
  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 60 * 1000;
  }

  // Specific schedule — compute ms until next occurrence, then use 1h interval
  // (simplified: treat as 1-hour interval)
  if (dom === '*' && month === '*' && dow === '*') {
    return 60 * 60 * 1000;
  }

  throw new Error(`Unsupported cron expression: ${cron}`);
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, CronJob>();

/**
 * Register a cron job. Does NOT start it automatically.
 */
export function scheduleJob(
  name: string,
  schedule: string,
  handler: () => Promise<unknown>,
): CronJob {
 const intervalMs = parseCronToInterval(schedule);
  const job: CronJob = {
    name,
    schedule,
    handler,
    timer: null,
    intervalMs,
    lastRunAt: null,
    nextRunAt: null,
  };
  registry.set(name, job);
  return job;
}

/**
 * Manually trigger a registered cron job by name.
 * Returns whatever the handler returns.
 */
export async function runJob(name: string): Promise<unknown> {
  const job = registry.get(name);
  if (!job) {
    throw new Error(`Cron job '${name}' is not registered`);
  }

  const startTime = Date.now();
  try {
    const result = await job.handler();
    job.lastRunAt = new Date(startTime);
    job.nextRunAt = new Date(Date.now() + job.intervalMs);
    return { success: true, result, durationMs: Date.now() - startTime };
  } catch (error) {
    job.lastRunAt = new Date(startTime);
    job.nextRunAt = new Date(Date.now() + job.intervalMs);
    throw error;
  }
}

/**
 * List all registered cron jobs (without timers).
 */
export function listJobs(): Omit<CronJob, 'handler' | 'timer'>[] {
  return Array.from(registry.values()).map((job) => ({
    name: job.name,
    schedule: job.schedule,
    intervalMs: job.intervalMs,
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
  }));
}

/**
 * Start all registered cron jobs.
 */
export function startAll(): void {
  for (const job of registry.values()) {
    if (job.timer) continue; // already running

    job.nextRunAt = new Date(Date.now() + job.intervalMs);

    job.timer = setInterval(async () => {
      job.lastRunAt = new Date();
      job.nextRunAt = new Date(Date.now() + job.intervalMs);
      try {
        await job.handler();
      } catch (error) {
        console.error(`[cron] Job '${job.name}' failed:`, error);
      }
    }, job.intervalMs);

    // Prevent the interval from keeping the process alive in some environments
    if (job.timer && typeof job.timer === 'object' && 'unref' in job.timer) {
      (job.timer as unknown as { unref: () => void }).unref();
    }
  }
}

/**
 * Stop all cron jobs.
 */
export function stopAll(): void {
  for (const job of registry.values()) {
    if (job.timer) {
      clearInterval(job.timer);
      job.timer = null;
      job.nextRunAt = null;
    }
  }
}

// ─── Pre-registered Jobs ──────────────────────────────────────────────────────

scheduleJob(
  'session-cleanup',
  '*/15 * * * *',
  async () => {
    const { runSessionCleanup } = await import('./session-cleanup');
    return runSessionCleanup();
  },
);

scheduleJob(
  'usage-aggregation',
  '0 * * * *',
  async () => {
    const { db } = await import('./db');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [apiCallCount, documentsIndexed, workerNodes] = await Promise.all([
      db.usageLog.count({
        where: { createdAt: { gte: oneHourAgo } },
      }).catch(() => 0),
      db.ragDocument.count({
        where: { status: 'indexed', indexedAt: { gte: oneHourAgo } },
      }).catch(() => 0),
      db.workerNode.findMany({
        select: { id: true, status: true, activeJobs: true },
      }).catch(() => []),
    ]);

    await db.metric.create({
      data: {
        name: 'usage-hourly-api-calls',
        value: apiCallCount,
        labels: JSON.stringify({ period: '1h' }),
      },
    }).catch(() => {});

    return { aggregated: true, apiCallCount, documentsIndexed, workerCount: workerNodes.length, timestamp: new Date().toISOString() };
  },
);

scheduleJob(
  'health-check',
  '*/5 * * * *',
  async () => {
    const { db } = await import('./db');
    const services = await db.infraService.findMany({
      select: { type: true, host: true, port: true, status: true },
    });

    const results: Record<string, { status: string; latencyMs: number; error?: string }> = {};

    await Promise.all(services.map(async (svc) => {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`http://${svc.host}:${svc.port}/healthz`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const latencyMs = Date.now() - startTime;
        results[svc.type] = { status: res.ok ? 'connected' : 'error', latencyMs };

        await db.infraService.update({
          where: { type: svc.type },
          data: {
            status: res.ok ? 'connected' : 'error',
            lastPingAt: new Date(),
            latencyMs,
            ...(res.ok ? { errorCount: 0, lastError: null } : {}),
          },
        }).catch(() => {});
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        results[svc.type] = { status: 'error', latencyMs: Date.now() - startTime, error };

        await db.infraService.update({
          where: { type: svc.type },
          data: {
            status: 'error',
            lastError: error,
            errorCount: { increment: 1 },
            lastPingAt: new Date(),
          },
        }).catch(() => {});
      }
    }));

    const allHealthy = Object.values(results).every((r) => r.status === 'connected');
    return { healthy: allHealthy, services: results, serviceCount: services.length, timestamp: new Date().toISOString() };
  },
);

scheduleJob(
  'notification-cleanup',
  '*/30 * * * *',
  async () => {
    const { db } = await import('./db');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await db.notification.deleteMany({
      where: {
        read: true,
        readAt: { not: null, lte: thirtyDaysAgo },
      },
    }).catch(() => ({ count: 0 }));
    return { cleaned: deleted.count, timestamp: new Date().toISOString() };
  },
);
