import { clientRoute } from '@/lib/portal/auth';
import { deliverableDto } from '@/lib/portal/dto';

/** GET /api/portal/deliverables — everything delivered to this client, with approval history. */
export const GET = clientRoute(async (ctx) => {
  const [deliverables, projects] = await Promise.all([
    ctx.tdb.clientDeliverable.findMany({ orderBy: { deliveredAt: 'desc' }, take: 300 }),
    ctx.tdb.clientProject.findMany({ select: { id: true, title: true } }),
  ]);
  const titles = new Map(projects.map((p) => [p.id, String(p.title)]));
  return { deliverables: deliverables.map((d) => deliverableDto(d, titles.get(String(d.projectId)) ?? '')) };
});
