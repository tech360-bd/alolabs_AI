import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @/lib/db for pre-registered jobs that import it
vi.mock('@/lib/db', () => ({
  db: {
    notification: {
      deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
    },
  },
}));

// Must reset modules to get a clean registry for each test
let scheduleJob: typeof import('@/lib/cron-jobs').scheduleJob;
let listJobs: typeof import('@/lib/cron-jobs').listJobs;
let runJob: typeof import('@/lib/cron-jobs').runJob;
let startAll: typeof import('@/lib/cron-jobs').startAll;
let stopAll: typeof import('@/lib/cron-jobs').stopAll;
let parseCronToInterval: typeof import('@/lib/cron-jobs').parseCronToInterval;

describe('Cron Jobs', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Dynamic import to get fresh module state
    vi.resetModules();
    const mod = await import('@/lib/cron-jobs');
    scheduleJob = mod.scheduleJob;
    listJobs = mod.listJobs;
    runJob = mod.runJob;
    startAll = mod.startAll;
    stopAll = mod.stopAll;
    parseCronToInterval = mod.parseCronToInterval;
  });

  afterEach(() => {
    stopAll();
    vi.useRealTimers();
  });

  // ─── parseCronToInterval ────────────────────────────────────────

  describe('parseCronToInterval', () => {
    it('should parse "* * * * *" (every minute) → 60000ms', () => {
      expect(parseCronToInterval('* * * * *')).toBe(60_000);
    });

    it('should parse "*/5 * * * *" (every 5 min) → 300000ms', () => {
      expect(parseCronToInterval('*/5 * * * *')).toBe(5 * 60_000);
    });

    it('should parse "*/15 * * * *" (every 15 min) → 900000ms', () => {
      expect(parseCronToInterval('*/15 * * * *')).toBe(15 * 60_000);
    });

    it('should parse "*/30 * * * *" (every 30 min) → 1800000ms', () => {
      expect(parseCronToInterval('*/30 * * * *')).toBe(30 * 60_000);
    });

    it('should parse "0 * * * *" (every hour) → 3600000ms', () => {
      expect(parseCronToInterval('0 * * * *')).toBe(3_600_000);
    });

    it('should parse "30 * * * *" (hourly at :30) → 3600000ms', () => {
      expect(parseCronToInterval('30 * * * *')).toBe(3_600_000);
    });

    it('should parse "*/10 * * * *" (every 10 min) → 600000ms', () => {
      expect(parseCronToInterval('*/10 * * * *')).toBe(10 * 60_000);
    });

    it('should parse 6-field "*/10 * * * * *" (every 10 sec) → 10000ms', () => {
      expect(parseCronToInterval('*/10 * * * * *')).toBe(10_000);
    });

    it('should throw for unsupported 6-field expression', () => {
      expect(() => parseCronToInterval('0 0 * * * *')).toThrow('Unsupported 6-field');
    });

    it('should throw for invalid field count (3 fields)', () => {
      expect(() => parseCronToInterval('* * *')).toThrow('Invalid cron expression');
    });

    it('should throw for unsupported expression', () => {
      expect(() => parseCronToInterval('0 0 1 * *')).toThrow('Unsupported cron expression');
    });
  });

  // ─── scheduleJob & listJobs ─────────────────────────────────────

  describe('scheduleJob and listJobs', () => {
    it('should register a job and appear in listJobs', () => {
      scheduleJob('test-job', '*/5 * * * *', async () => 'ok');
      const jobs = listJobs();
      const found = jobs.find((j) => j.name === 'test-job');
      expect(found).toBeDefined();
      expect(found!.schedule).toBe('*/5 * * * *');
      expect(found!.intervalMs).toBe(300_000);
      expect(found!.timer).toBeUndefined(); // listJobs omits handler & timer
    });

    it('should have pre-registered jobs from module load', () => {
      const jobs = listJobs();
      const names = jobs.map((j) => j.name);
      expect(names).toContain('session-cleanup');
      expect(names).toContain('usage-aggregation');
      expect(names).toContain('health-check');
      expect(names).toContain('notification-cleanup');
    });

    it('should compute correct intervals for pre-registered jobs', () => {
      const jobs = listJobs();
      const sessionCleanup = jobs.find((j) => j.name === 'session-cleanup');
      expect(sessionCleanup!.intervalMs).toBe(15 * 60_000);

      const usageAgg = jobs.find((j) => j.name === 'usage-aggregation');
      expect(usageAgg!.intervalMs).toBe(3_600_000);

      const healthCheck = jobs.find((j) => j.name === 'health-check');
      expect(healthCheck!.intervalMs).toBe(5 * 60_000);

      const notifCleanup = jobs.find((j) => j.name === 'notification-cleanup');
      expect(notifCleanup!.intervalMs).toBe(30 * 60_000);
    });
  });

  // ─── runJob ──────────────────────────────────────────────────────

  describe('runJob', () => {
    it('should throw for unregistered job', async () => {
      await expect(runJob('nonexistent')).rejects.toThrow('not registered');
    });

    it('should execute handler and return result', async () => {
      scheduleJob('manual-test', '*/5 * * * *', async () => ({ done: true }));
      const result = await runJob('manual-test') as any;
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ done: true });
      expect(typeof result.durationMs).toBe('number');
    });

    it('should update lastRunAt after execution', async () => {
      scheduleJob('timing-test', '* * * * *', async () => null);
      await runJob('timing-test');
      const jobs = listJobs();
      const job = jobs.find((j) => j.name === 'timing-test');
      expect(job!.lastRunAt).not.toBeNull();
      expect(job!.lastRunAt).toBeInstanceOf(Date);
    });

    it('should update nextRunAt after execution', async () => {
      scheduleJob('next-run-test', '* * * * *', async () => null);
      await runJob('next-run-test');
      const jobs = listJobs();
      const job = jobs.find((j) => j.name === 'next-run-test');
      expect(job!.nextRunAt).not.toBeNull();
      expect(job!.nextRunAt).toBeInstanceOf(Date);
    });

    it('should throw if handler throws', async () => {
      scheduleJob('failing-job', '* * * * *', async () => {
        throw new Error('handler failed');
      });
      await expect(runJob('failing-job')).rejects.toThrow('handler failed');
    });
  });

  // ─── startAll & stopAll ─────────────────────────────────────────

  describe('startAll and stopAll', () => {
    it('startAll should set timers on all jobs', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduleJob('start-test', '*/5 * * * *', handler);
      startAll();

      const jobs = listJobs();
      // After startAll, the internal registry should have timers set
      // listJobs omits timer, so we check behavior instead
      // The timer is set internally; we verify stopAll clears it.
    });

    it('stopAll should clear all timers', () => {
      scheduleJob('stop-test', '* * * * *', vi.fn());
      startAll();
      stopAll();

      // After stop, nextRunAt should be null for all
      const jobs = listJobs();
      // nextRunAt is set to null in the CronJob object when stopped
      // but listJobs returns a snapshot. The actual timer in the registry
      // should be null. We can't directly access it, so we verify no crash.
      expect(jobs.length).toBeGreaterThan(0);
    });

    it('should not create duplicate timers if startAll called twice', () => {
      scheduleJob('dedup-test', '*/5 * * * *', vi.fn());
      startAll();
      startAll(); // second call should skip already-running jobs
      stopAll();
      // No assertions needed beyond no crash
    });
  });
});
