import { z } from 'zod';
import { db } from '@/lib/db';
import { jsonResponse, secureRoute } from '@/lib/api/secure-route';

/**
 * Marketplace template catalogue.
 *
 * Reading the public catalogue stays available to anonymous visitors (rate
 * limited on a shared bucket); publishing a template is now an
 * administrator-only operation — previously anyone could POST one.
 */

const listQuery = z.object({
  type: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  category: z.string().min(1).max(60),
  description: z.string().max(2000).optional(),
  config: z.unknown().optional(),
  dependencies: z.unknown().optional(),
  icon: z.string().max(80).optional(),
});

export const GET = secureRoute(
  {
    resource: 'marketplace.templates',
    action: 'read',
    auth: 'optional',
    tenant: 'none',
    query: listQuery,
    rateLimit: { limit: 300, windowMs: 60_000, preAuth: true },
  },
  async (context) => {
    const { type, category } = context.query as z.infer<typeof listQuery>;
    const where: Record<string, unknown> = { isActive: true };
    if (type) where.type = type;
    if (category) where.category = category;
    const data = await db.marketplaceTemplate.findMany({
      where,
      orderBy: { installCount: 'desc' },
      include: { _count: { select: { installs: true, versions: true } } },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);

export const POST = secureRoute(
  {
    resource: 'marketplace.templates',
    action: 'create',
    roles: ['super_admin', 'admin'],
    body: createSchema,
    rateLimit: { limit: 60, windowMs: 60_000 },
  },
  async (context) => {
    const { config, dependencies, ...fields } = context.body;
    const data = await db.marketplaceTemplate.create({
      data: {
        ...fields,
        description: fields.description ?? '',
        configJson: JSON.stringify(config ?? {}),
        dependencies: JSON.stringify(dependencies ?? []),
        icon: fields.icon ?? 'Package',
      },
    });
    return jsonResponse({ data, success: true }, context.requestId);
  },
);
