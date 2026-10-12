import { z } from 'zod';
import { db } from '@/lib/db';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

/**
 * Marketplace template installs — authenticated and tenant-scoped.
 *
 * Previously: no authentication, and both `companyId` and `userId` came from
 * the request body, so an anonymous caller could install (or attribute) a
 * template in any tenant. Both values now come from the principal.
 */

const listQuery = z.object({
  status: z.string().max(40).optional(),
});

const installSchema = z.object({
  templateId: z.string().min(1),
  config: z.unknown().optional(),
});

export const GET = secureRoute(
  { resource: 'marketplace.installs', action: 'read', query: listQuery },
  async (context) => {
    const { status } = context.query as z.infer<typeof listQuery>;
    const where = context.tenantWhere(status ? { status } : {});
    const data = await db.templateInstall.findMany({
      where,
      orderBy: { installedAt: 'desc' },
      include: { template: true },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);

export const POST = secureRoute(
  {
    resource: 'marketplace.installs',
    action: 'create',
    body: installSchema,
    rateLimit: { limit: 60, windowMs: 60_000 },
  },
  async (context) => {
    const { templateId, config } = context.body;
    const template = await db.marketplaceTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('Template not found');

    await db.templateVersion.create({
      data: {
        templateId,
        version: template.version,
        configJson: template.configJson,
        changeLog: 'Initial install',
        isCurrent: true,
      },
    });
    const data = await db.templateInstall.create({
      data: {
        templateId,
        companyId: context.companyId,
        userId: context.principal.userId,
        version: template.version,
        status: 'installed',
        configJson: JSON.stringify(config ?? {}),
      },
    });
    await db.marketplaceTemplate.update({
      where: { id: templateId },
      data: { installCount: { increment: 1 } },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);
