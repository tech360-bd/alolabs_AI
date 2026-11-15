import { db } from '@/lib/db';
import { SECURITY_ROLES, internalRoute } from '@/lib/internal/auth';

const TYPES = [
  'client_to_internal_denied',
  'internal_to_client_denied',
  'client_key_to_internal_denied',
  'cross_tenant_access_denied',
  'tenant_tampering_denied',
  'privilege_escalation_denied',
  'internal_data_leak_blocked',
];

/**
 * GET /api/internal/security/access-violations — the record of denied
 * attempts to cross the client/internal boundary or a tenant boundary.
 */
export const GET = internalRoute(SECURITY_ROLES, async (ctx) => {
  const query = ctx.request.nextUrl.searchParams;
  const type = query.get('type');
  const limit = Math.min(Math.max(Number(query.get('limit')) || 100, 1), 500);
  const events = await db.securityEvent.findMany({
    where: { source: 'access-control', type: type && TYPES.includes(type) ? type : { in: TYPES } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const counts = await db.securityEvent.groupBy({ by: ['type'], where: { source: 'access-control' }, _count: { _all: true } });
  return {
    events: events.map((e) => {
      let details: unknown = null;
      try { details = e.details ? JSON.parse(e.details) : null; } catch { details = null; }
      return { id: e.id, type: e.type, severity: e.severity, companyId: e.companyId, riskScore: e.riskScore, createdAt: e.createdAt, details };
    }),
    counts: Object.fromEntries(counts.map((c) => [c.type, c._count._all])),
  };
});
