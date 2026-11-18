import { rethrowProviderError as rethrow } from '@/lib/api/v1-provider-error';
import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import {
  ProviderUpdateSchema,
  deleteProviderConfig,
  listProviderConfigs,
  updateProviderConfig,
} from '@/lib/ai-router/provider-admin';

/**
 * /api/v1/providers/:id — read, update (incl. key rotation) or delete one
 * provider configuration. Shared providers are read-only for tenant admins.
 */

function idFrom(request: { nextUrl: { pathname: string } }): string {
  return decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
}

function requireSession(identity: { kind: string }): void {
  if (identity.kind !== 'session') {
    throw new V1Error('Provider management requires an administrator session', 403, 'FORBIDDEN');
  }
}

export const GET = v1Handler(async ({ identity }, request) => {
  const id = idFrom(request);
  const configs = await listProviderConfigs({ userId: identity.userId, role: identity.role === 'super_admin' ? identity.role : identity.companyRole ?? identity.role, companyId: identity.companyId });
  const config = configs.find((c) => c.id === id);
  if (!config) throw new V1Error('Provider config not found', 404, 'NOT_FOUND');
  return config;
});

export const PATCH = v1Handler(async ({ identity }, request) => {
  requireSession(identity);
  const id = idFrom(request);
  const body = await v1Body<unknown>(request);
  const parsed = ProviderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 400, 'VALIDATION_ERROR');
  }
  try {
    return await updateProviderConfig(
      { userId: identity.userId, role: identity.role === 'super_admin' ? identity.role : identity.companyRole ?? identity.role, companyId: identity.companyId },
      id,
      parsed.data,
    );
  } catch (err) {
    rethrow(err);
  }
});

export const DELETE = v1Handler(async ({ identity }, request) => {
  requireSession(identity);
  const id = idFrom(request);
  try {
    await deleteProviderConfig({ userId: identity.userId, role: identity.role === 'super_admin' ? identity.role : identity.companyRole ?? identity.role, companyId: identity.companyId }, id);
    return { deleted: true, id };
  } catch (err) {
    rethrow(err);
  }
});
