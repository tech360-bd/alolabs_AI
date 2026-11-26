import { z } from 'zod';
import { jsonResponse, secureRoute } from '@/lib/api/secure-route';
import { integrationRegistry } from '@/lib/integrations';
import type { IntegrationCategory } from '@/lib/integrations';

/**
 * GET /api/integrations/catalog — the adapter catalog behind ONE Runtime.
 *
 * Read-only, authenticated, tenant-scoped (no tenant data is read at all: this
 * only describes which upstream systems the platform can talk to, and under
 * which license strategy). Credentials never appear here.
 *
 * Existing `/api/integrations` covers tenant-owned webhooks + OAuth providers.
 * This endpoint is the missing piece: the *capability* catalog produced by
 * `integrationRegistry.catalog()`, so admins can see every supported system,
 * its category, license class and integration strategy (REUSE / API_INTEGRATE /
 * LEARN) before configuring credentials.
 *
 * Query: ?category=gateway|ai-chat|automation|content|media|telephony|crm|messaging|coding-agent|deploy
 */

const catalogQuery = z.object({
  category: z
    .enum([
      'crm',
      'messaging',
      'content',
      'media',
      'telephony',
      'automation',
      'gateway',
      'ai-chat',
      'coding-agent',
      'deploy',
    ])
    .optional(),
  strategy: z.enum(['REUSE', 'API_INTEGRATE', 'LEARN']).optional(),
});

export const GET = secureRoute(
  {
    resource: 'integrations.catalog',
    action: 'read',
    query: catalogQuery,
    rateLimit: { limit: 120, windowMs: 60_000 },
  },
  async (context) => {
    const { category, strategy } = context.query as z.infer<typeof catalogQuery>;

    let adapters = category ? integrationRegistry.list(category as IntegrationCategory) : integrationRegistry.list();
    if (strategy) adapters = adapters.filter((a) => a.strategy === strategy);

    const data = adapters.map((a) => ({
      id: a.id,
      category: a.category,
      strategy: a.strategy,
      licenseClass: a.licenseClass,
      description: a.description,
      upstreamRepo: a.upstreamRepo,
    }));

    // Grouped view is what the admin UI renders; flat list stays for tooling.
    const byCategory: Record<string, number> = {};
    for (const a of integrationRegistry.list()) {
      byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
    }

    return jsonResponse(
      { data, total: data.length, byCategory, success: true },
      context.requestId,
    );
  },
);
