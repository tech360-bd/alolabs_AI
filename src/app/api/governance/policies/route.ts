import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import {
  POLICY_CATALOG,
  POLICY_CATALOG_VERSION,
  loadGovernanceState,
  validatePolicyCatalog,
} from '@/lib/governance';

/**
 * Super Admin policy catalogue.
 *
 * Policies are code-defined, so this endpoint is read-only by design: there is
 * no route through which an agent, a customer, or even an administrator can
 * rewrite the rules that govern execution. Changing a policy is a reviewed code
 * change (see docs/security/GOVERNANCE_POLICY_ENGINE.md).
 */
export async function GET() {
  try {
    await requireRole('super_admin', 'admin');
    const state = await loadGovernanceState({ refresh: true });
    const issues = validatePolicyCatalog();

    const byLevel = POLICY_CATALOG.reduce<Record<string, number>>((acc, policy) => {
      acc[policy.level] = (acc[policy.level] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      catalogVersion: POLICY_CATALOG_VERSION,
      policyCount: POLICY_CATALOG.length,
      byLevel,
      integrity: { ok: issues.length === 0, issues },
      emergency: {
        globalStop: state.globalStop,
        readOnly: state.readOnly,
        paidDisabled: state.paidDisabled,
        externalCommsStopped: state.externalCommsStopped,
        queuesStopped: state.queuesStopped,
        apiKeysBlocked: state.apiKeysBlocked,
        source: state.source,
        capturedAt: new Date(state.capturedAt).toISOString(),
      },
      policies: POLICY_CATALOG,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Forbidden' ? 403 : 401 },
      );
    }
    console.error('Governance policy catalogue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
