/**
 * Directus connector — directus/directus (MSCL-1.0-GPL, fair-code).
 *
 * License note: NOT MIT/MPL. Directus ships the "Monospace Sustainable Core
 * License 1.0" — a fair-code license permitting internal use, non-commercial
 * education/research, and hosting for a licensee, but FORBIDDING "Competing
 * Use" (offering the software itself as a paid product) and forbidding
 * removal of license-key functionality. So: API_INTEGRATE only, no vendoring,
 * no white-labelling as a Directus-hosted competitor. This adapter talks REST
 * to a separately hosted Directus instance (headless CMS: DB → instant APIs,
 * admin UI, auth).
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used:
 *  - GET  {base}/server/health
 *  - GET  {base}/items/{collection}?limit=..
 *  - POST {base}/items/{collection}
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

async function directusFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'content.directus');
  const res = await guardedFetch('content.directus', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('content.directus', `Directus API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const directusAdapter: ExternalSystemAdapter = {
  id: 'content.directus',
  category: 'content',
  licenseClass: 'source-available',
  strategy: 'API_INTEGRATE',
  description: 'Directus (MPL-2.0) — headless CMS: turn any DB into instant APIs + admin UI',
  upstreamRepo: 'directus/directus',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await directusFetch(ctx, 'server/health', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function directusListItems(
  ctx: ConnectorContext,
  collection: string,
  opts: { limit?: number } = {},
): Promise<Awaited<ReturnType<typeof runConnectorOp<Record<string, unknown>[]>>>> {
  return runConnectorOp(directusAdapter, ctx, 'listItems', async () => {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const res = await directusFetch(ctx, `items/${encodeURIComponent(collection)}?limit=${limit}`);
    const body: unknown = await res.json();
    const data = (body as { data?: unknown[] })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('content.directus', 'unexpected Directus response shape');
    }
    return data as Record<string, unknown>[];
  });
}
