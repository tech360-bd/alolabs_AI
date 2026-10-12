import { v1Handler, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/tasks/:id — task detail with steps, outputs, errors, artifacts.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const owned = identity.kind === 'session' && await db.task.findFirst({
    where: {
      id,
      userId: identity.userId,
      agent: { agentCompanyAccess: { some: { companyId: identity.companyId } } },
    },
    select: { id: true },
  });
  if (!owned) throw new V1Error('Task not found', 404, 'NOT_FOUND');
  const task = await db.task.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      outputs: true,
      taskErrors: true,
      artifacts: true,
    },
  });
  if (!task) throw new V1Error('Task not found', 404, 'NOT_FOUND');
  return task;
});
