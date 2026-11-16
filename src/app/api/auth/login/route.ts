import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { compare } from 'bcrypt';
import { db } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { z } from 'zod';
import { parseBody } from '@/lib/validators';

// ─── In-memory brute-force rate limiter ────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];
}

const loginRateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const REMEMBER_ME_TTL_HOURS = 30 * 24;
const loginBodySchema = z.object({
  email: z.string({ error: 'Email and password are required' }).trim().email().max(255),
  password: z.string({ error: 'Email and password are required' }).min(1).max(128),
  rememberMe: z.boolean().optional().default(false),
}).strict();

function sessionTtlHours(rememberMe: boolean): number {
  if (rememberMe) return REMEMBER_ME_TTL_HOURS;
  const configured = Number(process.env.SESSION_TTL_HOURS ?? 24);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
}

// Cleanup old entries every 60 seconds
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginRateLimits.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (entry.timestamps.length === 0) {
        loginRateLimits.delete(key);
      }
    }
  }, 60_000);
}

function checkLoginRateLimit(identifier: string, maxAttempts: number): boolean {
  const now = Date.now();
  let entry = loginRateLimits.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    loginRateLimits.set(identifier, entry);
  }
  // Prune stale timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (entry.timestamps.length >= maxAttempts) {
    return false; // rate limited
  }
  entry.timestamps.push(now);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    // Check IP-based rate limit
    if (!checkLoginRateLimit(`ip:${clientIp}`, MAX_ATTEMPTS_PER_IP)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = parseBody(loginBodySchema, body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });
    }
    const { email: submittedEmail, password, rememberMe } = parsed.data;
    const email = submittedEmail.toLowerCase();

    // Check email-based rate limit
    if (!checkLoginRateLimit(`email:${email.toLowerCase()}`, MAX_ATTEMPTS_PER_EMAIL)) {
      return NextResponse.json(
        { error: 'Too many login attempts for this email. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is disabled' },
        { status: 403 }
      );
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // If MFA is enabled, require verification before creating session
    if (user.otpEnabled) {
      // Generate tempToken and store it in Settings so MFA verify can look it up
      const tempToken = crypto.randomBytes(24).toString('hex');
      if (typeof db.settings?.upsert === 'function') {
        await db.settings.upsert({
          where: { key: `mfa_temp:${tempToken}` },
          create: {
            key: `mfa_temp:${tempToken}`,
            value: JSON.stringify({ userId: user.id, rememberMe, createdAt: Date.now() }),
            type: 'json',
          },
          update: { value: JSON.stringify({ userId: user.id, rememberMe, createdAt: Date.now() }), type: 'json' },
        });
      } else if (typeof db.settings?.create === 'function') {
        await db.settings.create({
          data: {
            key: `mfa_temp:${tempToken}`,
            value: JSON.stringify({ userId: user.id, rememberMe, createdAt: Date.now() }),
            type: 'json',
          },
        });
      }

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mfaRequired: true,
        },
        token: null,
        mfaPending: true,
        tempToken,
      });
    }

    // Persist the JWT's digest in Prisma; return the JWT for Bearer clients.
    const ttlHours = sessionTtlHours(rememberMe);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const token = await createSessionToken(user.id, {
      method: 'password',
      ttlHours,
      isRefreshToken: rememberMe,
      ipAddress: clientIp,
      userAgent,
      deviceInfo: userAgent,
    });

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log login event to AuditLog
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.login',
        resource: 'User',
        details: JSON.stringify({ ip: clientIp, userAgent }),
        ipAddress: clientIp,
      },
    });

    // Return the JWT for localStorage/Bearer API clients. Mirror it in an
    // httpOnly cookie only so server-rendered page gates can authenticate before
    // HTML is sent; private API authorization requires the Bearer header.
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
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}