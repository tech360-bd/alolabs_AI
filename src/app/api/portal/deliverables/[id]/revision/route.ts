import { clientRoute, conflict, denyForeignObject, readBody, text } from '@/lib/portal/auth';
import { deliverableDto, projectDto } from '@/lib/portal/dto';
import { logActivity, setProjectStatus } from '@/lib/client-services/operations';

/** POST /api/portal/deliverables/:id/revision — ask for changes to delivered work. */
export const POST = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const deliverable = await ctx.tdb.clientDeliverable.findOwned(id);
  if (!deliverable) return denyForeignObject(ctx, 'client-deliverable', id);
  if (deliverable.status !== 'delivered') throw conflict('This deliverable has already been reviewed.');
  const note = text(await readBody(ctx.request), 'note', { min: 5, max: 5000 });

  const updated = await ctx.tdb.clientDeliverable.updateOwned(
    id,
    { status: 'revision_requested', reviewedAt: new Date(), reviewedByUserId: ctx.userId, revisionNote: note },
    { status: 'delivered' },
  );
  if (!updated) throw conflict('This deliverable has already been reviewed.');

  const projectId = String(deliverable.projectId);
  await logActivity(ctx.companyId, {
    projectId,
    entityType: 'deliverable',
    entityId: id,
    type: 'deliverable.revision_requested',
    summary: `Revision requested: ${deliverable.title}`,
    actorType: 'client',
  });
  let project = await ctx.tdb.clientProject.findOwned(projectId);
  if (project && project.status === 'client_review') {
    project = await setProjectStatus(ctx.companyId, projectId, 'revision', 'client');
  }
  return { deliverable: deliverableDto(updated), project: project ? projectDto(project) : null };
});
