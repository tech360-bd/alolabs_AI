import { z } from 'zod';
import { mayOperateQueues } from '@/lib/access/queue';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/queues — list queues with item counts
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (!mayOperateQueues(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const queues = await db.jobQueue.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Get item counts per queue grouped by status
    const queueIds = queues.map((q) => q.id);
    const itemCounts = queueIds.length > 0
      ? await db.queueItem.groupBy({
          by: ['queueId', 'status'],
          where: { queueId: { in: queueIds } },
          _count: true,
        })
      : [];

    const countMap: Record<string, Record<string, number>> = {};
    for (const c of itemCounts) {
      if (!countMap[c.queueId]) countMap[c.queueId] = {};
      countMap[c.queueId][c.status] = c._count;
    }

    const data = queues.map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      concurrency: q.concurrency,
      maxRetries: q.maxRetries,
      isActive: q.isActive,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
      counts: countMap[q.id] || {},
      totalItems: Object.values(countMap[q.id] || {}).reduce((a, b) => a + b, 0),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/queues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/queues — create a queue
export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (!mayOperateQueues(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120), description: z.string().max(1024).optional(),
      concurrency: z.number().int().min(1).max(100).default(3), maxRetries: z.number().int().min(1).max(50).default(3),
      isActive: z.boolean().default(true),
    }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid queue configuration' }, { status: 400 });
    const { name, description, concurrency, maxRetries, isActive } = parsed.data;

    const existing = await db.jobQueue.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: 'Queue name already exists' }, { status: 409 });
    }

    const queue = await db.jobQueue.create({
      data: {
        name: name.trim(),
        description: description || null,
        concurrency, maxRetries, isActive,
      },
    });

    return NextResponse.json({ data: queue }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'Queue name already exists' }, { status: 409 });
    console.error('POST /api/queues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}