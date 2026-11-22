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

// ---------------------------------------------------------------------------\n// Shared adapter helpers\n// ---------------------------------------------------------------------------\n\nconst DEFAULT_TIMEOUT_MS = 15_000;\n\nexport class IntegrationError extends Error {\n  readonly httpStatus?: number;\n  readonly adapter: string;\n  constructor(adapter: string, message: string, httpStatus?: number) {\n    super(message);\n    this.name = 'IntegrationError';\n    this.adapter = adapter;\n    this.httpStatus = httpStatus;\n  }\n}\n\n/** Loopback / private-network targets are rejected unless explicitly allow-listed. */\nfunction isNumericLabel(label: string): boolean {\n  if (label.length === 0 || label.length > 3) return false;\n  for (const ch of label) {\n    if (ch < '0' || ch > '9') return false;\n  }\n  return true;\n}\n\n/** RFC1918 / loopback / link-local / CGNAT / unspecified IPv4 hosts. */\nfunction isPrivateIpv4Host(host: string): boolean {\n  const parts = host.split('.');\n  if (parts.length !== 4 || !parts.every(isNumericLabel)) return false;\n  const [a, b] = parts.map(Number);\n  if (a === 0 || a === 10 || a === 127) return true;\n  if (a === 169 && b === 254) return true;\n  if (a === 172 && b >= 16 && b <= 31) return true;\n  if (a === 192 && b === 168) return true;\n  if (a === 100 && b >= 64 && b <= 127) return true;\n  // 224/4 multicast and 240/4 reserved/broadcast are never a legitimate CRM.\n  if (a >= 224) return true;\n  return false;\n}\n\nexport function isAllowedIntegrationUrl(\n  rawUrl: string,\n  opts: { allowInsecure?: boolean } = {},\n): { allowed: boolean; reason?: string; url: URL } {\n  let url: URL;\n  try {\n    url = new URL(rawUrl);\n  } catch {\n    return { allowed: false, reason: 'invalid URL', url: new URL('https://invalid.invalid') };\n  }\n  const allowInsecure =\n    opts.allowInsecure ?? process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS === 'true';\n  if (url.protocol !== 'https:' && !allowInsecure) {\n    return {\n      allowed: false,\n      reason: `insecure protocol ${url.protocol}: (set ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true for trusted private networks)`,\n      url,\n    };\n  }\n  if (allowInsecure) return { allowed: true, url };\n\n  const rawHost = url.hostname.toLowerCase();\n  // A trailing dot is DNS-equivalent to the bare name (`localhost.` resolves to\n  // loopback), so normalise before matching.\n  let host = rawHost;\n  while (host.endsWith('.')) host = host.slice(0, -1);\n\n  // IPv6 literals arrive bracketed (`[::1]`, `[::ffff:7f00:1]`), which the\n  // string checks below would miss. A CRM never needs a literal IPv6 address,\n  // so fail closed rather than enumerate every inner form.\n  if (rawHost.startsWith('[') || host.includes(':')) {\n    return { allowed: false, reason: `IPv6 literal target \"${rawHost}\" is blocked (SSRF guard)`, url };\n  }\n\n  const isLoopback = host === 'localhost' || host.endsWith('.localhost');\n  const isUnspecified = host === '0' || host === '0.0.0.0';\n  const isLocalHostname = host.endsWith('.local') || host.endsWith('.internal');\n  if (isLoopback || isUnspecified || isLocalHostname || isPrivateIpv4Host(host)) {\n    return { allowed: false, reason: `private network target \"${host}\" is blocked (SSRF guard)`, url };\n  }\n  return { allowed: true, url };\n}\n\n/** fetch with timeout + URL guard; the single egress path for all adapters. */\nexport async function guardedFetch(\n  adapter: string,\n  url: string,\n  init: RequestInit & { timeoutMs?: number } = {},\n): Promise<Response> {\n  const guard = isAllowedIntegrationUrl(url);\n  if (!guard.allowed) {\n    // ─── SSRF REGRESSION PROTECTION: Audit blocked attempts ──────────────────\n    try {\n      await db.auditLog.create({\n        data: {\n          userId: 'system',\n          action: 'integration_ssrf_blocked',\n          resource: 'Integration',\n          details: JSON.stringify({ adapter, url, reason: guard.reason, timestamp: new Date().toISOString() }),\n        },\n      });\n    } catch {\n      // ignore audit failure\n    }\n    throw new IntegrationError(adapter, `blocked target: ${guard.reason}`);\n  }\n  const controller = new AbortController();\n  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);\n  try {\n    // Redirects are refused: the SSRF guard validates only the first URL, and a\n    // 30x to a private/link-local address would otherwise bypass it.\n    // Placed after `...init` so a caller can never re-enable redirect following\n    // and bypass the SSRF guard through a 30x to a private address.\n    return await fetch(guard.url.toString(), { ...init, redirect: 'error', signal: controller.signal });\n  } finally {\n    clearTimeout(timeout);\n  }\n}\n\n/** Run an adapter operation, normalize errors, and shape the audit result. */\nexport async function runConnectorOp<T>(\n  adapter: ExternalSystemAdapter,\n  ctx: ConnectorContext,\n  operation: string,\n  fn: () => Promise<T>,\n): Promise<ConnectorResult<T>> {\n  const startedAt = Date.now();\n  try {\n    const data = await fn();\n    return {\n      ok: true,\n      data,\n      durationMs: Date.now() - startedAt,\n      audit: { adapter: adapter.id, operation, companyId: ctx.companyId, agentId: ctx.agentId },\n    };\n  } catch (err) {\n    const status = err instanceof IntegrationError ? err.httpStatus : undefined;\n    const message = err instanceof Error ? err.message : String(err);\n    return {\n      ok: false,\n      error: message,\n      httpStatus: status,\n      durationMs: Date.now() - startedAt,\n      audit: {\n        adapter: adapter.id,\n        operation,\n        companyId: ctx.companyId,\n        agentId: ctx.agentId,\n      },\n    };\n  }\n}\n\nexport function requireApiKey(ctx: ConnectorContext, adapter: string): string {\n  const key = ctx.credential.apiKey;\n  if (!key) throw new IntegrationError(adapter, 'missing apiKey in credential');\n  return key;\n}\n\nexport function joinUrl(base: string, path: string): string {\n  return `${base.replace(/\\/+$/, '')}/${path.replace(/^\\/+/, '')}`;\n}\n