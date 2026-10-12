import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const OPERATING_RULES: { key: string; value: string; type: string }[] = [
  { key: 'LOCAL_FIRST', value: 'true', type: 'boolean' },
  { key: 'PAID_AI_API_ALLOWED', value: 'false', type: 'boolean' },
  { key: 'PRIVATE_AI_AGENTS', value: 'true', type: 'boolean' },
  { key: 'PRIVATE_SKILLS_ONLY', value: 'true', type: 'boolean' },
  { key: 'PUBLIC_SKILLS_DISABLED', value: 'true', type: 'boolean' },
  { key: 'PAYMENT_GUARD_ENABLED', value: 'true', type: 'boolean' },
  { key: 'PROTECTION_MODE_ENABLED', value: 'true', type: 'boolean' },
  { key: 'SELF_IMPROVEMENT_ENABLED', value: 'true', type: 'boolean' },
  { key: 'PRODUCTIVITY_MODE_ENABLED', value: 'true', type: 'boolean' },
  { key: 'OWNER_APPROVAL_REQUIRED', value: 'true', type: 'boolean' },
  { key: 'CROSS_COMPANY_DATA_ACCESS', value: 'false', type: 'boolean' },
  { key: 'EXTERNAL_AGENT_EXPORT', value: 'false', type: 'boolean' },
  { key: 'PUBLIC_AGENT_DOWNLOAD', value: 'false', type: 'boolean' },
];

async function main() {
  console.log(`Seeding ${OPERATING_RULES.length} Global Operating Rules...\n`);

  let upserted = 0;

  for (const rule of OPERATING_RULES) {
    const result = await db.settings.upsert({
      where: { key: rule.key },
      update: { value: rule.value, type: rule.type },
      create: { key: rule.key, value: rule.value, type: rule.type },
    });
    upserted++;
    console.log(`  ✓ ${rule.key} = ${rule.value} (${result.id})`);
  }

  console.log(`\nDone. ${upserted} rules seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());