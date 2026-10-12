import { jsonResponse, secureRoute } from '@/lib/api/secure-route';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

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
  { resource: 'billing.subscriptions', action: 'read', rateLimit: { limit: 300, windowMs: 60_000 } },
  async (context) => {
    const subscriptions = await db.subscription.findMany({
      where: context.tenantWhere(),
      orderBy: { createdAt: 'desc' },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            priceMonthly: true,
            priceYearly: true,
            agentLimit: true,
            skillLimit: true,
            workflowLimit: true,
            monthlyTokens: true,
            monthlyRequests: true,
          },
        },
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    const data = subscriptions.map((s) => ({
      id: s.id,
      companyId: s.companyId,
      company: s.company,
      planId: s.planId,
      plan: s.plan,
      status: s.status,
      trialEndsAt: s.trialEndsAt,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelledAt: s.cancelledAt,
      createdAt: s.createdAt,
    }));

    return jsonResponse({ data }, context.requestId);
  },
);

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const { companyId, planId, billingCycle, trialDays } = body;

    if (!companyId || !planId) {
      return NextResponse.json(
        { error: 'companyId and planId are required' },
        { status: 400 }
      );
    }

    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 });
    }

    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 400 });
    }

    const existing = await db.subscription.findUnique({ where: { companyId } });
    if (existing) {
      return NextResponse.json(
        { error: 'Company already has a subscription' },
        { status: 400 }
      );
    }

    const now = new Date();
    const periodStart = new Date(now);
    const periodEnd = new Date(now);

    if (billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const trialEndsAt = trialDays
      ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    const subscription = await db.subscription.create({
      data: {
        companyId,
        planId,
        status: trialEndsAt ? 'trial' : 'active',
        trialEndsAt,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            priceMonthly: true,
            priceYearly: true,
          },
        },
      },
    });

    // Auto-generate first invoice
    const amount = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    const cycleLabel = billingCycle === 'yearly' ? 'Yearly' : 'Monthly';
    const invoiceNumber = await generateInvoiceNumber();

    const lineItems = [
      {
        description: `${plan.name} Plan — ${cycleLabel} subscription`,
        amount,
        quantity: 1,
      },
    ];

    const invoice = await db.invoice.create({
      data: {
        subscriptionId: subscription.id,
        companyId,
        invoiceNumber,
        amount,
        currency: 'USD',
        status: 'sent',
        dueDate: new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before period end
        periodStart,
        periodEnd,
        lineItems: JSON.stringify(lineItems),
        notes: `First invoice for ${plan.name} plan`,
      },
    });

    return NextResponse.json(
      {
        id: subscription.id,
        companyId: subscription.companyId,
        planId: subscription.planId,
        plan: subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        firstInvoiceId: invoice.id,
        firstInvoiceNumber: invoice.invoiceNumber,
        createdAt: subscription.createdAt,
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