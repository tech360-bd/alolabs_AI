import { v1Handler, v1Pagination } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/approvals — list pending approvals for the tenant (GET).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const status = request.nextUrl.searchParams.get('status') ?? 'pending';

  const where = {
    companyId: identity.companyId,
    ...(status !== 'all' ? { status } : {}),
  };

  const [approvals, total] = await Promise.all([
    db.approval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.approval.count({ where }),
  ]);
  return { approvals, total, limit, offset };
});
