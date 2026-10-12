import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listJobs, runJob } from '@/lib/cron-jobs';
import { parseBody } from '@/lib/validators';
import { requireRole } from '@/lib/api-auth';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const triggerBodySchema = z.object({
  name: z.string().min(1),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/cron — list all registered cron jobs.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const jobs = listJobs();
    return NextResponse.json({
      data: jobs.map((job) => ({
        name: job.name,
        schedule: job.schedule,
        intervalMs: job.intervalMs,
        lastRunAt: job.lastRunAt?.toISOString() ?? null,
        nextRunAt: job.nextRunAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('GET /api/cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/cron — manually trigger a cron job.
 * Body: { name: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const body = await request.json();
    const parsed = parseBody(triggerBodySchema, body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
    }
    const { name } = parsed.data;

    const result = await runJob(name);
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/cron error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
