import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const UpdateSchema = z.object({
  companyId: z.string().min(1),
  settings: z.object({
    externalDataProcessingApproved: z.boolean().optional(),
    confidentialDataExternalAllowed: z.boolean().optional(),
    dataProcessingPolicyUrl: z.string().url().max(1000).nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    locale: z.string().min(2).max(20).optional(),
    timezone: z.string().min(2).max(80).optional(),
  }).optional(),
  budget: z.object({
    monthlyTokenBudget: z.number().int().min(0).max(2_000_000_000).optional(),
    dailyTokenBudget: z.number().int().min(0).max(2_000_000_000).optional(),
    maxPaidBudgetUsd: z.number().min(0).max(1_000_000).optional(),
    paidApiAllowed: z.boolean().optional(),
    autoBillingEnabled: z.literal(false).optional(),
  }).optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const companyId = request.nextUrl.searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    const [company, settings, budget, policies] = await Promise.all([
      db.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, slug: true, status: true, paidApiAllowed: true } }),
      db.companySettings.findUnique({ where: { companyId } }),
      db.companyBudget.findUnique({ where: { companyId } }),
      db.modelRoutingPolicy.findMany({ where: { companyId }, orderBy: { profile: 'asc' } }),
    ]);
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    return NextResponse.json({
      company,
      settings,
      budget,
      policies: policies.map((policy) => ({ ...policy, allowedProviderConfigIds: JSON.parse(policy.allowedProviderConfigIds || '[]') })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Company AI Config] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = UpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { companyId, settings, budget } = parsed.data;
    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, paidApiAllowed: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const existingSettings = await db.companySettings.findUnique({ where: { companyId } });
    const externalApproved = settings?.externalDataProcessingApproved ?? existingSettings?.externalDataProcessingApproved ?? false;
    const policyUrl = settings?.dataProcessingPolicyUrl === undefined ? existingSettings?.dataProcessingPolicyUrl : settings.dataProcessingPolicyUrl;
    const confidentialExternal = settings?.confidentialDataExternalAllowed ?? existingSettings?.confidentialDataExternalAllowed ?? false;
    if (externalApproved && !policyUrl) return NextResponse.json({ error: 'A data-processing policy URL is required before approving external processing.' }, { status: 400 });
    if (confidentialExternal && !externalApproved) return NextResponse.json({ error: 'Confidential data cannot be approved without general external processing approval.' }, { status: 400 });

    const existingBudget = await db.companyBudget.findUnique({ where: { companyId } });
    const paidAllowed = budget?.paidApiAllowed ?? existingBudget?.paidApiAllowed ?? false;
    const paidBudget = budget?.maxPaidBudgetUsd ?? existingBudget?.maxPaidBudgetUsd ?? 0;
    const autoBilling = budget?.autoBillingEnabled ?? existingBudget?.autoBillingEnabled ?? false;
    if (autoBilling) return NextResponse.json({ error: 'Automatic billing is disabled and cannot be enabled through this system.' }, { status: 400 });
    if (paidAllowed && paidBudget <= 0) return NextResponse.json({ error: 'Paid use requires an explicit positive Super Admin budget.' }, { status: 400 });

    const result = await db.$transaction(async (transaction) => {
      const updatedSettings = settings ? await transaction.companySettings.upsert({
        where: { companyId },
        create: { companyId, ...settings },
        update: settings,
      }) : existingSettings;
      const updatedBudget = budget ? await transaction.companyBudget.upsert({
        where: { companyId },
        create: { companyId, ...budget, autoBillingEnabled: false },
        update: { ...budget, autoBillingEnabled: false },
      }) : existingBudget;
      if (budget?.paidApiAllowed !== undefined) {
        await transaction.company.update({ where: { id: companyId }, data: { paidApiAllowed: budget.paidApiAllowed } });
      }
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          companyId,
          action: 'company.ai_governance.update',
          resource: 'company-ai-config',
          resourceId: companyId,
          details: JSON.stringify({ settingsFields: Object.keys(settings ?? {}), budgetFields: Object.keys(budget ?? {}), paidAllowed, paidBudget, autoBilling: false }),
        },
      });
      return { settings: updatedSettings, budget: updatedBudget };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Company AI Config] PUT failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
