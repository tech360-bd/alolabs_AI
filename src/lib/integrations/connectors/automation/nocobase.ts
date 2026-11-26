/**
 * NocoBase connector — nocobase/nocobase (custom "NocoBase License Agreement").
 *
 * License note: NOT Apache-2.0 for NocoBase 3+. LICENSE.txt is a bespoke
 * commercial agreement (updated 2026-11-16) that the vendor may amend
 * unilaterally; commercial/Studio capabilities require a paid license. This
 * adapter therefore NEVER vendors NocoBase code — it talks REST to a
 * separately hosted, customer-licensed instance (low-code business systems
 * with AI agents).
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used:
 *  - GET  {base}/api/collections
 *  - GET  {base}/api/{collection}:list?limit=..
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

async function nbFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'automation.nocobase');
  const res = await guardedFetch('automation.nocobase', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('automation.nocobase', `NocoBase API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const nocobaseAdapter: ExternalSystemAdapter = {
  id: 'automation.nocobase',
  category: 'automation',
  licenseClass: 'custom-model-license',
  strategy: 'API_INTEGRATE',
  description: 'NocoBase — low-code business systems platform with AI agents (self-hosted)',
  upstreamRepo: 'nocobase/nocobase',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await nbFetch(ctx, 'api/collections', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function nocobaseListCollections(
  ctx: ConnectorContext,
): Promise<Awaited<ReturnType<typeof runConnectorOp<string[]>>>> {
  return runConnectorOp(nocobaseAdapter, ctx, 'listCollections', async () => {
    const res = await nbFetch(ctx, 'api/collections');
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('automation.nocobase', 'unexpected NocoBase collections response shape');
    }
    return data
      .map((raw) => String((raw as Record<string, unknown>)?.['name'] ?? (raw as Record<string, unknown>)?.['key'] ?? ''))
      .filter((n) => n.length > 0);
  });
}
