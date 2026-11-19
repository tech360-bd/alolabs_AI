import { ProviderAdminError } from '@/lib/ai-router/provider-admin';
import { V1Error } from '@/lib/v1';

export function rethrowProviderError(err: unknown): never {
  if (err instanceof ProviderAdminError) throw new V1Error(err.message, err.status, err.code);
  throw err;
}
