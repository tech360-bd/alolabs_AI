import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('ticket:')) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const parsed = JSON.parse(existing.value);
    return NextResponse.json({
      id: existing.id,
      key: existing.key,
      ...parsed,
      comments: parsed.comments || [],
      createdAt: existing.createdAt.toISOString(),
      updatedAt: existing.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Ticket GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { status, priority, assignee, addComment } = body as {
      status?: string;
      priority?: string;
      assignee?: string;
      addComment?: string;
    };

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('ticket:')) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const parsed = JSON.parse(existing.value);
    const updates: Record<string, unknown> = {};
    const timeline = parsed.timeline || [];

    if (status) {
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = status;
      timeline.push({
        event: `Status changed to ${status}`,
        by: user.name || user.email,
        at: new Date().toISOString(),
      });
    }

    if (priority) {
      if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
        return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
      }
      updates.priority = priority;
      timeline.push({
        event: `Priority changed to ${priority}`,
        by: user.name || user.email,
        at: new Date().toISOString(),
      });
    }

    if (assignee !== undefined) {
      updates.assignee = assignee;
      timeline.push({
        event: assignee ? `Assigned to ${assignee}` : 'Assignee removed',
        by: user.name || user.email,
        at: new Date().toISOString(),
      });
    }

    if (addComment?.trim()) {
      const comments = parsed.comments || [];
      comments.push({
        text: addComment.trim(),
        by: user.name || user.email,
        at: new Date().toISOString(),
      });
      updates.comments = comments;
    }

    updates.timeline = timeline;

    const newValue = { ...parsed, ...updates };
    await db.settings.update({
      where: { id },
      data: { value: JSON.stringify(newValue) },
    });

    return NextResponse.json({
      id,
      key: existing.key,
      ...newValue,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Ticket PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('ticket:')) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const parsed = JSON.parse(existing.value);
    parsed.status = 'closed';
    parsed.timeline = parsed.timeline || [];
    parsed.timeline.push({
      event: 'Ticket closed',
      by: user.name || user.email,
      at: new Date().toISOString(),
    });

    await db.settings.update({
      where: { id },
      data: { value: JSON.stringify(parsed) },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Ticket DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}