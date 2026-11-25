import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { getResearchReport } from '@/lib/research/research-store';

export const dynamic = 'force-dynamic';

/** GET /api/research/reports/[id] — one tenant-scoped research report. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireCompanyAuth();
    const { id } = await params;
    if (!id || id.length > 200) return NextResponse.json({ error: 'Invalid report id' }, { status: 400 });

    const report = await getResearchReport(id, actor.companyId);
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    return NextResponse.json({ success: true, report });
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Could not load the report' }, { status: 500 });
  }
}
