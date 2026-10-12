import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

export async function GET() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const data = plans.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      agentLimit: p.agentLimit,
      skillLimit: p.skillLimit,
      workflowLimit: p.workflowLimit,
      monthlyTokens: p.monthlyTokens,
      monthlyRequests: p.monthlyRequests,
      features: JSON.parse(p.features),
      isEnterprise: p.isEnterprise,
      sortOrder: p.sortOrder,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');

    const body = await request.json();
    const {
      name,
      slug,
      description,
      priceMonthly,
      priceYearly,
      agentLimit,
      skillLimit,
      workflowLimit,
      monthlyTokens,
      monthlyRequests,
      features,
      isEnterprise,
      sortOrder,
    } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'name and slug are required' },
        { status: 400 }
      );
    }

    const existing = await db.subscriptionPlan.findFirst({
      where: {
        OR: [{ name }, { slug }],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Plan with this name or slug already exists' },
        { status: 400 }
      );
    }

    const plan = await db.subscriptionPlan.create({
      data: {
        name,
        slug,
        description: description || null,
        priceMonthly: priceMonthly ?? 0,
        priceYearly: priceYearly ?? 0,
        agentLimit: agentLimit ?? 100,
        skillLimit: skillLimit ?? 500,
        workflowLimit: workflowLimit ?? 100,
        monthlyTokens: monthlyTokens ?? 1000000,
        monthlyRequests: monthlyRequests ?? 50000,
        features: features ? JSON.stringify(features) : '[]',
        isEnterprise: isEnterprise ?? false,
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json(
      {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        agentLimit: plan.agentLimit,
        skillLimit: plan.skillLimit,
        workflowLimit: plan.workflowLimit,
        monthlyTokens: plan.monthlyTokens,
        monthlyRequests: plan.monthlyRequests,
        features: JSON.parse(plan.features),
        isEnterprise: plan.isEnterprise,
        sortOrder: plan.sortOrder,
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