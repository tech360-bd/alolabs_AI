import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/db
vi.mock('@/lib/db', () => ({
  db: {
    jobQueue: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    queueItem: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
}));

import {
  enqueue,
  dequeue,
  completeJob,
  failJob,
  getDeadLetterQueue,
  retryDeadLetterJob,
  getQueueStats,
} from '@/lib/job-queue';
import { db } from '@/lib/db';

const mockedDb = vi.mocked(db);

function makeQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    queueId: 'queue-1',
    jobId: null,
    jobType: 'email',
    priority: 0,
    payload: '{"to":"test@test.com"}',
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    error: null,
    startedAt: null,
    completedAt: null,
    scheduledAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('Job Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.jobQueue.findUnique.mockResolvedValue(null);
    mockedDb.jobQueue.create.mockResolvedValue({ id: 'queue-1', name: 'emails', maxRetries: 3, isActive: true, concurrency: 1 });
    mockedDb.queueItem.create.mockImplementation(async (args: any) => ({
      id: 'item-new',
      ...args.data,
      createdAt: new Date(),
    }));
    mockedDb.queueItem.update.mockImplementation(async (args: any) => {
      const existing = makeQueueItem({ id: args.where.id });
      return { ...existing, ...args.data, id: args.where.id };
    });
  });

  // ─── enqueue ────────────────────────────────────────────────

  describe('enqueue', () => {
    it('should create a queue if it does not exist', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValueOnce(null);
      await enqueue('emails', 'send', { to: 'user@test.com' });
      expect(mockedDb.jobQueue.create).toHaveBeenCalledWith({
        data: { name: 'emails', maxRetries: 3 },
      });
    });

    it('should reuse existing queue', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1', name: 'emails', maxRetries: 3, isActive: true, concurrency: 1 });
      await enqueue('emails', 'send', { to: 'user@test.com' });
      expect(mockedDb.jobQueue.create).not.toHaveBeenCalled();
    });

    it('should create a queue item with status queued', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      await enqueue('emails', 'send', { to: 'user@test.com' });
      expect(mockedDb.queueItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            queueId: 'queue-1',
            jobType: 'send',
            status: 'queued',
          }),
        }),
      );
    });

    it('should serialize non-string payloads as JSON', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      await enqueue('emails', 'send', { to: 'test@test.com' });
      const createCall = mockedDb.queueItem.create.mock.calls[0][0] as any;
      expect(createCall.data.payload).toBe('{"to":"test@test.com"}');
    });

    it('should pass string payload directly', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      await enqueue('emails', 'send', 'raw-payload');
      const createCall = mockedDb.queueItem.create.mock.calls[0][0] as any;
      expect(createCall.data.payload).toBe('raw-payload');
    });

    it('should set scheduledAt for delayed jobs', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      await enqueue('emails', 'send', {}, { delayMs: 5000 });
      const createCall = mockedDb.queueItem.create.mock.calls[0][0] as any;
      expect(createCall.data.scheduledAt).toBeInstanceOf(Date);
    });

    it('should respect custom priority', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      await enqueue('emails', 'send', {}, { priority: 10 });
      const createCall = mockedDb.queueItem.create.mock.calls[0][0] as any;
      expect(createCall.data.priority).toBe(10);
    });

    it('should respect custom maxRetries', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValueOnce(null);
      await enqueue('emails', 'send', {}, { maxRetries: 5 });
      expect(mockedDb.jobQueue.create).toHaveBeenCalledWith({
        data: { name: 'emails', maxRetries: 5 },
      });
    });
  });

  // ─── dequeue ────────────────────────────────────────────────

  describe('dequeue', () => {
    it('should return null when queue does not exist', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue(null);
      const result = await dequeue('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when no queued items', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      mockedDb.queueItem.findFirst.mockResolvedValue(null);
      const result = await dequeue('emails');
      expect(result).toBeNull();
    });

    it('should return the next queued item and mark as processing', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      const item = makeQueueItem({ id: 'item-99' });
      mockedDb.queueItem.findFirst.mockResolvedValue(item);
      mockedDb.queueItem.updateMany.mockResolvedValue({ count: 1 });
      mockedDb.queueItem.findUnique.mockResolvedValue({ ...item, status: 'processing', startedAt: new Date(), attempts: 1 });

      const result = await dequeue('emails');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('item-99');
      expect(mockedDb.queueItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-99', status: 'queued' },
          data: expect.objectContaining({ status: 'processing' }),
        }),
      );
    });

    it('should query by priority desc then createdAt asc', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      mockedDb.queueItem.findFirst.mockResolvedValue(null);
      await dequeue('emails');
      expect(mockedDb.queueItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' },
          ],
        }),
      );
    });
  });

  // ─── completeJob ────────────────────────────────────────────

  describe('completeJob', () => {
    it('should update job status to completed', async () => {
      const item = makeQueueItem({ id: 'item-1' });
      mockedDb.queueItem.update.mockResolvedValue({ ...item, status: 'completed', completedAt: new Date(), error: null });
      const result = await completeJob('item-1', { sent: true });
      expect(result.id).toBe('item-1');
      expect(mockedDb.queueItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({ status: 'completed' }),
        }),
      );
    });

    it('should store result as stringified JSON', async () => {
      mockedDb.queueItem.update.mockResolvedValue(makeQueueItem({ status: 'completed' }));
      await completeJob('item-1', { sent: true });
      const call = mockedDb.queueItem.update.mock.calls[0][0] as any;
      // Results live in their own column; the original payload is preserved for audit/replay.
      expect(call.data.result).toBe('{"sent":true}');
      expect(call.data.payload).toBeUndefined();
      expect(call.data.lockedBy).toBeNull();
    });
  });

  // ─── failJob ────────────────────────────────────────────────

  describe('failJob', () => {
    it('should throw for nonexistent job', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(null);
      await expect(failJob('missing', 'error msg')).rejects.toThrow('not found');
    });

    it('should re-queue job when retries remain', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(makeQueueItem({ attempts: 1, maxAttempts: 3 }));
      mockedDb.queueItem.update.mockResolvedValue(makeQueueItem({ status: 'queued', attempts: 2, error: 'fail' }));
      const result = await failJob('item-1', 'connection refused');
      expect(result.status).toBe('queued');
    });

    it('should move job to failed (DLQ) when retries exhausted', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(makeQueueItem({ attempts: 2, maxAttempts: 3 }));
      mockedDb.queueItem.update.mockResolvedValue(makeQueueItem({ status: 'failed', attempts: 3, error: 'fatal' }));
      const result = await failJob('item-1', 'fatal error');
      expect(result.status).toBe('failed');
    });

    it('should store error message', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(makeQueueItem({ attempts: 0, maxAttempts: 3 }));
      mockedDb.queueItem.update.mockResolvedValue(makeQueueItem());
      await failJob('item-1', 'timeout');
      const call = mockedDb.queueItem.update.mock.calls[0][0] as any;
      expect(call.data.error).toBe('timeout');
    });
  });

  // ─── Dead Letter Queue ───────────────────────────────────────

  describe('getDeadLetterQueue', () => {
    it('should return empty array for nonexistent queue', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue(null);
      const result = await getDeadLetterQueue('nope');
      expect(result).toEqual([]);
    });

    it('should return failed items ordered by completedAt desc', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      const failedItems = [
        makeQueueItem({ id: 'dl1', status: 'failed', completedAt: new Date('2024-01-02') }),
        makeQueueItem({ id: 'dl2', status: 'failed', completedAt: new Date('2024-01-01') }),
      ];
      mockedDb.queueItem.findMany.mockResolvedValue(failedItems);
      const result = await getDeadLetterQueue('emails');
      expect(result).toHaveLength(2);
      expect(mockedDb.queueItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { queueId: 'queue-1', status: 'failed' },
          orderBy: { completedAt: 'desc' },
        }),
      );
    });
  });

  describe('retryDeadLetterJob', () => {
    it('should throw for nonexistent job', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(null);
      await expect(retryDeadLetterJob('missing')).rejects.toThrow('not found');
    });

    it('should throw if job is not in failed status', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(makeQueueItem({ status: 'queued' }));
      await expect(retryDeadLetterJob('item-1')).rejects.toThrow('not in the dead letter queue');
    });

    it('should reset job to queued with 0 attempts', async () => {
      mockedDb.queueItem.findUnique.mockResolvedValue(makeQueueItem({ id: 'dl1', status: 'failed', attempts: 3 }));
      mockedDb.queueItem.update.mockResolvedValue(makeQueueItem({ id: 'dl1', status: 'queued', attempts: 0, error: null }));
      const result = await retryDeadLetterJob('dl1');
      expect(result.status).toBe('queued');
      expect(result.attempts).toBe(0);
      expect(result.error).toBeNull();
    });
  });

  // ─── getQueueStats ───────────────────────────────────────────

  describe('getQueueStats', () => {
    it('should return all zeros for nonexistent queue', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue(null);
      const result = await getQueueStats('nope');
      expect(result).toEqual({
        pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0,
      });
    });

    it('should aggregate counts from groupBy', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      mockedDb.queueItem.groupBy.mockResolvedValue([
        { status: 'queued', _count: 5 },
        { status: 'processing', _count: 2 },
        { status: 'completed', _count: 10 },
        { status: 'failed', _count: 1 },
        { status: 'cancelled', _count: 0 },
      ]);
      const result = await getQueueStats('emails');
      expect(result).toEqual({
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        cancelled: 0,
        total: 18,
      });
    });

    it('should default missing statuses to 0', async () => {
      mockedDb.jobQueue.findUnique.mockResolvedValue({ id: 'queue-1' });
      mockedDb.queueItem.groupBy.mockResolvedValue([
        { status: 'completed', _count: 3 },
      ]);
      const result = await getQueueStats('emails');
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(3);
    });
  });
});
