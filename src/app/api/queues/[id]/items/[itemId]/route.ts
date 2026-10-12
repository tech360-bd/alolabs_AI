import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/queues/[id]/items/[itemId] — update item status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id, itemId } = await params;
    const body = await request.json();
    const { status, error } = body;

    const validStatuses = ['completed', 'failed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const item = await db.queueItem.findFirst({
      where: { id: itemId, queueId: id },
    });

    if (!item) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    if (item.status !== 'processing') {
      return NextResponse.json(
        { error: `Item must be in 'processing' status to update. Current: ${item.status}` },
        { status: 400 }
      );
    }

    // Handle failure with retry logic
    if (status === 'failed') {
      if (item.attempts < item.maxAttempts - 1) {
        // Re-queue: increment attempts, set back to queued
        const requeued = await db.queueItem.update({
          where: { id: item.id },
          data: {
            attempts: item.attempts + 1,
            status: 'queued',
            error: error || null,
            startedAt: null,
          },
        });

        return NextResponse.json({
          data: {
            id: requeued.id,
            status: requeued.status,
            attempts: requeued.attempts,
            maxAttempts: requeued.maxAttempts,
            message: `Re-queued. Attempt ${requeued.attempts + 1} of ${requeued.maxAttempts}`,
          },
        });
      }

      // Max attempts reached — mark as permanently failed
      const failed = await db.queueItem.update({
        where: { id: item.id },
        data: {
          status: 'failed',
          attempts: item.attempts + 1,
          error: error || 'Max attempts reached',
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        data: {
          id: failed.id,
          status: failed.status,
          attempts: failed.attempts,
          maxAttempts: failed.maxAttempts,
          error: failed.error,
          completedAt: failed.completedAt?.toISOString() ?? null,
          message: 'Item permanently failed — max attempts reached',
        },
      });
    }

    // Handle completion or cancellation
    const updated = await db.queueItem.update({
      where: { id: item.id },
      data: {
        status,
        completedAt: new Date(),
        error: status === 'cancelled' ? error || null : item.error,
      },
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt?.toISOString() ?? null,
        error: updated.error,
      },
    });
  } catch (error) {
    console.error('PATCH /api/queues/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}