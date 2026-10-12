import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseBody, parseQuery, paginationQuery } from '@/lib/validators';
import { createRun, listRuns } from '@/lib/runs';
import { getProject } from '@/lib/projects';

/**
 * /api/runs — the ONE COMMAND entry point of ALO Labs AgentOS.
 *
 * POST: give ALO Labs a high-level objective. The Master Orchestrator plans,
 * decomposes, routes, executes, QC-gates, repairs, and assembles artifacts —
 * asynchronously and durably (the response returns a runId immediately).
 *
 * GET: list runs (newest first).
 */

const CreateRunSchema = z.object({
  objective: z.string().trim().min(1, 'objective is required').max(10000),
  projectId: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  // HTTP requests always use the durable queue; inline execution is only
  // available to trusted in-process callers/tests.
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const body = await request.json();
    const parsed = parseBody(CreateRunSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    if (parsed.data.projectId) {
      const project = await getProject(parsed.data.projectId);
      if (!project || project.companyId !== user.companyId) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }
    const result = await createRun({
      objective: parsed.data.objective,
      userId: user.userId,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          runId: result.runId,
          status: result.status,
          eventsUrl: `/api/runs/${result.runId}/events`,
          detailUrl: `/api/runs/${result.runId}`,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/runs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit } = parsed.data;
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const projectId = new URL(request.url).searchParams.get('projectId') ?? undefined;

    const { runs, total } = await listRuns({
      ...(user.companyId ? { companyId: user.companyId } : {}),
      userId: user.userId,
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      limit,
      offset: (page - 1) * limit,
    });

    return NextResponse.json({
      data: runs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/runs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
