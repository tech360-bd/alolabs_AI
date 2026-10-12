import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

type RouteContext = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

export const GET = secureRoute(
  { resource: 'billing.subscriptions.item', action: 'read', params: paramsSchema, rateLimit: { limit: 300, windowMs: 60_000 } },
  async (context) => {
    const { id } = context.params as z.infer<typeof paramsSchema>;

    const subscription = await db.subscription.findFirst({
      where: context.tenantWhere({ id }),
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            priceMonthly: true,
            priceYearly: true,
            agentLimit: true,
            skillLimit: true,
            workflowLimit: true,
            monthlyTokens: true,
            monthlyRequests: true,
            features: true,
            isEnterprise: true,
          },
        },
        company: {
          select: { id: true, name: true, slug: true },
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            status: true,
            dueDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!subscription) throw notFound('Subscription not found');

    return jsonResponse({
      id: subscription.id,
      companyId: subscription.companyId,
      company: subscription.company,
      planId: subscription.planId,
      plan: {
        ...subscription.plan,
        features: JSON.parse(subscription.plan.features),
      },
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      recentInvoices: subscription.invoices,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    }, context.requestId);
  },
);

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth();

    const { id } = await context.params;
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (cancel, pause, resume)' },
        { status: 400 }
      );
    }

    const subscription = await db.subscription.findUnique({ where: { id } });
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};
    let newStatus = subscription.status;

    switch (action) {
      case 'cancel':
        if (subscription.status === 'cancelled') {
          return NextResponse.json(
            { error: 'Subscription is already cancelled' },
            { status: 400 }
          );
        }
        newStatus = 'cancelled';
        updateData = {
          status: 'cancelled',
          cancelledAt: new Date(),
        };
        break;

      case 'pause':
        if (subscription.status !== 'active' && subscription.status !== 'trial') {
          return NextResponse.json(
            { error: 'Only active or trial subscriptions can be paused' },
            { status: 400 }
          );
        }
        newStatus = 'paused';
        updateData = { status: 'paused' };
        break;

      case 'resume':
        if (subscription.status !== 'paused') {
          return NextResponse.json(
            { error: 'Only paused subscriptions can be resumed' },
            { status: 400 }
          );
        }
        newStatus = 'active';
        updateData = { status: 'active' };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use cancel, pause, or resume' },
          { status: 400 }
        );
    }

    const updated = await db.subscription.update({
      where: { id },
      data: updateData,
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
        company: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      companyId: updated.companyId,
      company: updated.company,
      planId: updated.planId,
      plan: updated.plan,
      status: updated.status,
      trialEndsAt: updated.trialEndsAt,
      currentPeriodStart: updated.currentPeriodStart,
      currentPeriodEnd: updated.currentPeriodEnd,
      cancelledAt: updated.cancelledAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}