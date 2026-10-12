import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'meeting:' } },
      orderBy: { createdAt: 'desc' },
    });

    let meetings: Array<Record<string, unknown>> = [];

    for (const s of allSettings) {
      try {
        const parsed = JSON.parse(s.value);
        if (status && parsed.status !== status) continue;
        if (search) {
          const haystack = `${parsed.title || ''} ${parsed.description || ''}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) continue;
        }
        if (startDate && parsed.date && parsed.date < startDate) continue;
        if (endDate && parsed.date && parsed.date > endDate) continue;
        meetings.push({
          id: s.id,
          ...parsed,
          attendees: parsed.attendees || [],
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        });
      } catch {
        // skip
      }
    }

    // Sort by date descending
    meetings.sort((a, b) => {
      const dateA = (a.date as string) || '';
      const dateB = (b.date as string) || '';
      return dateB.localeCompare(dateA);
    });

    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const upcomingThisWeek = meetings.filter((m) => {
      const d = new Date(m.date as string);
      return d >= now && d <= weekEnd && m.status === 'scheduled';
    }).length;

    const totalDuration = meetings
      .filter((m) => m.status === 'completed')
      .reduce((sum, m) => sum + (m.duration as number || 0), 0);
    const completedCount = meetings.filter((m) => m.status === 'completed').length;
    const avgDuration = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;

    const stats = {
      total: meetings.length,
      scheduled: meetings.filter((m) => m.status === 'scheduled').length,
      completed: completedCount,
      cancelled: meetings.filter((m) => m.status === 'cancelled').length,
      upcomingThisWeek,
      avgDuration,
    };

    return NextResponse.json({ meetings, stats });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Meetings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { title, description, date, duration, attendees, meetingLink } = body as {
      title: string;
      description: string;
      date: string;
      duration: number;
      attendees: string[];
      meetingLink: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }
    if (duration && (duration < 5 || duration > 480)) {
      return NextResponse.json({ error: 'Duration must be between 5 and 480 minutes' }, { status: 400 });
    }

    const ts = new Date().toISOString();
    const id = `meeting:${Date.now()}`;

    const value = JSON.stringify({
      title: title.trim(),
      description: (description || '').trim(),
      date,
      duration: duration || 30,
      attendees: attendees || [],
      meetingLink: meetingLink || '',
      status: 'scheduled',
      createdBy: user.name || user.email,
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
    console.error('Meetings POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}