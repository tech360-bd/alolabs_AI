/**
 * RSSHub / RSS feed connector — knowledge ingestion boundary.
 *
 * License note: DIYgod/RSSHub is AGPL-3.0. Connect to the public instance or
 * an UNMODIFIED self-hosted instance as a separate service. The adapter only
 * reads feeds and normalizes items for the RAG ingestion pipeline.
 *
 * API surface used:
 *  - GET {base}/{route}?format=json&limit=..   (RSSHub route -> JSON feed)
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export interface FeedItem {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
  source: string;
}

export const rsshubAdapter: ExternalSystemAdapter = {
  id: 'content.rsshub',
  category: 'content',
  licenseClass: 'strong-copyleft-network',
  strategy: 'API_INTEGRATE',
  description: 'RSSHub (AGPL) — everything-to-RSS routes feeding RAG ingestion',
  upstreamRepo: 'DIYgod/RSSHub',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      // Health probe: fetch a tiny route with limit=1.
      const res = await guardedFetch(
        'content.rsshub',
        joinUrl(ctx.credential.baseUrl, 'rsshub/routes?limit=1'),
        { timeoutMs: 10_000 },
      );
      if (!res.ok) {
        throw new IntegrationError('content.rsshub', 'RSSHub health probe failed', res.status);
      }
      return { reachable: true, status: res.status };
    });
  },
};

/**
 * Fetch a route (e.g. `/github/trending/daily`) and normalize items.
 * `route` must NOT include the baseUrl; leading slash optional.
 */
export async function rsshubFetchRoute(
  ctx: ConnectorContext,
  route: string,
  opts: { limit?: number } = {},
): Promise<Awaited<ReturnType<typeof runConnectorOp<FeedItem[]>>>> {
  return runConnectorOp(rsshubAdapter, ctx, 'fetchRoute', async () => {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const qs = new URLSearchParams({ format: 'json', limit: String(limit) });
    const cleanRoute = route.replace(/^\/+/, '');
    const res = await guardedFetch('content.rsshub', joinUrl(ctx.credential.baseUrl, `${cleanRoute}?${qs.toString()}`), {
      timeoutMs: ctx.timeoutMs,
    });
    if (!res.ok) {
      throw new IntegrationError('content.rsshub', `RSSHub route "${cleanRoute}" failed`, res.status);
    }
    const body: unknown = await res.json();
    const items = (body as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) {
      throw new IntegrationError('content.rsshub', 'unexpected RSSHub response shape');
    }
    return items.map((raw) => {
      const item = raw as Record<string, unknown>;
      const title = item['title'];
      const link = (item as { url?: unknown })['url'] ?? item['id'];
      const summary = (item as { description?: unknown; summary?: unknown })['description'] ??
        (item as { summary?: unknown })['summary'];
      const published = (item as { date_published?: unknown; published?: unknown })['date_published'] ??
        (item as { published?: unknown })['published'];
      return {
        title: typeof title === 'string' ? title : '',
        url: typeof link === 'string' ? link : '',
        publishedAt: typeof published === 'string' ? published : undefined,
        summary: typeof summary === 'string' ? summary.slice(0, 500) : undefined,
        source: cleanRoute,
      } satisfies FeedItem;
    });
  });
}
