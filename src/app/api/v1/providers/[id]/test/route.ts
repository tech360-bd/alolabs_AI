import { v1Handler, V1Error } from '@/lib/v1';
import { ProviderAdminError, testProviderConfig } from '@/lib/ai-router/provider-admin';

/**
 * POST /api/v1/providers/:id/test[?chat=1]
 * Real connectivity test against the configured endpoint. Records the verdict
 * (healthy / unauthorized / unreachable / degraded / misconfigured) on the row.
 */
export const POST = v1Handler(async ({ identity }, request) => {
  if (identity.kind !== 'session') {
    throw new V1Error('Provider management requires an administrator session', 403, 'FORBIDDEN');
  }
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] ?? '');
  const withChat = ['1', 'true'].includes(request.nextUrl.searchParams.get('chat') ?? '');
  try {
    return await testProviderConfig(
      { userId: identity.userId, role: identity.role, companyId: identity.companyId },
      id,
      { withChat },
    );
  } catch (err) {
    if (err instanceof ProviderAdminError) throw new V1Error(err.message, err.status, err.code);
    throw err;
  }
});
