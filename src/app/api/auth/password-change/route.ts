import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, verifySessionToken, deleteSessionToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, status: 400, message: 'Current password and new password are required', error: 'MISSING_FIELDS' }, { status: 400 });
    }

    if (newPassword.length < 12) {
      return NextResponse.json({ success: false, status: 400, message: 'Password must be at least 12 characters', error: 'WEAK_PASSWORD' }, { status: 400 });
    }

    const dbUser = await db.user.findUnique({ where: { id: user.userId } });
    if (!dbUser) {
      return NextResponse.json({ success: false, status: 404, message: 'User not found', error: 'NOT_FOUND' }, { status: 404 });
    }

    const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ success: false, status: 401, message: 'Current password is incorrect', error: 'INVALID_PASSWORD' }, { status: 401 });
    }

    const newHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });

    await db.auditLog.create({
      data: { userId: user.userId, action: 'user.password_change', resource: 'User', details: '{}' },
    });

    return NextResponse.json({ success: true, status: 200, message: 'Password changed successfully' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, status: 401, message: 'Unauthorized', error: 'UNAUTHORIZED' }, { status: 401 });
    }
    return NextResponse.json({ success: false, status: 500, message: 'Internal server error', error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7);
  if (!token) throw new Error('Unauthorized');
  return { userId: (await verifySessionToken(token))?.userId };
}
