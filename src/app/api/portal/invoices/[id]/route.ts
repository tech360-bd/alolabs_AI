import { clientRoute, denyForeignObject } from '@/lib/portal/auth';
import { invoiceDto, paymentDto } from '@/lib/portal/dto';

/** GET /api/portal/invoices/:id — one invoice with the payments and receipts against it. */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const invoice = await ctx.tdb.clientInvoice.findOwned(id);
  if (!invoice) return denyForeignObject(ctx, 'client-invoice', id);
  const payments = await ctx.tdb.clientPayment.findMany({ where: { invoiceId: id }, orderBy: { paidAt: 'desc' } });
  return {
    invoice: invoiceDto(invoice),
    payments: payments.map((p) => paymentDto(p, String(invoice.number))),
    billTo: { company: ctx.companyName, email: ctx.account.billingEmail ?? ctx.email, address: ctx.account.billingAddress },
  };
});
