/**
 * ALO Labs — audit trail for access-control decisions.
 *
 * Every refused attempt to cross from the client surface into the internal one
 * (or to reach another client's records) is written to `SecurityEvent`, so the
 * security team can see who probed what. Writes are best-effort and never
 * throw: a failed audit write must not turn a correct denial into a 500.
 *
 * Only identifiers are stored — never tokens, request bodies or credentials.
 */

import { db } from '@/lib/db';

export type AccessViolationType =
  /** A client session presented to the internal surface. */
  | 'client_to_internal_denied'
  /** An internal session presented to the client route group. */
  | 'internal_to_client_denied'
  /** A client tried to read or change another client's record. */
  | 'cross_tenant_access_denied'
  /** A client request named a tenant other than its own. */
  | 'tenant_tampering_denied'
  /** A client request tried to set a field it does not own (role, status …). */
  | 'privilege_escalation_denied'
  /** A client company API key used outside the public service plane. */
  | 'client_key_to_internal_denied'
  /** A response was blocked because it contained internal fields. */
  | 'internal_data_leak_blocked';

export interface AccessViolationInput {
  type: AccessViolationType;
  userId?: string | null;
  role?: string | null;
  companyId?: string | null;
  /** Dotted resource name or route, e.g. `portal.projects`. */
  resource?: string | null;
  path?: string | null;
  method?: string | null;
  reason?: string;
  details?: Record<string, string | number | boolean | null>;
}

const SEVERITY: Record<AccessViolationType, 'medium' | 'high' | 'critical'> = {
  client_to_internal_denied: 'high',
  internal_to_client_denied: 'medium',
  cross_tenant_access_denied: 'critical',
  tenant_tampering_denied: 'high',
  privilege_escalation_denied: 'critical',
  client_key_to_internal_denied: 'high',
  internal_data_leak_blocked: 'critical',
};

const RISK: Record<AccessViolationType, number> = {
  client_to_internal_denied: 80,
  internal_to_client_denied: 40,
  cross_tenant_access_denied: 95,
  tenant_tampering_denied: 85,
  privilege_escalation_denied: 95,
  client_key_to_internal_denied: 80,
  internal_data_leak_blocked: 100,
};

/** Headers the request proxy stamps on every request it forwards. */
export const REQUEST_PATH_HEADER = 'x-alo-request-path';
export const REQUEST_METHOD_HEADER = 'x-alo-request-method';

/**
 * Best-effort lookup of the path being served. Only available inside a request
 * scope; outside one (scripts, unit tests) it simply returns nothing.
 */
async function currentRequest(): Promise<{ path?: string; method?: string }> {
  try {
    const { headers } = await import('next/headers');
    const list = await headers();
    const path = list.get(REQUEST_PATH_HEADER) ?? undefined;
    const method = list.get(REQUEST_METHOD_HEADER) ?? undefined;
    return { ...(path ? { path: path.slice(0, 300) } : {}), ...(method ? { method: method.slice(0, 10) } : {}) };
  } catch {
    return {};
  }
}

export async function recordAccessViolation(input: AccessViolationInput): Promise<void> {
  try {
    const request = input.path ? {} : await currentRequest();
    const path = input.path ?? request.path ?? null;
    const method = input.method ?? request.method ?? null;
    await db.securityEvent.create({
      data: {
        type: input.type,
        severity: SEVERITY[input.type],
        source: 'access-control',
        companyId: input.companyId ?? null,
        action: 'denied',
        riskScore: RISK[input.type],
        details: JSON.stringify({
          userId: input.userId ?? null,
          role: input.role ?? null,
          resource: input.resource ?? null,
          path: path ? path.slice(0, 300) : null,
          method,
          reason: input.reason ?? null,
          ...(input.details ?? {}),
        }),
      },
    });
  } catch {
    // Intentionally swallowed — see module comment.
  }
}
