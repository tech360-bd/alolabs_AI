import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import {
  buildTotpUri,
  generateTotpSecret,
  protectTotpSecret,
  serializeHashedBackupCodes,
} from '@/lib/auth/totp';

function generateBackupCode(): string {
  return crypto.randomBytes(4).toString('hex'); // 8-char hex string
}

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

    // Only the user themselves (or a super_admin) can configure MFA for an account.
    if (session.userId !== requestedUserId && authUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: can only set up MFA for yourself' },
        { status: 403 },
      );
    }

    const user = await db.user.findUnique({ where: { id: requestedUserId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.otpEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled for this user. Disable it first to reconfigure.' },
        { status: 400 },
      );
    }

    // Standard RFC 4648 Base32 secret (20 bytes -> 32 uppercase A-Z2-7 chars)
    const secret = generateTotpSecret();
    const storedSecret = protectTotpSecret(secret);

    await db.user.update({
      where: { id: requestedUserId },
      data: { otpSecret: storedSecret },
    });

    const qrCodeUrl = buildTotpUri(user.email, secret, 'ALO Labs');

    // Generate 6 single-use backup codes; store ONLY hashed digests at rest.
    const backupCodes: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      backupCodes.push(generateBackupCode());
    }
    const serializedHashes = serializeHashedBackupCodes(requestedUserId, backupCodes);

    await db.settings.upsert({
      where: { key: `mfa_backup:${requestedUserId}` },
      update: {
        value: serializedHashes,
        type: 'json',
        updatedAt: new Date(),
      },
      create: {
        key: `mfa_backup:${requestedUserId}`,
        value: serializedHashes,
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
