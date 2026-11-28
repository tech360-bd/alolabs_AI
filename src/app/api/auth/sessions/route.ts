import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/validators';
import {
  refreshSession,
  revokeOtherSessions,
  revokeSession,
  revokeSessionById,
  listActiveSessions,
} from '@/lib/session-manager';
import { verifySessionToken } from '@/lib/auth';

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  const cookieToken = request.cookies?.get?.('session-token')?.value ?? '';
  const token = bearer || cookieToken;
  if (!token) return null;

  // Shared account endpoint: both internal and client portal users may manage their own sessions.
  const session = await verifySessionToken(token, { audience: 'any' });
  return session ? { userId: session.userId, token } : null;
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const refreshBodySchema = z.object({});

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const rows = await listActiveSessions(auth.userId);
    const sessions = rows.map(({ id, session }) => ({
      id,
      userId: session.userId,
      device: session.deviceInfo ?? 'Unknown',
      deviceInfo: session.deviceInfo,
      userAgent: session.userAgent ?? 'Unknown',
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastActivityAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      audience: session.aud,
      method: session.method,
      isRefreshToken: session.isRefreshToken === true,
    }));
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const parsed = parseBody(refreshBodySchema, body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
    }

    const token = await refreshSession(auth.token);
    if (!token) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 401 });
    }
    return NextResponse.json({ token });
  } catch (error) {
    console.error('Refresh session error:', error);
    return NextResponse.json({ error: 'Failed to refresh session' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const { searchParams } = new URL(request.url);
    const revokeAllOthers = searchParams.get('all') === 'true';
    const sessionId = searchParams.get('sessionId');

    if (revokeAllOthers && sessionId) {
      return NextResponse.json({ error: 'Use either all=true or sessionId, not both' }, { status: 400 });
    }

    if (revokeAllOthers) {
      const count = await revokeOtherSessions(auth.userId, auth.token);
      return NextResponse.json({ revoked: count });
    }

    if (sessionId) {
      const revoked = await revokeSessionById(auth.userId, sessionId);
      if (!revoked) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      return NextResponse.json({ revoked: true });
    }

    const revoked = await revokeSession(auth.token);
    if (!revoked) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error('Revoke session error:', error);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
