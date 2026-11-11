#!/usr/bin/env npx tsx
/**
 * Role migration CLI — dry-run, create records, apply, rollback.
 *
 * Usage:
 *   npx tsx scripts/migrate-roles.ts --dry-run
 *   npx tsx scripts/migrate-roles.ts --create-records --operator <userId>
 *   npx tsx scripts/migrate-roles.ts --apply <migrationId> --operator <userId>
 *   npx tsx scripts/migrate-roles.ts --rollback <migrationId> --operator <userId>
 *
 * Per Decision 2: never auto-elevates. The dry-run is the default; nothing
 * is written until --create-records is explicitly passed, and no User.role
 * is changed until --apply is explicitly passed for a specific migration id.
 */

import { dryRunRoleMigration, createMigrationRecords, applyMigration, rollbackMigration } from '@/lib/role-migration';
import { db } from '@/lib/db';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const createRecords = args.includes('--create-records');

  // F9: Robust flag parsing. Use a helper that finds the value AFTER a flag,
  // returning undefined if the flag is absent (instead of args[0]).
  function flagValue(name: string): string | undefined {
    const i = args.indexOf(name);
    if (i === -1 || i + 1 >= args.length) return undefined;
    return args[i + 1];
  }

  const applyId = flagValue('--apply');
  const rollbackId = flagValue('--rollback');
  const operatorEmail = flagValue('--operator');

  if (dryRun) {
    const result = await dryRunRoleMigration();
    console.log('\n=== Role Migration Dry Run ===\n');
    console.log(`Total users: ${result.totalUsers}`);
    console.log(`Already mapped to spec roles: ${result.alreadyMapped}`);
    console.log(`Mappable (new pending records): ${result.mappable}`);
    console.log(`Unknown roles: ${result.unknownRoles.length}`);
    console.log(`Conflicts: ${result.conflicts.length}`);
    if (result.unknownRoles.length > 0) {
      console.log('\n--- Unknown roles (will NOT be migrated) ---');
      for (const u of result.unknownRoles) {
        console.log(`  ${u.email}: ${u.currentRole}`);
      }
    }
    if (result.conflicts.length > 0) {
      console.log('\n--- Conflicts (existing mapping differs) ---');
      for (const c of result.conflicts) {
        console.log(`  ${c.email}: existing=${c.existingMapping} proposed=${c.proposedMapping}`);
      }
    }
    console.log(`\nProposed mappings (${result.proposed.length}):`);
    for (const p of result.proposed) {
      console.log(`  ${p.email}: ${p.currentRole} → ${p.proposedRole}`);
    }
    console.log('\nNo records were written. Run with --create-records to create pending migrations.');
    return;
  }

  if (createRecords) {
    if (!operatorEmail) {
      console.error('--operator <email> is required for --create-records');
      process.exit(1);
    }
    const operator = await db.user.findUnique({ where: { email: operatorEmail }, select: { id: true, role: true } });
    if (!operator) {
      console.error(`Operator not found: ${operatorEmail}`);
      process.exit(1);
    }
    if (operator.role !== 'super_admin' && operator.role !== 'platform_super_admin') {
      console.error(`Operator must be super_admin or platform_super_admin. Current role: ${operator.role}`);
      process.exit(1);
    }
    const dryRunResult = await dryRunRoleMigration();
    const created = await createMigrationRecords(dryRunResult.proposed, operator.id);
    console.log(`Created ${created} pending migration records (operator: ${operatorEmail}).`);
    console.log('No User.role values were changed. Review the pending records and apply individually with --apply <id>.');
    return;
  }

  if (applyId) {
    if (!operatorEmail) {
      console.error('--operator <email> is required for --apply');
      process.exit(1);
    }
    const operator = await db.user.findUnique({ where: { email: operatorEmail }, select: { id: true, role: true } });
    if (!operator) {
      console.error(`Operator not found: ${operatorEmail}`);
      process.exit(1);
    }
    if (operator.role !== 'super_admin' && operator.role !== 'platform_super_admin') {
      console.error(`Operator must be super_admin or platform_super_admin. Current role: ${operator.role}`);
      process.exit(1);
    }
    const result = await applyMigration(applyId, operator.id);
    if (result.applied) {
      console.log(`Migration ${applyId} applied successfully.`);
    } else {
      console.error(`Failed: ${result.reason}`);
      process.exit(1);
    }
    return;
  }

  if (rollbackId) {
    if (!operatorEmail) {
      console.error('--operator <email> is required for --rollback');
      process.exit(1);
    }
    const operator = await db.user.findUnique({ where: { email: operatorEmail }, select: { id: true, role: true } });
    if (!operator) {
      console.error(`Operator not found: ${operatorEmail}`);
      process.exit(1);
    }
    const result = await rollbackMigration(rollbackId, operator.id);
    if (result.rolledBack) {
      console.log(`Migration ${rollbackId} rolled back.`);
    } else {
      console.error(`Failed: ${result.reason}`);
      process.exit(1);
    }
    return;
  }

  console.log('Usage: npx tsx scripts/migrate-roles.ts --dry-run | --create-records --operator <email> | --apply <id> --operator <email> | --rollback <id> --operator <email>');
}

main().catch(console.error).finally(() => db.$disconnect());
