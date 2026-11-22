import { z } from 'zod';
import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { verifyCrmConnection } from '@/lib/integrations/connections';
import type { V1Identity } from '@/lib/v1-auth';

/**
 * POST /api/v1/crm/connections/verify
 *
 * Body: { credentialId }
 *
 * Performs a REAL authenticated read-only request to the tenant's stored CRM
 * connection and persists the verdict. The credential id is looked up inside
 * the caller's company, so another tenant's id returns 404, never a probe.
 * Credentials are never accepted in this request body and never returned.
 */

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ credentialId: z.string().min(1).max(200) }).strict();

function requireOperator(identity: V1Identity) {
  if (identity.kind === 'apiKey') return;
  const allowed = identity.role === 'super_admin' || identity.companyRole === 'owner' || identity.companyRole === 'admin';
  if (!allowed) throw new V1Error('CRM connection management requires an administrator', 403, 'FORBIDDEN');
}

export const POST = v1Handler(async ({ identity }, request) => {
  requireOperator(identity);
  const parsed = BodySchema.safeParse(await v1Body<unknown>(request));
  if (!parsed.success) throw new V1Error('credentialId is required', 400, 'VALIDATION_ERROR');
  const verification = await verifyCrmConnection({
    companyId: identity.companyId,
    credentialId: parsed.data.credentialId,
  });
  if (verification.state === 'not_found') {
    throw new V1Error(verification.message, 404, 'NOT_FOUND');
  }
  return verification;
});
