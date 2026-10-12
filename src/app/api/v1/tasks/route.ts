import { v1Handler, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/tasks — list tasks (GET), including steps.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const status = request.nextUrl.searchParams.get('status') ?? undefined;
  const agentId = request.nextUrl.searchParams.get('agentId') ?? undefined;

  // Task has no companyId column. Scope through its agent's access grant
  // and the requesting user's ownership; service API keys cannot enumerate
  // unscoped historical tasks until the schema carries a tenant key.
  if (identity.kind === 'apiKey') {
    throw new V1Error('Task listing requires a user session', 403, 'FORBIDDEN');
  }
  const agents = await db.agent.findMany({
    where: { agentCompanyAccess: { some: { companyId: identity.companyId } } },
    select: { id: true },
  });
  const where = {
    userId: identity.userId,
    agentId: agentId && agents.some((a) => a.id === agentId)
      ? agentId
      : { in: agentId ? [] : agents.map((a) => a.id) },
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
