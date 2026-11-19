// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;
beforeAll(async () => { real = await createRealDb('queue-extension'); }, 90_000);
afterAll(async () => { await real?.cleanup(); });

it('only runs explicitly registered types, using durable claims; leaves core queues to the app', async () => {
  const { enqueue } = await import('@/lib/job-queue');
  const { registerHandler, pollRegisteredJobs } = await import('../../mini-services/queue-service/registered-handlers');
  const queue = 'extension-example', type = 'example.report';
  await real.db.jobQueue.create({ data: { name: queue, concurrency: 1 } });
  const unmatched = await enqueue(queue, 'other-type', {}, { priority: 10 });
  const matched = await enqueue(queue, type, { number: 3 });
  const core = await Promise.all(['agentos', 'voice'].map(name => enqueue(name, type, {})));
  expect(await pollRegisteredJobs()).toEqual([]);
  const handle = vi.fn(async (p: Record<string, unknown>) => ({ doubled: Number(p.number) * 2 }));
  registerHandler(type, handle);
  const transitions: unknown[] = [];
  const runs = await Promise.all([pollRegisteredJobs((job, name, result) => {
    transitions.push([name, job.status, result]);
    if (job.status === 'processing') throw Error('monitor unavailable');
  }), pollRegisteredJobs()]);
  expect(transitions).toEqual([[queue, 'processing', undefined], [queue, 'completed', { doubled: 6 }]]);
  expect(runs.flat().map(r => [r.id, r.status])).toEqual([[matched.id, 'completed']]);
  expect(handle).toHaveBeenCalledExactlyOnceWith({ number: 3 });
  const result = await real.db.queueItem.findUniqueOrThrow({ where: { id: matched.id } });
  expect(JSON.parse(result.payload)).toEqual({ number: 3 });
  expect(JSON.parse(result.result!)).toEqual({ doubled: 6 });
  for (const job of [unmatched, ...core]) {
    expect(await real.db.queueItem.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'queued', attempts: 0 });
  }
});

it('recovers expired registered work, respects retry limits, and does not reclaim another handler’s lease', async () => {
  const { enqueue } = await import('@/lib/job-queue');
  const { registerHandler, pollRegisteredJobs } = await import('../../mini-services/queue-service/registered-handlers');
  const queue = 'extension-retry', type = 'example.fails';
  await real.db.jobQueue.create({ data: { name: queue, concurrency: 2 } });
  const ours = await enqueue(queue, type, {}, { maxRetries: 2 });
  const theirs = await enqueue(queue, 'other.extension', {});
  await real.db.queueItem.updateMany({ where: { id: { in: [ours.id, theirs.id] } },
    data: { status: 'processing', attempts: 1, lockExpiresAt: new Date(0), lockedBy: 'previous' } });
  registerHandler(type, async () => { throw new Error('fixture rejected'); });
  await pollRegisteredJobs();
  expect(await real.db.queueItem.findUniqueOrThrow({ where: { id: ours.id } })).toMatchObject({ status: 'failed', attempts: 2, error: 'fixture rejected' });
  expect(await real.db.queueItem.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ status: 'processing', attempts: 1, lockedBy: 'previous' });
});
