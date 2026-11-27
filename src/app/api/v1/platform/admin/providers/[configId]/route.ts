/**
 * PATCH /api/v1/platform/admin/providers/[configId]
 *
 * Enable or disable a provider configuration.
 *
 * Only the enable flag is writable here. Credentials, base URLs and models are
 * *not* editable through this endpoint: changing a base URL silently redirects
 * every prompt on the platform to a different host, which is exactly the kind
 * of change that should require a deliberate, separate, auditable operation.
 */

import { z } from 'zod';
import { platformRoute, json } from '@/lib/platform/http';
import { requirePlatformAdmin, setProviderEnabled } from '@/lib/platform/admin';

const bodySchema = z.object({ enabled: z.boolean() });

type Params = { params: Promise<{ configId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { configId } = await params;
  return platformRoute({ body: bodySchema }, async ({ request: req, body, requestId }) => {
    const admin = await requirePlatformAdmin(req);
    const result = await setProviderEnabled(configId, body.enabled);
    return json({
      provider: result,
      changedBy: admin.user.email,
      note: body.enabled
        ? 'Enabled. The provider is considered on the next routing decision.'
        : 'Disabled. In-flight requests are unaffected; new routing decisions skip it.',
    }, requestId);
  })(request as never);
}
