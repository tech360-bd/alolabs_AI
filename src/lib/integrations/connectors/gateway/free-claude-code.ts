/**
 * Free Claude Code (FCC) connector — Alishahryar1/free-claude-code (AGPL-3.0-only).
 *
 * License note: AGPL-3.0-only. This adapter does NOT vendor any FCC code —
 * it talks REST to a separately hosted, UNMODIFIED FCC instance (multi-provider
 * gateway exposing Anthropic/OpenAI/Gemini-compatible endpoints, 1.3B+ free
 * tokens/month across 60+ providers). FCC follows provider ToS and removes
 * integrations that stop being allowed; AgentOS must do the same.
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

async function fccFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'gateway.free-claude-code');
  const res = await guardedFetch('gateway.free-claude-code', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('gateway.free-claude-code', `FCC API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const freeClaudeCodeAdapter: ExternalSystemAdapter = {
  id: 'gateway.free-claude-code',
  category: 'gateway',
  licenseClass: 'strong-copyleft-network',
  strategy: 'API_INTEGRATE',
  description: 'Free Claude Code (AGPL) — multi-provider gateway to free coding-agent models (1.3B+ free tokens/mo)',
  upstreamRepo: 'Alishahryar1/free-claude-code',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await fccFetch(ctx, 'v1/models', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function freeClaudeCodeListModels(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<string[]>>>> {
  return runConnectorOp(freeClaudeCodeAdapter, ctx, 'listModels', async () => {
    const res = await fccFetch(ctx, 'v1/models');
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('gateway.free-claude-code', 'unexpected FCC models response shape');
    }
    return data
      .map((raw) => String((raw as Record<string, unknown>)?.['id'] ?? ''))
      .filter((id) => id.length > 0);
  });
}
