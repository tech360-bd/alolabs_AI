/**
 * OmniRoute (OmniCopilot) connector — cheaper-inference/OmniCopilot (MIT).
 *
 * License note: MIT. OmniRoute is a unified AI router (VS Code extension +
 * self-hosted gateway) that routes across free/paid providers. This adapter
 * talks to a self-hosted OmniRoute gateway (OpenAI-compatible) and mirrors
 * its free-tier routing patterns for AgentOS's ai-router.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used (OpenAI-compatible):
 *  - GET  {base}/v1/models
 *  - POST {base}/v1/chat/completions
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

async function omniFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'gateway.omniroute');
  const res = await guardedFetch('gateway.omniroute', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('gateway.omniroute', `OmniRoute API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const omnirouteAdapter: ExternalSystemAdapter = {
  id: 'gateway.omniroute',
  category: 'gateway',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'OmniRoute (MIT) — self-hosted unified AI router across free and paid providers',
  upstreamRepo: 'cheaper-inference/OmniCopilot',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await omniFetch(ctx, 'v1/models', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function omnirouteListModels(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<string[]>>>> {
  return runConnectorOp(omnirouteAdapter, ctx, 'listModels', async () => {
    const res = await omniFetch(ctx, 'v1/models');
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('gateway.omniroute', 'unexpected OmniRoute models response shape');
    }
    return data
      .map((raw) => String((raw as Record<string, unknown>)?.['id'] ?? ''))
      .filter((id) => id.length > 0);
  });
}
