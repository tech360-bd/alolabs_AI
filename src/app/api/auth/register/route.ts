import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createSessionToken } from '@/lib/auth';
import { z } from 'zod';
import { CLIENT_ROLE } from '@/lib/access/surfaces';
import { recordAccessViolation } from '@/lib/access/audit';
import { provisionClientAccount } from '@/lib/client-services/operations';
import { provisionDefaultWorkspace } from '@/lib/platform/workspaces';

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

    // Give the new user a working Open AI Platform workspace: workspace +
    // default project + one scoped API key. Without this, "register" leads to an
    // empty dashboard and the user needs an administrator to become a customer,
    // which conflicts with the platform being self-service and multi-user.
    //
    // This is best-effort and deliberately non-fatal: the account exists and the
    // session is valid, so a provisioning fault must not turn a successful
    // signup into a 500. The workspace is created on demand by /platform/me if
    // it is missing, and the key can be reissued from settings.
    let workspace: { workspaceId: string; projectId: string; apiKey?: string } | null = null;
    try {
      const provisioned = await provisionDefaultWorkspace(user.id, name);
      workspace = {
        workspaceId: provisioned.workspaceId,
        projectId: provisioned.projectId,
        // Returned exactly once, in the signup response, for the same reason
        // the create-key endpoint does: it cannot be recovered later.
        ...(provisioned.apiKey.plaintext ? { apiKey: provisioned.apiKey.plaintext } : {}),
      };
    } catch (provisionError) {
      console.error('Workspace provisioning failed for new user:', provisionError instanceof Error ? provisionError.message : provisionError);
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
      ...(workspace ? { workspace } : {}),
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
