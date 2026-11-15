import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { logActivity, newReference, notifyClient, priceLines, setProjectStatus } from '@/lib/client-services/operations';
import { tenantDb } from '@/lib/portal/tenant-db';

/**
 * POST /api/internal/client-projects/:id/quotations — send the client a quotation.
 * Line items are what the client is charged for the service. Internal running
 * costs are not a line item and have no field here.
 */
export const POST = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const project = await db.clientProject.findUnique({ where: { id } });
  if (!project) throw new InternalError(404, 'Client project not found.');
  if (!['reviewing', 'quotation'].includes(project.status)) throw new InternalError(409, 'A quotation can only be sent while a request is under review.');
  const body = await readJsonBody(ctx.request);
  const priced = priceLines(body.lineItems, Number(body.taxRate) || 0);
  const validUntil = body.validUntil ? new Date(String(body.validUntil)) : new Date(Date.now() + 30 * 86_400_000);
  if (Number.isNaN(validUntil.getTime())) throw new InternalError(400, 'Invalid validUntil.');
  const account = await db.clientAccount.findUnique({ where: { companyId: project.companyId }, select: { currency: true } });

  const tdb = tenantDb(project.companyId);
  // Only one quotation is open per project at a time.
  await tdb.clientQuotation.updateMany({ where: { projectId: id, status: 'sent' }, data: { status: 'withdrawn' } });
  const quotation = await tdb.clientQuotation.create({
    data: {
      projectId: id,
      number: newReference('QUO'),
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : `Quotation for ${project.title}`,
      lineItems: JSON.stringify(priced.lines),
      subtotal: priced.subtotal,
      tax: priced.tax,
      total: priced.total,
      currency: account?.currency ?? 'USD',
      validUntil,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
      terms: typeof body.terms === 'string' ? body.terms.slice(0, 4000) : null,
    },
  });
  await logActivity(project.companyId, {
    projectId: id, entityType: 'quotation', entityId: quotation.id, type: 'quotation.sent',
    summary: `Quotation ${quotation.number} issued`, actorType: 'service_team',
  });
  if (project.status === 'reviewing') await setProjectStatus(project.companyId, id, 'quotation', 'staff', { silent: true });
  await notifyClient(project.companyId, {
    type: 'quotation.sent',
    title: `Quotation ready: ${project.title}`,
    message: `Quotation ${quotation.number} is ready for your review.`,
    link: '/portal/billing',
  });
  return { quotation };
});
