/**
 * Server-only helpers for the stack register & ONE Runtime adapter inventory.
 *
 * `stack.ts` is client-safe by design (no Node APIs, no Prisma), which means it
 * cannot import `@/lib/integrations` — that module pulls `@/lib/db`. The adapter
 * list is therefore read here, on the server, and injected.
 */

import { db } from '@/lib/db';
import { bootstrapIntegrations, integrationRegistry } from '@/lib/integrations';
import { buildStack, type StackAdapter, type StackReport } from './stack';

export type AdapterRuntimeState =
  | 'operational'
  | 'configured'
  | 'configuration_required'
  | 'degraded'
  | 'disabled'
  | 'restricted';

export interface ReconciledAdapterInventoryItem extends StackAdapter {
  runtimeState: AdapterRuntimeState;
  stateReason: string;
  dbIntegrationSlug: string | null;
}

/**
 * The 35 registered adapters in ONE Runtime, as plain data.
 *
 * `bootstrapIntegrations()` is idempotent, so calling it from a page render is
 * safe; it only populates the in-process registry.
 */
export function stackAdapters(): StackAdapter[] {
  bootstrapIntegrations();
  return integrationRegistry
    .list()
    .map((adapter) => ({
      id: adapter.id,
      category: adapter.category,
      strategy: adapter.strategy,
      licenseClass: adapter.licenseClass,
      description: adapter.description,
      upstreamRepo: adapter.upstreamRepo,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Full register with adapters joined in. */
export function serverStackReport(): StackReport {
  return buildStack({ adapters: stackAdapters() });
}

/**
 * Truthfully reconciles all 35 ONE Runtime adapters against persisted DB
 * `Integration` / `AIProviderConfig` rows and environment readiness. Never
 * reports `operational` merely because an adapter JS module is registered.
 */
export async function getOneRuntimeAdapterInventory(): Promise<ReconciledAdapterInventoryItem[]> {
  const adapters = stackAdapters();
  const [integrations, providers] = await Promise.all([
    db.integration.findMany({
      select: { slug: true, status: true, configJson: true },
    }),
    db.aIProviderConfig.findMany({
      select: { provider: true, isEnabled: true, lastHealthStatus: true, baseUrl: true },
    }),
  ]);

  const byAdapterId = new Map<string, { slug: string; status: string }>();
  for (const row of integrations) {
    try {
      const parsed = JSON.parse(row.configJson || '{}') as { adapterId?: string | null };
      if (parsed.adapterId) {
        byAdapterId.set(parsed.adapterId, { slug: row.slug, status: row.status });
      }
    } catch {
      // ignore malformed configJson
    }
  }

  const livekitReady = Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );
  const healthyProviders = new Set(
    providers.filter((p) => p.isEnabled && p.lastHealthStatus === 'healthy').map((p) => p.provider),
  );
  const enabledProviders = new Set(providers.filter((p) => p.isEnabled).map((p) => p.provider));

  return adapters.map((adapter) => {
    const dbMatch = byAdapterId.get(adapter.id);

    if (adapter.id === 'telephony.livekit') {
      return {
        ...adapter,
        dbIntegrationSlug: dbMatch?.slug ?? null,
        runtimeState: livekitReady ? 'configured' : 'configuration_required',
        stateReason: livekitReady
          ? 'LiveKit URL & API credentials present; call CreateRoom/ListRooms to verify live SFU'
          : 'Requires LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET',
      };
    }

    if (adapter.id === 'gateway.litellm' || adapter.id === 'gateway.omniroute' || adapter.id === 'gateway.free-claude-code') {
      const matched = healthyProviders.has('litellm-proxy') || healthyProviders.has('openai-compatible');
      if (matched) {
        return {
          ...adapter,
          dbIntegrationSlug: dbMatch?.slug ?? null,
          runtimeState: 'operational',
          stateReason: 'Verified healthy provider configuration active',
        };
      }
      if (enabledProviders.has('litellm-proxy')) {
        return {
          ...adapter,
          dbIntegrationSlug: dbMatch?.slug ?? null,
          runtimeState: 'configured',
          stateReason: 'Provider configured in DB; awaiting live health check',
        };
      }
    }

    if (dbMatch) {
      const state: AdapterRuntimeState =
        dbMatch.status === 'operational'
          ? 'operational'
          : dbMatch.status === 'configured'
            ? 'configuration_required'
            : dbMatch.status === 'restricted'
              ? 'restricted'
              : dbMatch.status === 'degraded'
                ? 'degraded'
                : dbMatch.status === 'disabled'
                  ? 'disabled'
                  : 'configuration_required';
      return {
        ...adapter,
        dbIntegrationSlug: dbMatch.slug,
        runtimeState: state,
        stateReason:
          state === 'restricted'
            ? `Gated (${adapter.licenseClass} / ${adapter.strategy}); requires isolated endpoint & clearance`
            : state === 'configuration_required'
              ? 'Cataloged in Asset Vault; requires tenant endpoint & credentials before health check'
              : `Vault integration status: ${dbMatch.status}`,
      };
    }

    return {
      ...adapter,
      dbIntegrationSlug: null,
      runtimeState: 'configuration_required',
      stateReason: 'Adapter registered in ONE Runtime; awaiting tenant credential configuration',
    };
  });
}
