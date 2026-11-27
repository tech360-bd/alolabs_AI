/**
 * LibreChat connector — LibreChat-AI/LibreChat (MIT).
 *
 * License note: MIT. LibreChat is an enhanced ChatGPT clone (agents, MCP,
 * skills, artifacts, multi-provider, message search, code interpreter).
 * This adapter talks REST to a separately hosted LibreChat instance and
 * learns its presets / agents / MCP patterns for AgentOS's chat surface.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used:
 *  - GET  {base}/api/models
 *  - POST {base}/api/ask  (best-effort; LibreChat versions differ — callers
 *    must handle 404/405 as "not configured" rather than failure)
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

async function libreFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'ai-chat.librechat');
  const res = await guardedFetch('ai-chat.librechat', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('ai-chat.librechat', `LibreChat API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const librechatAdapter: ExternalSystemAdapter = {
  id: 'ai-chat.librechat',
  category: 'ai-chat',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'LibreChat (MIT) — multi-provider chat with agents, MCP, skills and artifacts',
  upstreamRepo: 'LibreChat-AI/LibreChat',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await libreFetch(ctx, 'api/models', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function librechatListModels(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<string[]>>>> {
  return runConnectorOp(librechatAdapter, ctx, 'listModels', async () => {
    const res = await libreFetch(ctx, 'api/models');
    const body: unknown = await res.json();
    const models = (body as { models?: unknown[] })?.models ?? (body as { data?: unknown[] })?.data;
    if (!Array.isArray(models)) {
      throw new IntegrationError('ai-chat.librechat', 'unexpected LibreChat models response shape');
    }
    return models
      .map((raw) => (typeof raw === 'string' ? raw : String((raw as Record<string, unknown>)?.['id'] ?? '')))
      .filter((id) => id.length > 0);
  });
}
