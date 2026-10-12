import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getProjectDetail, deleteProject, updateProject } from '@/lib/projects';

/**
 * /api/projects/:id — project detail (runs, artifacts, totals) or delete.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const detail = await getProjectDetail(id);
    if (!detail || !detail.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (detail.project.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: detail });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/projects/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    const updated = await updateProject(id, body ?? {});
    if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (updated.companyId && user.companyId && updated.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PATCH /api/projects/:id]', error);
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
    const existing = await import('@/lib/projects').then((m) => m.getProject(id));
    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/projects/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
