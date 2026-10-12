import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { createSessionToken, verifySessionToken } from '@/lib/auth';

/**
 * Generate a TOTP code per RFC 6238 using HMAC-SHA1.
 * The secret is expected to be a hex-encoded string (as stored by the MFA setup endpoint).
 */
function generateTOTP(secretHex: string, timeStep: number = 30): string {
  const timeSlot = Math.floor(Date.now() / 1000 / timeStep);
  // Pack the 8-byte big-endian time counter
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(timeSlot), 0);

  // Decode the hex secret to bytes
  const secretBuffer = Buffer.from(secretHex, 'hex');

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(timeBuffer);
  const hmacResult = hmac.digest();

  // Dynamic truncation (RFC 4226 §5.4)
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify a TOTP code against the user's stored secret.
 * Checks the current time slot and the previous one to allow for clock skew.
 */
function verifyTOTP(secretHex: string, code: string): boolean {
  const normalizedCode = code.replace(/\s/g, '');

  // Check current and previous time slot to tolerate clock drift
  const timeSlot = Math.floor(Date.now() / 1000 / 30);

  for (const slotOffset of [0, -1]) {
    const slot = timeSlot + slotOffset;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(slot), 0);

    const secretBuffer = Buffer.from(secretHex, 'hex');
    const hmac = crypto.createHmac('sha1', secretBuffer);
    hmac.update(timeBuffer);
    const hmacResult = hmac.digest();

    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const binary =
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);

    const otp = (binary % 1_000_000).toString().padStart(6, '0');

    if (crypto.timingSafeEqual(Buffer.from(otp), Buffer.from(normalizedCode))) {
      return true;
    }
  }

  return false;
}

// ─── In-memory rate limiter for MFA verify attempts ──────────────────

interface RateLimitEntry {
  timestamps: number[];
}

const mfaRateLimits = new Map<string, RateLimitEntry>();
const MFA_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_MFA_ATTEMPTS_PER_IP = 10;

if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of mfaRateLimits.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < MFA_RATE_LIMIT_WINDOW_MS);
      if (entry.timestamps.length === 0) {
        mfaRateLimits.delete(key);
      }
    }
  }, 60_000);
}

function checkMfaRateLimit(clientIp: string): boolean {
  const now = Date.now();
  let entry = mfaRateLimits.get(clientIp);
  if (!entry) {
    entry = { timestamps: [] };
    mfaRateLimits.set(clientIp, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t < MFA_RATE_LIMIT_WINDOW_MS);
  if (entry.timestamps.length >= MAX_MFA_ATTEMPTS_PER_IP) {
    return false; // rate limited
  }
  entry.timestamps.push(now);
  return true;
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);

    // Rate limit MFA verify attempts by IP
    if (!checkMfaRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Too many MFA verification attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { tempToken, code, context } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      );
    }

    // ── Login context: verify TOTP and create session ──────────────────────
    if (context === 'login') {
      if (!tempToken) {
        return NextResponse.json(
          { error: 'tempToken is required for login context' },
          { status: 400 }
        );
      }

      // Look up tempToken in Settings to get the userId
      const tempEntry = await db.settings.findUnique({
        where: { key: `mfa_temp:${tempToken}` },
      });

      if (!tempEntry) {
        return NextResponse.json(
          { error: 'Invalid or expired verification token' },
          { status: 401 }
        );
      }

      let userId: string;
      try {
        const parsed = JSON.parse(tempEntry.value);
        userId = parsed.userId;
      } catch {
        return NextResponse.json(
          { error: 'Invalid verification token data' },
          { status: 401 }
        );
      }

      // Delete the temp token so it cannot be reused
      await db.settings.delete({
        where: { key: `mfa_temp:${tempToken}` },
      });

      const user = await db.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      if (!user.otpSecret || !user.otpEnabled) {
        return NextResponse.json(
          { error: 'MFA is not enabled for this user.' },
          { status: 400 }
        );
      }

      if (!verifyTOTP(user.otpSecret, code)) {
        return NextResponse.json(
          { error: 'Invalid verification code. Please try again.' },
          { status: 401 }
        );
      }

      // Create session token
      const token = await createSessionToken(user.id, { method: 'mfa' });

      // Update last login
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      });
    }

    // ── Setup context: enable MFA after first verification ─────────────────
    // Requires an existing authenticated session
    const authHeader = request.headers.get('authorization');
    const authToken = authHeader?.replace('Bearer ', '');
    if (!authToken) {
      return NextResponse.json(
        { error: 'Authentication required for MFA setup' },
        { status: 401 }
      );
    }

    const session = await verifySessionToken(authToken);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired session token' },
        { status: 401 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.otpSecret) {
      return NextResponse.json(
        { error: 'MFA has not been set up. Please call /api/auth/mfa/setup first.' },
        { status: 400 }
      );
    }

    if (user.otpEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled for this user.' },
        { status: 400 }
      );
    }

    if (!verifyTOTP(user.otpSecret, code)) {
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 401 }
      );
    }

    // Enable MFA
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
