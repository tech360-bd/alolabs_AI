import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { loadGovernanceState } from '@/lib/governance';

/**
 * Execution status for the signed-in user's workspace.
 *
 * Every authenticated user may see whether autonomous execution is currently
 * suspended — hiding an emergency stop from the people whose work is paused is
 * how a platform loses trust. No policy internals, provider configuration or
 * tenant data is exposed here.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const state = await loadGovernanceState();
    const suspended = state.globalStop || state.readOnly;

    return NextResponse.json({
      executionSuspended: suspended,
      readOnly: state.readOnly,
      globalStop: state.globalStop,
      paidServicesDisabled: state.paidDisabled,
      externalCommunicationStopped: state.externalCommsStopped,
      queuesStopped: state.queuesStopped,
      // Never surface the raw error: it can name internal tables or hosts.
      stateReliable: state.source === 'database',
      capturedAt: new Date(state.capturedAt).toISOString(),
      message: suspended
        ? 'Autonomous and state-changing execution is temporarily suspended by a platform administrator.'
        : 'Execution is operating normally.',
      role: user.role,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('Governance status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
