/**
 * Route-level authentication guard.
 *
 * Provides `withAuth` — a thin wrapper that verifies the Bearer token
 * before delegating to the actual handler. Returns 401 early on missing/
 * invalid tokens so individual route handlers never need to duplicate
 * the auth boilerplate.
 *
 * Usage:
 *   export const GET = withAuth(async (req, ctx, user) => {
 *     // user is guaranteed to be { userId, role, email, name }
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from './auth';

type AuthUser = {
  userId: string;
  role: string;
  email: string | null;
  name: string | null;
};

type AuthenticatedHandler = (
  request: NextRequest,
  context?: Record<string, unknown>,
  user?: AuthUser,
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler with authentication.
 * Extracts Bearer token, verifies session, enriches with user info.
 * Returns 401 if authentication fails.
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, context?: Record<string, unknown>): Promise<NextResponse> => {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: missing token' }, { status: 401 });
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    // Fetch minimal user info for role-based checks
    const { db } = await import('./db');
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Unauthorized: user not found or inactive' }, { status: 401 });
    }

    const authUser: AuthUser = {
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    return handler(request, context, authUser);
  };
}

/**
 * Returns an early 401 response. Useful for routes that need
 * conditional auth (e.g., public GET but authenticated POST).
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}
