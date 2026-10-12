import { z } from 'zod';
import { v1Handler, v1Body, v1ProjectAccess, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { runWorkflow } from '@/lib/workflow-engine';

/**
 * POST /api/v1/workflows/:id/run — execute a workflow end-to-end.
 */

const RunSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  projectId: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const workflowId = decodeURIComponent(request.nextUrl.pathname.split('/')[4]);
  const body = await v1Body<unknown>(request);
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const workflow = await db.workflow.findFirst({
    where: {
      OR: [{ id: workflowId }, { slug: workflowId }],
      workflowPermissions: { some: { companyId: identity.companyId, accessLevel: { in: ['execute', 'full'] } } },
    },
    select: { id: true, name: true, status: true },
  });
  if (!workflow) throw new V1Error('Workflow not found', 404, 'NOT_FOUND');

  if (parsed.data.projectId) await v1ProjectAccess(parsed.data.projectId, identity.companyId);
  const result = await runWorkflow(workflow.id, {
    input: parsed.data.input ?? {},
    companyId: identity.companyId,
    ...(identity.kind === 'session' ? { userId: identity.userId } : {}),
    ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
    ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
  });

  return {
    workflowRunId: result.workflowRunId,
    runId: result.runId,
    status: result.status,
    eventsUrl: `/api/runs/${result.runId}/events`,
  };
});
