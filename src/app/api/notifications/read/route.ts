import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { ids, markAll } = body;

    if (markAll) {
      await db.notification.updateMany({
        where: { read: false },
        data: { read: true, readAt: new Date() },
      });
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (ids && Array.isArray(ids)) {
      await db.notification.updateMany({
        where: { id: { in: ids } },
        data: { read: true, readAt: new Date() },
      });
      return NextResponse.json({ success: true, message: `${ids.length} notifications marked as read` });
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