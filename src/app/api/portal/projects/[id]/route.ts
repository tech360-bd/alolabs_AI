import { clientRoute, denyForeignObject } from '@/lib/portal/auth';
import {
  activityDto, deliverableDto, documentDto, milestoneDto, projectDto, quotationDto,
} from '@/lib/portal/dto';

/**
 * GET /api/portal/projects/:id — one project with its milestones, files,
 * deliverables, quotations and history. A project id that belongs to another
 * client is indistinguishable from one that does not exist.
 */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const project = await ctx.tdb.clientProject.findOwned(id);
  if (!project) return denyForeignObject(ctx, 'client-project', id);

  const [milestones, documents, deliverables, quotations, activity] = await Promise.all([
    ctx.tdb.clientProjectMilestone.findMany({ where: { projectId: id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ctx.tdb.clientDocument.findMany({ where: { projectId: id, kind: { not: 'deliverable' } }, orderBy: { createdAt: 'desc' } }),
    ctx.tdb.clientDeliverable.findMany({ where: { projectId: id }, orderBy: [{ deliveredAt: 'desc' }] }),
    ctx.tdb.clientQuotation.findMany({ where: { projectId: id, status: { not: 'withdrawn' } }, orderBy: { issuedAt: 'desc' } }),
    ctx.tdb.clientActivity.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  return {
    project: projectDto(project),
    milestones: milestones.map(milestoneDto),
    documents: documents.map(documentDto),
    deliverables: deliverables.map((d) => deliverableDto(d)),
    quotations: quotations.map(quotationDto),
    activity: activity.map(activityDto),
  };
});
