import { v1Handler } from '@/lib/v1';
import { db } from '@/lib/db';
import { getRouter } from '@/lib/ai-router';
import { AI_MODELS } from '@/lib/model-registry';

/**
 * /api/v1/models — model registry + live provider health (GET).
 *
 * Never exposes provider secrets — only ids, capabilities, pricing metadata,
 * and health.
 */

export const GET = v1Handler(async () => {
  const [registered, providerHealth] = await Promise.all([
    db.modelRegistry.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
      select: {
        id: true, modelId: true, name: true, provider: true, costPer1kTokens: true,
        maxContext: true, capabilities: true, status: true, healthStatus: true, deployedAt: true,
      },
    }),
    getRouter().getHealthStatus(),
  ]);

  const providers = Array.from(providerHealth.entries()).map(([name, health]) => ({
    provider: name,
    healthy: health.isHealthy,
    circuitOpen: health.circuitOpen,
    latencyMs: health.latencyMs,
    errorRate: health.errorRate,
  }));

  // Static catalog from the registry module (capability metadata only)
  const catalog = AI_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    maxContext: m.maxContext,
    capabilities: m.capabilities,
  }));

  return {
    models: registered,
    providers,
    catalog,
    configured: providers.some((p) => p.healthy),
    configurationRequired: !providers.some((p) => p.healthy),
  };
});
