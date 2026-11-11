/**
 * Frappe / Frappe CRM connector (DocType REST).
 *
 * License note: frappe/frappe is MIT, frappe/crm and frappe/erpnext are
 * AGPL-3.0 / GPL-3.0. This adapter vendors nothing — it uses the standard
 * DocType REST API of a separately hosted instance.
 *
 * API surface used:
 *  - GET  {base}/api/resource/{doctype}?limit_page_length=..&limit_start=..
 *  - POST {base}/api/resource/{doctype}
 * Auth: `Authorization: token <api_key>:<api_secret>` (Frappe token auth).
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

export interface FrappeDoc {
  name: string;
  doctype: string;
  fields: Record<string, unknown>;
}

/** Frappe accepts `token key:secret` — the apiKey slot carries "key:secret". */
async function frappeFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const token = requireApiKey(ctx, 'crm.frappe');
  const res = await guardedFetch('crm.frappe', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('crm.frappe', `Frappe API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const frappeAdapter: ExternalSystemAdapter = {
  id: 'crm.frappe',
  category: 'crm',
  licenseClass: 'strong-copyleft-network',
  strategy: 'API_INTEGRATE',
  description: 'Frappe framework / Frappe CRM — DocType REST connector (separately hosted)',
  upstreamRepo: 'frappe/frappe',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await frappeFetch(ctx, 'api/resource/CRM Lead?limit_page_length=1', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function frappeListDocs(
  ctx: ConnectorContext,
  doctype: string,
  opts: { limit?: number; offset?: number; filters?: Record<string, unknown> } = {},
): Promise<Awaited<ReturnType<typeof runConnectorOp<FrappeDoc[]>>>> {
  return runConnectorOp(frappeAdapter, ctx, 'listDocs', async () => {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const qs = new URLSearchParams({
      limit_page_length: String(limit),
      limit_start: String(opts.offset ?? 0),
    });
    if (opts.filters) qs.set('filters', JSON.stringify(opts.filters));
    const res = await frappeFetch(ctx, `api/resource/${encodeURIComponent(doctype)}?${qs.toString()}`);
    const body: unknown = await res.json();
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      throw new IntegrationError('crm.frappe', 'unexpected Frappe response shape');
    }
    return data.map((raw) => {
      const d = raw as Record<string, unknown>;
      return {
        name: String(d['name'] ?? ''),
        doctype,
        fields: d,
      };
    });
  });
}

export async function frappeCreateDoc(
  ctx: ConnectorContext,
  doctype: string,
  fields: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof runConnectorOp<FrappeDoc>>>> {
  return runConnectorOp(frappeAdapter, ctx, 'createDoc', async () => {
    const res = await frappeFetch(ctx, `api/resource/${encodeURIComponent(doctype)}`, {
      method: 'POST',
      body: JSON.stringify({ doctype, ...fields }),
    });
    const body: unknown = await res.json();
    const data = (body as { data?: Record<string, unknown> })?.data;
    if (!data || typeof data !== 'object') {
      throw new IntegrationError('crm.frappe', 'unexpected Frappe create response');
    }
    return { name: String(data['name'] ?? ''), doctype, fields: data };
  });
}
