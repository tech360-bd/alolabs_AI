/**
 * /api/access-denied — the audit sink for refused cross-surface API calls.
 *
 * src/proxy.ts rewrites here when a client session calls anything outside the
 * client route group, or an internal session calls the client route group. The
 * original handler never runs. This endpoint:
 *
 *   1. records the attempt in the security event log (who, which path), and
 *   2. answers a client with one uniform 404 — identical for a route that
 *      exists and one that does not — so internal routes cannot be discovered
 *      by probing.
 *
 * It returns no data under any circumstances, so calling it directly gains
 * nothing; a direct call is simply recorded as a denied request to itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { recordAccessViolation, REQUEST_METHOD_HEADER, REQUEST_PATH_HEADER } from '@/lib/access/audit';
import { audienceForToken } from '@/lib/access/surfaces';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

async function deny(request: NextRequest): Promise<NextResponse> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const path = request.headers.get(REQUEST_PATH_HEADER) ?? request.nextUrl.pathname;
  const method = request.headers.get(REQUEST_METHOD_HEADER) ?? request.method;

  // Attribute the attempt when the token is a real session. `any` because the
  // point here is to identify the caller, not to admit them anywhere.
  const session = token ? await verifySessionToken(token, { audience: 'any' }).catch(() => null) : null;
  const audience = session?.audience ?? audienceForToken(token);

  await recordAccessViolation({
    type: audience === 'client' ? 'client_to_internal_denied' : 'internal_to_client_denied',
    userId: session?.userId ?? null,
    role: session?.role ?? null,
    resource: 'api',
    path,
    method,
    reason: audience === 'client'
      ? 'client session called a route outside the client route group'
      : 'internal session called the client route group',
    details: { authenticated: Boolean(session) },
  });

  if (audience === 'client') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    { error: 'Forbidden', message: 'The client portal API is only available to client accounts.' },
    { status: 403, headers: NO_STORE },
  );
}

export const GET = deny;
export const POST = deny;
export const PUT = deny;
export const PATCH = deny;
export const DELETE = deny;
