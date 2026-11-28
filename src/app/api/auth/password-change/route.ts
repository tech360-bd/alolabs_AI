import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, revokeUserSessions, verifyPassword, verifySessionToken } from '@/lib/auth';
import { validatePasswordStrength } from '@/lib/auth/password-policy';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = (await request.json().catch(() => null)) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    } | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, status: 400, message: 'Invalid request body', error: 'INVALID_BODY' },
        { status: 400 },
      );
    }

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPasswordRaw = body.newPassword;

    if (!currentPassword || !newPasswordRaw) {
      return NextResponse.json(
        { success: false, status: 400, message: 'Current password and new password are required', error: 'MISSING_FIELDS' },
        { status: 400 },
      );
    }

    const strength = validatePasswordStrength(newPasswordRaw);
    if (!strength.ok) {
      return NextResponse.json(
        { success: false, status: 400, message: strength.error, error: 'WEAK_PASSWORD' },
        { status: 400 },
      );
    }

    if (strength.password === currentPassword) {
      return NextResponse.json(
        { success: false, status: 400, message: 'New password must be different from current password', error: 'SAME_PASSWORD' },
        { status: 400 },
      );
    }

    const dbUser = await db.user.findUnique({ where: { id: user.userId } });
    if (!dbUser || dbUser.isActive === false) {
      return NextResponse.json(
        { success: false, status: 404, message: 'User not found', error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, status: 401, message: 'Current password is incorrect', error: 'INVALID_PASSWORD' },
        { status: 401 },
      );
    }

    const newHash = await hashPassword(strength.password);
    const sessionsRevoked = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.userId },
        data: { passwordHash: newHash, updatedAt: new Date() },
      });
      const revoked = await revokeUserSessions(user.userId, tx);
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'user.password_change',
          resource: 'User',
          details: JSON.stringify({ sessionsRevoked: revoked }),
        },
      });
      return revoked;
    });

    const response = NextResponse.json({
      success: true,
      status: 200,
      message: 'Password changed successfully. Please sign in again.',
      sessionsRevoked,
    });
    response.cookies.set('session-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, status: 401, message: 'Unauthorized', error: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { success: false, status: 500, message: 'Internal server error', error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7).trim();
  if (!token) throw new Error('Unauthorized');
  // Shared account endpoint: a user of either surface may change their own
  // password. An invalid session is a 401, never an undefined user id.
  const session = await verifySessionToken(token, { audience: 'any' });
  if (!session) throw new Error('Unauthorized');
  return { userId: session.userId };
}
