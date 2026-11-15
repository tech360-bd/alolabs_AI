import { badRequest, clientRoute, denyForeignObject, readBody, text } from '@/lib/portal/auth';
import { accountDto, ticketDto } from '@/lib/portal/dto';
import { newReference } from '@/lib/client-services/operations';

const CATEGORIES = ['general', 'project', 'billing', 'technical', 'account'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/** GET /api/portal/tickets — the client's support requests and their account manager. */
export const GET = clientRoute(async (ctx) => {
  const tickets = await ctx.tdb.clientSupportTicket.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 });
  return { tickets: tickets.map(ticketDto), accountManager: accountDto(ctx).accountManager };
});

/** POST /api/portal/tickets — open a support request. */
export const POST = clientRoute(async (ctx) => {
  const body = await readBody(ctx.request);
  const subject = text(body, 'subject', { min: 3, max: 160 });
  const message = text(body, 'message', { min: 5, max: 5000 });
  const category = typeof body.category === 'string' && CATEGORIES.includes(body.category) ? body.category : 'general';
  const priority = typeof body.priority === 'string' && PRIORITIES.includes(body.priority) ? body.priority : 'normal';

  let projectId: string | null = null;
  if (body.projectId !== undefined && body.projectId !== null && body.projectId !== '') {
    if (typeof body.projectId !== 'string') throw badRequest('projectId must be text.');
    // A ticket may only reference one of the caller's own projects.
    const project = await ctx.tdb.clientProject.findOwned(body.projectId, { select: { id: true } });
    if (!project) return denyForeignObject(ctx, 'client-project', body.projectId);
    projectId = project.id;
  }

  const ticket = await ctx.tdb.clientSupportTicket.create({
    data: { reference: newReference('SUP'), subject, category, priority, status: 'open', projectId, createdByUserId: ctx.userId },
  });
  await ctx.tdb.clientMessage.create({
    data: { threadType: 'ticket', threadId: ticket.id, senderType: 'client', senderName: ctx.name, senderUserId: ctx.userId, body: message },
  });
  return { ticket: ticketDto(ticket) };
});
