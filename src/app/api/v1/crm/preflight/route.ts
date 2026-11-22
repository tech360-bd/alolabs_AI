import { v1Handler } from '@/lib/v1';
import { runCrmPreflight } from '@/lib/integrations/preflight';

/**
 * GET /api/v1/crm/preflight[?credentialId=…][&verify=1]
 *
 * Server-side readiness report for the fixed five-lead Bengali draft workflow.
 *
 * Response semantics (deliberately unambiguous):
 *   preflight_status          — did the CHECK run? ('ok' | 'error')
 *   workflow_execution_ready  — can the workflow actually execute now?
 *   ready                     — deprecated alias, always equal to the above
 *   missing_dependencies      — one explicit entry per missing/failed dependency
 *   blockers                  — human-readable strings for the same failures
 *
 * A missing CRM URL, CRM credential, AI provider or model therefore yields
 * `workflow_execution_ready: false` — never `true`. This endpoint reports
 * configuration only; it does not claim that a real external run succeeded.
 * `verify=1` performs a real read-only CRM verification; it never sends a
 * message and never returns a secret.
 */

export const dynamic = 'force-dynamic';

export const GET = v1Handler(async ({ identity }, request) => {
  const query = request.nextUrl.searchParams;
  const credentialId = query.get('credentialId') ?? undefined;
  const verify = ['1', 'true'].includes(query.get('verify') ?? '');
  return runCrmPreflight({
    companyId: identity.companyId,
    ...(credentialId ? { credentialId } : {}),
    verify,
  });
});
