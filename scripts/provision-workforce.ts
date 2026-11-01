#!/usr/bin/env npx tsx
/**
 * ALO Labs workforce provisioning CLI (idempotent).
 *
 * Usage:
 *   npx tsx scripts/provision-workforce.ts              # dry-run (default; no writes)
 *   npx tsx scripts/provision-workforce.ts --dry-run    # report what would change; no writes
 *   npx tsx scripts/provision-workforce.ts --apply      # explicit write mode, after owner approval
 *   npx tsx scripts/provision-workforce.ts --verify     # read-only verification only
 *
 * Exit codes: 0 = provisioned/verified, 1 = conflicts or verification failure, 2 = error.
 * Requires DATABASE_URL. Never deletes rows and never modifies rows it does not own.
 */
import { buildWorkforcePlan, createPrismaWorkforceStore, provisionWorkforce, verifyWorkforce } from '../src/lib/workforce';
import { getDepartmentRegistry } from '../src/lib/department-registry';
import { db } from '../src/lib/db';
import { workforceProvisionMode } from '../src/lib/workforce/cli-policy';

async function main(): Promise<number> {
  const mode = workforceProvisionMode(process.argv.slice(2));
  const dryRun = mode === 'dry-run';
  const verifyOnly = mode === 'verify';

  const plan = buildWorkforcePlan(getDepartmentRegistry().getAllDepartments());
  const store = createPrismaWorkforceStore(db);

  if (!verifyOnly) {
    const provision = await provisionWorkforce(store, plan, { dryRun });
    console.log(JSON.stringify({ provision }, null, 2));
    if (!provision.ok) {
      console.error('Provisioning refused: conflicts found. No conflicting row was modified.');
      return 1;
    }
  }

  // The verification document is always emitted, including for a dry run. It is
  // a read-only report of the database's CURRENT state — which for a dry run is
  // the pre-provisioning state — so it tells the operator exactly what a
  // subsequent `--apply` would have to reconcile.
  //
  // This used to `return 0` before verification in dry-run mode, which meant the
  // command emitted a provisioning plan with no verification report and exit 0,
  // contradicting the documented contract ("Exit codes: 0 = provisioned /
  // verified") and leaving operators unable to see drift before applying.
  const rows = await store.loadAll();
  const tenantId = await store.findTenantId('alo-labs');
  const verify = verifyWorkforce(plan, { tenantId, ...rows });
  console.log(JSON.stringify({ verify }, null, 2));

  // A dry run writes nothing, so an unprovisioned database legitimately fails
  // the post-state check. Report it without failing the dry run itself.
  if (dryRun) return 0;
  return verify.ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(2);
  })
  .finally(() => db.$disconnect());
