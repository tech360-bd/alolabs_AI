import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getJob, refreshJob } from '@/lib/media-generation';

/**
 * GET /api/media/jobs/:id — read (and, for asynchronous providers, refresh)
 * one generation job. Only the owning company can see it.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth();
    const { id } = await context.params;

    const job = await getJob(decodeURIComponent(id));
    if (!job || job.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const refreshed = await refreshJob(job);
    return NextResponse.json({ job: refreshed });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Media job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
