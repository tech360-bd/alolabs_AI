import { db } from '@/lib/db';
import { clientRoute } from '@/lib/portal/auth';
import { invoiceDto, paymentDto, quotationDto } from '@/lib/portal/dto';

/**
 * GET /api/portal/billing — quotations, invoices, payments and balance.
 *
 * This is what the client has been quoted and charged for services. It is
 * built only from the client billing tables; ALO Labs' own running costs are
 * held elsewhere and are not part of any figure here.
 */
export const GET = clientRoute(async (ctx) => {
  const [quotations, invoices, payments, projects] = await Promise.all([
    ctx.tdb.clientQuotation.findMany({ where: { status: { not: 'withdrawn' } }, orderBy: { issuedAt: 'desc' }, take: 200 }),
    ctx.tdb.clientInvoice.findMany({ orderBy: { issuedAt: 'desc' }, take: 300 }),
    ctx.tdb.clientPayment.findMany({ orderBy: { paidAt: 'desc' }, take: 300 }),
    ctx.tdb.clientProject.findMany({
      where: { status: { in: ['approved', 'in_progress', 'client_review', 'revision'] }, serviceOfferingId: { not: null } },
      select: { id: true, title: true, serviceName: true, serviceOfferingId: true, createdAt: true },
    }),
  ]);

  const invoiceList = invoices.map(invoiceDto);
  const numbers = new Map(invoices.map((i) => [i.id, String(i.number)]));
  const billed = invoiceList.filter((i) => i.status !== 'void');

  // Recurring services the client currently has running.
  const offeringIds = [...new Set(projects.map((p) => String(p.serviceOfferingId)))];
  const recurring = offeringIds.length
    ? await db.serviceOffering.findMany({
        where: { id: { in: offeringIds }, billingInterval: { not: null } },
        select: { id: true, name: true, billingInterval: true },
      })
    : [];
  const recurringById = new Map(recurring.map((o) => [o.id, o]));
  const subscriptions = projects
    .filter((p) => recurringById.has(String(p.serviceOfferingId)))
    .map((p) => ({
      projectId: p.id,
      service: String(p.serviceName),
      title: String(p.title),
      billedEvery: recurringById.get(String(p.serviceOfferingId))!.billingInterval,
      status: 'active',
      since: p.createdAt instanceof Date ? p.createdAt.toISOString() : null,
    }));

  const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
  return {
    currency: ctx.account.currency,
    summary: {
      totalInvoiced: sum(billed.map((i) => i.total)),
      totalPaid: sum(billed.map((i) => i.amountPaid)),
      outstandingBalance: sum(billed.map((i) => i.balanceDue)),
      overdueBalance: sum(billed.filter((i) => i.status === 'overdue').map((i) => i.balanceDue)),
    },
    quotations: quotations.map(quotationDto),
    invoices: invoiceList,
    payments: payments.map((p) => paymentDto(p, numbers.get(String(p.invoiceId)) ?? '')),
    subscriptions,
  };
});
