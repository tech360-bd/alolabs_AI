import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import {
  livekitCreateRoom,
  livekitDeleteRoom,
  livekitGetRoom,
  signLiveKitAccessToken,
} from '@/lib/integrations/connectors/telephony/livekit';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'meeting:' } },
      orderBy: { createdAt: 'desc' },
    });

    const meetings: Array<Record<string, unknown>> = [];

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
      .reduce((sum, m) => sum + ((m.duration as number) || 0), 0);
    const completedCount = meetings.filter((m) => m.status === 'completed').length;
    const avgDuration = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;

    const livekitConfigured = Boolean(
      process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
    );

    return NextResponse.json({
      meetings,
      livekitConfigured,
      stats: {
        total: meetings.length,
        scheduled: meetings.filter((m) => m.status === 'scheduled').length,
        completed: completedCount,
        cancelled: meetings.filter((m) => m.status === 'cancelled').length,
        upcomingThisWeek,
        avgDuration,
      },
    });
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
    const user = await requireAuth(request);
    const body = await request.json();
    const { title, description, date, duration, attendees, meetingLink, provider } = body as {
      title: string;
      description: string;
      date: string;
      duration: number;
      attendees: string[];
      meetingLink: string;
      provider?: 'livekit' | 'joincall' | 'custom';
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
    const selectedProvider = provider ?? 'livekit';
    const roomName = `alo-room-${Date.now().toString(36)}`;
    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;

    let livekitStatus: 'verified_room' | 'unconfigured_sfu' | 'sfu_error' | 'not_applicable' =
      selectedProvider === 'livekit' ? 'unconfigured_sfu' : 'not_applicable';
    let livekitRoom: Record<string, unknown> | null = null;
    let livekitError: string | null = null;
    let livekitToken: string | null = null;

    if (selectedProvider === 'livekit' && livekitUrl && livekitKey && livekitSecret) {
      const ctx = {
        companyId: user.companyId ?? 'system',
        credential: {
          baseUrl: livekitUrl,
          apiKey: livekitKey,
          extras: { apiSecret: livekitSecret },
        },
        timeoutMs: 8_000,
      };
      const createRes = await livekitCreateRoom(ctx, roomName, (duration || 30) * 60);
      if (createRes.ok) {
        const getRes = await livekitGetRoom(ctx, roomName);
        if (getRes.ok && getRes.data) {
          livekitStatus = 'verified_room';
          livekitRoom = getRes.data;
          livekitToken = signLiveKitAccessToken({
            apiKey: livekitKey,
            apiSecret: livekitSecret,
            identity: user.userId,
            name: user.name || user.email,
            roomName,
            roomCreate: false,
          });
        } else {
          livekitStatus = 'sfu_error';
          livekitError = getRes.error ?? 'Created room could not be retrieved from LiveKit SFU';
        }
      } else {
        livekitStatus = 'sfu_error';
        livekitError = createRes.error ?? 'LiveKit RoomService CreateRoom failed';
      }
    }

    const value = JSON.stringify({
      title: title.trim(),
      description: (description || '').trim(),
      date,
      duration: duration || 30,
      attendees: attendees || [],
      meetingLink: meetingLink || (selectedProvider === 'livekit' ? `/meet/${roomName}` : ''),
      provider: selectedProvider,
      roomName,
      livekitStatus,
      ...(livekitError ? { livekitError } : {}),
      status: 'scheduled',
      createdBy: user.name || user.email,
      createdAt: ts,
    });

    const setting = await db.settings.create({
      data: { key: id, value, type: 'json' },
    });

    await db.meetingSession
      .create({
        data: {
          id: randomUUID(),
          roomCode: roomName,
          companyId: user.companyId ?? 'system',
          hostUserId: user.userId,
          providerKind: selectedProvider,
          title: title.trim(),
          status: livekitStatus === 'verified_room' ? 'active' : 'scheduled',
          meetingUrl: meetingLink || (selectedProvider === 'livekit' ? `/meet/${roomName}` : null),
          participantsJson: JSON.stringify(attendees || []),
          startedAt: new Date(date),
        },
      })
      .catch(() => undefined);

    return NextResponse.json(
      {
        success: livekitStatus !== 'sfu_error',
        id: setting.id,
        roomName,
        provider: selectedProvider,
        livekitStatus,
        ...(livekitRoom ? { livekitRoom } : {}),
        ...(livekitError ? { livekitError } : {}),
        ...(livekitToken ? { livekitToken } : {}),
      },
      { status: livekitStatus === 'sfu_error' ? 502 : 200 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Meetings POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Meeting id required' }, { status: 400 });

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('meeting:')) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    let roomName: string | null = null;
    try {
      const parsed = JSON.parse(existing.value) as { roomName?: string; provider?: string };
      roomName = parsed.roomName ?? null;
      if (
        parsed.provider === 'livekit' &&
        roomName &&
        process.env.LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET
      ) {
        await livekitDeleteRoom(
          {
            companyId: user.companyId ?? 'system',
            credential: {
              baseUrl: process.env.LIVEKIT_URL,
              apiKey: process.env.LIVEKIT_API_KEY,
              extras: { apiSecret: process.env.LIVEKIT_API_SECRET },
            },
            timeoutMs: 6_000,
          },
          roomName,
        );
      }
    } catch {
      // cleanup DB even if SFU room already expired
    }

    await db.settings.delete({ where: { id } });
    if (roomName) {
      await db.meetingSession.deleteMany({ where: { roomCode: roomName } }).catch(() => undefined);
    }

    return NextResponse.json({ success: true, deletedId: id, roomName });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}
