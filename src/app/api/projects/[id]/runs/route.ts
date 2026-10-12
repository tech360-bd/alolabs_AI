import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseBody } from '@/lib/validators';
import { getProject, createProjectRun } from '@/lib/projects';
import { listRuns } from '@/lib/runs';

/**
 * /api/projects/:id/runs — list runs in a project, or start a new run.
 */

const CreateRunSchema = z.object({
  objective: z.string().trim().min(1).max(10000),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (project.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const limit = Math.min(100, parseInt(new URL(request.url).searchParams.get('limit') ?? '50'));
    const { runs, total } = await listRuns({ projectId: id, limit });
    return NextResponse.json({ success: true, data: { runs, total } });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/projects/:id/runs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (project.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const parsed = parseBody(CreateRunSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const result = await createProjectRun(id, parsed.data.objective, user.userId);
    return NextResponse.json(
      { success: true, data: { runId: result.runId, status: result.status, eventsUrl: `/api/runs/${result.runId}/events` } },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('[POST /api/projects/:id/runs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
