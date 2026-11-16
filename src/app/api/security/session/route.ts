/**
 * Session API
 *
 * GET    /api/security/session — list the current user's active sessions
 * DELETE /api/security/session — revoke one of the current user's sessions
 * POST   /api/security/session — revoke all other sessions, preserving caller
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseBody } from '@/lib/validators';
import {
  destroyAllUserSessions,
  destroyListedSession,
  destroySession,
  listUserSessions,
} from '@/lib/security/session-manager';

const deleteSessionSchema = z.object({
  token: z.string().min(1).max(4096).optional(),
  sessionId: z.string().min(1).max(191).optional(),
  sessionCreatedAt: z.string().datetime().optional(),
}).refine(
  (body) => [body.token, body.sessionId, body.sessionCreatedAt].filter(Boolean).length === 1,
  'Provide exactly one of token, sessionId, or sessionCreatedAt',
);

const logoutOthersSchema = z.object({
  // Older clients sent this in the JSON body. It is accepted only when it
  // exactly matches the authenticated Authorization header and is never used
  // as an independent credential.
  currentToken: z.string().min(1).max(4096).optional(),
}).strict();

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function parseError(error: { status: number; message: string }) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

export async function GET() {
  try {
    const user = await requireAuth();
    const sessions = await listUserSessions(user.userId);
    const safeSessions = sessions.map((session) => ({
      id: session.id,
      device: session.metadata.device ?? 'Unknown',
      userAgent: session.metadata.userAgent ?? 'Unknown',
      ipAddress: session.metadata.ipAddress
        ? session.metadata.ipAddress.replace(/(\d+\.\d+)\.\d+\.\d+/, '$1.*.*')
        : 'Unknown',
      createdAt: session.metadata.createdAt,
      lastActivityAt: session.metadata.lastActivityAt,
      expiresAt: session.metadata.expiresAt,
      isActive: session.isActive,
    }));
    return NextResponse.json({ sessions: safeSessions, total: safeSessions.length });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Session list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const parsed = parseBody(deleteSessionSchema, body);
    if (parsed.error) return parseError(parsed.error);

    const { token, sessionId, sessionCreatedAt } = parsed.data;
    const destroyed = token
      ? await destroySession(token, user.userId)
      : await destroyListedSession(user.userId, { sessionId, sessionCreatedAt });
    if (!destroyed) {
      return NextResponse.json({ error: 'Session not found or already expired' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Session terminated' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Session delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const parsed = parseBody(logoutOthersSchema, body);
    if (parsed.error) return parseError(parsed.error);

    const currentToken = bearerToken(request);
    if (!currentToken) {
      return NextResponse.json({ error: 'Bearer token required' }, { status: 401 });
    }
    if (parsed.data.currentToken && parsed.data.currentToken !== currentToken) {
      return NextResponse.json({ error: 'currentToken must match the authenticated session' }, { status: 400 });
    }

    const sessions = await listUserSessions(user.userId);
    if (sessions.length <= 1) {
      return NextResponse.json({ success: true, message: 'No other sessions to terminate', terminatedCount: 0 });
    }

    const terminatedCount = await destroyAllUserSessions(user.userId, currentToken);
    return NextResponse.json({
      success: true,
      message: `${terminatedCount} other session(s) terminated. Current session preserved.`,
      terminatedCount,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Session logout-all error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
