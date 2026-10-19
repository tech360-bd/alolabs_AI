import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { isOfficialProviderDocsUrl } from '@/lib/ai-provider-catalog';

export const dynamic = 'force-dynamic';

const QuotaSchema = z.object({
  providerConfigId: z.string().min(1),
  quotaKind: z.enum(['provider_verified_quota', 'provider_reported_remaining', 'local_estimate', 'unknown']),
  quotaPeriod: z.enum(['request', 'minute', 'daily', 'monthly', 'unknown']).default('unknown'),
  limitRequests: z.number().int().nonnegative().optional().nullable(),
  limitTokens: z.number().int().nonnegative().optional().nullable(),
  remainingRequests: z.number().int().nonnegative().optional().nullable(),
  remainingTokens: z.number().int().nonnegative().optional().nullable(),
  resetAt: z.string().datetime().optional().nullable(),
  officialSource: z.string().url().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.quotaKind === 'provider_reported_remaining' && value.remainingRequests == null && value.remainingTokens == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['remainingTokens'], message: 'Provider-reported remaining quota requires a remaining request or token value' });
  }
  if ((value.quotaKind === 'provider_reported_remaining' || value.quotaKind === 'provider_verified_quota') && !value.officialSource) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['officialSource'], message: 'A source URL is required for provider-sourced quota data' });
  }
});

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');
    const providerConfigId = request.nextUrl.searchParams.get('providerConfigId') || undefined;
    const data = await db.providerQuotaSnapshot.findMany({
      where: providerConfigId ? { providerConfigId } : {},
      orderBy: { capturedAt: 'desc' },
      take: 500,
      include: { providerConfig: { select: { id: true, name: true, provider: true, companyId: true } } },
    });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Provider Quota] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = QuotaSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const config = await db.aIProviderConfig.findUnique({ where: { id: parsed.data.providerConfigId }, select: { id: true, provider: true, baseUrl: true, companyId: true } });
    if (!config) return NextResponse.json({ error: 'Provider config not found' }, { status: 404 });
    const source = parsed.data.officialSource ?? null;
    if (source && !isOfficialProviderDocsUrl(config.provider, source, config.baseUrl)) {
      return NextResponse.json({ error: 'Quota source must use an official provider documentation host listed for this provider.' }, { status: 400 });
    }
    const capturedAt = new Date();
    const data = await db.$transaction(async (transaction) => {
      const snapshot = await transaction.providerQuotaSnapshot.create({
        data: {
          providerConfigId: config.id,
          quotaKind: parsed.data.quotaKind,
          quotaPeriod: parsed.data.quotaPeriod,
          limitRequests: parsed.data.limitRequests ?? null,
          limitTokens: parsed.data.limitTokens ?? null,
          remainingRequests: parsed.data.remainingRequests ?? null,
          remainingTokens: parsed.data.remainingTokens ?? null,
          resetAt: parsed.data.resetAt ? new Date(parsed.data.resetAt) : null,
          capturedAt,
          officialSource: source,
          notes: parsed.data.notes ?? null,
          recordedBy: actor.userId,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          companyId: config.companyId,
          action: 'ai_provider.quota_snapshot.create',
          resource: 'provider-quota-snapshot',
          resourceId: snapshot.id,
          details: JSON.stringify({ providerConfigId: config.id, quotaKind: snapshot.quotaKind, quotaPeriod: snapshot.quotaPeriod, remainingRequests: snapshot.remainingRequests, remainingTokens: snapshot.remainingTokens, capturedAt: capturedAt.toISOString() }),
        },
      });
      return snapshot;
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Provider Quota] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
