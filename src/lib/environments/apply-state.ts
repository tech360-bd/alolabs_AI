/**
 * Environment apply — the parts that are pure logic.
 *
 * These live apart from `service.ts` for one reason: `service.ts` imports the Prisma
 * client, and these rules decide whether a configuration may be shown as live. They
 * should be provable in a test that needs no database and no generated client.
 */

export class EnvironmentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | 'not-found'
      | 'invalid'
      | 'conflict'
      | 'approval-required'
      | 'same-user-approval'
      | 'secret-store-unavailable',
  ) {
    super(message);
    this.name = 'EnvironmentError';
  }
}
/**
 * The apply state machine, as pure predicates.
 *
 * Keeping these out of the database code makes the rules testable without a client —
 * and they are the rules that matter: an apply can only be claimed once, a finished
 * apply cannot be re-run, and "succeeded" without a health check is not a success.
 */
export function assertApplyClaimable(status: string): void {
  if (status === 'succeeded' || status === 'failed' || status === 'rolled_back') {
    throw new EnvironmentError(`Apply is already ${status}`, 409, 'conflict');
  }
  if (status === 'running') {
    throw new EnvironmentError('Apply is already claimed by a host', 409, 'conflict');
  }
}

export function assertApplyOutcome(outcome: string, healthCheck?: string): void {
  if (!['succeeded', 'failed', 'rolled_back'].includes(outcome)) {
    throw new EnvironmentError(`Unknown apply outcome: ${outcome}`, 400, 'invalid');
  }
  if (outcome === 'succeeded' && !healthCheck) {
    throw new EnvironmentError(
      'A successful apply must include the health check that proved it.',
      400,
      'invalid',
    );
  }
}

