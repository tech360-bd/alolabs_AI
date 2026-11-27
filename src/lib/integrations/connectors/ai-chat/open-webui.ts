/**
 * Open WebUI connector — open-webui/open-webui ("Open WebUI License").
 *
 * License note: NOT plain BSD-3. The LICENSE file is BSD-3-style BUT adds
 * clause 4: you may not alter/remove/obscure "Open WebUI" branding unless you
 * have <=50 end users in a rolling 30-day window, written permission, or an
 * enterprise license. That makes it source-available, so this adapter does
 * NOT vendor or fork Open WebUI — it talks REST to a separately hosted,
 * unmodified instance (branding intact). Open WebUI is a user-friendly AI
 * interface for Ollama/OpenAI-compatible backends (RAG, pipelines, functions).
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used (OpenAI-compatible):
 *  - GET  {base}/api/models
 *  - POST {base}/api/chat/completions
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

async function owuiFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'ai-chat.open-webui');
  const res = await guardedFetch('ai-chat.open-webui', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('ai-chat.open-webui', `Open WebUI API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const openWebuiAdapter: ExternalSystemAdapter = {
  id: 'ai-chat.open-webui',
  category: 'ai-chat',
  licenseClass: 'source-available',
  strategy: 'API_INTEGRATE',
  description: 'Open WebUI (BSD-3 + branding clause) — Ollama/OpenAI chat UI with RAG, pipelines and functions',
  upstreamRepo: 'open-webui/open-webui',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await owuiFetch(ctx, 'api/models', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function openWebuiListModels(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<string[]>>>> {
  return runConnectorOp(openWebuiAdapter, ctx, 'listModels', async () => {
    const res = await owuiFetch(ctx, 'api/models');
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('ai-chat.open-webui', 'unexpected Open WebUI models response shape');
    }
    return data
      .map((raw) => String((raw as Record<string, unknown>)?.['id'] ?? ''))
      .filter((id) => id.length > 0);
  });
}
