import { clientRoute, readBody } from '@/lib/portal/auth';
import { notificationDto } from '@/lib/portal/dto';

/** GET /api/portal/notifications — notifications for this client. */
export const GET = clientRoute(async (ctx) => {
  const forUser = { OR: [{ userId: null }, { userId: ctx.userId }] };
  const [notifications, unread] = await Promise.all([
    ctx.tdb.clientNotification.findMany({ where: forUser, orderBy: { createdAt: 'desc' }, take: 100 }),
    ctx.tdb.clientNotification.count({ where: { ...forUser, readAt: null } }),
  ]);
  return { notifications: notifications.map(notificationDto), unread };
});

/** POST /api/portal/notifications — mark read. Body: { ids?: string[] } (omit for all). */
export const POST = clientRoute(async (ctx) => {
  const body = await readBody(ctx.request).catch(() => ({}) as Record<string, unknown>);
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string').slice(0, 200) : null;
  const result = await ctx.tdb.clientNotification.updateMany({
    where: {
      readAt: null,
      OR: [{ userId: null }, { userId: ctx.userId }],
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
});
