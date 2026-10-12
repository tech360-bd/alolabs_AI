/**
 * Seed Script: 100 Departments
 * ALO Labs AIOS — Upserts all 100 departments into the database.
 *
 * Usage: npx tsx scripts/seed-100-departments.ts
 */

import { PrismaClient } from '@prisma/client';
import { getDepartmentRegistry } from '@/lib/department-registry';

const db = new PrismaClient();

/**
 * Build a slug from department code: lowercase, replace hyphens with underscores.
 * e.g. "EXEC-OFFICE" → "exec-office"
 */
function codeToSlug(code: string): string {
  return code.toLowerCase();
}

async function main() {
  const registry = getDepartmentRegistry();
  const allDepts = registry.getAllDepartments();

  console.log(`\nSeeding ${allDepts.length} departments into database...\n`);

  let upserted = 0;
  let skipped = 0;
  const groups = new Map<string, number>();

  for (const dept of allDepts) {
    const slug = codeToSlug(dept.departmentCode);

    // Count groups
    groups.set(dept.group, (groups.get(dept.group) ?? 0) + 1);

    try {
      const result = await db.department.upsert({
        where: { slug },
        update: {
          name: dept.departmentName,
          description: dept.description,
          agentCount: dept.agentCount,
          sortOrder: dept.priority,
          status: dept.status,
        },
        create: {
          name: dept.departmentName,
          slug,
          description: dept.description,
          agentCount: dept.agentCount,
          sortOrder: dept.priority,
          status: dept.status,
        },
      });

      upserted++;
      console.log(
        `  ✓ [${dept.departmentCode}] ${dept.departmentName} → ${result.id} (${dept.group}, ${dept.agentCount} agents)`
      );
    } catch (err) {
      skipped++;
      console.error(
        `  ✗ [${dept.departmentCode}] ${dept.departmentName} — ${err}`
      );
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Total departments in registry: ${allDepts.length}`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Skipped/Failed: ${skipped}`);
  console.log(`\n  Groups (${groups.size}):`);
  for (const [group, count] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${group.padEnd(16)} ${count} departments`);
  }

  const totalAgents = registry.getTotalAgentCount();
  console.log(`\n  Total agent capacity: ${totalAgents}`);
  console.log(`${'─'.repeat(60)}\n`);

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
