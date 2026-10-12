import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const priority = searchParams.get('priority') || '';
    const assignee = searchParams.get('assignee') || '';
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'ticket:' } },
      orderBy: { createdAt: 'desc' },
    });

    let tickets: Array<Record<string, unknown>> = [];

    for (const s of allSettings) {
      try {
        const parsed = JSON.parse(s.value);
        if (status && parsed.status !== status) continue;
        if (priority && parsed.priority !== priority) continue;
        if (assignee && parsed.assignee !== assignee) continue;
        if (search) {
          const haystack = `${parsed.subject || ''} ${parsed.description || ''}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) continue;
        }
        tickets.push({
          id: s.id,
          ticketId: `TKT-${String(tickets.length + 1).padStart(4, '0')}`,
          ...parsed,
          comments: parsed.comments || [],
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        });
      } catch {
        // skip malformed entries
      }
    }

    // Sort by creation date descending
    tickets.sort(
      (a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
    );

    // Assign ticket IDs after sorting
    tickets.forEach((t, idx) => {
      t.ticketId = `TKT-${String(tickets.length - idx).padStart(4, '0')}`;
    });

    const total = tickets.length;
    const offset = (page - 1) * limit;
    const paginated = tickets.slice(offset, offset + limit);

    const stats = {
      open: tickets.filter((t) => t.status === 'open').length,
      in_progress: tickets.filter((t) => t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
      total,
    };

    return NextResponse.json({
      tickets: paginated,
      stats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Tickets GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { subject, description, priority, category, assignee } = body as {
      subject: string;
      description: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      category: string;
      assignee: string;
    };

    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    const ts = new Date().toISOString();
    const id = `ticket:${Date.now()}`;

    const value = JSON.stringify({
      subject: subject.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      category: category || 'general',
      assignee: assignee || '',
      status: 'open',
      createdBy: user.name || user.email,
      comments: [],
      timeline: [
        { event: 'Ticket created', by: user.name || user.email, at: ts },
      ],
      createdAt: ts,
    });

    const setting = await db.settings.create({
      data: { key: id, value, type: 'json' },
    });

    return NextResponse.json({ success: true, id: setting.id });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Tickets POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}