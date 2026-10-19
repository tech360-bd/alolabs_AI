#!/usr/bin/env npx tsx
/**
 * Provision or verify distinct AI employee identities linked to existing,
 * tenant-owned workforce agents. This never creates agents, model workers, or
 * execution history. It is read-only by default; --apply is required to write.
 *
 *   npx tsx scripts/provision-ai-employee-identities.ts --dry-run
 *   npx tsx scripts/provision-ai-employee-identities.ts --apply
 *   npx tsx scripts/provision-ai-employee-identities.ts --verify
 */
import {
  ALO_TENANT,
  buildAIEmployeePlan,
  buildWorkforcePlan,
  createPrismaAIEmployeeStore,
  provisionAIEmployeeIdentities,
  verifyAIEmployeeIdentities,
} from '../src/lib/workforce';
import { getDepartmentRegistry } from '../src/lib/department-registry';
import { db } from '../src/lib/db';

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is required; set it explicitly for a reviewed environment. No records were changed.');
    return 2;
  }
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const verifyOnly = args.has('--verify');
  const dryRun = args.has('--dry-run') || (!apply && !verifyOnly);
  if (apply && verifyOnly) throw new Error('Choose --apply or --verify, not both');

  const plan = buildWorkforcePlan(getDepartmentRegistry().getAllDepartments());
  const employees = buildAIEmployeePlan(plan.agents);
  const company = await db.company.findUnique({ where: { slug: ALO_TENANT.slug }, select: { id: true } });
  if (!company) {
    console.error(`Tenant "${ALO_TENANT.slug}" is not present. No records were changed.`);
    return 1;
  }

  const store = createPrismaAIEmployeeStore(db);
  if (verifyOnly) {
    const rows = await store.listEmployees(company.id);
    const report = verifyAIEmployeeIdentities(employees, rows, company.id);
    console.log(JSON.stringify({ verification: report }, null, 2));
    return report.ok ? 0 : 1;
  }

  const report = await provisionAIEmployeeIdentities(store, company.id, employees, {
    dryRun,
    actorUserId: 'system:ai-employee-provisioner',
  });
  console.log(JSON.stringify({ provisioning: report }, null, 2));
  if (!report.ok) {
    console.error('Employee provisioning refused: resolve agent ownership or identity conflicts first. No identity rows were written.');
    return 1;
  }
  if (dryRun) {
    console.log('Dry run only. Pass --apply to create or update the tenant employee identities.');
    return 0;
  }

  const rows = await store.listEmployees(company.id);
  const verification = verifyAIEmployeeIdentities(employees, rows, company.id);
  console.log(JSON.stringify({ verification }, null, 2));
  return verification.ok ? 0 : 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
