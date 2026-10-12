import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';

function generateBackupCode(): string {
  return crypto.randomBytes(4).toString('hex'); // 8-char hex string
}

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

    // Ownership check: user can only set up MFA for themselves, or admin for any user
    const authUser = await db.user.findUnique({ where: { id: session.userId } });
    if (!authUser) return NextResponse.json({ error: 'User not found' }, { status: 401 });
    if (session.userId !== userId && authUser.role !== 'super_admin' && authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: can only set up MFA for yourself' }, { status: 403 });
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

    if (user.otpEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled for this user. Disable it first to reconfigure.' },
        { status: 400 }
      );
    }

    // Generate a 32-char hex secret
    const secret = crypto.randomBytes(16).toString('hex'); // 32 hex chars

    // Store the secret in the user record
    await db.user.update({
      where: { id: userId },
      data: { otpSecret: secret },
    });

    // Build TOTP URI for QR code
    const issuer = 'ALO Labs';
    const emailEncoded = encodeURIComponent(user.email);
    const qrCodeUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${emailEncoded}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

    // Generate 6 backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 6; i++) {
      backupCodes.push(generateBackupCode());
    }

    // Store backup codes in Settings table
    await db.settings.upsert({
      where: { key: `mfa_backup:${userId}` },
      update: {
        value: JSON.stringify(backupCodes),
        updatedAt: new Date(),
      },
      create: {
        key: `mfa_backup:${userId}`,
        value: JSON.stringify(backupCodes),
        type: 'json',
      },
    });

    return NextResponse.json({
      secret,
      qrCodeUrl,
      backupCodes,
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}