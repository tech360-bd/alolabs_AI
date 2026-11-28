import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
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

async function authenticateInviteAdmin() {
  const user = await requireAuth();
  const isPlatformAdmin = user.role === 'super_admin';
  const isAdminRole =
    isPlatformAdmin ||
    user.role === 'company_admin' ||
    user.role === 'admin' ||
    user.companyRole === 'owner' ||
    user.companyRole === 'admin';

  if (!isAdminRole) {
    throw new Error('Forbidden');
  }

  let companyId = user.companyId ?? null;
  if (!companyId && !isPlatformAdmin) {
    const membership = await db.companyUser.findFirst({
      where: { userId: user.userId, role: { in: ['owner', 'admin'] } },
      select: { companyId: true },
    });
    companyId = membership?.companyId ?? null;
  }

  return {
    id: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    isPlatformAdmin,
    companyId,
  };
}

// ---------------------------------------------------------------------------
// POST — Create invitation
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const admin = await authenticateInviteAdmin();

    const body = (await request.json().catch(() => null)) as {
      email?: string;
      role?: string;
      companyId?: string;
      message?: string;
    } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { email, role, companyId: requestedCompanyId, message } = body;

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
    if (role === 'super_admin' && !admin.isPlatformAdmin) {
      return NextResponse.json(
        { error: 'Only super admins can invite super admins' },
        { status: 403 },
      );
    }

    // --- Tenant isolation: non-super_admins can invite ONLY to their own company ---
    let targetCompanyId: string | null = admin.companyId;
    if (admin.isPlatformAdmin) {
      targetCompanyId = requestedCompanyId?.trim() || admin.companyId || null;
    } else {
      if (!admin.companyId) {
        return NextResponse.json({ error: 'Company membership required' }, { status: 403 });
      }
      if (requestedCompanyId && requestedCompanyId !== admin.companyId) {
        return NextResponse.json(
          { error: 'Forbidden: cannot invite users to another company' },
          { status: 403 },
        );
      }
    }

    // --- Check for duplicate pending invitation within same company ---
    const existingInvitations = await db.settings.findMany({
      where: { key: { startsWith: 'invitation:' } },
      select: { key: true, value: true },
    });

    for (const inv of existingInvitations) {
      try {
        const data = JSON.parse(inv.value) as {
          email?: string;
          status?: string;
          companyId?: string | null;
        };
        if (
          data.email === normalizedEmail &&
          data.status === 'pending' &&
          (data.companyId ?? null) === targetCompanyId
        ) {
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
      companyId: targetCompanyId,
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

    // Never persist plaintext invite tokens into AuditLog
    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: 'create_invitation',
        resource: 'invitations',
        details: JSON.stringify({
          email: normalizedEmail,
          role,
          companyId: targetCompanyId,
          tokenPrefix: token.slice(0, 8),
        }),
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
        companyId: targetCompanyId,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('POST /api/users/invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — List invitations (strictly tenant-scoped; raw tokens redacted)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const admin = await authenticateInviteAdmin();
    if (!admin.isPlatformAdmin && !admin.companyId) {
      return NextResponse.json({ error: 'Company membership required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'pending' | 'accepted' | 'expired'

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'invitation:' } },
      select: { key: true, value: true },
      orderBy: { updatedAt: 'desc' },
    });

    let invitations: Array<{
      tokenPreview: string;
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
        const data = JSON.parse(s.value) as {
          email: string;
          role: string;
          companyId: string | null;
          message: string | null;
          invitedBy: string;
          createdAt: string;
          expiresAt: string;
          status: string;
          usedBy: string | null;
        };
        if (!admin.isPlatformAdmin && data.companyId !== admin.companyId) {
          continue;
        }
        const rawToken = s.key.replace('invitation:', '');
        invitations.push({
          tokenPreview: `${rawToken.slice(0, 8)}...`,
          email: data.email,
          role: data.role,
          companyId: data.companyId,
          message: data.message,
          invitedBy: data.invitedBy,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          status: data.status,
          usedBy: data.usedBy,
        });
      } catch {
        // skip
      }
    }

    if (statusFilter) {
      invitations = invitations.filter((inv) => inv.status === statusFilter);
    }

    const now = new Date();
    invitations = invitations.map((inv) => {
      if (inv.status === 'pending' && new Date(inv.expiresAt) < now) {
        return { ...inv, status: 'expired' };
      }
      return inv;
    });

    const shouldMask = !admin.isPlatformAdmin;
    const response = invitations.map((inv) => ({
      ...inv,
      email: shouldMask ? maskEmail(inv.email) : inv.email,
    }));

    return NextResponse.json({ data: response, total: response.length });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
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
    const user = await requireAuth();
    const isPlatformAdmin = user.role === 'super_admin';

    const body = (await request.json().catch(() => null)) as {
      token?: string;
      action?: string;
    } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { token, action } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }
    if (!action || !['accept', 'resend'].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'resend'" },
        { status: 400 },
      );
    }

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
      if (new Date(invitationData.expiresAt as string) < now) {
        return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
      }

      // Only the invited email (or super_admin) can accept an invitation
      const invitedEmail = typeof invitationData.email === 'string' ? invitationData.email.toLowerCase() : '';
      if (!isPlatformAdmin && invitedEmail !== user.email.toLowerCase()) {
        return NextResponse.json(
          { error: 'Forbidden: this invitation belongs to another email address' },
          { status: 403 },
        );
      }

      invitationData.status = 'accepted';
      invitationData.usedBy = user.userId;
      invitationData.acceptedAt = now.toISOString();

      await db.settings.update({
        where: { key: `invitation:${token}` },
        data: { value: JSON.stringify(invitationData), updatedAt: now },
      });

      await db.auditLog.create({
        data: {
          userId: user.userId,
          action: 'accept_invitation',
          resource: 'invitations',
          details: JSON.stringify({
            tokenPrefix: token.slice(0, 8),
            email: invitationData.email,
            role: invitationData.role,
            companyId: invitationData.companyId ?? null,
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

    // --- action === 'resend' --- (must be an admin of the invitation's company or super_admin)
    const admin = await authenticateInviteAdmin();
    const invCompanyId = (invitationData.companyId as string | null) ?? null;
    if (!admin.isPlatformAdmin && invCompanyId !== admin.companyId) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

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
        details: JSON.stringify({
          tokenPrefix: token.slice(0, 8),
          email: invitationData.email,
          companyId: invCompanyId,
          newExpiresAt,
        }),
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
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('PUT /api/users/invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
