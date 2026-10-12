import { v1Handler, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/agents/:id — get one agent (by agentId like AGENT-0001 or db id).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const agent = await db.agent.findFirst({
    where: {
      OR: [{ agentId: id }, { id }],
      agentCompanyAccess: { some: { companyId: identity.companyId } },
    },
  });
  if (!agent) throw new V1Error('Agent not found', 404, 'NOT_FOUND');
  return agent;
});
