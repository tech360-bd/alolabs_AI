/**
 * Postmill AI social automation connector — postmill-ai/postmill-app (AGPL-3.0).
 *
 * License note: AGPL-3.0. This adapter NEVER copies Postmill code — it talks
 * REST to an isolated external Postmill deployment only. Publishing actions
 * remain gated behind human approval.
 */
import {
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

export const postmillAdapter: ExternalSystemAdapter = {
  id: 'content.postmill',
  category: 'content',
  licenseClass: 'strong-copyleft-network',
  strategy: 'API_INTEGRATE',
  description: 'Postmill AI (AGPL-3.0 sidecar) — external multi-channel social scheduling API',
  upstreamRepo: 'postmill-ai/postmill-app',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const apiKey = requireApiKey(ctx, 'content.postmill');
      const res = await guardedFetch('content.postmill', joinUrl(ctx.credential.baseUrl, 'api/health'), {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: ctx.timeoutMs ?? 10_000,
      });
      if (!res.ok) throw new IntegrationError('content.postmill', 'Postmill API health failed', res.status);
      return { reachable: true, status: res.status };
    });
  },
};
