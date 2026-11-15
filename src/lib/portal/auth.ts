/**
 * Authentication and request handling for the client route group
 * (`/api/portal/**`).
 *
 * `clientRoute` wraps every portal handler and is the only way one is built:
 *
 *   1. AUTHENTICATION — Bearer session token, verified with
 *      `verifySessionToken(token, { audience: 'client' })`. An internal
 *      (staff) session is refused here; a client session is refused
 *      everywhere else.
 *   2. TENANT RESOLUTION — the company is derived from the caller's own
 *      membership. `x-company-id`, `x-company-slug`, `?companyId=` and any
 *      `companyId` in a body are ignored for scoping; sending one that names a
 *      different company is recorded as tenant tampering.
 *   3. DATA ACCESS — the handler receives `tdb`, a `tenantDb(companyId)` handle
 *      that scopes every query. It never receives an unscoped client.
 *   4. RESPONSE — JSON is passed through the leak guard and sent `no-store`.
 *
 * Errors are deliberately uniform: an object that belongs to another client
 * and an object that does not exist both produce the same 404.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { recordAccessViolation } from '@/lib/access/audit';
import { checkRateLimit } from '@/lib/rate-limiter';
import { tenantDb, type TenantDb } from '@/lib/portal/tenant-db';
import { findInternalLeak } from '@/lib/portal/leak-guard';
import { OperationError } from '@/lib/client-services/operations';
import { DocumentError } from '@/lib/portal/documents';

export class PortalError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'PortalError';
  }
}

export const notFound = (message = 'Not found') => new PortalError(404, message, 'NOT_FOUND');
export const badRequest = (message: string) => new PortalError(400, message, 'BAD_REQUEST');
export const conflict = (message: string) => new PortalError(409, message, 'CONFLICT');

export interface ClientAccountInfo {
  status: string;
  currency: string;
  accountManagerName: string | null;
  accountManagerTitle: string | null;
  accountManagerEmail: string | null;
  accountManagerPhone: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
}

export interface ClientContext {
  userId: string;
  name: string;
  email: string;
  /** Role of the user inside their own company: owner | member. */
  memberRole: string;
  companyId: string;
  companyName: string;
  account: ClientAccountInfo;
  /** Query handle bound to this client's company. */
  tdb: TenantDb;
  request: NextRequest;
}

const NO_STORE: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function bearer(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Resolve the authenticated client and their company, or throw PortalError.
 * Exported for the acceptance tests; handlers should use `clientRoute`.
 */
export async function authenticateClient(request: NextRequest): Promise<ClientContext> {
  const token = bearer(request);
  if (!token) throw new PortalError(401, 'Unauthorized', 'UNAUTHORIZED');

  const session = await verifySessionToken(token, { audience: 'client' });
  if (!session) throw new PortalError(401, 'Unauthorized', 'UNAUTHORIZED');

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) throw new PortalError(401, 'Unauthorized', 'UNAUTHORIZED');

  // The tenant comes from membership and nothing else. A client user belongs
  // to exactly one client company; if that is ever not true we refuse rather
  // than guess which company they meant.
  const memberships = await db.companyUser.findMany({
    where: { userId: user.id, company: { accountType: 'client' } },
    select: { role: true, company: { select: { id: true, name: true, slug: true, status: true } } },
    take: 2,
  });
  if (memberships.length !== 1 || memberships[0].company.status !== 'active') {
    throw new PortalError(403, 'No active client account is linked to this login.', 'NO_CLIENT_ACCOUNT');
  }
  const { company, role: memberRole } = memberships[0];

  const account = await db.clientAccount.findUnique({ where: { companyId: company.id } });
  if (!account || account.status !== 'active') {
    throw new PortalError(403, 'This client account is not active.', 'ACCOUNT_INACTIVE');
  }

  // A request that names some other company is an attempt to cross tenants.
  // It changes nothing (scoping never reads these), but it is worth knowing.
  const claimed =
    request.headers.get('x-company-id') ??
    request.headers.get('x-company-slug') ??
    request.nextUrl.searchParams.get('companyId');
  if (claimed && claimed !== company.id && claimed !== company.slug) {
    await recordAccessViolation({
      type: 'tenant_tampering_denied',
      userId: user.id,
      role: session.role,
      companyId: company.id,
      resource: 'client-portal',
      path: request.nextUrl.pathname,
      method: request.method,
      reason: 'request named a company other than the caller\'s own',
    });
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    memberRole,
    companyId: company.id,
    companyName: company.name,
    account: {
      status: account.status,
      currency: account.currency,
      accountManagerName: account.accountManagerName,
      accountManagerTitle: account.accountManagerTitle,
      accountManagerEmail: account.accountManagerEmail,
      accountManagerPhone: account.accountManagerPhone,
      billingEmail: account.billingEmail,
      billingAddress: account.billingAddress,
    },
    tdb: tenantDb(company.id),
    request,
  };
}

type RouteParams = Record<string, string>;
type ClientHandler<P extends RouteParams> = (ctx: ClientContext, params: P) => Promise<unknown>;

export interface ClientRouteOptions {
  /** Requests allowed per user per minute. Default 120 for reads, 30 for writes. */
  rateLimit?: number;
}

/**
 * Build a `/api/portal/**` route handler. The handler returns a plain object
 * (sent as JSON after the leak guard) or a `Response` (file downloads).
 */
export function clientRoute<P extends RouteParams = RouteParams>(
  handler: ClientHandler<P>,
  options: ClientRouteOptions = {},
) {
  return async (request: NextRequest, segment?: { params: Promise<P> }): Promise<Response> => {
    let ctx: ClientContext | null = null;
    try {
      ctx = await authenticateClient(request);

      const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
      const limit = options.rateLimit ?? (isWrite ? 30 : 120);
      const bucket = await checkRateLimit(`portal:${isWrite ? 'w' : 'r'}:${ctx.userId}`, limit, 60_000);
      if (!bucket.allowed) return json({ error: 'Too many requests. Please try again shortly.' }, 429);

      const params = (segment?.params ? await segment.params : {}) as P;
      const result = await handler(ctx, params);
      if (result instanceof Response) return result;

      const leak = findInternalLeak(result);
      if (leak) {
        await recordAccessViolation({
          type: 'internal_data_leak_blocked',
          userId: ctx.userId,
          companyId: ctx.companyId,
          resource: 'client-portal',
          path: request.nextUrl.pathname,
          method: request.method,
          reason: 'response contained an internal-only field and was withheld',
          details: { field: leak },
        });
        return json({ error: 'Something went wrong. Please try again.' }, 500);
      }
      return json(result);
    } catch (error) {
      if (error instanceof PortalError) {
        return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
      }
      // Business-rule errors carry messages written for clients.
      if (error instanceof OperationError || error instanceof DocumentError) {
        return json({ error: error.message }, error.status);
      }
      // Never echo an internal error message to a client.
      console.error('[portal] unhandled error', request.method, request.nextUrl.pathname, error);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}

/** Record an attempt to reach an object the caller does not own, then 404. */
export async function denyForeignObject(ctx: ClientContext, resource: string, id: string): Promise<never> {
  await recordAccessViolation({
    type: 'cross_tenant_access_denied',
    userId: ctx.userId,
    companyId: ctx.companyId,
    resource,
    path: ctx.request.nextUrl.pathname,
    method: ctx.request.method,
    reason: 'object is not owned by the caller\'s account',
    details: { objectId: String(id).slice(0, 64) },
  });
  throw notFound();
}

/** Parse a JSON object body; anything else is a 400. */
export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw badRequest('A JSON body is required.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw badRequest('A JSON object is required.');
  return parsed as Record<string, unknown>;
}

/** A trimmed, length-bounded string field, or a 400. */
export function text(
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max: number; optional?: boolean } = { max: 2000 },
): string {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.optional) return '';
    throw badRequest(`${field} is required.`);
  }
  if (typeof raw !== 'string') throw badRequest(`${field} must be text.`);
  const value = raw.trim();
  if (value.length < (opts.min ?? 1) && !opts.optional) throw badRequest(`${field} is too short.`);
  if (value.length > opts.max) throw badRequest(`${field} is too long (maximum ${opts.max} characters).`);
  return value;
}
