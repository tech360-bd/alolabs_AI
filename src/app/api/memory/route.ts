import { z } from 'zod';
import { getMemoryStore } from '@/lib/memory';
import { jsonResponse, notFound, secureRoute } from '@/lib/api/secure-route';

/**
 * Agent memory — authenticated, validated and rate limited.
 *
 * The memory store is partitioned by user (it was already keyed on
 * `user.userId`), so the tenant requirement stays optional to avoid breaking
 * principals without a company membership. What this adds is input validation,
 * rate limiting, and an ownership check on delete: previously any
 * authenticated caller could delete any memory entry by id.
 */

const memorySchema = z.object({
  type: z.enum(['short_term', 'long_term', 'episodic']),
  key: z.string().min(1).max(200),
  content: z.string().min(1),
  agentId: z.string().max(128).optional(),
  scope: z.enum(['private', 'team', 'company']).optional(),
  rank: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const listQuery = z.object({
  q: z.string().max(500).optional(),
  agentId: z.string().max(128).optional(),
  type: z.enum(['short_term', 'long_term', 'episodic']).optional(),
  id: z.string().max(128).optional(),
});

/** Memory entries are owned by a user; refuse to touch anybody else's. */
function assertOwnedBy(entry: unknown, userId: string): void {
  const owner = (entry ?? {}) as { userId?: unknown; companyId?: unknown };
  const ownerId = typeof owner.userId === 'string' ? owner.userId : typeof owner.companyId === 'string' ? owner.companyId : null;
  if (ownerId && ownerId !== userId) throw notFound('Memory entry not found');
}

export const GET = secureRoute(
  { resource: 'memory', action: 'read', tenant: 'optional', query: listQuery, rateLimit: { limit: 300, windowMs: 60_000 } },
  async (context) => {
    const { q, agentId, type } = context.query as z.infer<typeof listQuery>;
    const store = getMemoryStore();
    const scopeId = context.principal.userId;

    if (q) {
      const results = await store.search({ text: q, agentId: agentId ?? undefined, companyId: scopeId, type, limit: 50 });
      return jsonResponse({ success: true, data: results, total: results.length }, context.requestId);
    }
    if (agentId) {
      const memories = await store.getByAgent(agentId, type);
      return jsonResponse({ success: true, data: memories, total: memories.length }, context.requestId);
    }
    const stats = await store.getStats();
    return jsonResponse({ success: true, data: stats }, context.requestId);
  },
);

export const POST = secureRoute(
  {
    resource: 'memory',
    action: 'create',
    tenant: 'optional',
    body: memorySchema,
    bodyStatus: 400, // unchanged from the previous contract
    rateLimit: { limit: 240, windowMs: 60_000 },
  },
  async (context) => {
    const { type, key, content, agentId, scope, rank, metadata } = context.body;
    const store = getMemoryStore();
    const companyId = context.principal.userId;

    let entry;
    switch (type) {
      case 'short_term':
        entry = await store.addShortTerm({ agentId: agentId ?? '', companyId, userId: context.principal.userId, key, content });
        break;
      case 'long_term':
        entry = await store.addLongTerm({ agentId, companyId, userId: context.principal.userId, key, content, scope, rank });
        break;
      case 'episodic':
        entry = await store.addEpisodic({ agentId: agentId ?? '', companyId, userId: context.principal.userId, content, metadata });
        break;
    }

    return jsonResponse({ success: true, data: entry }, context.requestId);
  },
);

export const DELETE = secureRoute(
  {
    resource: 'memory',
    action: 'delete',
    tenant: 'optional',
    query: z.object({ id: z.string().min(1, 'id query parameter is required').max(128) }),
    bodyStatus: 400,
  },
  async (context) => {
    const id = (context.query as { id: string }).id;
    const store = getMemoryStore();
    const entry = await store.get(id);
    if (!entry) throw notFound('Memory entry not found');
    assertOwnedBy(entry, context.principal.userId);

    await store.delete(id);
    return jsonResponse({ success: true }, context.requestId);
  },
);
