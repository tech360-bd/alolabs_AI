import { NextRequest, NextResponse } from 'next/server';
import { notificationScope } from '@/lib/access/notifications';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const scope = notificationScope(await requireAuth());
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { ids, markAll } = body;

    if (markAll === true) {
      await db.notification.updateMany({
        where: { ...scope, read: false },
        data: { read: true, readAt: new Date() },
      });
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (Array.isArray(ids) && ids.length <= 500 && ids.every(id => typeof id === 'string')) {
      const { count } = await db.notification.updateMany({
        where: { ...scope, id: { in: ids } },
        data: { read: true, readAt: new Date() },
      });
      return NextResponse.json({ success: true, message: `${count} notifications marked as read` });
    }

    return NextResponse.json({ error: 'ids or markAll required' }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Notifications read POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}