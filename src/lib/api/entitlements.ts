/**
 * Entitlement enforcement for the public service plane.
 *
 * Every /v1/ai/** request must:
 *  1. Authenticate (API key or session).
 *  2. Verify the required scope (e.g. "ai:chat").
 *  3. Verify the tenant has an ACTIVE entitlement to the service.
 *  4. Check the per-key rate limit.
 *  5. Check the entitlement quota (quotaUsed < quotaLimit).
 *
 * This module centralizes steps 3-5 so every /v1/ai/* handler calls it.
 */

import { db } from '@/lib/db';
import { hasScope, type V1Identity } from '@/lib/v1-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { V1Error } from '@/lib/v1';

export interface EntitlementCheckResult {
  serviceId: string;
  serviceName: string;
  quotaLimit: number;
  quotaUsed: number;
  remaining: number;
}

/**
 * Verify the caller is entitled to the service identified by `serviceSlug`.
 * Throws V1Error (403) if not entitled, (429) if rate-limited, (429) if quota
 * exhausted.
 */
export async function requireEntitlement(
  identity: V1Identity,
  serviceSlug: string,
  requiredScope: string,
): Promise<EntitlementCheckResult> {
  // Scope check.
  if (identity.kind === 'apiKey' && !hasScope(identity, requiredScope) && !hasScope(identity, '*')) {
    throw new V1Error(`Scope required: ${requiredScope}`, 403, 'FORBIDDEN');
  }

  const service = await db.service.findUnique({
    where: { slug: serviceSlug },
    select: { id: true, name: true, isActive: true },
  });
  if (!service || !service.isActive) {
    throw new V1Error('Service not available', 404, 'NOT_FOUND');
  }

  const entitlement = await db.entitlement.findUnique({
    where: { companyId_serviceId: { companyId: identity.companyId, serviceId: service.id } },
    select: { id: true, status: true, quotaLimit: true, quotaUsed: true, expiresAt: true },
  });

  if (!entitlement || entitlement.status !== 'active') {
    throw new V1Error('This service is not enabled for your account.', 403, 'ENTITLEMENT_REQUIRED');
  }
  if (entitlement.expiresAt && entitlement.expiresAt < new Date()) {
    throw new V1Error('Entitlement expired.', 403, 'ENTITLEMENT_REQUIRED');
  }
  if (entitlement.quotaUsed >= entitlement.quotaLimit) {
    throw new V1Error('Usage quota exceeded.', 429, 'QUOTA_EXCEEDED');
  }

  // F7: Per-key rate limit (API keys only — sessions are not rate-limited
  // per-key). Reads the ACTUAL CompanyApiKey.rateLimit configured for this
  // key, NOT a hardcoded default. A key with rateLimit=10 enforces 10/min.
  if (identity.kind === 'apiKey' && identity.keyId) {
    const apiKey = await db.companyApiKey.findUnique({
      where: { id: identity.keyId },
      select: { rateLimit: true },
    });
    const limit = apiKey?.rateLimit ?? 1000; // fail-safe default if row missing
    const rl = checkRateLimit(identity.keyId, limit);
    if (!rl.allowed) {
      throw new V1Error('Too many requests. Please slow down.', 429, 'RATE_LIMITED');
    }
  }

  return {
    serviceId: service.id,
    serviceName: service.name,
    quotaLimit: entitlement.quotaLimit,
    quotaUsed: entitlement.quotaUsed,
    remaining: entitlement.quotaLimit - entitlement.quotaUsed,
  };
}

/**
 * Increment the entitlement quota usage after a successful service call.
 * Best-effort; does not fail the request if the increment fails.
 */
export async function incrementUsage(serviceId: string, companyId: string, units = 1): Promise<void> {
  try {
    await db.entitlement.update({
      where: { companyId_serviceId: { companyId, serviceId } },
      data: { quotaUsed: { increment: units } },
    });
  } catch {
    /* best-effort */
  }
}
