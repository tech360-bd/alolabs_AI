import { v1Handler, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/events — recent run events for the tenant (GET).
 *
 * For live streaming, use GET /api/runs/:id/events (SSE).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const runId = request.nextUrl.searchParams.get('runId') ?? undefined;
  const type = request.nextUrl.searchParams.get('type') ?? undefined;

  // Run events are linked to runs; scope by the tenant's runs.
  const tenantRuns = await db.agentOSRun.findMany({
    where: { companyId: identity.companyId },
    select: { id: true },
    take: 500,
  });
  const runIds = new Set(tenantRuns.map((r) => r.id));

  if (runId) {
    const owned = await db.agentOSRun.findFirst({ where: { id: runId, companyId: identity.companyId }, select: { id: true } });
    if (!owned) throw new V1Error('Run not found', 404, 'NOT_FOUND');
  }
  const where = {
    ...(runId ? { runId } : { runId: { in: Array.from(runIds) } }),
    ...(type ? { type } : {}),
  };

  const [events, total] = await Promise.all([
    db.runEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.runEvent.count({ where }),
  ]);
  return { events, total, limit, offset };
});
