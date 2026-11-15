import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { findInternalDetail } from '@/lib/client-services/client-safe';
import { notifyClient } from '@/lib/client-services/operations';
import { tenantDb } from '@/lib/portal/tenant-db';

const TEAM_NAME = 'ALO Labs Support';

/** GET /api/internal/client-tickets/:id — a support request and its conversation. */
export const GET = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (_ctx, { id }) => {
  const ticket = await db.clientSupportTicket.findUnique({ where: { id } });
  if (!ticket) throw new InternalError(404, 'Ticket not found.');
  const messages = await tenantDb(ticket.companyId).clientMessage.findMany({
    where: { threadType: 'ticket', threadId: id },
    orderBy: { createdAt: 'asc' },
  });
  return { ticket, messages };
});

/**
 * POST /api/internal/client-tickets/:id
 *   { action: 'reply', body }                      → awaiting the client
 *   { action: 'resolve', resolutionSummary, body? } → resolved
 */
export const POST = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const ticket = await db.clientSupportTicket.findUnique({ where: { id } });
  if (!ticket) throw new InternalError(404, 'Ticket not found.');
  const body = await readJsonBody(ctx.request);
  const action = body.action ?? 'reply';
  if (action !== 'reply' && action !== 'resolve') throw new InternalError(400, 'Unknown action.');

  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 5000) : '';
  const summary = typeof body.resolutionSummary === 'string' ? body.resolutionSummary.trim().slice(0, 1000) : '';
  if (action === 'reply' && !text) throw new InternalError(400, 'body is required.');
  if (action === 'resolve' && !summary) throw new InternalError(400, 'resolutionSummary is required.');
  const findings = findInternalDetail(`${text}\n${summary}`);
  if (findings.length) {
    throw new InternalError(422, `This reply refers to internal systems and cannot be sent to a client (${findings.map((f) => `${f.label}: "${f.excerpt}"`).join('; ')}).`);
  }

  const tdb = tenantDb(ticket.companyId);
  const message = text
    ? await tdb.clientMessage.create({
        data: { threadType: 'ticket', threadId: id, senderType: 'service_team', senderName: TEAM_NAME, senderUserId: ctx.userId, body: text },
      })
    : null;
  const updated = await tdb.clientSupportTicket.updateOwned(id, {
    status: action === 'resolve' ? 'resolved' : 'awaiting_client',
    firstResponseAt: ticket.firstResponseAt ?? new Date(),
    ...(action === 'resolve' ? { resolvedAt: new Date(), resolutionSummary: summary } : {}),
  });
  await notifyClient(ticket.companyId, {
    type: action === 'resolve' ? 'ticket.resolved' : 'ticket.reply',
    title: action === 'resolve' ? `Resolved: ${ticket.subject}` : `Reply on: ${ticket.subject}`,
    message: action === 'resolve' ? 'Your support request has been resolved.' : 'Our team has replied to your support request.',
    link: `/portal/support/${id}`,
  });
  return { ticket: updated, message };
});
