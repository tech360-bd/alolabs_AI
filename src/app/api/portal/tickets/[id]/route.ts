import { badRequest, clientRoute, conflict, denyForeignObject, readBody, text } from '@/lib/portal/auth';
import { accountDto, messageDto, ticketDto } from '@/lib/portal/dto';

/** GET /api/portal/tickets/:id — one support request with its conversation. */
export const GET = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const ticket = await ctx.tdb.clientSupportTicket.findOwned(id);
  if (!ticket) return denyForeignObject(ctx, 'client-ticket', id);
  const messages = await ctx.tdb.clientMessage.findMany({
    where: { threadType: 'ticket', threadId: id },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  return { ticket: ticketDto(ticket), messages: messages.map(messageDto), accountManager: accountDto(ctx).accountManager };
});

/**
 * POST /api/portal/tickets/:id — reply to, close or reopen a support request.
 * Body: { action: 'reply', body } | { action: 'close' } | { action: 'reopen', body }
 */
export const POST = clientRoute<{ id: string }>(async (ctx, { id }) => {
  const ticket = await ctx.tdb.clientSupportTicket.findOwned(id);
  if (!ticket) return denyForeignObject(ctx, 'client-ticket', id);
  const body = await readBody(ctx.request);
  const action = body.action ?? 'reply';

  if (action === 'close') {
    if (ticket.status === 'closed') throw conflict('This request is already closed.');
    const updated = await ctx.tdb.clientSupportTicket.updateOwned(id, {
      status: 'closed',
      resolvedAt: ticket.resolvedAt ?? new Date(),
      resolutionSummary: ticket.resolutionSummary ?? 'Closed by client.',
    });
    return { ticket: ticketDto(updated!) };
  }
  if (action !== 'reply' && action !== 'reopen') throw badRequest('Unknown action.');
  if (action === 'reply' && ticket.status === 'closed') throw conflict('This request is closed. Reopen it to continue the conversation.');

  const message = await ctx.tdb.clientMessage.create({
    data: {
      threadType: 'ticket',
      threadId: id,
      senderType: 'client',
      senderName: ctx.name,
      senderUserId: ctx.userId,
      body: text(body, 'body', { max: 5000 }),
    },
  });
  const updated = await ctx.tdb.clientSupportTicket.updateOwned(id, {
    status: 'awaiting_support',
    ...(action === 'reopen' ? { resolvedAt: null } : {}),
  });
  return { ticket: ticketDto(updated!), message: messageDto(message) };
});
