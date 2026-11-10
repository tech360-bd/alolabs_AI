/**
 * Integration Adapter Registry — the single catalog of external systems.
 *
 * ONE Runtime rule: registering an adapter whose declared strategy is AVOID
 * is a programming error and throws (fail-closed). The registry is the only
 * way the rest of the platform can reach an external system.
 */
import type { ExternalSystemAdapter, IntegrationCategory, ConnectorContext, ConnectorResult } from './types';

class IntegrationRegistry {
  private readonly adapters = new Map<string, ExternalSystemAdapter>();

  register(adapter: ExternalSystemAdapter): void {
    if (adapter.strategy === 'AVOID') {
      throw new Error(
        `integration registry: adapter "${adapter.id}" is marked AVOID (license/ToS risk) and must not be registered`,
      );
    }
    if (this.adapters.has(adapter.id)) {
      throw new Error(`integration registry: duplicate adapter id "${adapter.id}"`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ExternalSystemAdapter | undefined {
    return this.adapters.get(id);
  }

  require(id: string): ExternalSystemAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`integration registry: unknown adapter "${id}"`);
    }
    return adapter;
  }

  list(category?: IntegrationCategory): ExternalSystemAdapter[] {
    const all = [...this.adapters.values()];
    return category ? all.filter((a) => a.category === category) : all;
  }

  /** Catalog view for admin UI / API: id, category, strategy, license. */
  catalog(): Array<Pick<ExternalSystemAdapter, 'id' | 'category' | 'strategy' | 'licenseClass' | 'description' | 'upstreamRepo'>> {
    return this.list().map((a) => ({
      id: a.id,
      category: a.category,
      strategy: a.strategy,
      licenseClass: a.licenseClass,
      description: a.description,
      upstreamRepo: a.upstreamRepo,
    }));
  }

  /** Health sweep across adapters a tenant has credentials for. */
  async healthCheck(
    entries: Array<{ id: string; ctx: ConnectorContext }>,
  ): Promise<Record<string, ConnectorResult<Record<string, unknown>>>> {
    const out: Record<string, ConnectorResult<Record<string, unknown>>> = {};
    for (const { id, ctx } of entries) {
      out[id] = await this.require(id).testConnection(ctx);
    }
    return out;
  }
}

const globalForRegistry = globalThis as unknown as { __aloIntegrationRegistry?: IntegrationRegistry };

/** Process-wide singleton (ONE registry, like ONE runtime). */
export const integrationRegistry: IntegrationRegistry =
  globalForRegistry.__aloIntegrationRegistry ?? new IntegrationRegistry();

if (!globalForRegistry.__aloIntegrationRegistry) {
  globalForRegistry.__aloIntegrationRegistry = integrationRegistry;
}
