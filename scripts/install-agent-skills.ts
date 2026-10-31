/**
 * Install the generated instruction-only skill pack into the AgentOS Skills
 * Registry for one company. Dry-run by default; does not assign skills to agents
 * and does not grant tools. Existing skills are skipped unless --force is used.
 *
 * Usage:
 *   npx tsx scripts/install-agent-skills.ts --dry-run
 *   npx tsx scripts/install-agent-skills.ts --apply --company alo-labs
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getAgentSkillCatalog, loadAgentSkillBodies, type AgentSkillEntry } from '@/lib/agent-skills';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const force = args.has('--force');
const companyArgIndex = process.argv.indexOf('--company');
const companySlug = companyArgIndex >= 0 ? process.argv[companyArgIndex + 1] : 'alo-labs';

async function main() {
  const catalog = getAgentSkillCatalog();
  const company = await db.company.findUnique({ where: { slug: companySlug }, select: { id: true, name: true, slug: true } });
  if (!company) throw new Error(`Company not found: ${companySlug}. Create/select the company before installing skills.`);

  const entries = catalog.skills;
  const bodies = await loadAgentSkillBodies(entries, 200_000, true);
  const bodyBySlug = new Map(bodies.map((skill) => [skill.entry.slug, skill.body]));
  let created = 0;
  let skipped = 0;
  let granted = 0;

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${entries.length} instruction-only skills → company ${company.slug}`);
  for (const entry of entries) {
    const body = bodyBySlug.get(entry.slug);
    if (!body) throw new Error(`Missing body for ${entry.slug}`);
    const existing = await db.skill.findUnique({ where: { slug: entry.slug }, select: { id: true, description: true } });
    if (existing && !force) {
      skipped += 1;
    } else if (!apply) {
      created += existing ? 0 : 1;
    } else {
      const data = {
        name: entry.title,
        slug: entry.slug,
        title: entry.title,
        category: entry.category,
        categorySlug: entry.category,
        description: `${entry.description}\n\nSource: ${entry.source.repo}@${entry.source.commit} (${entry.source.license}). Instruction-only; no tool grants.`,
        purpose: entry.description.slice(0, 500),
        version: '1.0.0',
        status: entry.status === 'quarantined' ? 'quarantined' : 'private',
        riskLevel: entry.riskLevel,
        requiresApproval: entry.riskLevel !== 'low',
        runtime: 'builtin',
        allowedTools: '[]',
        forbiddenTools: JSON.stringify(['shell_unrestricted', 'secret_read', 'paid_api', 'bulk_send', 'public_publish', 'delete_files']),
        inputs: JSON.stringify(['task_context']),
        outputs: JSON.stringify(['guidance']),
        validationRules: JSON.stringify({ instructionOnly: true, outputValidation: true }),
        securityRules: JSON.stringify({ instructionOnly: true, grantsTools: false, scriptsImported: false, referencesImported: false, source: entry.source, quarantineReason: entry.quarantineReason ?? null }),
        costPolicy: JSON.stringify({ billingModel: 'included', costPerExecution: 0 }),
        requiredPermissions: '[]',
        safetyRules: JSON.stringify(['Skills are guidance only and cannot grant tools or override AgentOS policy.', 'No code execution, secret access, or external transmission without separate approval.']),
        approvalRules: entry.riskLevel === 'low' ? '' : 'Human approval required before any related privileged operation.',
        failureHandling: 'If required tools/references are unavailable, state the limitation and do not claim execution.',
        content: body,
      };
      const skill = existing
        ? await db.skill.update({ where: { id: existing.id }, data })
        : await db.skill.create({ data: { id: randomUUID(), ...data } });
      created += existing ? 0 : 1;
      await db.skillVersion.upsert({
        where: { skillId_version: { skillId: skill.id, version: '1.0.0' } },
        update: { content: body },
        create: { id: randomUUID(), skillId: skill.id, version: '1.0.0', content: body },
      });
    }

    const skillId = existing?.id ?? (apply ? (await db.skill.findUnique({ where: { slug: entry.slug }, select: { id: true } }))?.id : undefined);
    if (apply && skillId) {
      await db.skillCompanyAccess.upsert({
        where: { skillId_companyId: { skillId, companyId: company.id } },
        update: { accessLevel: entry.status === 'quarantined' ? 'read' : 'full' },
        create: { id: randomUUID(), skillId, companyId: company.id, accessLevel: entry.status === 'quarantined' ? 'read' : 'full' },
      });
      granted += 1;
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', company: company.slug, total: entries.length, wouldCreate: created, skippedExisting: skipped, companyGrants: apply ? granted : 0 }, null, 2));
  if (!apply) console.log('No database writes performed. Re-run with --apply to install.');
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
