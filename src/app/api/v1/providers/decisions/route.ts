import { v1Handler } from '@/lib/v1';
import { listRoutingDecisions, routingDecisionSummary } from '@/lib/ai-router/provider-admin';

/**
 * GET /api/v1/providers/decisions[?limit=&runId=&success=&hours=]
 * Model-router observability: every routing decision (success, failure,
 * fallback) recorded for this tenant, plus a per-provider summary.
 */
export const GET = v1Handler(async ({ identity }, request) => {
  const params = request.nextUrl.searchParams;
  const actor = { userId: identity.userId, role: identity.role, companyId: identity.companyId };
  const limit = Number(params.get('limit')) || 50;
  const runId = params.get('runId') ?? undefined;
  const successParam = params.get('success');
  const success = successParam === null ? undefined : successParam === 'true';
  const hours = Math.min(Math.max(Number(params.get('hours')) || 24, 1), 24 * 30);
  const [decisions, summary] = await Promise.all([
    listRoutingDecisions(actor, { limit, runId, success }),
    routingDecisionSummary(actor, hours),
  ]);
  return { decisions, summary };
});
