import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAuth();
    const settings = await db.settings.findMany({
      orderBy: { key: 'asc' },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ data: settings, map: settingsMap });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireRole('super_admin', 'admin');
    const body = await request.json();

    if (!body.key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    const setting = await db.settings.upsert({
      where: { key: body.key },
      update: {
        value: String(body.value),
        type: body.type || 'string',
      },
      create: {
        key: body.key,
        value: String(body.value),
        type: body.type || 'string',
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'settings',
        details: JSON.stringify({ key: body.key, value: body.value }),
      },
    });

    return NextResponse.json(setting);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}