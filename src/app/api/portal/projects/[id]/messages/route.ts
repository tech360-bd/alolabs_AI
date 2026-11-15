import { clientRoute, denyForeignObject, readBody, text } from '@/lib/portal/auth';
import { messageDto } from '@/lib/portal/dto';

/** GET /api/portal/projects/:id/messages — conversation with the service team. */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const project = await ctx.tdb.clientProject.findOwned(id, { select: { id: true } });
  if (!project) return denyForeignObject(ctx, 'client-project', id);
  const messages = await ctx.tdb.clientMessage.findMany({
    where: { threadType: 'project', threadId: id },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  return { messages: messages.map(messageDto) };
});

/** POST /api/portal/projects/:id/messages — send a message to the service team. */
export const POST = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const project = await ctx.tdb.clientProject.findOwned(id, { select: { id: true } });
  if (!project) return denyForeignObject(ctx, 'client-project', id);
  const body = await readBody(ctx.request);
  const message = await ctx.tdb.clientMessage.create({
    data: {
      threadType: 'project',
      threadId: id,
      // Sender identity is taken from the session, never from the body.
      senderType: 'client',
      senderName: ctx.name,
      senderUserId: ctx.userId,
      body: text(body, 'body', { max: 5000 }),
    },
  });
  return { message: messageDto(message) };
});
