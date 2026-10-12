/**
 * Session Cleanup Endpoint — P5
 * ALO Labs AISMH
 *
 * POST /api/auth/sessions/cleanup
 * Admin-only endpoint to manually trigger expired session cleanup.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/validators';
import { verifySession } from '@/lib/session-manager';
import { runSessionCleanup } from '@/lib/session-cleanup';

const ADMIN_ROLES = ['super_admin', 'admin'];

async function authenticateAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  // Try enterprise session manager first
  let session = await verifySession(token);
  if (session) {
    const { db } = await import('@/lib/db');
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, isActive: true },
    });
    if (user && user.isActive && ADMIN_ROLES.includes(user.role)) {
      return user;
    }
    return null;
  }

  // Legacy auth fallback
  const { verifySessionToken } = await import('@/lib/auth');
  const legacy = await verifySessionToken(token);
  if (!legacy) return null;

  const { db } = await import('@/lib/db');
  const user = await db.user.findUnique({
    where: { id: legacy.userId },
    select: { id: true, role: true, isActive: true },
  });
  if (user && user.isActive && ADMIN_ROLES.includes(user.role)) {
    return user;
  }
  return null;
}

const cleanupBodySchema = z.object({});

export async function POST(request: NextRequest) {
  const admin = await authenticateAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(cleanupBodySchema, body);
  if (parsed.error) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: parsed.error.status },
    );
  }

  try {
    const result = await runSessionCleanup();
    return NextResponse.json({
      cleaned: result.cleaned,
      message: result.cleaned === 0
        ? 'No expired sessions found'
        : `Cleaned ${result.cleaned} expired session(s)`,
    });
  } catch (error) {
    console.error('Session cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to run session cleanup' },
      { status: 500 },
    );
  }
}
