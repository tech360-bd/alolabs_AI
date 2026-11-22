/**
 * ALO Lead API v1 — CRM read connector.
 *
 * This adapter talks to a *documented* customer-hosted contract; it does not
 * scrape arbitrary websites and it does not claim universal compatibility.
 * A CRM (Twenty, Frappe, Zoho, a bespoke ALO Education staging service, …)
 * is usable only when the operator exposes these two read-only endpoints:
 *
 *   GET {baseUrl}/api/v1/capabilities
 *     → 200 { service: string, apiVersion: "1", permissions: ["leads:read"] }
 *
 *   GET {baseUrl}/api/v1/leads?limit=5&sort=-createdAt
 *     → 200 { data: [ { id, name?, email?, phone?, stage?, notes?, createdAt? } ] }
 *
 * Auth is `Authorization: Bearer <api key>`; keys are stored encrypted by
 * `/api/company/integrations` and decrypted only inside the server-side
 * connection service. No credential ever reaches this response body.
 *
 * Egress goes through `guardedFetch` (HTTPS + SSRF guard + timeout), and the
 * body is read with a hard size cap.
 */
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
} from '../../types';

export const ALO_LEAD_API_ID = 'crm.alo-lead-api';
export const CAPABILITIES_PATH = '/api/v1/capabilities';
export const LEADS_PATH = '/api/v1/leads';
export const MAX_RESPONSE_BYTES = 1_048_576;
export const MAX_LEADS_PER_CALL = 50;

/** Failure categories shared by verification and the workflow. */
export type CrmFailureKind =
  | 'authentication_failed'
  | 'permission_denied'
  | 'unreachable'
  | 'sync_failed';

export interface CrmLead {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  stage?: string;
  notes?: string;
  createdAt?: string;
}

export interface LeadCapabilities {
  service: string;
  apiVersion: string;
  permissions: string[];
}

export type LeadReadOutcome<T> =
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; kind: CrmFailureKind; httpStatus?: number; message: string; retryable: boolean };

/** Read at most `MAX_RESPONSE_BYTES` of a response body. */
async function readBodyCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new IntegrationError(ALO_LEAD_API_ID, `response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new IntegrationError(ALO_LEAD_API_ID, `response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  return text;
}

/** Map an HTTP status to a stable, non-secret failure category. */
export function classifyHttpStatus(status: number): CrmFailureKind {
  if (status === 401) return 'authentication_failed';
  if (status === 403) return 'permission_denied';
  return 'sync_failed';
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function describeStatus(status: number): string {
  if (status === 401) return 'CRM rejected the credential (401)';
  if (status === 403) return 'CRM credential lacks the required permission (403)';
  if (status === 404) return 'CRM endpoint not found (404) — is the ALO Lead API contract exposed?';
  if (status === 429) return 'CRM rate limit reached (429)';
  if (status >= 500) return `CRM server error (${status})`;
  return `CRM request failed (${status})`;
}

async function requestJson(
  ctx: ConnectorContext,
  path: string,
): Promise<LeadReadOutcome<unknown>> {
  const apiKey = requireApiKey(ctx, ALO_LEAD_API_ID);
  let res: Response;
  try {
    res = await guardedFetch(ALO_LEAD_API_ID, joinUrl(ctx.credential.baseUrl, path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      timeoutMs: ctx.timeoutMs ?? 10_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // `guardedFetch` refuses private/loopback/metadata targets before any socket
    // is opened; that is a policy refusal, reported as unreachable (with reason).
    return {
      ok: false,
      kind: 'unreachable',
      message: message.includes('blocked target')
        ? `CRM target refused by egress policy (${message})`
        : `CRM endpoint unreachable (${message})`,
      retryable: false,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: classifyHttpStatus(res.status),
      httpStatus: res.status,
      message: describeStatus(res.status),
      retryable: isRetryableStatus(res.status),
    };
  }

  let text: string;
  try {
    text = await readBodyCapped(res);
  } catch (error) {
    return {
      ok: false,
      kind: 'sync_failed',
      httpStatus: res.status,
      message: error instanceof Error ? error.message : 'CRM response could not be read',
      retryable: false,
    };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown, httpStatus: res.status };
  } catch {
    return {
      ok: false,
      kind: 'sync_failed',
      httpStatus: res.status,
      message: 'CRM returned invalid JSON',
      retryable: false,
    };
  }
}

function parseCapabilities(body: unknown): LeadCapabilities | null {
  const raw = body as { service?: unknown; apiVersion?: unknown; permissions?: unknown };
  if (typeof raw?.service !== 'string' || typeof raw?.apiVersion !== 'string') return null;
  if (!Array.isArray(raw.permissions) || raw.permissions.some((p) => typeof p !== 'string')) return null;
  return { service: raw.service, apiVersion: raw.apiVersion, permissions: raw.permissions as string[] };
}

export interface LeadFetchResult {
  leads: CrmLead[];
  httpStatus: number;
  capabilities: LeadCapabilities;
}

/**
 * Verify connectivity, credential validity and the minimum permission the
 * workflow needs (`leads:read`). Read-only: the CRM contract exposes no writes.
 */
export async function aloLeadApiVerify(
  ctx: ConnectorContext,
): Promise<LeadReadOutcome<{ capabilities: LeadCapabilities }>> {
  const caps = await requestJson(ctx, CAPABILITIES_PATH);
  if (!caps.ok) return caps;
  const parsed = parseCapabilities(caps.data);
  if (!parsed) {
    return { ok: false, kind: 'sync_failed', httpStatus: caps.httpStatus, message: 'CRM capabilities response has an unexpected shape', retryable: false };
  }
  if (!parsed.permissions.includes('leads:read')) {
    return { ok: false, kind: 'permission_denied', httpStatus: caps.httpStatus, message: 'CRM credential is missing the leads:read permission', retryable: false };
  }
  return { ok: true, data: { capabilities: parsed }, httpStatus: caps.httpStatus };
}

/** Read the most recent leads, newest first. Source `id`s are preserved verbatim. */
export async function aloLeadApiListRecentLeads(
  ctx: ConnectorContext,
  opts: { limit?: number } = {},
): Promise<LeadReadOutcome<LeadFetchResult>> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 5), 1), MAX_LEADS_PER_CALL);
  const caps = await aloLeadApiVerify(ctx);
  if (!caps.ok) return caps;

  const qs = new URLSearchParams({ limit: String(limit), sort: '-createdAt' });
  const result = await requestJson(ctx, `${LEADS_PATH}?${qs.toString()}`);
  if (!result.ok) return result;

  const rows = (result.data as { data?: unknown })?.data;
  if (!Array.isArray(rows)) {
    return { ok: false, kind: 'sync_failed', httpStatus: result.httpStatus, message: 'CRM leads response is missing a data array', retryable: false };
  }

  const leads: CrmLead[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    if (!id) {
      return { ok: false, kind: 'sync_failed', httpStatus: result.httpStatus, message: 'CRM returned a lead without a source id', retryable: false };
    }
    if (leads.some((lead) => lead.id === id)) {
      return { ok: false, kind: 'sync_failed', httpStatus: result.httpStatus, message: 'CRM returned a duplicate lead id', retryable: false };
    }
    const str = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : undefined);
    leads.push({
      id,
      name: str('name'),
      email: str('email'),
      phone: str('phone'),
      stage: str('stage'),
      notes: str('notes'),
      createdAt: str('createdAt'),
    });
  }
  if (leads.length > limit) {
    return { ok: false, kind: 'sync_failed', httpStatus: result.httpStatus, message: `CRM returned more than the requested ${limit} leads`, retryable: false };
  }

  return {
    ok: true,
    httpStatus: result.httpStatus,
    data: { leads, httpStatus: result.httpStatus, capabilities: caps.data.capabilities },
  };
}

export const aloLeadApiAdapter: ExternalSystemAdapter = {
  id: ALO_LEAD_API_ID,
  category: 'crm',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Read-only CRM lead contract (ALO Lead API v1) for tenant-hosted CRMs',
  upstreamRepo: 'tech360-bd/alolabs_AI',
  async testConnection(ctx) {
    const startedAt = Date.now();
    const result = await aloLeadApiVerify(ctx);
    return {
      ok: result.ok,
      ...(result.ok ? { data: { reachable: true, permissions: result.data.capabilities.permissions } } : { error: result.message, httpStatus: result.httpStatus }),
      durationMs: Date.now() - startedAt,
      audit: { adapter: ALO_LEAD_API_ID, operation: 'testConnection', companyId: ctx.companyId },
    };
  },
};
