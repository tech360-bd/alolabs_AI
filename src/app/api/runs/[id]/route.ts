import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getRun, getRunDetail, cancelRun } from '@/lib/runs';

/**
 * /api/runs/:id — run detail (plan, tasks, agents, models, QC, artifacts,
 * approvals) or cancellation.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const detail = await getRunDetail(id);
    if (!detail || !detail.run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    // Tenant check
    if (detail.run.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: detail });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/runs/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const run = await getRun(id);
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    if (run.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const cancelled = await cancelRun(id);
    if (!cancelled) {
      return NextResponse.json({ error: 'Run is already in a terminal state' }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: { id, status: 'cancelled' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/runs/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
