import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { notificationScope } from '@/lib/access/notifications';
import { redisPublish } from '@/lib/redis';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { parseBody, parseQuery, paginationQuery, buildOrderBy, paginatedResponse } from '@/lib/validators';

const notificationCreateSchema = z.object({
  type: z.string().default('info'),
  title: z.string().min(1),
  message: z.string().min(1),
  priority: z.string().default('info'),
  userId: z.string().optional(),
  companyId: z.string().optional(),
  metadata: z.string().optional(),
});

const notificationUpdateSchema = z.object({
  id: z.string().min(1),
  read: z.boolean().optional(),
  title: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  priority: z.string().optional(),
});

// GET /api/notifications
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit, sort, order } = parsed.data;
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || '';

    const scope = notificationScope(user);
    const where: Record<string, unknown> = { ...scope };
    if (tab === 'unread') {
      where.read = false;
    } else if (tab === 'alerts') {
      where.type = { in: ['security_alert', 'usage_warning', 'agent_alert'] };
    } else if (tab === 'system') {
      where.type = 'system_update';
    }

    const orderBy = buildOrderBy(sort, order);

    const [data, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { ...scope, read: false } }),
    ]);

    return NextResponse.json({ ...paginatedResponse(data, page, limit, total), unreadCount });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/notifications
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const parsed = parseBody(notificationCreateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const data = parsed.data;
    if (!['super_admin', 'platform_super_admin'].includes(user.role)) {
      if ((data.userId && data.userId !== user.userId) || (data.companyId && data.companyId !== user.companyId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      data.userId = user.userId;
    }
    const notification = await db.notification.create({ data });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'notifications',
        details: JSON.stringify({ notificationId: notification.id, title: notification.title }),
      },
    });

    // DB is authoritative; send a scoped invalidation, not the message body.
    await redisPublish('realtime:notification:new', JSON.stringify({ id: notification.id, userId: notification.userId, companyId: notification.companyId }));
    return NextResponse.json({ data: notification }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Notifications POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/notifications
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(notificationUpdateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { id, read, ...rest } = parsed.data;

    const existing = await db.notification.findFirst({ where: { id, ...notificationScope(user) } });
    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (read !== undefined) {
      data.read = read;
      data.readAt = read ? new Date() : null;
    }
    if (rest.title !== undefined) data.title = rest.title;
    if (rest.message !== undefined) data.message = rest.message;
    if (rest.priority !== undefined) data.priority = rest.priority;

    const notification = await db.notification.update({
      where: { id },
      data,
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'notifications',
        details: JSON.stringify({ notificationId: id, changes: Object.keys(parsed.data).filter((k) => k !== 'id') }),
      },
    });

    return NextResponse.json({ data: notification });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Notifications PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/notifications
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.notification.findFirst({ where: { id, ...notificationScope(user) } });
    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    await db.notification.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'notifications',
        details: JSON.stringify({ notificationId: id, title: existing.title }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Notifications DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
