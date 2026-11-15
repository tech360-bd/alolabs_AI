import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { isInternalRole } from '@/lib/access/surfaces';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole('super_admin');
    const { id } = await params;
    const body = await request.json();

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { name, email, role, isActive } = body;

    if (role !== undefined) {
      if (typeof role !== 'string' || !/^[a-z_]{2,40}$/.test(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      // Nobody edits their own role: a role change always needs a second person.
      if (id === user.userId && role !== existing.role) {
        return NextResponse.json({ error: 'You cannot change your own role' }, { status: 409 });
      }
      // A login that belongs to a client company is a customer. It cannot be
      // given an internal role — that would hand a customer the internal
      // surface. Internal staff get their own, separate account.
      if (isInternalRole(role) && !isInternalRole(existing.role)) {
        const clientMembership = await db.companyUser.findFirst({
          where: { userId: id, company: { accountType: 'client' } },
          select: { id: true },
        });
        if (clientMembership) {
          return NextResponse.json(
            { error: 'This login belongs to a client account and cannot be given an internal role. Create a separate internal account instead.' },
            { status: 409 },
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await db.user.update({
      where: { id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'users',
        details: JSON.stringify({ updatedUserId: id, changes: Object.keys(updateData) }),
      },
    });

    return NextResponse.json({ success: true, id: updated.id });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('User PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole('super_admin');
    const { id } = await params;

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent self-deletion
    if (existing.id === user.userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    await db.user.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'users',
        details: JSON.stringify({ deletedUserId: id, email: existing.email }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('User DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
