import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/validators';
import {
  verifySession,
  revokeSession,
  revokeOtherSessions,
  listActiveSessions,
  refreshSession,
} from '@/lib/session-manager';

// ─── Auth helper ────────────────────────────────────────────────────

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  // Try enterprise session manager first, fall back to legacy auth
  let session = await verifySession(token);
  if (session) return { userId: session.userId, token };

  // Legacy auth compatibility
  const { verifySessionToken } = await import('@/lib/auth');
  const legacy = await verifySessionToken(token);
  if (legacy) return { userId: legacy.userId, token };

  return null;
}

// ─── GET: list active sessions ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessions = await listActiveSessions(auth.userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 },
    );
  }
}

// ─── POST: refresh session token ────────────────────────────────────

const refreshBodySchema = z.object({});

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(refreshBodySchema, body);
  if (parsed.error) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: parsed.error.status },
    );
  }

  try {
    const newToken = await refreshSession(auth.token);
    if (!newToken) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 401 },
      );
    }
    return NextResponse.json({ token: newToken });
  } catch (error) {
    console.error('Refresh session error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh session' },
      { status: 500 },
    );
  }
}

// ─── DELETE: revoke current session (logout) ───────────────────────

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for query param ?all=true to revoke all OTHER sessions
  const { searchParams } = new URL(request.url);
  const revokeAll = searchParams.get('all') === 'true';

  try {
    if (revokeAll) {
      // Revoke every session EXCEPT this one. "Sign out all other devices" must
      // not sign out the caller: the previous revokeAllSessions() call deleted
      // the caller's own session and never re-created it, so the client kept
      // holding a dead token and 401'd on its next request.
      const count = await revokeOtherSessions(auth.userId, auth.token);
      return NextResponse.json({ revoked: count });
    }

    // Revoke only the current session
    const revoked = await revokeSession(auth.token);
    if (!revoked) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error('Revoke session error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke session' },
      { status: 500 },
    );
  }
}
