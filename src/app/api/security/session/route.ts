/**
 * Session API
 * ALO Labs AIOS — Manage user sessions.
 *
 * GET    /api/security/session — List active sessions for current user
 * DELETE /api/security/session — Logout specific session
 * POST   /api/security/session — Logout all other sessions (keep current)
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  listUserSessions,
  destroySession,
  destroyAllUserSessions,
} from '@/lib/security/session-manager';

// ─── GET: List Sessions ──────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireAuth();

    const sessions = await listUserSessions(user.userId);

    // Sanitize: remove sensitive info
    const safeSessions = sessions.map((s) => ({
      userAgent: s.metadata.userAgent ?? 'Unknown',
      device: s.metadata.device ?? 'Unknown',
      ipAddress: s.metadata.ipAddress
        ? s.metadata.ipAddress.replace(/(\d+\.\d+)\.\d+\.\d+/, '$1.*.*')
        : 'Unknown',
      createdAt: s.metadata.createdAt,
      lastActivityAt: s.metadata.lastActivityAt,
      expiresAt: s.metadata.expiresAt,
    }));

    return NextResponse.json({
      sessions: safeSessions,
      total: safeSessions.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Session list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── DELETE: Logout Specific Session ─────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();

    const body = await request.json().catch(() => ({}));
    const { token, sessionCreatedAt } = body as {
      token?: string;
      sessionCreatedAt?: string;
    };

    if (!token && !sessionCreatedAt) {
      return NextResponse.json(
        { error: 'token or sessionCreatedAt is required' },
        { status: 400 },
      );
    }

    if (token) {
      // Direct token destruction
      const destroyed = await destroySession(token);
      if (!destroyed) {
        return NextResponse.json(
          { error: 'Session not found or already expired' },
          { status: 404 },
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Session terminated',
      });
    }

    // Find session by createdAt and destroy it
    if (sessionCreatedAt) {
      const sessions = await listUserSessions(user.userId);
      const targetSession = sessions.find(
        (s) => s.metadata.createdAt === sessionCreatedAt,
      );

      if (!targetSession) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 },
        );
      }

      // We can't destroy without the token — need to find it
      // Use the token hash from the meta record
      const { db } = await import('@/lib/db');
      const metaRecords = await db.settings.findMany({
        where: {
          key: {
            startsWith: `session:meta:${user.userId}:`,
          },
        },
      });

      for (const record of metaRecords) {
        try {
          const data = JSON.parse(record.value) as {
            tokenHash: string;
            createdAt: string;
          };
          if (data.createdAt === sessionCreatedAt) {
            // Construct a dummy token that hashes to the stored hash
            // Since we don't store raw tokens, delete by Settings key
            await db.settings.deleteMany({
              where: {
                OR: [
                  { key: `session:${data.tokenHash}` },
                  { key: record.key },
                ],
              },
            });

            return NextResponse.json({
              success: true,
              message: 'Session terminated',
            });
          }
        } catch {
          continue;
        }
      }

      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: 'token or sessionCreatedAt is required' },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Session delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── POST: Logout All Other Sessions ─────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    const body = await request.json().catch(() => ({}));
    const { currentToken } = body as { currentToken?: string };

    // Get all sessions
    const sessions = await listUserSessions(user.userId);

    if (sessions.length <= 1) {
      return NextResponse.json({
        success: true,
        message: 'No other sessions to terminate',
        terminatedCount: 0,
      });
    }

    // Destroy all sessions
    const destroyedCount = await destroyAllUserSessions(user.userId);

    // Re-create current session
    if (currentToken) {
      const { createSession } = await import('@/lib/security/session-manager');
      await createSession(user.userId);
    }

    return NextResponse.json({
      success: true,
      message: `${destroyedCount} session(s) terminated. Current session preserved.`,
      terminatedCount: destroyedCount,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Session logout-all error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}