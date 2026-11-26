/**
 * Bearer-session resolution for the legacy `/api/*` routes that predate
 * `secureRoute`.
 *
 * ── The defect this exists to remove ───────────────────────────────────────
 * Around sixty route files share this shape:
 *
 *     const token = request.headers.get('authorization')?.replace('Bearer ', '');
 *     const session = await verifySessionToken(token);
 *     const rows = await db.workflow.findMany();        // ← no tenant filter
 *
 * The session check is real, so it looks secure in review. But authentication
 * proves *who* is calling, never *what they may see*. Every one of those queries
 * returned all tenants' rows to any logged-in user — including client-portal
 * accounts, which are the least privileged population on the platform.
 *
 * `secureRoute` fixed this properly, but it also changes the response contract
 * and adds auditing, so rewriting sixty working endpoints in one step would risk
 * the UI for no security gain. This helper carries the same tenant resolution to
 * the old shape:
 *
 *   · the caller must hold a live CompanyUser membership;
 *   · `companyId` comes from that membership, never from the request;
 *   · tenant-scoped models are filtered with `tenantWhere(...)`.
 *
 * Migrating a route to `secureRoute` remains the goal; this removes the
 * vulnerability in the meantime without changing what the UI receives.
 */
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { isUsableTenantId } from '@/lib/tenancy/policy';

export interface LegacyTenant {
  userId: string;
  companyId: string;
  companyRole: string;
}

/** Thrown when a legacy route cannot establish a tenant. */
export class LegacyAuthError extends Error {
  constructor(readonly status: 401 | 403, message: string) {
    super(message);
    this.name = 'LegacyAuthError';
  }
}

/**
 * Resolve the caller's tenant for a hand-written route.
 *
 * Returns the company the user actually belongs to. Throws rather than
 * returning null so a caller cannot accidentally continue with an undefined
 * tenant — the failure mode this helper exists to prevent.
 */
export async function legacyTenant(request: NextRequest): Promise<LegacyTenant> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) throw new LegacyAuthError(401, 'Unauthorized');

  // Imported lazily to keep this module out of the edge/runtime import graph of
  // routes that merely reference the type.
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) throw new LegacyAuthError(401, 'Invalid token');

  const membership = await db.companyUser.findFirst({
    where: { userId: session.userId },
    select: { companyId: true, role: true },
  });

  if (!membership || !isUsableTenantId(membership.companyId)) {
    throw new LegacyAuthError(403, 'Your account does not belong to a company.');
  }

  return { userId: session.userId, companyId: membership.companyId, companyRole: membership.role };
}

/**
 * Build a Prisma `where` fragment scoped to the caller's company.
 *
 * `tenantWhere(tenant, { status: 'active' })` → `{ companyId, status: 'active' }`.
 * Pass `field` for models whose tenant column is named differently.
 */
export function tenantWhere<T extends Record<string, unknown> = Record<string, never>>(
  tenant: LegacyTenant,
  extra?: T,
  field = 'companyId',
): { companyId: string } & T {
  // `extra` can never overwrite the tenant: the spread order is deliberate.
  // Returned as a plain intersection rather than a computed key type, because
  // Prisma's generated `WhereInput` accepts an object literal and the mapped
  // type defeated inference at the call sites.
  return { [field]: tenant.companyId, ...(extra ?? ({} as T)) } as unknown as { companyId: string } & T;
}

/** Map a `LegacyAuthError` to the JSON response the UI already expects. */
export function legacyAuthResponse(error: unknown): { error: string; status: number } | null {
  if (error instanceof LegacyAuthError) {
    return { error: error.message, status: error.status };
  }
  return null;
}
