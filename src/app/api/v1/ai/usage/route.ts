import { v1Handler, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { randomUUID } from 'node:crypto';

/**
 * GET /api/v1/ai/usage — the caller's own usage (tenant-scoped).
 *
 * Returns per-service usage units for the current billing period. Never
 * includes another tenant's data, internal cost structure, or workforce
 * allocation.
 */

export const GET = v1Handler(async ({ identity }) => {
  const entitlements = await db.entitlement.findMany({
    where: { companyId: identity.companyId },
    select: {
      serviceId: true,
      status: true,
      quotaLimit: true,
      quotaUsed: true,
      quotaPeriod: true,
      expiresAt: true,
      service: { select: { slug: true, name: true } },
    },
  });

  return {
    usage: entitlements.map((e) => ({
      service: e.service.slug,
      service_name: e.service.name,
      status: e.status,
      quota_limit: e.quotaLimit,
      quota_used: e.quotaUsed,
      remaining: Math.max(0, e.quotaLimit - e.quotaUsed),
      period: e.quotaPeriod,
      expires_at: e.expiresAt?.toISOString() ?? null,
    })),
    period: {
      type: 'monthly',
      started_at: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      ends_at: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    },
    request_id: randomUUID(),
  };
});
