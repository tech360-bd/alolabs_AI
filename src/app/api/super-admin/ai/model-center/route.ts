import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { ensureRouterSynced } from '@/lib/ai-router';
import { freeOnlyModeDescription, isFreeOnlyMode } from '@/lib/ai-router/free-only-mode';
import { FREE_PROVIDER_ENV_MAP } from '@/lib/ai-router/free-provider-specs';
import { getDefaultQuota } from '@/lib/ai-router/free-tier-quota-tracker';
import { OPEN_SOURCE_MODELS } from '@/lib/open-source-models';
import { buildWeeklyDiscoveryReport } from '@/lib/ai-discovery/weekly-discovery';

export const dynamic = 'force-dynamic';

/**
 * /api/super-admin/ai/model-center
 *
 * Model Control Center data for the Super Admin UI (Phase 6).
 *
 * Every number here is computed from the database or the live router. Nothing
 * is fabricated: a metric with no rows reports 0, and a model with no
 * verification row reports `unverified` rather than "free".
 *
 * Read-only. It never changes a provider, policy or model assignment.
 */

function authError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface UsageAggregate {
  provider: string | null;
  model: string | null;
  status: string;
  _count: { _all: number };
  _sum: { totalTokens: number | null; estimatedCostUsd: number | null };
  _avg: { latencyMs: number | null };
}

export async function GET() {
  try {
    await requireRole('super_admin');

    const since = new Date(Date.now() - 7 * DAY_MS);

    const [configs, verifications, usageRows, decisions, recentFailures] = await Promise.all([
      db.aIProviderConfig.findMany({
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, companyId: true, provider: true, name: true, baseUrl: true, isEnabled: true,
          isLocal: true, fallbackEligible: true, priority: true, models: true,
          lastHealthStatus: true, lastHealthAt: true, lastHealthLatencyMs: true, lastError: true,
          encryptedApiKey: true,
        },
      }),
      db.aIProviderVerification.findMany({
        orderBy: { verifiedAt: 'desc' },
        select: {
          id: true, providerConfigId: true, freeTierEligibility: true, verifiedAt: true,
          officialDocsUrl: true, commercialUse: true, billingBehavior: true,
          verifiedModels: true, pricingEvidenceUrl: true, pricingVerifiedAt: true,
        },
      }),
      db.modelUsageRecord.groupBy({
        by: ['provider', 'model', 'status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCostUsd: true },
        _avg: { latencyMs: true },
      }) as unknown as Promise<UsageAggregate[]>,
      db.modelRoutingDecision.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true, requestedModel: true, selectedProvider: true, selectedModel: true,
          reason: true, attempts: true, fallbackFrom: true, success: true,
          errorCode: true, latencyMs: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.modelUsageRecord.findMany({
        where: { createdAt: { gte: since }, status: { in: ['failure', 'deferred', 'blocked'] } },
        select: {
          id: true, provider: true, model: true, status: true, errorCode: true,
          rateLimitResponse: true, createdAt: true, profile: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const router = await ensureRouterSynced();
    const runtime = router.getProviderSummaries();

    // ── Verification lookup (latest row per provider config) ──────────
    const verificationByConfig = new Map<string, (typeof verifications)[number]>();
    for (const row of verifications) {
      if (!verificationByConfig.has(row.providerConfigId)) verificationByConfig.set(row.providerConfigId, row);
    }

    const verificationFresh = (verifiedAt: Date | null): boolean =>
      Boolean(verifiedAt) && Date.now() - (verifiedAt as Date).getTime() <= 30 * DAY_MS;

    // ── Model registry (configured models only, no invention) ─────────
    const models = configs.flatMap((config) => {
      let catalogue: Array<{ id?: unknown; name?: unknown; contextLength?: unknown; capabilities?: unknown }> = [];
      try {
        const parsed = JSON.parse(config.models || '[]');
        if (Array.isArray(parsed)) catalogue = parsed;
      } catch {
        catalogue = [];
      }
      const verification = verificationByConfig.get(config.id);
      let verifiedModels: string[] = [];
      try {
        const parsed = JSON.parse(verification?.verifiedModels || '[]');
        if (Array.isArray(parsed)) verifiedModels = parsed.filter((id): id is string => typeof id === 'string');
      } catch {
        verifiedModels = [];
      }
      return catalogue
        .filter((model) => typeof model.id === 'string')
        .map((model) => {
          const modelId = model.id as string;
          const openModel = OPEN_SOURCE_MODELS.find((entry) => modelId.toLowerCase().includes(entry.id.toLowerCase()));
          const quota = getDefaultQuota(config.provider);
          return {
            id: modelId,
            providerConfigId: config.id,
            provider: config.provider,
            providerName: config.name,
            isLocal: config.isLocal,
            isEnabled: config.isEnabled,
            contextLength: typeof model.contextLength === 'number' ? model.contextLength : openModel?.contextLength ?? null,
            capabilities: Array.isArray(model.capabilities) ? model.capabilities.filter((c): c is string => typeof c === 'string') : [],
            licence: openModel?.license ?? null,
            family: openModel?.family ?? null,
            /** Only an explicit verification row makes a model "free". */
            freeStatus: verification
              ? verification.freeTierEligibility === 'verified_free' && verifiedModels.includes(modelId)
                ? verificationFresh(verification.verifiedAt) ? 'verified_free' : 'verification_stale'
                : verification.freeTierEligibility ?? 'unverified'
              : 'unverified',
            quotaDefault: config.isLocal ? null : { limit: quota.limit, period: quota.period },
            healthStatus: config.lastHealthStatus,
          };
        });
    });

    // ── Usage aggregation ─────────────────────────────────────────────
    const usage = usageRows.reduce(
      (sum, row) => {
        const count = row._count._all;
        const tokens = row._sum.totalTokens ?? 0;
        const cost = row._sum.estimatedCostUsd ?? 0;
        sum.requests += count;
        sum.tokens += tokens;
        sum.costUsd += cost;
        if (row.status === 'success') { sum.successes += count; sum.successTokens += tokens; }
        if (row.status === 'failure') sum.failures += count;
        if (row.status === 'deferred') sum.deferred += count;
        if (row.status === 'blocked') sum.blocked += count;
        return sum;
      },
      { requests: 0, successes: 0, failures: 0, deferred: 0, blocked: 0, tokens: 0, successTokens: 0, costUsd: 0 },
    );

    const byProvider = new Map<string, { provider: string; requests: number; failures: number; tokens: number; costUsd: number; avgLatencyMs: number | null }>();
    for (const row of usageRows) {
      const key = row.provider ?? 'unknown';
      const current = byProvider.get(key) ?? { provider: key, requests: 0, failures: 0, tokens: 0, costUsd: 0, avgLatencyMs: null };
      current.requests += row._count._all;
      if (row.status === 'failure') current.failures += row._count._all;
      current.tokens += row._sum.totalTokens ?? 0;
      current.costUsd += row._sum.estimatedCostUsd ?? 0;
      if (row._avg.latencyMs != null) current.avgLatencyMs = Math.round(row._avg.latencyMs);
      byProvider.set(key, current);
    }

    // ── Failover monitor ──────────────────────────────────────────────
    const failoverEvents = decisions.filter((row) => row.fallbackFrom || row.attempts > 1);
    const failoverMonitor = failoverEvents.slice(0, 50).map((row) => ({
      id: row.id,
      requestedModel: row.requestedModel,
      failedProvider: row.fallbackFrom,
      currentProvider: row.selectedProvider,
      selectedModel: row.selectedModel,
      reason: row.reason,
      attempts: row.attempts,
      success: row.success,
      errorCode: row.errorCode,
      latencyMs: row.latencyMs,
      occurredAt: row.createdAt,
    }));

    // ── Quota snapshots (provider-reported, newest per config) ────────
    const quotaSnapshots = await db.providerQuotaSnapshot.findMany({
      where: { quotaKind: 'provider_reported_remaining' },
      orderBy: { capturedAt: 'desc' },
      take: 200,
      select: {
        id: true, providerConfigId: true, remainingRequests: true, remainingTokens: true,
        limitRequests: true, limitTokens: true, capturedAt: true, resetAt: true, officialSource: true,
      },
    });
    const newestQuotaByConfig = new Map<string, (typeof quotaSnapshots)[number]>();
    for (const snapshot of quotaSnapshots) {
      if (!newestQuotaByConfig.has(snapshot.providerConfigId)) newestQuotaByConfig.set(snapshot.providerConfigId, snapshot);
    }

    // ── Weekly discovery summary for the dashboard header ─────────────
    let discovery: { providersQueried: number; newModels: number; generatedAt: string } | null = null;
    try {
      const report = await buildWeeklyDiscoveryReport({ timeoutMs: 4_000 });
      discovery = {
        providersQueried: report.providers.length,
        newModels: report.newModels.length,
        generatedAt: report.generatedAt,
      };
    } catch {
      discovery = null;
    }

    const envConfigured = FREE_PROVIDER_ENV_MAP
      .filter((entry) => Boolean(process.env[entry.envVar]))
      .map((entry) => ({ envVar: entry.envVar, kind: entry.kind, label: entry.label }));

    return NextResponse.json({
      mode: {
        freeOnly: isFreeOnlyMode(),
        description: freeOnlyModeDescription(),
      },
      summary: {
        totalModels: models.length,
        activeModels: models.filter((model) => model.isEnabled).length,
        localModels: models.filter((model) => model.isLocal).length,
        freeApiModels: models.filter((model) => model.freeStatus === 'verified_free').length,
        unverifiedModels: models.filter((model) => model.freeStatus === 'unverified').length,
        unavailableProviders: runtime.filter((entry) => entry.circuitOpen || !entry.initialized).length,
        totalProviders: configs.length,
        enabledProviders: configs.filter((config) => config.isEnabled).length,
        externalSpendUsd: usage.costUsd,
        windowDays: 7,
      },
      usage,
      byProvider: Array.from(byProvider.values()).sort((a, b) => b.requests - a.requests),
      models,
      providers: configs.map((config) => ({
        id: config.id,
        companyId: config.companyId,
        provider: config.provider,
        name: config.name,
        baseUrl: config.baseUrl,
        isEnabled: config.isEnabled,
        isLocal: config.isLocal,
        fallbackEligible: config.fallbackEligible,
        priority: config.priority,
        hasApiKey: Boolean(config.encryptedApiKey),
        lastHealthStatus: config.lastHealthStatus,
        lastHealthAt: config.lastHealthAt,
        lastHealthLatencyMs: config.lastHealthLatencyMs,
        lastError: config.lastError,
        verification: verificationByConfig.get(config.id) ?? null,
        quota: newestQuotaByConfig.get(config.id) ?? null,
      })),
      runtime: runtime.map((entry) => ({
        provider: entry.provider,
        initialized: entry.initialized,
        circuitOpen: entry.circuitOpen,
        isLocal: entry.isLocal,
        models: entry.models,
        initError: entry.initError ?? null,
      })),
      failover: {
        events: failoverMonitor,
        totalFallbacks: failoverEvents.length,
        successfulFallbacks: failoverEvents.filter((row) => row.success).length,
      },
      failures: recentFailures,
      discovery,
      envConfiguredProviders: envConfigured,
      /** Shown in the UI so an operator never reads $0 as "everything is free". */
      notes: [
        'Costs shown are external AI inference charges recorded by this platform. Hosting, electricity and maintenance are not included and are never $0.',
        'A model is only labelled verified_free when an AIProviderVerification row names it, the pricing is fresh (<=30 days) and billing cannot continue automatically.',
        'Provider health reflects live router state; a provider that has never been tested shows no health status.',
      ],
    });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    console.error('[super-admin/ai/model-center] failed', error);
    return NextResponse.json({ error: 'Failed to load model center data' }, { status: 500 });
  }
}
