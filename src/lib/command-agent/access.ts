/**
 * Shared access rules for every Commanding Center surface.
 *
 * The chat, stream and run-history endpoints must agree on *who* may use the
 * agent and *which* tenant the request belongs to. Duplicating that logic per
 * route is how one endpoint ends up slightly more permissive than another, so it
 * lives here once.
 */

import { db } from '@/lib/db';
import { canManageCompany, type AuthenticatedUser } from '@/lib/api-auth';

export interface CommandCompany {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** Platform super_admin, or a company owner/admin. Everyone else is refused. */
export function canUseCommandAgent(actor: Pick<AuthenticatedUser, 'role' | 'companyRole'>): boolean {
  return actor.role === 'super_admin' || canManageCompany(actor);
}

/**
 * Resolve the tenant the command applies to.
 *
 * - super_admin may name any company, otherwise their own, otherwise the
 *   platform company;
 * - a company admin may only use their own company, and a foreign target is
 *   refused rather than silently replaced.
 */
export async function resolveCommandCompany(
  actor: Pick<AuthenticatedUser, 'role' | 'companyId' | 'companyRole'>,
  target: string | null | undefined,
): Promise<CommandCompany | null> {
  if (actor.role === 'super_admin') {
    if (target) {
      return db.company.findFirst({
        where: { OR: [{ id: target }, { slug: target }] },
        select: { id: true, name: true, slug: true, status: true },
      });
    }
    if (actor.companyId) {
      const selected = await db.company.findUnique({
        where: { id: actor.companyId },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (selected) return selected;
    }
    return db.company.findUnique({
      where: { slug: 'alo-labs' },
      select: { id: true, name: true, slug: true, status: true },
    });
  }

  if (!actor.companyId || !canManageCompany(actor)) return null;
  const own = await db.company.findUnique({
    where: { id: actor.companyId },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!own) return null;
  if (target && target !== own.id && target !== own.slug) return null;
  return own;
}
