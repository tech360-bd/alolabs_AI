import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { parseBody, parseQuery, paginationQuery, paginatedResponse } from '@/lib/validators';
import { retryDeadLetterJob } from '@/lib/job-queue';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const dlqQuerySchema = paginationQuery.extend({
  queueId: z.string().min(1).optional(),
});

const retryBodySchema = z.object({
  jobId: z.string().min(1),
});

const purgeBodySchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatItem(item: {
  id: string;
  queueId: string;
  jobId: string | null;
  jobType: string;
  priority: number;
  payload: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
}) {
  return {
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
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/queues/dead-letter?queueId=<id>
 *
 * List failed (dead letter queue) items, optionally filtered by queueId.
 */
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const parsed = parseQuery(dlqQuerySchema, request.nextUrl.searchParams);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
    }
    const { queueId, page, limit } = parsed.data;

    const where: Record<string, unknown> = { status: 'failed' };
    if (queueId) {
      const queue = await db.jobQueue.findUnique({ where: { id: queueId } });
      if (!queue) {
        return NextResponse.json({ error: 'Queue not found' }, { status: 404 });
      }
      (where as Record<string, string>).queueId = queueId;
    }

    const [items, total] = await Promise.all([
      db.queueItem.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.queueItem.count({ where }),
    ]);

    return NextResponse.json({
      data: paginatedResponse(items.map(formatItem), page, limit, total),
    });
  } catch (error) {
    console.error('GET /api/queues/dead-letter error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST (retry) ─────────────────────────────────────────────────────────────

/**
 * POST /api/queues/dead-letter/retry
 *
 * Re-enqueue a failed job for retry.
 * Body: { jobId: string }
 */
export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = parseBody(retryBodySchema, body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
    }
    const { jobId } = parsed.data;

    const item = await retryDeadLetterJob(jobId);
    return NextResponse.json({ data: formatItem(item) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/queues/dead-letter/retry error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── DELETE (purge) ───────────────────────────────────────────────────────────

/**
 * DELETE /api/queues/dead-letter
 *
 * Purge (delete) specified DLQ items.
 * Body: { jobIds: string[] }
 */
export async function DELETE(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = parseBody(purgeBodySchema, body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
    }
    const { jobIds } = parsed.data;

    // Only purge items that are actually in 'failed' status
    const result = await db.queueItem.deleteMany({
      where: {
        id: { in: jobIds },
        status: 'failed',
      },
    });

    return NextResponse.json({
      data: { deleted: result.count, requested: jobIds.length },
    });
  } catch (error) {
    console.error('DELETE /api/queues/dead-letter error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
