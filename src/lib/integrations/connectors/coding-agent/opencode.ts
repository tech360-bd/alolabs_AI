/**
 * anomalyco/opencode connector — MIT open-source coding agent harness.
 */
import {
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export const opencodeAdapter: ExternalSystemAdapter = {
  id: 'coding-agent.opencode',
  category: 'coding-agent',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'OpenCode by anomalyco (MIT) — sandboxed coding harness API integration',
  upstreamRepo: 'anomalyco/opencode',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (ctx.credential.apiKey) headers.Authorization = `Bearer ${ctx.credential.apiKey}`;
      const res = await guardedFetch('coding-agent.opencode', joinUrl(ctx.credential.baseUrl, 'global/health'), {
        headers,
        timeoutMs: ctx.timeoutMs ?? 10_000,
      });
      if (!res.ok) throw new IntegrationError('coding-agent.opencode', 'OpenCode server health failed', res.status);
      return { reachable: true, status: res.status };
    });
  },
};
