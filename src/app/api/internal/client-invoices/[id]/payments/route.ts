import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { logActivity, newReference, notifyClient, reconcileInvoice } from '@/lib/client-services/operations';
import { tenantDb } from '@/lib/portal/tenant-db';

const METHODS = ['bank_transfer', 'card', 'mobile_banking', 'cash', 'other'];

/** POST /api/internal/client-invoices/:id/payments — record a payment and issue a receipt. */
export const POST = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const invoice = await db.clientInvoice.findUnique({ where: { id } });
  if (!invoice) throw new InternalError(404, 'Invoice not found.');
  if (invoice.status === 'void') throw new InternalError(409, 'This invoice is void.');
  const body = await readJsonBody(ctx.request);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const balance = Math.round((invoice.total - invoice.amountPaid) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new InternalError(400, 'amount must be greater than zero.');
  if (amount > balance) throw new InternalError(400, 'amount exceeds the outstanding balance.');

  const payment = await tenantDb(invoice.companyId).clientPayment.create({
    data: {
      invoiceId: id,
      receiptNumber: newReference('RCP'),
      amount,
      currency: invoice.currency,
      method: typeof body.method === 'string' && METHODS.includes(body.method) ? body.method : 'bank_transfer',
      reference: typeof body.reference === 'string' ? body.reference.slice(0, 120) : null,
      paidAt: body.paidAt ? new Date(String(body.paidAt)) : new Date(),
      recordedByUserId: ctx.userId,
    },
  });
  const updated = await reconcileInvoice(invoice.companyId, id);
  await logActivity(invoice.companyId, {
    projectId: invoice.projectId, entityType: 'invoice', entityId: id, type: 'payment.received',
    summary: `Payment received for invoice ${invoice.number}`, actorType: 'service_team',
  });
  await notifyClient(invoice.companyId, {
    type: 'payment.received',
    title: `Payment received — ${invoice.number}`,
    message: `Receipt ${payment.receiptNumber} is available in your billing area.`,
    link: '/portal/billing',
  });
  return { payment, invoice: updated };
});
