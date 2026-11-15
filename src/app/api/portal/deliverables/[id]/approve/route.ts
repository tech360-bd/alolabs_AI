import { clientRoute, conflict, denyForeignObject } from '@/lib/portal/auth';
import { deliverableDto, projectDto } from '@/lib/portal/dto';
import { logActivity, setProjectStatus } from '@/lib/client-services/operations';

/**
 * POST /api/portal/deliverables/:id/approve — accept delivered work.
 * Approving the final deliverable of a project in Client Review completes it.
 */
export const POST = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const deliverable = await ctx.tdb.clientDeliverable.findOwned(id);
  if (!deliverable) return denyForeignObject(ctx, 'client-deliverable', id);
  if (deliverable.status !== 'delivered') throw conflict('This deliverable has already been reviewed.');

  const updated = await ctx.tdb.clientDeliverable.updateOwned(
    id,
    { status: 'approved', reviewedAt: new Date(), reviewedByUserId: ctx.userId, revisionNote: null },
    { status: 'delivered' },
  );
  if (!updated) throw conflict('This deliverable has already been reviewed.');

  const projectId = String(deliverable.projectId);
  await logActivity(ctx.companyId, {
    projectId,
    entityType: 'deliverable',
    entityId: id,
    type: 'deliverable.approved',
    summary: `Deliverable approved: ${deliverable.title}`,
    actorType: 'client',
  });

  let project = await ctx.tdb.clientProject.findOwned(projectId);
  if (project && project.status === 'client_review' && deliverable.isFinal) {
    const awaiting = await ctx.tdb.clientDeliverable.count({ where: { projectId, status: 'delivered' } });
    if (awaiting === 0) project = await setProjectStatus(ctx.companyId, projectId, 'completed', 'client');
  }
  return { deliverable: deliverableDto(updated), project: project ? projectDto(project) : null };
});
