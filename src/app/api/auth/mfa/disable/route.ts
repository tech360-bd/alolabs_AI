import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Ownership check: user can only disable MFA for themselves, or admin for any user
    const authUser = await db.user.findUnique({ where: { id: session.userId } });
    if (!authUser) return NextResponse.json({ error: 'User not found' }, { status: 401 });
    if (session.userId !== userId && authUser.role !== 'super_admin' && authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: can only disable MFA for yourself' }, { status: 403 });
    }

    // Find the user
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.otpEnabled) {
      return NextResponse.json(
        { error: 'MFA is not currently enabled for this user.' },
        { status: 400 }
      );
    }

    // Disable MFA: clear secret and set enabled to false
    await db.user.update({
      where: { id: userId },
      data: {
        otpEnabled: false,
        otpSecret: null,
      },
    });

    // Remove backup codes from Settings
    try {
      await db.settings.delete({
        where: { key: `mfa_backup:${userId}` },
      });
    } catch {
      // Backup codes setting may not exist
    }

    return NextResponse.json({
      message: 'MFA disabled successfully',
      enabled: false,
    });
  } catch (error) {
    console.error('MFA disable error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}