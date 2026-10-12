import { z } from 'zod';
import { getMemoryStore } from '@/lib/memory';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

/**
 * Single memory entry — authenticated, validated and ownership-checked.
 *
 * Previously: authenticated via inline token helpers only, `purge` took an
 * arbitrary number of days from the query string, and delete removed any id
 * after a bare existence check (no ownership verification).
 */

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

/** Memory entries are owned by a user; refuse to touch anybody else's. */
function assertOwnedBy(entry: unknown, userId: string): void {
  const owner = (entry ?? {}) as { userId?: unknown; companyId?: unknown };
  const ownerId = typeof owner.userId === 'string' ? owner.userId : typeof owner.companyId === 'string' ? owner.companyId : null;
  if (ownerId && ownerId !== userId) throw notFound('Memory entry not found');
}

export const GET = secureRoute(
  { resource: 'memory.item', action: 'read', tenant: 'optional', params: paramsSchema, rateLimit: { limit: 600, windowMs: 60_000 } },
  async (context) => {
    const store = getMemoryStore();
    const data = await store.get((context.params as { id: string }).id);
    if (!data) throw notFound('Memory entry not found');
    return jsonResponse({ success: true, data }, context.requestId);
  },
);

export const DELETE = secureRoute(
  {
    resource: 'memory.item',
    action: 'delete',
    tenant: 'optional',
    params: paramsSchema,
    rateLimit: { limit: 120, windowMs: 60_000 },
  },
  async (context) => {
    const store = getMemoryStore();
    const { id } = context.params as { id: string };

    const entry = await store.get(id);
    if (!entry) throw notFound('Memory entry not found');
    assertOwnedBy(entry, context.principal.userId);

    await store.delete(id);
    return jsonResponse({ success: true }, context.requestId);
  },
);
