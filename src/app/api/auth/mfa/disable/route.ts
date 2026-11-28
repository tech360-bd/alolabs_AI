import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';

function extractSessionToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return request.cookies.get('session-token')?.value ?? null;
}

export async function POST(request: NextRequest) {
  const token = extractSessionToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await verifySessionToken(token, { audience: 'any' });
  if (!session) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown } | null;
    const requestedUserId =
      body && typeof body.userId === 'string' && body.userId.trim()
        ? body.userId.trim()
        : session.userId;

    const authUser = await db.user.findUnique({ where: { id: session.userId } });
    if (!authUser || authUser.isActive === false) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (session.userId !== requestedUserId && authUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: can only disable MFA for yourself' },
        { status: 403 },
      );
    }

    const user = await db.user.findUnique({ where: { id: requestedUserId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.otpEnabled) {
      return NextResponse.json(
        { error: 'MFA is not currently enabled for this user.' },
        { status: 400 },
      );
    }

    await db.user.update({
      where: { id: requestedUserId },
      data: {
        otpEnabled: false,
        otpSecret: null,
      },
    });

    await db.settings
      .delete({ where: { key: `mfa_backup:${requestedUserId}` } })
      .catch(() => undefined);

    return NextResponse.json({
      message: 'MFA disabled successfully',
      enabled: false,
    });
  } catch (error) {
    console.error('MFA disable error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
