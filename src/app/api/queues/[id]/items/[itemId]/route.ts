import { completeJob, failJob } from '@/lib/job-queue';
import { mayOperateQueues } from '@/lib/access/queue';
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
  if (!mayOperateQueues(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const claim = { lockedBy: `api-${session.userId}`, attempts: item.attempts };
    const updated = status === 'completed' ? await completeJob(item.id, undefined, claim)
      : status === 'failed' ? await failJob(item.id, typeof error === 'string' ? error : 'Job failed', { claim })
      : await db.queueItem.update({
          where: { id: item.id, queueId: id, status: 'processing', ...claim },
          data: { status: 'cancelled', completedAt: new Date(), lockedBy: null, lockExpiresAt: null, error: typeof error === 'string' ? error : null },
        });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') return NextResponse.json({ error: 'Claim no longer owned by this worker' }, { status: 409 });
    console.error('PATCH /api/queues/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}