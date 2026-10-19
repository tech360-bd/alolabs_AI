import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { tenantTarget } from '@/lib/api/secure-route';
import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';

const InviteSchema = z.object({
  companyId: z.string().min(1).optional(),
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'manager', 'operator', 'employee']).default('employee'),
});
const UpdateRoleSchema = z.object({
  companyId: z.string().min(1).optional(),
  userId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'manager', 'operator', 'employee']),
});

function authError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

function resolveTarget(user: Awaited<ReturnType<typeof requireAuth>>, requested?: string | null) {
  return tenantTarget(user, requested ?? user.companyId ?? null);
}

function canManage(user: { role: string; companyRole?: string }): boolean {
  return user.role === 'super_admin' || user.companyRole === 'owner' || user.companyRole === 'admin';
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const target = resolveTarget(user, request.nextUrl.searchParams.get('companyId'));
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    const companyId = target.companyId;
    if (user.role !== 'super_admin' && user.companyId !== companyId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const members = await db.companyUser.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
    const userIds = members.map((member) => member.userId);
    const users = userIds.length ? await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true },
    }) : [];
    const userById = new Map(users.map((member) => [member.id, member]));
    return NextResponse.json({ data: members.map((member) => ({
      id: member.id,
      companyId: member.companyId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      user: userById.get(member.userId) ?? null,
    })) });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[Company Members] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = InviteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const target = resolveTarget(user, parsed.data.companyId);
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    const companyId = target.companyId;
    if (user.role !== 'super_admin' && (!canManage(user) || user.companyId !== companyId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, status: true } });
    if (!company || company.status !== 'active') return NextResponse.json({ error: 'Active company not found' }, { status: 404 });
    const email = parsed.data.email.toLowerCase();
    const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const membership = await db.companyUser.findUnique({ where: { companyId_userId: { companyId, userId: existingUser.id } }, select: { id: true } });
      if (membership) return NextResponse.json({ error: 'User is already a member of this company' }, { status: 409 });
    }
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await db.companyInvitation.create({
      data: { companyId, email, name: parsed.data.name ?? null, role: parsed.data.role, tokenHash, expiresAt, invitedBy: user.userId },
      select: { id: true, companyId: true, role: true, expiresAt: true, createdAt: true },
    });
    await writeAuditEvent({ actorUserId: user.userId, companyId, action: 'company.member.invite', resource: 'company-invitation', resourceId: invitation.id, details: { role: invitation.role, expiresAt: expiresAt.toISOString() } });
    return NextResponse.json({ data: invitation, inviteToken: rawToken, delivery: 'copy-token-securely' }, { status: 201 });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[Company Members] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = UpdateRoleSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const target = resolveTarget(user, parsed.data.companyId);
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    const companyId = target.companyId;
    if (user.role !== 'super_admin' && (!canManage(user) || user.companyId !== companyId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (parsed.data.role === 'owner' && user.role !== 'super_admin' && user.companyRole !== 'owner') {
      return NextResponse.json({ error: 'Only a company owner or Super Admin may assign the owner role' }, { status: 403 });
    }

    const membership = await db.companyUser.findUnique({ where: { companyId_userId: { companyId, userId: parsed.data.userId } } });
    if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    if (membership.role === 'owner' && parsed.data.role !== 'owner') {
      const ownerCount = await db.companyUser.count({ where: { companyId, role: 'owner' } });
      if (ownerCount <= 1) return NextResponse.json({ error: 'A company must retain at least one owner' }, { status: 409 });
    }
    const updated = await db.$transaction(async (transaction) => {
      const row = await transaction.companyUser.update({ where: { id: membership.id }, data: { role: parsed.data.role } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId,
          action: 'company.member.role.update',
          resource: 'company-membership',
          resourceId: membership.id,
          details: JSON.stringify({ userId: membership.userId, fromRole: membership.role, toRole: parsed.data.role }),
        },
      });
      return row;
    });
    return NextResponse.json({ data: { id: updated.id, companyId, userId: updated.userId, role: updated.role } });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[Company Members] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth();
    const target = resolveTarget(user, request.nextUrl.searchParams.get('companyId'));
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    const companyId = target.companyId;
    const memberUserId = request.nextUrl.searchParams.get('userId');
    if (!memberUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    if (user.role !== 'super_admin' && (!canManage(user) || user.companyId !== companyId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const membership = await db.companyUser.findUnique({ where: { companyId_userId: { companyId, userId: memberUserId } } });
    if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    if (membership.role === 'owner') {
      const ownerCount = await db.companyUser.count({ where: { companyId, role: 'owner' } });
      if (ownerCount <= 1) return NextResponse.json({ error: 'A company must retain at least one owner' }, { status: 409 });
    }
    await db.$transaction(async (transaction) => {
      await transaction.companyUser.delete({ where: { id: membership.id } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId,
          action: 'company.member.remove',
          resource: 'company-membership',
          resourceId: membership.id,
          details: JSON.stringify({ userId: membership.userId, removedRole: membership.role }),
        },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[Company Members] DELETE failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
