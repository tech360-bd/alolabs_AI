import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { MODEL_ROUTING_PROFILES } from '@/lib/multi-tenant-ai/policy';

export const dynamic = 'force-dynamic';

const PolicySchema = z.object({
  companyId: z.string().min(1),
  profile: z.enum(MODEL_ROUTING_PROFILES),
  allowedProviderConfigIds: z.array(z.string().min(1)).max(100).default([]),
  preferLocal: z.boolean().default(true),
  allowVerifiedFree: z.boolean().default(true),
  allowPaid: z.boolean().default(false),
  externalDataAllowed: z.boolean().default(false),
  fallbackBehavior: z.literal('defer').default('defer'),
  maxOutputTokens: z.number().int().min(1).max(32768).default(4096),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const companyId = request.nextUrl.searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    const data = await db.modelRoutingPolicy.findMany({ where: { companyId }, orderBy: { profile: 'asc' } });
    return NextResponse.json({ data: data.map((row) => ({ ...row, allowedProviderConfigIds: JSON.parse(row.allowedProviderConfigIds || '[]') })) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Routing Policies] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = PolicySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;
    const company = await db.company.findUnique({ where: { id: data.companyId }, select: { id: true, paidApiAllowed: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    if (data.allowPaid && data.profile !== 'approved_paid') return NextResponse.json({ error: 'Paid use is allowed only in the approved_paid profile.' }, { status: 400 });
    if (data.allowPaid) {
      const budget = await db.companyBudget.findUnique({ where: { companyId: data.companyId }, select: { paidApiAllowed: true, maxPaidBudgetUsd: true, autoBillingEnabled: true } });
      if (!company.paidApiAllowed || !budget?.paidApiAllowed || budget.maxPaidBudgetUsd <= 0 || budget.autoBillingEnabled) {
        return NextResponse.json({ error: 'Paid routing requires explicit Super Admin authorization and a positive paid budget; auto-billing remains disabled.' }, { status: 400 });
      }
    }
    if (data.externalDataAllowed) {
      const settings = await db.companySettings.findUnique({ where: { companyId: data.companyId }, select: { externalDataProcessingApproved: true, dataProcessingPolicyUrl: true } });
      if (!settings?.externalDataProcessingApproved || !settings.dataProcessingPolicyUrl) {
        return NextResponse.json({ error: 'External routing requires a Super Admin-approved data-processing policy.' }, { status: 400 });
      }
    }
    if (data.allowedProviderConfigIds.length) {
      const providers = await db.aIProviderConfig.findMany({ where: { id: { in: data.allowedProviderConfigIds } }, select: { id: true, companyId: true } });
      if (providers.length !== new Set(data.allowedProviderConfigIds).size || providers.some((provider) => provider.companyId !== null && provider.companyId !== data.companyId)) {
        return NextResponse.json({ error: 'One or more provider configs do not exist or belong to another company.' }, { status: 400 });
      }
    }
    const policy = await db.$transaction(async (transaction) => {
      const existing = await transaction.modelRoutingPolicy.findFirst({ where: { companyId: data.companyId, profile: data.profile }, select: { id: true } });
      const values = {
        allowedProviderConfigIds: JSON.stringify(data.allowedProviderConfigIds),
        preferLocal: data.preferLocal,
        allowVerifiedFree: data.allowVerifiedFree,
        allowPaid: data.allowPaid,
        externalDataAllowed: data.externalDataAllowed,
        fallbackBehavior: data.fallbackBehavior,
        maxOutputTokens: data.maxOutputTokens,
        updatedBy: actor.userId,
      };
      const saved = existing
        ? await transaction.modelRoutingPolicy.update({ where: { id: existing.id }, data: values })
        : await transaction.modelRoutingPolicy.create({ data: { companyId: data.companyId, profile: data.profile, ...values } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          companyId: data.companyId,
          action: 'ai_routing_policy.update',
          resource: 'model-routing-policy',
          resourceId: saved.id,
          details: JSON.stringify({ profile: data.profile, allowedProviderConfigIds: data.allowedProviderConfigIds, allowPaid: data.allowPaid, externalDataAllowed: data.externalDataAllowed, fallbackBehavior: data.fallbackBehavior }),
        },
      });
      return saved;
    });
    return NextResponse.json({ data: { ...policy, allowedProviderConfigIds: data.allowedProviderConfigIds } });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Routing Policies] PUT failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
