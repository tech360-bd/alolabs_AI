import { badRequest, clientRoute, conflict, denyForeignObject, readBody } from '@/lib/portal/auth';
import { projectDto, quotationDto } from '@/lib/portal/dto';
import { logActivity, setProjectStatus } from '@/lib/client-services/operations';

/**
 * POST /api/portal/quotations/:id/respond — accept or decline a quotation.
 * Body: { decision: 'accept' | 'decline' }. Amounts cannot be changed here.
 */
export const POST = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const quotation = await ctx.tdb.clientQuotation.findOwned(id);
  if (!quotation) return denyForeignObject(ctx, 'client-quotation', id);

  const { decision } = await readBody(ctx.request);
  if (decision !== 'accept' && decision !== 'decline') throw badRequest('decision must be "accept" or "decline".');
  if (quotation.status !== 'sent') throw conflict('This quotation has already been responded to.');
  if (quotation.validUntil instanceof Date && quotation.validUntil.getTime() < Date.now()) {
    await ctx.tdb.clientQuotation.updateOwned(id, { status: 'expired' }, { status: 'sent' });
    throw conflict('This quotation has expired. Please ask us for an updated quotation.');
  }

  const status = decision === 'accept' ? 'accepted' : 'declined';
  const updated = await ctx.tdb.clientQuotation.updateOwned(
    id,
    { status, respondedAt: new Date(), respondedByUserId: ctx.userId },
    { status: 'sent' },
  );
  if (!updated) throw conflict('This quotation has already been responded to.');

  const projectId = quotation.projectId ? String(quotation.projectId) : null;
  await logActivity(ctx.companyId, {
    projectId,
    entityType: 'quotation',
    entityId: id,
    type: `quotation.${status}`,
    summary: `Quotation ${quotation.number} ${status}`,
    actorType: 'client',
  });

  let project = projectId ? await ctx.tdb.clientProject.findOwned(projectId) : null;
  if (project && project.status === 'quotation') {
    project = await setProjectStatus(ctx.companyId, project.id, decision === 'accept' ? 'approved' : 'reviewing', 'client');
  }
  return { quotation: quotationDto(updated), project: project ? projectDto(project) : null };
});
