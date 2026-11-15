import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody, requireClientCompany } from '@/lib/internal/auth';
import { logActivity, newReference, notifyClient, priceLines } from '@/lib/client-services/operations';
import { tenantDb } from '@/lib/portal/tenant-db';

/** GET /api/internal/client-invoices — client invoices across accounts (staff only). */
export const GET = internalRoute(CLIENT_SERVICE_ROLES, async (ctx) => {
  const companyId = ctx.request.nextUrl.searchParams.get('companyId');
  const invoices = await db.clientInvoice.findMany({ where: companyId ? { companyId } : {}, orderBy: { issuedAt: 'desc' }, take: 300 });
  return { invoices };
});

/**
 * POST /api/internal/client-invoices — issue an invoice to a client.
 * Body: { companyId, projectId?, quotationId?, title?, lineItems?, taxRate?, dueDate? }
 * With `quotationId` the lines are copied from the accepted quotation.
 */
export const POST = internalRoute(CLIENT_SERVICE_ROLES, async (ctx) => {
  const body = await readJsonBody(ctx.request);
  const account = await requireClientCompany(body.companyId);
  const tdb = tenantDb(account.companyId);

  let projectId: string | null = null;
  if (typeof body.projectId === 'string' && body.projectId) {
    // The project must belong to the SAME client the invoice is for.
    const project = await tdb.clientProject.findOwned(body.projectId, { select: { id: true } });
    if (!project) throw new InternalError(404, 'Project not found for this client.');
    projectId = project.id;
  }

  let priced: ReturnType<typeof priceLines>;
  let quotationId: string | null = null;
  if (typeof body.quotationId === 'string' && body.quotationId) {
    const quotation = await tdb.clientQuotation.findOwned(body.quotationId);
    if (!quotation) throw new InternalError(404, 'Quotation not found for this client.');
    if (quotation.status !== 'accepted') throw new InternalError(409, 'Only an accepted quotation can be invoiced.');
    quotationId = quotation.id;
    projectId = projectId ?? (quotation.projectId ? String(quotation.projectId) : null);
    const lines = JSON.parse(String(quotation.lineItems || '[]'));
    const subtotal = Number(quotation.subtotal) || 0;
    priced = priceLines(lines, subtotal > 0 ? ((Number(quotation.tax) || 0) / subtotal) * 100 : 0);
  } else {
    priced = priceLines(body.lineItems, Number(body.taxRate) || 0);
  }

  const dueDate = body.dueDate ? new Date(String(body.dueDate)) : new Date(Date.now() + 14 * 86_400_000);
  if (Number.isNaN(dueDate.getTime())) throw new InternalError(400, 'Invalid dueDate.');

  const invoice = await tdb.clientInvoice.create({
    data: {
      projectId,
      quotationId,
      number: newReference('INV'),
      title: typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '',
      lineItems: JSON.stringify(priced.lines),
      subtotal: priced.subtotal,
      tax: priced.tax,
      total: priced.total,
      currency: account.currency,
      dueDate,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
    },
  });
  await logActivity(account.companyId, {
    projectId, entityType: 'invoice', entityId: invoice.id, type: 'invoice.issued',
    summary: `Invoice ${invoice.number} issued`, actorType: 'service_team',
  });
  await notifyClient(account.companyId, {
    type: 'invoice.issued',
    title: `Invoice ${invoice.number}`,
    message: 'A new invoice is available in your billing area.',
    link: '/portal/billing',
  });
  return { invoice };
});
