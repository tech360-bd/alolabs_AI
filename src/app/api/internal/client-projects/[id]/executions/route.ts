import { db } from '@/lib/db';
import { InternalError, WORKFORCE_ROLES, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { startExecution, syncExecution } from '@/lib/client-services/fulfilment';

/** GET /api/internal/client-projects/:id/executions — internal work on a client project. */
export const GET = internalRoute<{ id: string }>(WORKFORCE_ROLES, async (_ctx, { id }) => {
  const rows = await db.clientProjectExecution.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const executions = await Promise.all(rows.map((row) => syncExecution(row.id)));
  return {
    executions: executions.map(({ execution, run }) => ({
      ...execution,
      run: run ? { id: run.id, status: run.status, summary: run.summary, error: run.error, startedAt: run.startedAt, completedAt: run.completedAt } : null,
    })),
  };
});

/**
 * POST /api/internal/client-projects/:id/executions — hand the project to the
 * internal AI workforce. The client sees only that the project is In Progress.
 */
export const POST = internalRoute<{ id: string }>(WORKFORCE_ROLES, async (ctx, { id }) => {
  const project = await db.clientProject.findUnique({ where: { id }, select: { companyId: true } });
  if (!project) throw new InternalError(404, 'Client project not found.');
  const body = await readJsonBody(ctx.request).catch(() => ({}) as Record<string, unknown>);
  const execution = await startExecution({
    companyId: project.companyId,
    projectId: id,
    staffUserId: ctx.userId,
    instructions: typeof body.instructions === 'string' ? body.instructions.slice(0, 5000) : undefined,
    workflowId: typeof body.workflowId === 'string' ? body.workflowId : undefined,
    priority: typeof body.priority === 'string' ? body.priority : undefined,
  });
  return { execution };
});
