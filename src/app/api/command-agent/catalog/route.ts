import { NextResponse } from 'next/server';
import { requireAuth, canManageCompany } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { listCompanyAIModels } from '@/lib/multi-tenant-ai/service';
import {
  FREE_LLM_PROVIDERS,
  FREE_SERVICES,
  FREE_FALLBACK_ORDER,
  catalogStats,
  configuredFromEnvironment,
} from '@/lib/command-agent/free-catalog';
import { hasExplicitZeroPricing } from '@/lib/ai-router/free-models';
import { COMMAND_TOOLS } from '@/lib/command-agent/tools';
import { listToolDefinitions } from '@/lib/tools/registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/command-agent/catalog — free AI catalogue for the Commanding Center.
 *
 * Returns the static free-provider/model/service catalogue, which providers
 * already have credentials in the environment (booleans only, never keys),
 * the live OpenRouter :free list (public endpoint, fail-soft), the models
 * currently authorised for the caller's company, and the agent's tool list.
 * Access: super_admin or company owner/admin.
 */

async function liveOpenRouterFree(): Promise<{ available: boolean; count: number; models: string[] }> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return { available: false, count: 0, models: [] };
    const payload = (await response.json()) as { data?: unknown[] };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const free = rows
      .filter((row) => hasExplicitZeroPricing(row))
      .map((row) => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
    return { available: true, count: free.length, models: free.slice(0, 200) };
  } catch {
    return { available: false, count: 0, models: [] };
  }
}

export async function GET() {
  let actor;
  try { actor = await requireAuth(); }
  catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (actor.role !== 'super_admin' && !canManageCompany(actor)) {
    return NextResponse.json({ error: 'Command Agent requires Super Admin or company Admin access' }, { status: 403 });
  }

  const [openRouterFree, authorisedModels, providerConfigCount] = await Promise.all([
    liveOpenRouterFree(),
    (async () => {
      try {
        const companyId = actor.companyId
          ?? (await db.company.findUnique({ where: { slug: 'alo-labs' }, select: { id: true } }))?.id;
        if (!companyId) return [];
        return await listCompanyAIModels({ companyId, userId: actor.userId, role: actor.role }, 'free_general');
      } catch {
        return [];
      }
    })(),
    db.aIProviderConfig.count({ where: { isEnabled: true } }).catch(() => 0),
  ]);

  return NextResponse.json({
    success: true,
    stats: catalogStats(),
    providers: FREE_LLM_PROVIDERS,
    services: FREE_SERVICES,
    fallbackOrder: FREE_FALLBACK_ORDER,
    configuredFromEnvironment: configuredFromEnvironment(),
    enabledProviderConfigs: providerConfigCount,
    authorisedModels,
    openRouterFree,
    tools: [
      ...listToolDefinitions().map((tool) => ({ name: tool.name, description: tool.description, kind: 'internal' as const, category: tool.category, cost: 'free' })),
      ...COMMAND_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, kind: 'external-free' as const, category: 'utility', cost: 'free' })),
    ],
    setupSteps: [
      'Get a free key — start with Groq (console.groq.com/keys) and OpenRouter (openrouter.ai/keys). No card needed.',
      'In Super Admin AI Control Plane → AI Providers, add the provider kind + base URL from the Free Models tab and paste the key.',
      'Add the free model ids (e.g. qwen/qwen3-32b:free, llama-3.3-70b-versatile) with cost 0 and capabilities chat + function-calling.',
      'Record the free-tier verification (official docs URL + "no automatic billing") so free_* routing profiles may use it.',
      'Allow the provider in the company routing policy for free_general / free_coding / free_reasoning.',
      'Optional but recommended: run Ollama locally (ollama pull qwen3:30b-a3b) as the unlimited offline fallback.',
      'Come back here and command your agent — every call is policy-checked, budget-checked and audited at $0.',
    ],
    disclaimer: 'Free tiers change often. Verify current limits and commercial-use terms on each provider\u2019s official page before relying on them; AgentOS records that verification and never silently falls back to a paid route.',
  });
}
