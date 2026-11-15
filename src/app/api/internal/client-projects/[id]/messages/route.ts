import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { findInternalDetail } from '@/lib/client-services/client-safe';
import { notifyClient } from '@/lib/client-services/operations';
import { tenantDb } from '@/lib/portal/tenant-db';

/** The name a client sees on service-team messages unless the account manager is named. */
const TEAM_NAME = 'ALO Labs Service Team';

/**
 * POST /api/internal/client-projects/:id/messages — reply to the client.
 * The message is signed with the account manager's public name or the team
 * name — never with the internal user record of whoever sent it.
 */
export const POST = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const project = await db.clientProject.findUnique({ where: { id }, select: { companyId: true, title: true } });
  if (!project) throw new InternalError(404, 'Client project not found.');
  const body = await readJsonBody(ctx.request);
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 5000) : '';
  if (!text) throw new InternalError(400, 'body is required.');
  const findings = findInternalDetail(text);
  if (findings.length) {
    throw new InternalError(422, `This message refers to internal systems and cannot be sent to a client (${findings.map((f) => `${f.label}: "${f.excerpt}"`).join('; ')}).`);
  }
  const account = await db.clientAccount.findUnique({ where: { companyId: project.companyId }, select: { accountManagerName: true } });
  const message = await tenantDb(project.companyId).clientMessage.create({
    data: {
      threadType: 'project',
      threadId: id,
      senderType: 'service_team',
      senderName: body.signAsAccountManager === true && account?.accountManagerName ? account.accountManagerName : TEAM_NAME,
      senderUserId: ctx.userId,
      body: text,
    },
  });
  await notifyClient(project.companyId, {
    type: 'message.new',
    title: `New message on ${project.title}`,
    message: 'Your service team has sent you a message.',
    link: `/portal/projects/${id}`,
  });
  return { message };
});
