import { z } from 'zod';
import { jsonResponse, secureRoute } from '@/lib/api/secure-route';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/** Payments are authenticated and tenant-scoped; `companyId` from the query
 *  string is no longer trusted. */
const paymentListQuery = z.object({ status: z.string().max(40).optional() });

export const GET = secureRoute(
  { resource: 'billing.payments', action: 'read', query: paymentListQuery, rateLimit: { limit: 300, windowMs: 60_000 } },
  async (context) => {
    const { status } = context.query as z.infer<typeof paymentListQuery>;

    const payments = await db.payment.findMany({
      where: context.tenantWhere(status ? { status } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    const data = payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      companyId: p.companyId,
      company: p.company,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      status: p.status,
      transactionRef: p.transactionRef,
      notes: p.notes,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    }));

    return jsonResponse({ data }, context.requestId);
  },
);

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const { invoiceId, companyId, amount, currency, method, transactionRef, notes, status: paymentStatus } = body;

    if (!companyId || !amount) {
      return NextResponse.json(
        { error: 'companyId and amount are required' },
        { status: 400 }
      );
    }

    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 });
    }

    let invoice: { id: string } | null = null;
    if (invoiceId) {
      invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 400 });
      }
    }

    const isCompleted = paymentStatus === 'completed';

    const payment = await db.payment.create({
      data: {
        invoiceId: invoiceId || null,
        companyId,
        amount,
        currency: currency || 'USD',
        method: method || 'manual',
        status: paymentStatus || 'pending',
        transactionRef: transactionRef || null,
        notes: notes || null,
        paidAt: isCompleted ? new Date() : null,
      },
    });

    // If payment completed and linked to an invoice, mark invoice as paid
    if (isCompleted && invoice) {
      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'paid',
          paidAt: new Date(),
        },
      });
    }

    return NextResponse.json(
      {
        id: payment.id,
        invoiceId: payment.invoiceId,
        companyId: payment.companyId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: payment.status,
        transactionRef: payment.transactionRef,
        notes: payment.notes,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
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