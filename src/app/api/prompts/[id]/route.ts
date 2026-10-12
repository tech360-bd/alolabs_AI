import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = JSON.parse(existing.value);
    if (parsed.locked) {
      return NextResponse.json({ error: 'Prompt is locked. Unlock first to edit.' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.content !== undefined) updates.content = body.content;
    if (body.category !== undefined) updates.category = body.category;
    if (body.associatedWith !== undefined) updates.associatedWith = body.associatedWith;
    if (body.versionNotes !== undefined) {
      updates.version = (parsed.version || 1) + 1;
      updates.versionNotes = body.versionNotes;
    }
    if (body.locked !== undefined) updates.locked = body.locked;

    const newValue = { ...parsed, ...updates };
    const updated = await db.settings.update({
      where: { id },
      data: { value: JSON.stringify(newValue) },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'prompts',
        details: JSON.stringify({ name: parsed.name, changes: Object.keys(updates) }),
      },
    });

    return NextResponse.json({ id: updated.id, key: updated.key, ...newValue });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Prompts PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}