/**
 * Authentication for the staff route group (`/api/internal/**`) — the internal
 * side of the client-services wall, where ALO Labs personnel manage client
 * work and connect it to AgentOS.
 *
 * `internalRoute` requires an INTERNAL session (`verifySessionToken` with the
 * default internal audience refuses every client token) AND one of the roles
 * the route names. A client session never reaches the handler; the attempt is
 * recorded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { recordAccessViolation } from '@/lib/access/audit';
import { isInternalRole } from '@/lib/access/surfaces';
import { OperationError } from '@/lib/client-services/operations';
import { DocumentError } from '@/lib/portal/documents';

/** Roles with full authority over the internal surface. */
export const PLATFORM_ADMIN_ROLES = ['super_admin', 'platform_super_admin', 'admin'] as const;
/** May manage client accounts, projects, quotations, invoices and tickets. */
export const CLIENT_SERVICE_ROLES = [...PLATFORM_ADMIN_ROLES, 'account_manager'] as const;
/** May start and review the internal work that fulfils a client project. */
export const WORKFORCE_ROLES = [...PLATFORM_ADMIN_ROLES, 'ai_workforce_admin'] as const;
/** May read the security event log. */
export const SECURITY_ROLES = [...PLATFORM_ADMIN_ROLES, 'security_admin'] as const;

export interface StaffContext {
  userId: string;
  role: string;
  name: string;
  email: string;
  request: NextRequest;
}

export class InternalError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'InternalError';
  }
}

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function authenticateStaff(request: NextRequest, roles: readonly string[]): Promise<StaffContext> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) throw new InternalError(401, 'Unauthorized');

  // Default audience is `internal`: a client session returns null here and the
  // refusal is recorded by verifySessionToken itself.
  const session = await verifySessionToken(token);
  if (!session) throw new InternalError(401, 'Unauthorized');

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive || !isInternalRole(user.role)) throw new InternalError(401, 'Unauthorized');

  if (!roles.includes(user.role)) {
    await recordAccessViolation({
      type: 'privilege_escalation_denied',
      userId: user.id,
      role: user.role,
      resource: 'internal-api',
      path: request.nextUrl.pathname,
      method: request.method,
      reason: 'internal role is not permitted on this route',
    });
    throw new InternalError(403, 'Forbidden');
  }
  return { userId: user.id, role: user.role, name: user.name, email: user.email, request };
}

type RouteParams = Record<string, string>;

export function internalRoute<P extends RouteParams = RouteParams>(
  roles: readonly string[],
  handler: (ctx: StaffContext, params: P) => Promise<unknown>,
) {
  return async (request: NextRequest, segment?: { params: Promise<P> }): Promise<Response> => {
    try {
      const ctx = await authenticateStaff(request, roles);
      const params = (segment?.params ? await segment.params : {}) as P;
      const result = await handler(ctx, params);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      if (error instanceof InternalError || error instanceof OperationError || error instanceof DocumentError) {
        return json({ error: error.message }, error.status);
      }
      console.error('[internal] unhandled error', request.method, request.nextUrl.pathname, error);
      return json({ error: 'Internal server error' }, 500);
    }
  };
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new InternalError(400, 'A JSON object body is required.');
}

/** Resolve a client company by id, refusing anything that is not a client tenant. */
export async function requireClientCompany(companyId: unknown) {
  if (typeof companyId !== 'string' || !companyId) throw new InternalError(400, 'companyId is required.');
  const account = await db.clientAccount.findUnique({
    where: { companyId },
    include: { company: { select: { id: true, name: true, slug: true, accountType: true, status: true } } },
  });
  if (!account || account.company.accountType !== 'client') throw new InternalError(404, 'Client account not found.');
  return account;
}
