import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

const AcceptSchema = z.object({ token: z.string().min(20).max(200) });

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = AcceptSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid invitation token' }, { status: 400 });
    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
    const invitation = await db.companyInvitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Invitation is invalid or expired' }, { status: 404 });
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Invitation was issued to a different account' }, { status: 403 });
    }

    await db.$transaction(async (transaction) => {
      const existing = await transaction.companyUser.findUnique({
        where: { companyId_userId: { companyId: invitation.companyId, userId: user.userId } },
        select: { id: true },
      });
      if (existing) throw new Error('User is already a member of this company');
      const company = await transaction.company.findUnique({ where: { id: invitation.companyId }, select: { status: true } });
      if (!company || company.status !== 'active') throw new Error('Company is not active');
      await transaction.companyUser.create({ data: { companyId: invitation.companyId, userId: user.userId, role: invitation.role } });
      await transaction.companyInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: invitation.companyId,
          action: 'company.invitation.accept',
          resource: 'company-invitation',
          resourceId: invitation.id,
          details: JSON.stringify({ role: invitation.role }),
        },
      });
    });
    return NextResponse.json({ success: true, companyId: invitation.companyId, role: invitation.role });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'User is already a member of this company') return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === 'Company is not active') return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('[Company Invitation] Accept failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
