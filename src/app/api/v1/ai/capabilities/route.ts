import { v1Handler } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * GET /api/v1/ai/capabilities — public service catalog.
 *
 * Returns the services the platform offers, with descriptions and required
 * scopes. Never includes internal implementation details (which agent, which
 * model, which tool). The caller's entitlement status per service is included
 * so the portal can show "enabled" vs "not enabled".
 */

export const GET = v1Handler(async ({ identity }) => {
  const services = await db.service.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      endpoint: true,
      scope: true,
      entitlements: {
        where: { companyId: identity.companyId },
        select: { status: true, quotaLimit: true, quotaUsed: true, expiresAt: true },
      },
    },
    orderBy: { category: 'asc' },
  });

  return {
    services: services.map((s) => {
      const ent = s.entitlements[0];
      return {
        slug: s.slug,
        name: s.name,
        description: s.description,
        category: s.category,
        endpoint: s.endpoint,
        scope_required: s.scope,
        entitlement: ent
          ? {
              status: ent.status,
              quota_limit: ent.quotaLimit,
              quota_used: ent.quotaUsed,
              remaining: Math.max(0, ent.quotaLimit - ent.quotaUsed),
              expires_at: ent.expiresAt?.toISOString() ?? null,
            }
          : null,
      };
    }),
  };
});
