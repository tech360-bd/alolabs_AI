import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processQueue } from '@/lib/job-queue';

/**
 * POST /api/queues/[id]/process — trigger manual processing of a queue.
 *
 * Dispatches on `jobType` through the shared AgentOS dispatcher. Jobs with
 * no registered executor fail (and retry/dead-letter per queue policy).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    // Execute jobs with the SAME dispatcher the background worker uses.
    // Jobs without a registered executor fail explicitly (dead-letter after
    // retries) instead of being silently acknowledged as completed.
    const { dispatchAgentOSJob, loadDispatchDeps, AGENTOS_JOB_TYPES } = await import('@/lib/workers/agentos-dispatcher');
    const deps = await loadDispatchDeps();
    const results = await processQueue(queue.name, async (job) => {
      if ((AGENTOS_JOB_TYPES as readonly string[]).includes(job.jobType)) {
        return dispatchAgentOSJob(job, deps);
      }
      throw new Error(`No executor registered for job type '${job.jobType}'`);
    }, { workerId: `api-${session.userId}` });

    const summary = {
      total: results.length,
      completed: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      requeued: results.filter((r) => r.status === 'queued').length,
    };

    return NextResponse.json({ data: { results, summary } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/queues/[id]/process error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
