import { notFound } from '@/lib/api/secure-route';

/** Memory entries are owned by a user; refuse to touch anybody else's. */
export function assertOwnedBy(entry: unknown, userId: string): void {
  const owner = (entry ?? {}) as { userId?: unknown; companyId?: unknown };
  const ownerId = typeof owner.userId === 'string' ? owner.userId : typeof owner.companyId === 'string' ? owner.companyId : null;
  if (ownerId && ownerId !== userId) throw notFound('Memory entry not found');
}
