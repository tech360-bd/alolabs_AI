/**
 * LiteLLM gateway connector — BerriAI/litellm (MIT core, open-core).
 *
 * License note: the `litellm/` package and proxy core are MIT. The
 * `enterprise/` directory is under a separate BerriAI Enterprise License
 * (paid, seat-counted) and is NEVER vendored here. This adapter talks REST
 * to a separately hosted LiteLLM Proxy (OpenAI-compatible) and learns its
 * routing / virtual-key / budget patterns for AgentOS's own ai-router.
 * See docs/ECOSYSTEM_REVERSE_MAP.md and docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used (LiteLLM Proxy, OpenAI-compatible):
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

export interface LiteLLMModel {
  id: string;
  ownedBy?: string;
}

async function litellmFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'gateway.litellm');
  const res = await guardedFetch('gateway.litellm', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('gateway.litellm', `LiteLLM API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const litellmAdapter: ExternalSystemAdapter = {
  id: 'gateway.litellm',
  category: 'gateway',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'LiteLLM Proxy (MIT core) — 100+ LLMs behind one OpenAI-compatible gateway with virtual keys, budgets and fallbacks',
  upstreamRepo: 'BerriAI/litellm',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await litellmFetch(ctx, 'v1/models', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function litellmListModels(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<LiteLLMModel[]>>>> {
  return runConnectorOp(litellmAdapter, ctx, 'listModels', async () => {
    const res = await litellmFetch(ctx, 'v1/models');
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('gateway.litellm', 'unexpected LiteLLM models response shape');
    }
    return data.map((raw) => {
      const m = raw as Record<string, unknown>;
      return {
        id: String(m['id'] ?? ''),
        ownedBy: typeof m['owned_by'] === 'string' ? (m['owned_by'] as string) : undefined,
      };
    });
  });
}

export async function litellmChat(
  ctx: ConnectorContext,
  input: { model: string; messages: Array<{ role: string; content: string }>; maxTokens?: number },
): Promise<Awaited<ReturnType<typeof runConnectorOp<{ content: string; model: string }>>>> {
  return runConnectorOp(litellmAdapter, ctx, 'chat', async () => {
    const res = await litellmFetch(ctx, 'v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens ?? 1024,
      }),
    });
    const body: unknown = await res.json();
    const choices = (body as { choices?: unknown[] })?.choices;
    const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown>) : undefined;
    const message = first?.['message'] as Record<string, unknown> | undefined;
    const content = typeof message?.['content'] === 'string' ? (message['content'] as string) : '';
    const model = typeof (body as { model?: unknown })?.model === 'string' ? String((body as { model: string }).model) : input.model;
    return { content, model };
  });
}
