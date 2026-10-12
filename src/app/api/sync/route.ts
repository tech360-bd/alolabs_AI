import { z } from 'zod';
import { db } from '@/lib/db';
import { jsonResponse, secureRoute } from '@/lib/api/secure-route';

/**
 * Cross-system sync log — authenticated and tenant-scoped.
 *
 * Previously: no authentication at all, and the `companyId` written to the log
 * came straight from the request body, so anyone could forge another tenant's
 * sync records. The tenant is now taken from the authenticated principal.
 */

const listQuery = z.object({
  sourceSystem: z.string().max(120).optional(),
  targetSystem: z.string().max(120).optional(),
  status: z.string().max(40).optional(),
});

const createSchema = z.object({
  sourceSystem: z.string().min(1).max(120),
  targetSystem: z.string().min(1).max(120),
  syncType: z.string().min(1).max(60),
  entityType: z.string().min(1).max(120),
  entityId: z.string().max(128).optional(),
  payload: z.unknown().optional(),
});

export const GET = secureRoute(
  { resource: 'sync.log', action: 'read', query: listQuery },
  async (context) => {
    const { sourceSystem, targetSystem, status } = context.query as z.infer<typeof listQuery>;
    const where = context.tenantWhere({
      ...(sourceSystem ? { sourceSystem } : {}),
      ...(targetSystem ? { targetSystem } : {}),
      ...(status ? { status } : {}),
    });
    const data = await db.crossSystemSyncLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);

export const POST = secureRoute(
  {
    resource: 'sync.log',
    action: 'create',
    body: createSchema,
    rateLimit: { limit: 240, windowMs: 60_000 },
  },
  async (context) => {
    const { payload, ...fields } = context.body;
    const data = await db.crossSystemSyncLog.create({
      data: {
        ...fields,
        payload: JSON.stringify(payload ?? {}),
        syncedBy: context.principal.userId,
        companyId: context.companyId,
        status: 'syncing',
      },
    });
    await db.crossSystemSyncLog.update({
      where: { id: data.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);
