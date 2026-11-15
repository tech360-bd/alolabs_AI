import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { CLIENT_ROLE, isInternalRole } from '@/lib/access/surfaces';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { provisionClientAccount } from '@/lib/client-services/operations';

/** GET /api/internal/clients — every client account (staff only). */
export const GET = internalRoute(CLIENT_SERVICE_ROLES, async () => {
  const accounts = await db.clientAccount.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { company: { select: { id: true, name: true, slug: true, status: true } }, _count: { select: { projects: true, tickets: true, invoices: true } } },
  });
  return { clients: accounts };
});

/**
 * POST /api/internal/clients — create a client account and its first login.
 * The login is always created with the `client` role; this route cannot mint
 * an internal user.
 */
export const POST = internalRoute(CLIENT_SERVICE_ROLES, async (ctx) => {
  const body = await readJsonBody(ctx.request);
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (companyName.length < 2 || contactName.length < 2) throw new InternalError(400, 'companyName and contactName are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InternalError(400, 'A valid email is required.');
  const supplied = typeof body.password === 'string' ? body.password : '';
  if (supplied && supplied.length < 12) throw new InternalError(400, 'Password must be at least 12 characters.');

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true } });
  let user: { id: string; email: string; name: string | null };
  let temporaryPassword: string | undefined;

  if (existing) {
    // Adopting an existing login is allowed only for a login that is plainly a
    // customer without an account yet (for example someone who registered
    // before client accounts existed). It must be requested explicitly, it can
    // never touch internal personnel, and it never changes the password.
    if (body.adoptExistingLogin !== true) throw new InternalError(409, 'A user with this email already exists.');
    if (isInternalRole(existing.role)) throw new InternalError(409, 'This login belongs to internal personnel and cannot become a client login.');
    const membership = await db.companyUser.findFirst({ where: { userId: existing.id }, select: { id: true } });
    if (membership) throw new InternalError(409, 'This login already belongs to a company.');
    await db.user.update({ where: { id: existing.id }, data: { role: CLIENT_ROLE } });
    user = { id: existing.id, email: existing.email, name: existing.name };
  } else {
    temporaryPassword = supplied || randomBytes(12).toString('base64url');
    user = await db.user.create({
      data: { email, name: contactName.slice(0, 120), passwordHash: await hashPassword(temporaryPassword), role: CLIENT_ROLE },
      select: { id: true, email: true, name: true },
    });
  }
  const { companyId } = await provisionClientAccount({ userId: user.id, companyName, billingEmail: email });

  for (const field of ['accountManagerName', 'accountManagerTitle', 'accountManagerEmail', 'accountManagerPhone'] as const) {
    if (typeof body[field] === 'string') {
      await db.clientAccount.update({ where: { companyId }, data: { [field]: (body[field] as string).trim().slice(0, 160) } });
    }
  }
  await db.auditLog.create({
    data: { userId: ctx.userId, action: 'client.account_created', resource: 'ClientAccount', details: JSON.stringify({ companyId, clientUserId: user.id }) },
  });
  return { client: { companyId, companyName, user }, ...(temporaryPassword && !supplied ? { temporaryPassword } : {}) };
});
