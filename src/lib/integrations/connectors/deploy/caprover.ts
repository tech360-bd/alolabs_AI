/**
 * CapRover connector — caprover/caprover (Apache-2.0).
 *
 * License note: Apache-2.0 (permissive). CapRover is a scalable PaaS
 * (automated Docker + nginx, "Heroku on steroids"). This adapter talks REST
 * to a separately hosted CapRover instance (Captain API) for app lifecycle.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used (Captain API):
 *  - POST {base}/api/v2/user/apps
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

export const caproverAdapter: ExternalSystemAdapter = {
  id: 'deploy.caprover',
  category: 'deploy',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'CapRover (Apache-2.0) — scalable PaaS with automated Docker + nginx deploys',
  upstreamRepo: 'caprover/caprover',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const apiKey = requireApiKey(ctx, 'deploy.caprover');
      const res = await guardedFetch('deploy.caprover', joinUrl(ctx.credential.baseUrl, 'api/v2/user/apps'), {
        method: 'POST',
        headers: {
          'x-captain-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        timeoutMs: 10_000,
      });
      // CapRover returns 200 with { data: { apps: [...] } } on success.
      if (!res.ok) {
        throw new IntegrationError('deploy.caprover', 'CapRover health probe failed', res.status);
      }
      return { reachable: true, status: res.status };
    });
  },
};
