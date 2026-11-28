import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSessionToken, verifySessionToken } from '@/lib/auth';
import { verifyAndConsumeBackupCode, verifyTotpCode } from '@/lib/auth/totp';
import { checkLimit } from '@/lib/security/rate-limiter';
import { sessionTtlHours } from '@/lib/session-ttl';
import { parseBody } from '@/lib/validators';

const MFA_TEMP_TTL_MS = 5 * 60 * 1000;
const MAX_MFA_ATTEMPTS_PER_IP = 10;
const MAX_MFA_ATTEMPTS_PER_CHALLENGE = 5;
const MFA_RATE_LIMIT_WINDOW_MS = 60_000;

const mfaVerifyBodySchema = z
  .object({
    userId: z.string().min(1).max(191).optional(),
    tempToken: z.string().min(1).max(128).optional(),
    code: z.string().trim().min(6).max(32).optional(),
    backupCode: z.string().trim().min(6).max(32).optional(),
    context: z.enum(['login', 'setup']).optional(),
  })
  .strict()
  .refine(({ code, backupCode }) => Boolean(code || backupCode), {
    message: 'Verification code is required',
  });

function getClientIp(request: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  if (trustProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const rightmost = forwarded.split(',').at(-1)?.trim();
      if (rightmost) return rightmost;
    }
  }
  return 'unknown';
}

function extractSessionToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return request.cookies?.get?.('session-token')?.value ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    if (!(await checkLimit(`mfa:ip:${clientIp}`, MAX_MFA_ATTEMPTS_PER_IP, MFA_RATE_LIMIT_WINDOW_MS)).allowed) {
      return NextResponse.json(
        { error: 'Too many MFA verification attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsedBody = parseBody(mfaVerifyBodySchema, body);
    if (parsedBody.error) {
      return NextResponse.json({ error: parsedBody.error.message }, { status: parsedBody.error.status });
    }

    const { tempToken, code, backupCode, context } = parsedBody.data;
    const submittedCode = (code ?? backupCode ?? '').trim();

    // ── Login context: verify TOTP or single-use backup code and issue session ──
    if (context === 'login') {
      if (!tempToken) {
        return NextResponse.json({ error: 'tempToken is required for login context' }, { status: 400 });
      }

      const tokenRateKey = `mfa:token:${crypto.createHash('sha256').update(tempToken).digest('hex')}`;
      if (!(await checkLimit(tokenRateKey, MAX_MFA_ATTEMPTS_PER_CHALLENGE, MFA_TEMP_TTL_MS)).allowed) {
        return NextResponse.json(
          { error: 'Too many MFA verification attempts. Please sign in again.' },
          { status: 429 },
        );
      }

      const tempKey = `mfa_temp:${tempToken}`;
      const tempEntry = await db.settings.findUnique({ where: { key: tempKey } });
      if (!tempEntry) {
        return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 401 });
      }

      let userId: string;
      let rememberMe = false;
      let createdAt: number;
      let attempts = 0;
      try {
        const parsed = JSON.parse(tempEntry.value) as {
          userId?: unknown;
          rememberMe?: unknown;
          createdAt?: unknown;
          attempts?: unknown;
        };
        if (typeof parsed.userId !== 'string' || typeof parsed.createdAt !== 'number') {
          throw new Error('invalid MFA temp record');
        }
        userId = parsed.userId;
        rememberMe = parsed.rememberMe === true;
        createdAt = parsed.createdAt;
        attempts = typeof parsed.attempts === 'number' && Number.isFinite(parsed.attempts) ? parsed.attempts : 0;
      } catch {
        return NextResponse.json({ error: 'Invalid verification token data' }, { status: 401 });
      }

      if (Date.now() - createdAt >= MFA_TEMP_TTL_MS) {
        await db.settings.delete({ where: { key: tempKey } }).catch(() => undefined);
        return NextResponse.json({ error: 'Verification token has expired' }, { status: 401 });
      }

      if (attempts >= MAX_MFA_ATTEMPTS_PER_CHALLENGE) {
        await db.settings.delete({ where: { key: tempKey } }).catch(() => undefined);
        return NextResponse.json(
          { error: 'Maximum MFA verification attempts exceeded. Please sign in again.' },
          { status: 401 },
        );
      }

      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user || user.isActive === false) {
        await db.settings.delete({ where: { key: tempKey } }).catch(() => undefined);
        return NextResponse.json({ error: 'Invalid or inactive user' }, { status: 401 });
      }

      if (!user.otpSecret || !user.otpEnabled) {
        await db.settings.delete({ where: { key: tempKey } }).catch(() => undefined);
        return NextResponse.json({ error: 'MFA is not enabled for this user.' }, { status: 400 });
      }

      let verified = false;
      let consumedBackupNextValue: string | null | undefined;
      const isSixDigitTotp = /^\d{6}$/.test(submittedCode) && !backupCode;

      if (isSixDigitTotp) {
        verified = verifyTotpCode(user.otpSecret, submittedCode);
      }

      if (!verified && (backupCode || /^[A-Za-z0-9-]{6,32}$/.test(submittedCode))) {
        const backupRow = await db.settings
          .findUnique({ where: { key: `mfa_backup:${user.id}` } })
          .catch(() => null);
        if (backupRow) {
          const backupResult = verifyAndConsumeBackupCode(backupRow.value, user.id, submittedCode);
          if (backupResult.valid) {
            verified = true;
            consumedBackupNextValue = backupResult.nextValue;
          }
        }
      }

      if (!verified) {
        const nextAttempts = attempts + 1;
        if (nextAttempts >= MAX_MFA_ATTEMPTS_PER_CHALLENGE) {
          await db.settings.delete({ where: { key: tempKey } }).catch(() => undefined);
        } else if (typeof db.settings.update === 'function') {
          await db.settings
            .update({
              where: { key: tempKey },
              data: {
                value: JSON.stringify({ userId, rememberMe, createdAt, attempts: nextAttempts }),
                updatedAt: new Date(),
              },
            })
            .catch(() => undefined);
        }
        return NextResponse.json(
          {
            error: 'Invalid verification code. Please try again.',
            retryAllowed: nextAttempts < MAX_MFA_ATTEMPTS_PER_CHALLENGE,
            attemptsRemaining: Math.max(0, MAX_MFA_ATTEMPTS_PER_CHALLENGE - nextAttempts),
          },
          { status: 401 },
        );
      }

      // Consume the single-use pending challenge ONLY after verification succeeds.
      await db.settings.delete({ where: { key: tempKey } });

      // Persist single-use backup code consumption if a backup code was used.
      if (consumedBackupNextValue !== undefined) {
        if (consumedBackupNextValue === null) {
          await db.settings.delete({ where: { key: `mfa_backup:${user.id}` } }).catch(() => undefined);
        } else if (typeof db.settings.update === 'function') {
          await db.settings
            .update({
              where: { key: `mfa_backup:${user.id}` },
              data: { value: consumedBackupNextValue, updatedAt: new Date() },
            })
            .catch(() => undefined);
        }
      }

      const ttlHours = sessionTtlHours(rememberMe);
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const token = await createSessionToken(user.id, {
        method: 'mfa',
        ttlHours,
        isRefreshToken: rememberMe,
        ipAddress: clientIp,
        userAgent,
        deviceInfo: userAgent,
      });

      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const response = NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      });
      response.cookies.set('session-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(ttlHours * 60 * 60),
      });
      return response;
    }

    // ── Setup context: enable MFA after first 6-digit TOTP verification ──────────
    const authToken = extractSessionToken(request);
    if (!authToken) {
      return NextResponse.json({ error: 'Authentication required for MFA setup' }, { status: 401 });
    }

    const session = await verifySessionToken(authToken, { audience: 'any' });
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
    }

    if (!(await checkLimit(`mfa:setup:${session.userId}`, MAX_MFA_ATTEMPTS_PER_CHALLENGE, MFA_RATE_LIMIT_WINDOW_MS)).allowed) {
      return NextResponse.json(
        { error: 'Too many MFA verification attempts. Please try again later.' },
        { status: 429 },
      );
    }

    if (!/^\d{6}$/.test(submittedCode) || backupCode) {
      return NextResponse.json(
        { error: 'A 6-digit authenticator TOTP code is required to complete setup.' },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.otpSecret) {
      return NextResponse.json(
        { error: 'MFA has not been set up. Please call /api/auth/mfa/setup first.' },
        { status: 400 },
      );
    }

    if (user.otpEnabled) {
      return NextResponse.json({ error: 'MFA is already enabled for this user.' }, { status: 400 });
    }

    if (!verifyTotpCode(user.otpSecret, submittedCode)) {
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 401 },
      );
    }

    await db.user.update({
      where: { id: session.userId },
      data: { otpEnabled: true },
    });

    return NextResponse.json({
      message: 'MFA enabled successfully',
      enabled: true,
    });
  } catch (error) {
    console.error('MFA verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
