import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseBody } from '@/lib/validators';
import { runWorkflow } from '@/lib/workflow-engine';
import { db } from '@/lib/db';

/**
 * POST /api/workflows/:id/run — execute a persisted workflow end-to-end
 * through the Workflow Engine (durable, QC-gated, artifact-producing).
 */

const RunWorkflowSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  projectId: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  // HTTP entrypoints always enqueue durable workflow jobs.
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;

    const workflow = await db.workflow.findFirst({
      where: { id, workflowPermissions: { some: { companyId: user.companyId, accessLevel: { in: ['execute', 'full'] } } } },
      select: { id: true, name: true, status: true },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const parsed = parseBody(RunWorkflowSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    if (parsed.data.projectId) {
      const project = await db.project.findFirst({ where: { id: parsed.data.projectId, companyId: user.companyId }, select: { id: true } });
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const result = await runWorkflow(id, {
      input: parsed.data.input ?? {},
      ...(user.companyId ? { companyId: user.companyId } : {}),
      userId: user.userId,
      ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          workflowRunId: result.workflowRunId,
          runId: result.runId,
          status: result.status,
          eventsUrl: `/api/runs/${result.runId}/events`,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes('not active')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[POST /api/workflows/:id/run]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
