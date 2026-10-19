import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { isOfficialProviderDocsUrl } from '@/lib/ai-provider-catalog';
import { isPaidPricingVerified } from '@/lib/multi-tenant-ai/policy';

export const dynamic = 'force-dynamic';

const PermissionSchema = z.object({
  companyId: z.string().min(1),
  providerConfigId: z.string().min(1),
  modelId: z.string().trim().min(1).max(200),
  isAllowed: z.boolean(),
  allowPaid: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const companyId = request.nextUrl.searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    const data = await db.companyModelPermission.findMany({
      where: { companyId },
      orderBy: [{ providerConfigId: 'asc' }, { modelId: 'asc' }],
      include: { providerConfig: { select: { id: true, companyId: true, provider: true, name: true, isLocal: true, fallbackEligible: true, priority: true, models: true } } },
    });
    return NextResponse.json({ data: data.map((row) => ({ ...row, providerConfig: { ...row.providerConfig, models: JSON.parse(row.providerConfig.models || '[]') } })) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Model Permissions] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = PermissionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { companyId, providerConfigId, modelId, isAllowed, allowPaid } = parsed.data;
    const [company, provider] = await Promise.all([
      db.company.findUnique({ where: { id: companyId }, select: { id: true, paidApiAllowed: true } }),
      db.aIProviderConfig.findUnique({ where: { id: providerConfigId }, select: { id: true, companyId: true, provider: true, baseUrl: true, models: true } }),
    ]);
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    if (!provider || (provider.companyId !== null && provider.companyId !== companyId)) return NextResponse.json({ error: 'Provider config not found for this company' }, { status: 404 });
    if (allowPaid && !isAllowed) return NextResponse.json({ error: 'A paid model must also be allowed.' }, { status: 400 });
    if (allowPaid) {
      const budget = await db.companyBudget.findUnique({ where: { companyId }, select: { paidApiAllowed: true, maxPaidBudgetUsd: true, autoBillingEnabled: true } });
      if (!company.paidApiAllowed || !budget?.paidApiAllowed || budget.maxPaidBudgetUsd <= 0 || budget.autoBillingEnabled) {
        return NextResponse.json({ error: 'Paid model permission requires an enabled Super Admin budget and automatic billing must remain disabled.' }, { status: 400 });
      }
      let models: Array<{ id?: string; costPerMillionTokens?: number }> = [];
      try { models = JSON.parse(provider.models || '[]') as Array<{ id?: string; costPerMillionTokens?: number }>; } catch { /* safe denial below */ }
      const model = models.find((item) => item.id === modelId);
      if (!model || typeof model.costPerMillionTokens !== 'number' || model.costPerMillionTokens <= 0) {
        return NextResponse.json({ error: 'Paid grants require a model with an explicitly configured positive cost estimate.' }, { status: 400 });
      }
      const verification = await db.aIProviderVerification.findFirst({
        where: { providerConfigId },
        orderBy: { verifiedAt: 'desc' },
      });
      if (!verification || !isPaidPricingVerified(verification, modelId, model.costPerMillionTokens)) {
        return NextResponse.json({ error: 'Paid grants require current official pricing evidence for this exact model and a non-automatic billing method.' }, { status: 400 });
      }
      if (!isOfficialProviderDocsUrl(provider.provider, verification.officialDocsUrl ?? '', provider.baseUrl) ||
          !isOfficialProviderDocsUrl(provider.provider, verification.pricingEvidenceUrl ?? '', provider.baseUrl)) {
        return NextResponse.json({ error: 'Paid pricing evidence must reference official provider documentation.' }, { status: 400 });
      }
    }
    const row = await db.$transaction(async (transaction) => {
      const existing = await transaction.companyModelPermission.findFirst({ where: { companyId, providerConfigId, modelId }, select: { id: true } });
      const permission = existing
        ? await transaction.companyModelPermission.update({ where: { id: existing.id }, data: { isAllowed, allowPaid, grantedBy: actor.userId } })
        : await transaction.companyModelPermission.create({ data: { companyId, providerConfigId, modelId, isAllowed, allowPaid, grantedBy: actor.userId } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          companyId,
          action: 'ai_model_permission.set',
          resource: 'company-model-permission',
          resourceId: permission.id,
          details: JSON.stringify({ providerConfigId, modelId, isAllowed, allowPaid }),
        },
      });
      return permission;
    });
    return NextResponse.json({ data: row });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Model Permissions] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
