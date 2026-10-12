import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { getMemory, storeMemory } from '@/lib/memory';

/**
 * /api/v1/memory — agent memory (GET: read, POST: write).
 *
 * Memory is scoped: entries are namespaced per agent + company and are never
 * exposed across tenants.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit } = v1Pagination(request);
  const agentId = request.nextUrl.searchParams.get('agentId');
  const type = request.nextUrl.searchParams.get('type') ?? undefined;

  if (agentId) {
    const owned = await db.agent.findFirst({
      where: {
        OR: [{ id: agentId }, { agentId }],
        agentCompanyAccess: { some: { companyId: identity.companyId } },
      },
      select: { id: true },
    });
    if (!owned) throw new V1Error('Agent not found', 404, 'NOT_FOUND');
    const entries = (await getMemory(agentId, type as never))
      .filter((entry) => entry.companyId === identity.companyId)
      .filter((entry) => entry.scope !== 'private' || entry.userId === identity.userId);
    return { agentId, entries: entries.slice(0, limit), total: entries.length };
  }

  // Company-wide memory listing (DB-backed agent memory)
  const where = { companyId: identity.companyId };
  const [memories, total] = await Promise.all([
    db.agentMemory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db.agentMemory.count({ where }),
  ]);
  return { memories, total, limit };
});

const WriteMemorySchema = z.object({
  agentId: z.string().min(1),
  key: z.string().trim().min(1).max(300),
  content: z.string().max(100000),
  type: z.enum(['short_term', 'long_term']).optional(),
  scope: z.enum(['private', 'team', 'company', 'global']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = WriteMemorySchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const agent = await db.agent.findFirst({
    where: {
      OR: [{ id: parsed.data.agentId }, { agentId: parsed.data.agentId }],
      agentCompanyAccess: { some: { companyId: identity.companyId } },
    },
    select: { id: true },
  });
  if (!agent) throw new V1Error('Agent not found', 404, 'NOT_FOUND');
  if (parsed.data.scope === 'global') throw new V1Error('Global memory writes are not permitted', 403, 'FORBIDDEN');
  const entry = await storeMemory(
    parsed.data.agentId,
    parsed.data.key,
    parsed.data.content,
    {
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
      companyId: identity.companyId,
      ...(identity.kind === 'session' ? { userId: identity.userId } : {}),
    },
  );

  return { stored: true, entry };
});
