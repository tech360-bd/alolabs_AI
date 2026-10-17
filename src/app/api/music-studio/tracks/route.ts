import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { jobToRow, listJobs } from '@/lib/media-generation';

/**
 * GET /api/music-studio/tracks — generated music jobs for the caller's company.
 * Supports `page`, `limit`, `search` (prompt/title) to match useDataTable.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const search = (searchParams.get('search') || '').toLowerCase();

    const jobs = (await listJobs(user.companyId, 200, 'music')).filter(
      (job) => !search || job.prompt.toLowerCase().includes(search),
    );
    const start = (page - 1) * limit;
    const rows = jobs.slice(start, start + limit).map(jobToRow);

    return NextResponse.json({ data: rows, total: jobs.length, page, limit });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Music tracks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
