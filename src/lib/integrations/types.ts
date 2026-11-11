/**
 * External System Integration — Adapter Contract
 *
 * ONE Runtime rule: every external system (CRM, SMS gateway, crawler, video
 * model, telephony stack) enters AI-EOS through exactly one adapter layer.
 * There is no second execution path: adapters are invoked by the agent
 * runtime / tool loop, they never spawn their own runtime.
 *
 * The license strategy from docs/ECOSYSTEM_REVERSE_MAP.md is encoded here:
 * each adapter declares `licenseClass` and `strategy` so the compliance
 * policy is executable, not just documented.
 */

export type IntegrationCategory =
  | 'crm'
  | 'messaging'
  | 'content'
  | 'media'
  | 'telephony'
  | 'automation';

/**
 * REUSE            — permissive license; adapter may be inspired by or vendor code (with attribution).
 * API_INTEGRATE    — copyleft / fair-code / source-available; connect to a separately hosted instance only.
 * LEARN            — clean-room reference only; adapter talks to an official/supported API surface.
 * AVOID            — must not be integrated (license or ToS risk). Registry rejects registration.
 */
export type IntegrationStrategy = 'REUSE' | 'API_INTEGRATE' | 'LEARN' | 'AVOID';

export type LicenseClass =
  | 'permissive'
  | 'weak-copyleft'
  | 'strong-copyleft-network'
  | 'strong-copyleft-process'
  | 'source-available'
  | 'custom-model-license';

export interface IntegrationCredential {
  /** Base URL of the (usually self-hosted or customer-hosted) system. */
  baseUrl: string;
  /** API key / bearer token, when the system uses one. */
  apiKey?: string;
  /** Extra provider-specific auth parts (e.g. httpsms phone number, Frappe key:secret). */
  extras?: Record<string, string>;
}

export interface ConnectorContext {
  /** Owning tenant — every adapter call is tenant-scoped and auditable. */
  companyId: string;
  agentId?: string;
  credential: IntegrationCredential;
  /** Per-call timeout; adapters must never run unbounded. */
  timeoutMs?: number;
}

export interface ConnectorResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  httpStatus?: number;
  durationMs: number;
  /** Audit trail fields — callers persist these to ToolRun/audit rows. */
  audit: {
    adapter: string;
    operation: string;
    companyId: string;
    agentId?: string;
    requestUrl?: string;
  };
}

export interface ExternalSystemAdapter {
  /** Stable adapter id, e.g. `crm.twenty`. */
  readonly id: string;
  readonly category: IntegrationCategory;
  readonly licenseClass: LicenseClass;
  readonly strategy: IntegrationStrategy;
  /** Short human description of what this connects to. */
  readonly description: string;
  /** Upstream repository the adapter targets (for attribution + version pinning). */
  readonly upstreamRepo: string;
  /** Verify credentials + connectivity without mutating remote state. */
  testConnection(ctx: ConnectorContext): Promise<ConnectorResult<Record<string, unknown>>>;
}

// ---------------------------------------------------------------------------
// Shared adapter helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;

export class IntegrationError extends Error {
  readonly httpStatus?: number;
  readonly adapter: string;
  constructor(adapter: string, message: string, httpStatus?: number) {
    super(message);
    this.name = 'IntegrationError';
    this.adapter = adapter;
    this.httpStatus = httpStatus;
  }
}

/** Loopback / private-network targets are rejected unless explicitly allow-listed. */
export function isAllowedIntegrationUrl(
  rawUrl: string,
  opts: { allowInsecure?: boolean } = {},
): { allowed: boolean; reason?: string; url: URL } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'invalid URL', url: new URL('https://invalid.invalid') };
  }
  const allowInsecure =
    opts.allowInsecure ?? process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS === 'true';
  if (url.protocol !== 'https:' && !allowInsecure) {
    return {
      allowed: false,
      reason: `insecure protocol ${url.protocol}: (set ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true for trusted private networks)`,
      url,
    };
  }
  const host = url.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '::1' || host.endsWith('.localhost');
  const isPrivateV4 = /^10\.|^127\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(host);
  const isPrivateV6 = host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  const isLocalHostname = host.endsWith('.local') || host.endsWith('.internal');
  if ((isLoopback || isPrivateV4 || isPrivateV6 || isLocalHostname) && !allowInsecure) {
    return { allowed: false, reason: `private network target "${host}" is blocked (SSRF guard)`, url };
  }
  return { allowed: true, url };
}

/** fetch with timeout + URL guard; the single egress path for all adapters. */
export async function guardedFetch(
  adapter: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const guard = isAllowedIntegrationUrl(url);
  if (!guard.allowed) {
    throw new IntegrationError(adapter, `blocked target: ${guard.reason}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(guard.url.toString(), { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Run an adapter operation, normalize errors, and shape the audit result. */
export async function runConnectorOp<T>(
  adapter: ExternalSystemAdapter,
  ctx: ConnectorContext,
  operation: string,
  fn: () => Promise<T>,
): Promise<ConnectorResult<T>> {
  const startedAt = Date.now();
  try {
    const data = await fn();
    return {
      ok: true,
      data,
      durationMs: Date.now() - startedAt,
      audit: { adapter: adapter.id, operation, companyId: ctx.companyId, agentId: ctx.agentId },
    };
  } catch (err) {
    const status = err instanceof IntegrationError ? err.httpStatus : undefined;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      httpStatus: status,
      durationMs: Date.now() - startedAt,
      audit: {
        adapter: adapter.id,
        operation,
        companyId: ctx.companyId,
        agentId: ctx.agentId,
      },
    };
  }
}

export function requireApiKey(ctx: ConnectorContext, adapter: string): string {
  const key = ctx.credential.apiKey;
  if (!key) throw new IntegrationError(adapter, 'missing apiKey in credential');
  return key;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
