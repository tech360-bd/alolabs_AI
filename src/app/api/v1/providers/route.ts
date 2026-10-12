import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { ensureRouterSynced } from '@/lib/ai-router';
import {
  ProviderAdminError,
  ProviderCreateSchema,
  createProviderConfig,
  listProviderConfigs,
} from '@/lib/ai-router/provider-admin';

/**
 * /api/v1/providers — AI provider configuration (tenant-scoped).
 *
 * GET  → configs visible to this tenant (own + shared) and live router state.
 *        Secrets are never returned; only `hasApiKey` and a key fingerprint.
 * POST → create a provider (admin). Keys are encrypted at rest.
 */

function rethrow(err: unknown): never {
  if (err instanceof ProviderAdminError) throw new V1Error(err.message, err.status, err.code);
  throw err;
}

export const GET = v1Handler(async ({ identity }) => {
  const actor = { userId: identity.userId, role: identity.role, companyId: identity.companyId };
  const [configs, router] = await Promise.all([listProviderConfigs(actor), ensureRouterSynced()]);
  const runtime = router
    .getProviderSummaries()
    .filter((p) => p.companyId === undefined || p.companyId === identity.companyId)
    .map((p) => ({
      provider: p.provider,
      shared: p.companyId === undefined,
      initialized: p.initialized,
      circuitOpen: p.circuitOpen,
      initError: p.initError ?? null,
      models: p.models,
    }));
  return {
    configs,
    runtime,
    configured: runtime.some((p) => p.initialized && !p.circuitOpen) || configs.some((c) => c.isEnabled),
  };
});

export const POST = v1Handler(async ({ identity }, request) => {
  if (identity.kind !== 'session') {
    throw new V1Error('Provider management requires an administrator session', 403, 'FORBIDDEN');
  }
  const body = await v1Body<unknown>(request);
  const parsed = ProviderCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 400, 'VALIDATION_ERROR');
  }
  try {
    return await createProviderConfig(
      { userId: identity.userId, role: identity.role, companyId: identity.companyId },
      parsed.data,
    );
  } catch (err) {
    rethrow(err);
  }
});
