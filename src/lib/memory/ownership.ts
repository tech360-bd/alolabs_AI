import { notFound } from '@/lib/api/secure-route';

/**
 * Memory entries are owned by a user (or user-scoped sessionId/companyId).
 * Refuse to touch anybody else's or any entry with no provable owner.
 */
export function assertOwnedBy(entry: unknown, userId: string): void {
  const owner = (entry ?? {}) as { userId?: unknown; companyId?: unknown };
  const ownerId =
    typeof owner.userId === 'string' && owner.userId.length > 0
      ? owner.userId
      : typeof owner.companyId === 'string' && owner.companyId.length > 0
        ? owner.companyId
        : null;
  if (!ownerId || ownerId !== userId) throw notFound('Memory entry not found');
}
