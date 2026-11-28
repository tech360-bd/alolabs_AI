/**
 * anomalyco/browse connector — MIT browser automation MCP server & Chromium bridge.
 */
import {
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export const browseMcpAdapter: ExternalSystemAdapter = {
  id: 'coding-agent.browse-mcp',
  category: 'coding-agent',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'anomalyco/browse (MIT) — MCP browser automation paired with SSRF & human approval gates',
  upstreamRepo: 'anomalyco/browse',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (ctx.credential.apiKey) headers.Authorization = `Bearer ${ctx.credential.apiKey}`;
      const res = await guardedFetch('coding-agent.browse-mcp', joinUrl(ctx.credential.baseUrl, 'health'), {
        headers,
        timeoutMs: ctx.timeoutMs ?? 10_000,
      });
      if (!res.ok) throw new IntegrationError('coding-agent.browse-mcp', 'Browse MCP health failed', res.status);
      return { reachable: true, status: res.status };
    });
  },
};
