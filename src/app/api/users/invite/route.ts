import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// Allowed roles for invitations
// ---------------------------------------------------------------------------
const ALLOWED_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'operator',
  'viewer',
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

function isAllowedRole(role: string): role is AllowedRole {
  return (ALLOWED_ROLES as readonly string[]).includes(role);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '****';
  const visible = local.slice(0, 2);
  const masked = '*'.repeat(Math.max(local.length - 2, 3));
  return `${visible}${masked}@${domain}`;
}

async function authenticateAsAdmin() {
  const user = await requireAuth();
  if (!user.role || !['super_admin', 'company_admin'].includes(user.role)) {
    throw new Error('Unauthorized');
  }
  return { id: user.userId, email: user.email, name: user.name, role: user.role };
}

// ---------------------------------------------------------------------------
// POST — Create invitation
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const admin = await authenticateAsAdmin();

    const body = await request.json();
    const { email, role, companyId, message } = body as {
      email?: string;
      role?: string;
      companyId?: string;
      message?: string;
    };

    // --- Validate email ---
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 },
      );
    }
    const normalizedEmail = email.trim().toLowerCase();

    // --- Validate role ---
    if (!role || typeof role !== 'string' || !isAllowedRole(role)) {
      return NextResponse.json(
        { error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` },
        { status: 400 },
      );
    }

    // Prevent non-super_admins from inviting super_admins
    if (role === 'super_admin' && admin.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can invite super admins' },
        { status: 403 },
      );
    }

    // --- Check for duplicate pending invitation ---
    const existingInvitations = await db.settings.findMany({
      where: { key: { startsWith: 'invitation:' } },
      select: { key: true, value: true },
    });

    for (const inv of existingInvitations) {
      try {
        const data = JSON.parse(inv.value);
        if (data.email === normalizedEmail && data.status === 'pending') {
          return NextResponse.json(
            { error: 'A pending invitation already exists for this email' },
            { status: 409 },
          );
        }
      } catch {
        // skip corrupted records
      }
    }

    // --- Generate token & build payload ---
    const token = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    const invitationData = {
      email: normalizedEmail,
      role,
      companyId: companyId || null,
      message: message || null,
      invitedBy: admin.id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending' as const,
      usedBy: null as string | null,
    };

    await db.settings.upsert({
      where: { key: `invitation:${token}` },
      update: { value: JSON.stringify(invitationData), updatedAt: now },
      create: { key: `invitation:${token}`, value: JSON.stringify(invitationData), type: 'json' },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: 'create_invitation',
        resource: 'invitations',
        details: JSON.stringify({ email: normalizedEmail, role, companyId, token }),
      },
    });

    const inviteLink = `/invite?token=${token}`;

    return NextResponse.json(
      {
        success: true,
        token,
        inviteLink,
        email: normalizedEmail,
        role,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/users/invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — List invitations
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const admin = await authenticateAsAdmin();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'pending' | 'accepted' | 'expired'

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'invitation:' } },
      select: { key: true, value: true },
      orderBy: { updatedAt: 'desc' },
    });

    let invitations: Array<{
      token: string;
      email: string;
      role: string;
      companyId: string | null;
      message: string | null;
      invitedBy: string;
      createdAt: string;
      expiresAt: string;
      status: string;
      usedBy: string | null;
    }> = [];

    for (const s of allSettings) {
      try {
        const data = JSON.parse(s.value);
        invitations.push({ token: s.key.replace('invitation:', ''), ...data });
      } catch {
        // skip
      }
    }

    // Apply status filter
    if (statusFilter) {
      invitations = invitations.filter((inv) => inv.status === statusFilter);
    }

    // Mark expired pending invitations
    const now = new Date();
    invitations = invitations.map((inv) => {
      if (
        inv.status === 'pending' &&
        new Date(inv.expiresAt) < now
      ) {
        return { ...inv, status: 'expired' };
      }
      return inv;
    });

    // Mask emails for non-super_admin users
    const shouldMask = admin.role !== 'super_admin';
    const response = invitations.map((inv) => ({
      ...inv,
      email: shouldMask ? maskEmail(inv.email) : inv.email,
    }));

    return NextResponse.json({ data: response, total: response.length });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GET /api/users/invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT — Accept or resend invitation
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const admin = await authenticateAsAdmin();

    const body = await request.json();
    const { token, action } = body as { token?: string; action?: string };

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }
    if (!action || !['accept', 'resend'].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'resend'" },
        { status: 400 },
      );
    }

    // --- Fetch invitation ---
    const record = await db.settings.findUnique({
      where: { key: `invitation:${token}` },
    });
    if (!record) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    let invitationData: Record<string, unknown>;
    try {
      invitationData = JSON.parse(record.value);
    } catch {
      return NextResponse.json({ error: 'Corrupted invitation data' }, { status: 500 });
    }

    if (invitationData.status === 'accepted') {
      return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 });
    }

    const now = new Date();

    if (action === 'accept') {
      // Check expiry
      if (new Date(invitationData.expiresAt as string) < now) {
        return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
      }

      // Mark as accepted
      invitationData.status = 'accepted';
      invitationData.usedBy = admin.id;
      invitationData.acceptedAt = now.toISOString();

      await db.settings.update({
        where: { key: `invitation:${token}` },
        data: { value: JSON.stringify(invitationData), updatedAt: now },
      });

      await db.auditLog.create({
        data: {
          userId: admin.id,
          action: 'accept_invitation',
          resource: 'invitations',
          details: JSON.stringify({
            token,
            email: invitationData.email,
            role: invitationData.role,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Invitation accepted',
        email: invitationData.email,
        role: invitationData.role,
      });
    }

    // --- action === 'resend' ---
    const newExpiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    invitationData.expiresAt = newExpiresAt.toISOString();
    invitationData.resentAt = now.toISOString();
    invitationData.resentBy = admin.id;

    await db.settings.update({
      where: { key: `invitation:${token}` },
      data: { value: JSON.stringify(invitationData), updatedAt: now },
    });

    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: 'resend_invitation',
        resource: 'invitations',
        details: JSON.stringify({ token, email: invitationData.email, newExpiresAt }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Invitation resent',
      token,
      newExpiresAt: newExpiresAt.toISOString(),
      inviteLink: `/invite?token=${token}`,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('PUT /api/users/invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}