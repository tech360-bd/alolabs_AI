import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, internalRoute } from '@/lib/internal/auth';

/** GET /api/internal/client-tickets — support requests across client accounts (staff only). */
export const GET = internalRoute(CLIENT_SERVICE_ROLES, async (ctx) => {
  const query = ctx.request.nextUrl.searchParams;
  const status = query.get('status');
  const companyId = query.get('companyId');
  const tickets = await db.clientSupportTicket.findMany({
    where: { ...(status ? { status } : {}), ...(companyId ? { companyId } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    include: { account: { select: { company: { select: { name: true } } } } },
  });
  return { tickets };
});
