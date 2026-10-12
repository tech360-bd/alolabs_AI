// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

type Queue = typeof import('@/lib/job-queue');

/**
 * Queue failure/recovery semantics against a REAL database (no mocks, no
 * synchronous substitutes). Each scenario maps to a production failure mode.
 */
describe('durable job queue (real SQLite database)', () => {
  let real: RealDb;
  let q: Queue;
  const QUEUE = 'durability-test';

  beforeAll(async () => {
    real = await createRealDb('alo-queue');
    q = await import('@/lib/job-queue');
    await real.db.jobQueue.create({ data: { name: QUEUE, isActive: true, concurrency: 4, maxRetries: 3 } });
  }, 90_000);

  afterAll(async () => {
    await real?.cleanup();
  });

  it('claims each job exactly once even when 10 workers race for it', async () => {
    const job = await q.enqueue(QUEUE, 'race', { n: 1 });
    const winners = await Promise.all(
      Array.from({ length: 10 }, (_, i) => q.dequeue(QUEUE, { workerId: `w${i}`, leaseMs: 60_000 })),
    );
    const claimed = winners.filter((w) => w !== null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.id).toBe(job.id);
    expect(claimed[0]!.attempts).toBe(1);
    expect(claimed[0]!.lockedBy).toMatch(/^w\d$/);
    await q.completeJob(job.id, { ok: true });
  });

  it('stores handler results without overwriting the payload', async () => {
    const job = await q.enqueue(QUEUE, 'result', { input: 'keep-me' });
    const results = await q.processQueue(QUEUE, async () => ({ answer: 42 }), { workerId: 'w-result' });
    expect(results.find((r) => r.id === job.id)?.status).toBe('completed');
    const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
    expect(JSON.parse(row.payload)).toEqual({ input: 'keep-me' });
    expect(JSON.parse(row.result ?? 'null')).toEqual({ answer: 42 });
    expect(row.lockedBy).toBeNull();
  });

  it('retries with backoff, counts attempts exactly once per claim, then dead-letters at maxAttempts', async () => {
    const job = await q.enqueue(QUEUE, 'flaky', { x: 1 }, { maxRetries: 3 });
    const backoffMs = (attempt: number) => attempt * 1000;
    let runs = 0;

    for (let round = 1; round <= 3; round += 1) {
      // backoff pushes scheduledAt into the future; make it due again for the test
      await real.db.queueItem.update({ where: { id: job.id }, data: { scheduledAt: null } });
      const results = await q.processQueue(QUEUE, async () => { runs += 1; throw new Error(`boom ${round}`); }, { workerId: 'w-flaky', backoffMs });
      const mine = results.find((r) => r.id === job.id)!;
      const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.attempts).toBe(round);
      expect(row.error).toBe(`boom ${round}`);
      if (round < 3) {
        expect(mine.status).toBe('queued');
        expect(row.status).toBe('queued');
        // scheduled strictly in the future by the backoff function
        expect(row.scheduledAt!.getTime()).toBeGreaterThan(Date.now() + backoffMs(round) - 500);
      } else {
        expect(mine.status).toBe('failed');
        expect(row.status).toBe('failed');
        expect(row.completedAt).not.toBeNull();
      }
    }
    expect(runs).toBe(3);

    // Dead-letter visibility + manual retry resets attempts.
    const dlq = await q.getDeadLetterQueue(QUEUE);
    expect(dlq.map((j) => j.id)).toContain(job.id);
    const retried = await q.retryDeadLetterJob(job.id);
    expect(retried.status).toBe('queued');
    expect(retried.attempts).toBe(0);
    await q.cancelJob(job.id, 'test cleanup');
  });

  it('does not process a job before its retry backoff elapses', async () => {
    const job = await q.enqueue(QUEUE, 'delayed-retry', {}, { maxRetries: 3 });
    await q.processQueue(QUEUE, async () => { throw new Error('first'); }, { workerId: 'w-delay', backoffMs: () => 60_000 });
    const second = await q.processQueue(QUEUE, async () => { throw new Error('must not run'); }, { workerId: 'w-delay' });
    expect(second.find((r) => r.id === job.id)).toBeUndefined();
    const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.attempts).toBe(1);
    await q.cancelJob(job.id, 'test cleanup');
  });

  it('recovers a job whose worker crashed (lease expired) without losing or duplicating it', async () => {
    const job = await q.enqueue(QUEUE, 'crash', { important: true }, { maxRetries: 3 });
    // Worker claims with a very short lease and "crashes" (never completes).
    const claimed = await q.dequeue(QUEUE, { workerId: 'w-crash', leaseMs: 50 });
    expect(claimed?.id).toBe(job.id);

    // Before expiry: nothing to reclaim, nobody else can take it.
    expect(await q.reclaimExpiredLeases(QUEUE)).toEqual({ requeued: 0, deadLettered: 0 });
    expect(await q.dequeue(QUEUE, { workerId: 'w-other' })).toBeNull();

    await new Promise((r) => setTimeout(r, 80));
    const reclaimed = await q.reclaimExpiredLeases(QUEUE);
    expect(reclaimed).toEqual({ requeued: 1, deadLettered: 0 });

    const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(1);
    expect(row.error).toContain('lease expired');
    expect(JSON.parse(row.payload)).toEqual({ important: true });

    // Another worker now completes it.
    const results = await q.processQueue(QUEUE, async (j) => ({ recoveredBy: 'w-other', payload: j.payload }), { workerId: 'w-other' });
    expect(results.find((r) => r.id === job.id)?.status).toBe('completed');
    const done = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.attempts).toBe(2);
  });

  it('dead-letters a crashed job when its attempts are already exhausted', async () => {
    const job = await q.enqueue(QUEUE, 'crash-exhausted', {}, { maxRetries: 1 });
    await q.dequeue(QUEUE, { workerId: 'w-crash2', leaseMs: 20 });
    await new Promise((r) => setTimeout(r, 50));
    expect(await q.reclaimExpiredLeases(QUEUE)).toEqual({ requeued: 0, deadLettered: 1 });
    const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('failed');
  });

  it('heartbeats keep a long-running job leased while it is processed', async () => {
    const job = await q.enqueue(QUEUE, 'long', {});
    let leaseDuringRun: Date | null = null;
    const results = await q.processQueue(QUEUE, async (_j, ctx) => {
      await new Promise((r) => setTimeout(r, 120));
      await ctx.heartbeat();
      const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } });
      leaseDuringRun = row.lockExpiresAt;
      return 'done';
    }, { workerId: 'w-long', leaseMs: 300, heartbeatMs: 30 });
    expect(results.find((r) => r.id === job.id)?.status).toBe('completed');
    expect(leaseDuringRun).not.toBeNull();
    expect(leaseDuringRun!.getTime()).toBeGreaterThan(Date.now() - 50);
  });

  it('enqueue with an idempotency key never creates duplicates (sequential and concurrent)', async () => {
    const a = await q.enqueue(QUEUE, 'idem', { v: 1 }, { idempotencyKey: 'idem-1' });
    const b = await q.enqueue(QUEUE, 'idem', { v: 2 }, { idempotencyKey: 'idem-1' });
    expect(b.id).toBe(a.id);
    expect(JSON.parse(b.payload)).toEqual({ v: 1 });

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => q.enqueue(QUEUE, 'idem', { v: 3 }, { idempotencyKey: 'idem-concurrent' })),
    );
    expect(new Set(concurrent.map((j) => j.id)).size).toBe(1);
    expect(await real.db.queueItem.count({ where: { idempotencyKey: 'idem-concurrent' } })).toBe(1);
    await q.cancelJob(a.id);
    await q.cancelJob(concurrent[0].id);
  });

  it('cancels queued jobs and lets running handlers observe cancellation', async () => {
    const queued = await q.enqueue(QUEUE, 'cancel-queued', {});
    expect((await q.cancelJob(queued.id, 'operator'))?.status).toBe('cancelled');
    expect(await q.dequeue(QUEUE, { workerId: 'w-c' })).toBeNull();

    const running = await q.enqueue(QUEUE, 'cancel-running', {});
    const results = await q.processQueue(QUEUE, async (j, ctx) => {
      await q.cancelJob(j.id, 'cancelled mid-flight');
      expect(await ctx.isCancelled()).toBe(true);
      return 'ignored';
    }, { workerId: 'w-c' });
    expect(results.find((r) => r.id === running.id)?.status).toBe('cancelled');
    const row = await real.db.queueItem.findUniqueOrThrow({ where: { id: running.id } });
    expect(row.status).toBe('cancelled');
    // A failure after cancellation does not resurrect the job.
    await q.failJob(running.id, 'late failure');
    expect((await real.db.queueItem.findUniqueOrThrow({ where: { id: running.id } })).status).toBe('cancelled');
  });

  it('reports accurate queue statistics', async () => {
    const stats = await q.getQueueStats(QUEUE);
    const rows = await real.db.queueItem.groupBy({ by: ['status'], where: { queue: { name: QUEUE } }, _count: true });
    const by = Object.fromEntries(rows.map((r) => [r.status, r._count]));
    expect(stats.completed).toBe(by.completed ?? 0);
    expect(stats.failed).toBe(by.failed ?? 0);
    expect(stats.cancelled).toBe(by.cancelled ?? 0);
    expect(stats.pending).toBe(by.queued ?? 0);
    expect(stats.processing).toBe(0);
  });
});
