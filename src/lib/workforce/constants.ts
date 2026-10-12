/**
 * ALO Labs workforce — fixed capacity and identity constants.
 *
 * These values are the contract that the plan builder, the idempotent
 * provisioner and the verifier all share. Changing any of them is a
 * deliberate, reviewed change: the verifier fails closed if the database
 * drifts from them.
 */

/** Number of operational departments the platform must provision. */
export const DEPARTMENT_COUNT = 100;

/** Primary agents per department. 100 x 20 = 2,000 primary agents. */
export const AGENTS_PER_DEPARTMENT = 20;

/** Total primary agents across all departments. */
export const PRIMARY_AGENT_COUNT = DEPARTMENT_COUNT * AGENTS_PER_DEPARTMENT;

/** Tenant that owns the ALO Labs internal workforce (matches seed scripts). */
export const ALO_TENANT = { slug: 'alo-labs', name: 'ALO Labs' } as const;

/**
 * Version of the workforce plan. Bump when the generation rules change so a
 * re-provision can distinguish "same spec, nothing to do" from "new spec".
 */
export const WORKFORCE_PLAN_VERSION = 'workforce-plan@1';

/** Marker stored in `runtimeProfile.provisioning.managedBy` on every managed row. */
export const MANAGED_BY = 'workforce-plan';

/**
 * Lifecycle status for a freshly provisioned agent. A registered agent is NOT
 * operational until execution verification passes, so provisioning never
 * writes `active`.
 */
export const PROVISIONED_STATUS = 'provisioned';

/** Agent business key format: AGENT-0001 … AGENT-2000. */
export const AGENT_ID_PATTERN = /^AGENT-(\d{4})$/;

export function agentBusinessKey(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > PRIMARY_AGENT_COUNT) {
    throw new RangeError(`agent sequence must be an integer in [1, ${PRIMARY_AGENT_COUNT}], got ${sequence}`);
  }
  return `AGENT-${String(sequence).padStart(4, '0')}`;
}
