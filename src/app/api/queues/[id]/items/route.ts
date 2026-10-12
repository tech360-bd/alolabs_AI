import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/queues/[id]/items — list queue items (filter by status)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(200, parseInt(searchParams.get('limit') || '50'));
    const offset = parseInt(searchParams.get('offset') || '0');

    const queue = await db.jobQueue.findUnique({ where: { id } });
    if (!queue) {
      return NextResponse.json({ error: 'Queue not found' }, { status: 404 });
    }

    const where: Record<string, unknown> = { queueId: id };
    if (status) {
      const validStatuses = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      where.status = status;
    }

    const [items, total] = await Promise.all([
      db.queueItem.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: limit,
        skip: offset,
      }),
      db.queueItem.count({ where }),
    ]);

    const data = items.map((item) => ({
      id: item.id,
      queueId: item.queueId,
      jobId: item.jobId,
      jobType: item.jobType,
      priority: item.priority,
      payload: item.payload,
      status: item.status,
      attempts: item.attempts,
      maxAttempts: item.maxAttempts,
      error: item.error,
      startedAt: item.startedAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    }));

    return NextResponse.json({ data, total, limit, offset });
  } catch (error) {
    console.error('GET /api/queues/[id]/items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/queues/[id]/items — enqueue a new item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const { jobId, jobType, priority, payload, maxAttempts, scheduledAt } = body;

    const queue = await db.jobQueue.findUnique({ where: { id } });
    if (!queue) {
      return NextResponse.json({ error: 'Queue not found' }, { status: 404 });
    }

    if (!queue.isActive) {
      return NextResponse.json({ error: 'Queue is not active' }, { status: 400 });
    }

    if (!jobType || typeof jobType !== 'string') {
      return NextResponse.json({ error: 'jobType is required' }, { status: 400 });
    }

    const item = await db.queueItem.create({
      data: {
        queueId: id,
        jobId: jobId || null,
        jobType,
        priority: typeof priority === 'number' ? priority : 0,
        payload: payload ? JSON.stringify(payload) : '{}',
        status: 'queued',
        maxAttempts: typeof maxAttempts === 'number' ? maxAttempts : queue.maxRetries,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    });

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    console.error('POST /api/queues/[id]/items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/queues/[id]/items — process next item (dequeue highest priority)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params;

    const queue = await db.jobQueue.findUnique({ where: { id } });
    if (!queue) {
      return NextResponse.json({ error: 'Queue not found' }, { status: 404 });
    }

    if (!queue.isActive) {
      return NextResponse.json({ error: 'Queue is not active' }, { status: 400 });
    }

    // Count currently processing items
    const processingCount = await db.queueItem.count({
      where: { queueId: id, status: 'processing' },
    });

    if (processingCount >= queue.concurrency) {
      return NextResponse.json(
        { error: 'Queue is at max concurrency', processingCount, maxConcurrency: queue.concurrency },
        { status: 429 }
      );
    }

    // Find highest priority queued item (skip scheduled items not yet due)
    const now = new Date();
    const item = await db.queueItem.findFirst({
      where: {
        queueId: id,
        status: 'queued',
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: now } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!item) {
      return NextResponse.json({ data: null, message: 'No items available' });
    }

    // Mark as processing
    const updated = await db.queueItem.update({
      where: { id: item.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        queueId: updated.queueId,
        jobId: updated.jobId,
        jobType: updated.jobType,
        priority: updated.priority,
        payload: updated.payload,
        status: updated.status,
        attempts: updated.attempts,
        maxAttempts: updated.maxAttempts,
        startedAt: updated.startedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/queues/[id]/items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}