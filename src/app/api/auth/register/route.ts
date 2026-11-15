import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createSessionToken } from '@/lib/auth';
import { z } from 'zod';
import { CLIENT_ROLE } from '@/lib/access/surfaces';
import { recordAccessViolation } from '@/lib/access/audit';
import { provisionClientAccount } from '@/lib/client-services/operations';

// Public self-registration creates CLIENT accounts and nothing else. The
// schema names every field that is read; `role`, `accountType`, `isActive`
// and anything else in the body are never looked at, so a caller cannot
// register themselves into the internal workforce.
const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  companyName: z.string().trim().min(2).max(120).optional(),
});

/** Body fields that only make sense as an attempt to gain privileges. */
const PRIVILEGE_FIELDS = ['role', 'roles', 'accountType', 'audience', 'isAdmin', 'permissions', 'companyId'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { email, password, name, companyName } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const attempted = PRIVILEGE_FIELDS.filter((field) => body && typeof body === 'object' && field in body);
    if (attempted.length) {
      await recordAccessViolation({
        type: 'privilege_escalation_denied',
        resource: 'auth.register',
        path: '/api/auth/register',
        method: 'POST',
        reason: 'registration body tried to set privileged fields; they were ignored',
        details: { fields: attempted.join(',') },
      });
    }

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name,
        role: CLIENT_ROLE,
        isActive: true,
      },
    });

    // Every client login belongs to exactly one client company, which is the
    // tenant boundary for everything they can see in the portal.
    await provisionClientAccount({
      userId: user.id,
      companyName: companyName ?? `${name}'s organisation`,
      billingEmail: normalizedEmail,
    });

    // Create session token
    const token = await createSessionToken(user.id, { method: 'register' });

    // Log registration event
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.register',
        resource: 'User',
        details: JSON.stringify({ ip: clientIp, userAgent }),
        ipAddress: clientIp,
      },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    }, { status: 201 });
    // Same cookie contract as /api/auth/login: the server-side page gate reads
    // this cookie, so a freshly registered user lands inside the dashboard.
    response.cookies.set('session-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
