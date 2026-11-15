import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody, requireClientCompany } from '@/lib/internal/auth';

/** GET /api/internal/clients/:companyId — one client account with its users. */
export const GET = internalRoute<{ companyId: string }>(CLIENT_SERVICE_ROLES, async (_ctx, { companyId }) => {
  const account = await requireClientCompany(companyId);
  const members = await db.companyUser.findMany({ where: { companyId }, select: { userId: true, role: true } });
  const users = await db.user.findMany({
    where: { id: { in: members.map((m) => m.userId) } },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  });
  return { client: account, users };
});

const TEXT_FIELDS = [
  'accountManagerName', 'accountManagerTitle', 'accountManagerEmail', 'accountManagerPhone',
  'billingEmail', 'billingAddress', 'internalNotes',
] as const;

/** PATCH /api/internal/clients/:companyId — account manager, billing details, status. */
export const PATCH = internalRoute<{ companyId: string }>(CLIENT_SERVICE_ROLES, async (ctx, { companyId }) => {
  await requireClientCompany(companyId);
  const body = await readJsonBody(ctx.request);
  const data: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (body[field] === null) data[field] = null;
    else if (typeof body[field] === 'string') data[field] = (body[field] as string).trim().slice(0, field === 'internalNotes' ? 5000 : 300);
  }
  if (body.status !== undefined) {
    if (!['active', 'suspended', 'closed'].includes(String(body.status))) throw new InternalError(400, 'Invalid status.');
    data.status = body.status;
  }
  if (typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)) data.currency = body.currency;
  if (!Object.keys(data).length) throw new InternalError(400, 'Nothing to update.');
  const client = await db.clientAccount.update({ where: { companyId }, data });
  return { client };
});
