/**
 * Activepieces connector — activepieces/activepieces (MIT core, open-core).
 *
 * License note: MIT core (enterprise features licensed separately). Activepieces
 * is AI workflow automation with ~400 MCP servers / pieces. This adapter talks
 * REST to a separately hosted Activepieces instance and maps its piece
 * architecture onto AgentOS's tool registry.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used:
 *  - GET  {base}/v1/flows?limit=..
 *  - POST {base}/v1/flows/{id}/run
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

async function apFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'automation.activepieces');
  const res = await guardedFetch('automation.activepieces', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('automation.activepieces', `Activepieces API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const activepiecesAdapter: ExternalSystemAdapter = {
  id: 'automation.activepieces',
  category: 'automation',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Activepieces (MIT core) — visual AI workflow automation with ~400 MCP pieces',
  upstreamRepo: 'activepieces/activepieces',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await apFetch(ctx, 'v1/flows?limit=1', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function activepiecesListFlows(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<string[]>>>> {
  return runConnectorOp(activepiecesAdapter, ctx, 'listFlows', async () => {
    const res = await apFetch(ctx, 'v1/flows?limit=50');
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('automation.activepieces', 'unexpected Activepieces flows response shape');
    }
    return data
      .map((raw) => String((raw as Record<string, unknown>)?.['id'] ?? ''))
      .filter((id) => id.length > 0);
  });
}
