import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, internalRoute } from '@/lib/internal/auth';
import { isProjectStatus } from '@/lib/client-services/status';

/** GET /api/internal/client-projects — client work across all accounts (staff only). */
export const GET = internalRoute(CLIENT_SERVICE_ROLES, async (ctx) => {
  const query = ctx.request.nextUrl.searchParams;
  const status = query.get('status');
  const companyId = query.get('companyId');
  const projects = await db.clientProject.findMany({
    where: {
      ...(status && isProjectStatus(status) ? { status } : {}),
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    include: { account: { select: { company: { select: { name: true } } } } },
  });
  return { projects };
});
