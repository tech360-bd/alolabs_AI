import { clientRoute, denyForeignObject } from '@/lib/portal/auth';
import { projectDto } from '@/lib/portal/dto';
import { setProjectStatus } from '@/lib/client-services/operations';

/** POST /api/portal/projects/:id/withdraw — withdraw a request before work is approved. */
export const POST = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const project = await ctx.tdb.clientProject.findOwned(id);
  if (!project) return denyForeignObject(ctx, 'client-project', id);
  const updated = await setProjectStatus(ctx.companyId, id, 'cancelled', 'client');
  return { project: projectDto(updated) };
});
