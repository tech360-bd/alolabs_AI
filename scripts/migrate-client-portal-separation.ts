/**
 * Client-portal separation — one-time data migration (database-agnostic).
 *
 * Run once, right after the schema change has been applied (SQLite:
 * `npm run db:push:sqlite`; MySQL: prisma/migrations/mysql/
 * 20261115_client_portal_separation.sql, which performs the same backfill and
 * leaves this script with nothing to change).
 *
 * What it does
 *   1. Classifies the companies that existed before the separation as
 *      `internal`. The client-account concept did not exist before, so every
 *      pre-existing Company row is an AgentOS tenant provisioned by a Super
 *      Admin. `Company.accountType` defaults to `client` (fail closed), which
 *      would otherwise turn those tenants' API keys away from the internal API.
 *      Companies that already own a ClientAccount are never touched.
 *   2. Seeds the published service catalogue if it is empty.
 *   3. Reports the logins that are no longer admitted to the internal platform
 *      so a Super Admin can decide, per login, whether it is a customer (give
 *      it a client account) or staff on a legacy role (assign an internal role).
 *      It changes NO roles: nobody is promoted by a script.
 *
 * It is guarded by a Settings marker, so running it again does not reclassify
 * a customer account created afterwards.
 *
 * Usage:
 *   npx tsx scripts/migrate-client-portal-separation.ts            # apply
 *   npx tsx scripts/migrate-client-portal-separation.ts --dry-run  # report only
 *   KEEP_AS_CLIENT=slug-a,slug-b npx tsx scripts/…                 # leave these as client accounts
 */

import { db } from '@/lib/db';
import { INTERNAL_ROLES, isInternalRole } from '@/lib/access/surfaces';
import { ensureServiceCatalogue } from '@/lib/client-services/operations';

const MARKER_KEY = 'migration:client-portal-separation';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const keepAsClient = new Set(
    (process.env.KEEP_AS_CLIENT ?? '').split(',').map((slug) => slug.trim()).filter(Boolean),
  );

  console.log(`\nClient-portal separation — data migration${dryRun ? ' (dry run)' : ''}\n`);

  // ── 1. Company classification ──
  const marker = await db.settings.findUnique({ where: { key: MARKER_KEY } });
  if (marker) {
    console.log(`Company backfill already applied (${marker.value}); skipping.`);
  } else {
    const candidates = await db.company.findMany({
      where: { accountType: { not: 'internal' }, clientAccount: null },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
    });
    const toInternal = candidates.filter((company) => !keepAsClient.has(company.slug));
    const kept = candidates.filter((company) => keepAsClient.has(company.slug));

    console.log(`Companies to classify as internal AgentOS tenants: ${toInternal.length}`);
    for (const company of toInternal) console.log(`  • ${company.name} (${company.slug})`);
    if (kept.length) {
      console.log(`Left as client accounts (KEEP_AS_CLIENT): ${kept.length}`);
      for (const company of kept) console.log(`  • ${company.name} (${company.slug}) — create its client account via POST /api/internal/clients`);
    }

    if (!dryRun) {
      await db.$transaction([
        db.company.updateMany({
          where: { id: { in: toInternal.map((company) => company.id) } },
          data: { accountType: 'internal' },
        }),
        db.settings.create({
          data: {
            key: MARKER_KEY,
            type: 'json',
            value: JSON.stringify({ appliedAt: new Date().toISOString(), internal: toInternal.length, keptAsClient: kept.length }),
          },
        }),
      ]);
      console.log('Applied.');
    }
  }

  // ── 2. Service catalogue ──
  if (!dryRun) {
    await ensureServiceCatalogue();
    console.log(`\nService catalogue: ${await db.serviceOffering.count({ where: { isActive: true } })} published services.`);
  }

  // ── 3. Logins that are no longer internal ──
  const users = await db.user.findMany({
    select: { id: true, email: true, role: true, isActive: true },
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });
  const external = users.filter((user) => !isInternalRole(user.role));
  const clientMembers = new Set(
    (await db.companyUser.findMany({
      where: { company: { accountType: 'client', clientAccount: { isNot: null } } },
      select: { userId: true },
    })).map((membership) => membership.userId),
  );
  const unassigned = external.filter((user) => !clientMembers.has(user.id));

  console.log(`\nInternal personnel: ${users.length - external.length} login(s) [roles: ${INTERNAL_ROLES.join(', ')}]`);
  console.log(`Client logins with a client account: ${external.length - unassigned.length}`);
  console.log(`Logins with NO internal role and NO client account: ${unassigned.length}`);
  for (const user of unassigned) {
    console.log(`  • ${user.email}  role=${user.role}${user.isActive ? '' : '  (inactive)'}`);
  }
  if (unassigned.length) {
    console.log(
      '\nThese logins can sign in but reach neither surface until a Super Admin decides:\n' +
      '  – staff on a legacy role  → PUT /api/users/:id { "role": "<internal role>" }\n' +
      '  – a customer              → POST /api/internal/clients (creates the client account)\n' +
      'Nothing is promoted automatically.',
    );
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
