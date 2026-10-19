import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { isOfficialProviderDocsUrl } from '@/lib/ai-provider-catalog';
import { writeAuditEvent } from '@/lib/audit-events';

export const dynamic = 'force-dynamic';

function parseJsonArray(value: string | null | undefined): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const VerificationSchema = z.object({
  providerConfigId: z.string().min(1),
  officialDocsUrl: z.string().url().max(1000).optional().nullable(),
  freeTierEligibility: z.enum(['unknown', 'verified_free', 'not_free']).default('unknown'),
  verifiedModels: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  pricingEvidenceUrl: z.string().url().max(1000).optional().nullable(),
  verifiedModelCosts: z.array(z.object({
    modelId: z.string().trim().min(1).max(200),
    costPerMillionTokens: z.number().positive().max(100_000),
  }).strict()).max(100).default([]),
  commercialUse: z.enum(['unknown', 'allowed', 'restricted']).default('unknown'),
  rateLimitRequestsPerMinute: z.number().int().nonnegative().optional().nullable(),
  rateLimitTokensPerMinute: z.number().int().nonnegative().optional().nullable(),
  dailyQuotaTokens: z.number().int().nonnegative().optional().nullable(),
  monthlyQuotaTokens: z.number().int().nonnegative().optional().nullable(),
  quotaPeriod: z.enum(['request', 'minute', 'daily', 'monthly', 'unknown']).default('unknown'),
  apiCompatibility: z.enum(['unknown', 'openai-compatible', 'native', 'partial', 'incompatible']).default('unknown'),
  dataRetention: z.enum(['unknown', 'no-training', 'retained', 'configurable', 'restricted']).default('unknown'),
  billingBehavior: z.enum(['unknown', 'no_automatic_billing', 'auto_billing', 'prepaid_only', 'manual_top_up']).default('unknown'),
  authenticationRequirements: z.enum(['unknown', 'api_key', 'oauth', 'account_required', 'no_key']).default('unknown'),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  try {
    await requireRole('super_admin');
    const rows = await db.aIProviderVerification.findMany({
      orderBy: { verifiedAt: 'desc' },
      take: 200,
      include: { providerConfig: { select: { id: true, name: true, provider: true, companyId: true } } },
    });
    return NextResponse.json({ data: rows.map((row) => ({
      ...row,
      verifiedModels: parseJsonArray(row.verifiedModels),
      verifiedModelCosts: parseJsonArray(row.verifiedModelCosts),
    })) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Provider Verification] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = VerificationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const config = await db.aIProviderConfig.findUnique({ where: { id: parsed.data.providerConfigId }, select: { id: true, provider: true, baseUrl: true, companyId: true, models: true } });
    if (!config) return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
    const docsUrl = parsed.data.officialDocsUrl ?? null;
    if (docsUrl && !isOfficialProviderDocsUrl(config.provider, docsUrl, config.baseUrl)) {
      return NextResponse.json({ error: 'Documentation URL must use an official provider host listed for this provider.' }, { status: 400 });
    }
    const pricingEvidenceUrl = parsed.data.pricingEvidenceUrl ?? null;
    if (pricingEvidenceUrl && !isOfficialProviderDocsUrl(config.provider, pricingEvidenceUrl, config.baseUrl)) {
      return NextResponse.json({ error: 'Pricing evidence must use an official provider documentation host listed for this provider.' }, { status: 400 });
    }
    if (parsed.data.verifiedModelCosts.length) {
      if (!docsUrl || !pricingEvidenceUrl || parsed.data.commercialUse !== 'allowed' ||
          !['no_automatic_billing', 'prepaid_only', 'manual_top_up'].includes(parsed.data.billingBehavior)) {
        return NextResponse.json({ error: 'Paid pricing verification requires official documentation, explicit commercial-use approval, and billing that cannot charge automatically.' }, { status: 400 });
      }
      let configuredModels: Array<{ id?: string; costPerMillionTokens?: number }>;
      try {
        const parsedModels: unknown = JSON.parse(config.models || '[]');
        if (!Array.isArray(parsedModels)) throw new Error('Configured model catalogue is not an array.');
        configuredModels = parsedModels as Array<{ id?: string; costPerMillionTokens?: number }>;
      } catch {
        return NextResponse.json({ error: 'Provider model catalogue is invalid; correct it before recording pricing evidence.' }, { status: 400 });
      }
      const seenModels = new Set<string>();
      for (const price of parsed.data.verifiedModelCosts) {
        if (seenModels.has(price.modelId)) return NextResponse.json({ error: `Duplicate pricing record for model ${price.modelId}` }, { status: 400 });
        seenModels.add(price.modelId);
        const configured = configuredModels.find((model) => model.id === price.modelId);
        if (!configured || configured.costPerMillionTokens !== price.costPerMillionTokens) {
          return NextResponse.json({ error: `Verified price for ${price.modelId} must exactly match its configured cost estimate.` }, { status: 400 });
        }
      }
    }
    if (parsed.data.freeTierEligibility === 'verified_free') {
      if (!docsUrl || !parsed.data.verifiedModels.length || parsed.data.commercialUse !== 'allowed' || parsed.data.billingBehavior !== 'no_automatic_billing') {
        return NextResponse.json({ error: 'Verified free requires an official documentation URL, explicit model IDs, commercial-use approval, and no automatic billing.' }, { status: 400 });
      }
    }
    const verifiedAt = new Date();
    const row = await db.$transaction(async (transaction) => {
      const created = await transaction.aIProviderVerification.create({
        data: {
          providerConfigId: config.id,
          officialDocsUrl: docsUrl,
          verifiedAt,
          freeTierEligibility: parsed.data.freeTierEligibility,
          verifiedModels: JSON.stringify(parsed.data.verifiedModels),
          pricingEvidenceUrl,
          pricingVerifiedAt: parsed.data.verifiedModelCosts.length ? verifiedAt : null,
          verifiedModelCosts: JSON.stringify(parsed.data.verifiedModelCosts),
          commercialUse: parsed.data.commercialUse,
          rateLimitRequestsPerMinute: parsed.data.rateLimitRequestsPerMinute ?? null,
          rateLimitTokensPerMinute: parsed.data.rateLimitTokensPerMinute ?? null,
          dailyQuotaTokens: parsed.data.dailyQuotaTokens ?? null,
          monthlyQuotaTokens: parsed.data.monthlyQuotaTokens ?? null,
          quotaPeriod: parsed.data.quotaPeriod,
          apiCompatibility: parsed.data.apiCompatibility,
          dataRetention: parsed.data.dataRetention,
          billingBehavior: parsed.data.billingBehavior,
          authenticationRequirements: parsed.data.authenticationRequirements,
          notes: parsed.data.notes ?? null,
          verifiedBy: actor.userId,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          companyId: config.companyId,
          action: 'ai_provider.verification.create',
          resource: 'ai-provider-verification',
          resourceId: created.id,
          details: JSON.stringify({ providerConfigId: config.id, freeTierEligibility: created.freeTierEligibility, verifiedModels: parsed.data.verifiedModels, verifiedModelCosts: parsed.data.verifiedModelCosts, officialDocsUrl: docsUrl, pricingEvidenceUrl }),
        },
      });
      return created;
    });
    return NextResponse.json({ data: { ...row, verifiedModels: parsed.data.verifiedModels, verifiedModelCosts: parsed.data.verifiedModelCosts } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Provider Verification] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
