import { z } from 'zod';
import { jsonResponse, secureRoute } from '@/lib/api/secure-route';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/** Invoice listing is now authenticated and tenant-scoped; the `companyId`
 *  query filter was removed because the tenant comes from the principal. */
const invoiceListQuery = z.object({ status: z.string().max(40).optional() });

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const lastInvoice = await db.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let nextNum = 1;
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split('-');
    nextNum = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export const GET = secureRoute(
  { resource: 'billing.invoices', action: 'read', query: invoiceListQuery, rateLimit: { limit: 300, windowMs: 60_000 } },
  async (context) => {
    const { status } = context.query as z.infer<typeof invoiceListQuery>;

    const invoices = await db.invoice.findMany({
      where: context.tenantWhere(status ? { status } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { id: true, name: true, slug: true },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            plan: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    const data = invoices.map((inv) => ({
      id: inv.id,
      subscriptionId: inv.subscriptionId,
      companyId: inv.companyId,
      company: inv.company,
      subscription: inv.subscription,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      lineItems: JSON.parse(inv.lineItems),
      notes: inv.notes,
      createdAt: inv.createdAt,
    }));

    return jsonResponse({ data }, context.requestId);
  },
);

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const { subscriptionId, lineItems, notes } = body;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'subscriptionId is required' },
        { status: 400 }
      );
    }

    const subscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 400 }
      );
    }

    if (subscription.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot generate invoice for cancelled subscription' },
        { status: 400 }
      );
    }

    const parsedLineItems = lineItems || [
      {
        description: `${subscription.plan.name} Plan — Subscription`,
        amount: subscription.plan.priceMonthly,
        quantity: 1,
      },
    ];

    const totalAmount = parsedLineItems.reduce(
      (sum: number, item: { amount: number; quantity: number }) =>
        sum + (item.amount ?? 0) * (item.quantity ?? 1),
      0
    );

    const periodStart = new Date(subscription.currentPeriodEnd);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await db.invoice.create({
      data: {
        subscriptionId,
        companyId: subscription.companyId,
        invoiceNumber,
        amount: totalAmount,
        currency: 'USD',
        status: 'sent',
        dueDate: new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000),
        periodStart,
        periodEnd,
        lineItems: JSON.stringify(parsedLineItems),
        notes: notes || null,
      },
    });

    return NextResponse.json(
      {
        id: invoice.id,
        subscriptionId: invoice.subscriptionId,
        companyId: invoice.companyId,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        dueDate: invoice.dueDate,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        lineItems: parsedLineItems,
        notes: invoice.notes,
        createdAt: invoice.createdAt,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}