/**
 * Twenty CRM connector.
 *
 * License note: twentyhq/twenty is AGPL-3.0. This adapter does NOT vendor any
 * Twenty code — it talks REST to a customer-hosted / separately-hosted Twenty
 * instance. See docs/ECOSYSTEM_REVERSE_MAP.md (License Compliance Policy).
 *
 * API surface used:
 *  - GET  {base}/rest/people?startingAfter=...   (contact list, cursor paging)
 *  - POST {base}/rest/people                     (create contact)
 *  - GET  {base}/rest/companies                  (company list)
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

export interface TwentyPerson {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
}

async function twentyFetch(ctx: ConnectorContext, path: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'crm.twenty');
  const res = await guardedFetch('crm.twenty', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('crm.twenty', `Twenty API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const twentyAdapter: ExternalSystemAdapter = {
  id: 'crm.twenty',
  category: 'crm',
  licenseClass: 'strong-copyleft-network',
  strategy: 'API_INTEGRATE',
  description: 'Twenty CRM (AGPL) — REST connector to a separately hosted instance',
  upstreamRepo: 'twentyhq/twenty',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await twentyFetch(ctx, 'rest/companies?limit=1', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function twentyListPeople(
  ctx: ConnectorContext,
  opts: { limit?: number; startingAfter?: string } = {},
): Promise<Awaited<ReturnType<typeof runConnectorOp<{ people: TwentyPerson[]; nextCursor?: string }>>>> {
  return runConnectorOp(twentyAdapter, ctx, 'listPeople', async () => {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const qs = new URLSearchParams({ limit: String(limit) });
    if (opts.startingAfter) qs.set('startingAfter', opts.startingAfter);
    const res = await twentyFetch(ctx, `rest/people?${qs.toString()}`);
    const body: unknown = await res.json();
    const data = (body as { data?: { people?: unknown[] } })?.data?.people;
    const pageInfo = (body as { page_info?: { hasNextPage?: boolean; endCursor?: string } })?.page_info;
    const people: TwentyPerson[] = Array.isArray(data)
      ? data.map((raw) => {
          const p = raw as Record<string, unknown>;
          const name = p['name'];
          return {
            id: String(p['id'] ?? ''),
            name: typeof name === 'string' ? name : undefined,
            email: typeof p['email'] === 'string' ? (p['email'] as string) : undefined,
            phone: typeof p['phone'] === 'string' ? (p['phone'] as string) : undefined,
            jobTitle: typeof p['jobTitle'] === 'string' ? (p['jobTitle'] as string) : undefined,
          };
        })
      : [];
    return {
      people,
      nextCursor: pageInfo?.hasNextPage ? pageInfo.endCursor : undefined,
    };
  });
}

export async function twentyCreatePerson(
  ctx: ConnectorContext,
  input: { name: string; email?: string; phone?: string; jobTitle?: string },
): Promise<Awaited<ReturnType<typeof runConnectorOp<TwentyPerson>>>> {
  return runConnectorOp(twentyAdapter, ctx, 'createPerson', async () => {
    const res = await twentyFetch(ctx, 'rest/people', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const body: unknown = await res.json();
    const created = (body as { data?: Record<string, unknown> })?.data ?? (body as Record<string, unknown>);
    const name = created?.['name'];
    return {
      id: String(created?.['id'] ?? ''),
      name: typeof name === 'string' ? name : input.name,
      email: typeof created?.['email'] === 'string' ? (created['email'] as string) : input.email,
      phone: typeof created?.['phone'] === 'string' ? (created['phone'] as string) : input.phone,
      jobTitle: typeof created?.['jobTitle'] === 'string' ? (created['jobTitle'] as string) : input.jobTitle,
    };
  });
}
