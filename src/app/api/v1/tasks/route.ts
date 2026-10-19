import { v1Handler, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/tasks — list tasks (GET), including steps.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const status = request.nextUrl.searchParams.get('status') ?? undefined;
  const agentId = request.nextUrl.searchParams.get('agentId') ?? undefined;

  // Task carries companyId; do not infer tenant ownership from a shared agent.
  if (identity.kind === 'apiKey') {
    throw new V1Error('Task listing requires a user session', 403, 'FORBIDDEN');
  }
  const where = {
    companyId: identity.companyId,
    userId: identity.userId,
    ...(agentId ? { agentId } : {}),
    ...(status ? { status } : {}),
  };

  const [tasks, total] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    }),
    db.task.count({ where }),
  ]);
  return { tasks, total, limit, offset };
});
