/**
 * AgentOS Seed Script — idempotent.
 *
 * Creates the minimum real data for the Command Center to work:
 *   - admin user (email/password from env or defaults)
 *   - company + membership
 *   - departments (from the 100-department registry, upserted)
 *   - 4 starter AI employees (research, analysis, verification, writing)
 *     with company access grants
 *   - starter skills with company access grants
 *
 * Usage:
 *   npx tsx scripts/seed-agentos.ts
 *
 * Env:
 *   SEED_ADMIN_EMAIL     (default admin@alolabs.net)
 *   SEED_ADMIN_PASSWORD  (default Admin@2026 — CHANGE IN PRODUCTION)
 */

import { randomUUID } from 'node:crypto';
import { hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDepartmentRegistry } from '@/lib/department-registry';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@alolabs.net';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

async function main() {
  console.log('\n🌱 AgentOS seed — starting\n');

  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('Set SEED_ADMIN_PASSWORD to a unique password of at least 12 characters before seeding.');
  }

  // ── 1. Admin user ──
  let user = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) {
    user = await db.user.create({
      data: {
        id: randomUUID(),
        email: ADMIN_EMAIL,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        name: 'ALO Admin',
        role: 'super_admin',
        isActive: true,
      },
    });
    console.log(`  ✓ user ${ADMIN_EMAIL} (password set via environment)`);
  } else {
    // Repair the unsafe hash from an earlier sandbox seed; never rotate an
    // existing user's real password on an idempotent production seed.
    if (/^[0-9a-f]{64}$/.test(user.passwordHash)) {
      user = await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(ADMIN_PASSWORD) },
      });
      console.log(`  ✓ repaired legacy seed hash for ${ADMIN_EMAIL}`);
    } else {
      console.log(`  = user ${ADMIN_EMAIL} already exists`);
    }
  }

  // ── 2. Company ──
  let company = await db.company.findUnique({ where: { slug: 'alo-labs' } });
  if (!company) {
    company = await db.company.create({
      data: {
        id: randomUUID(),
        name: 'ALO Labs',
        slug: 'alo-labs',
        domain: 'alolabs.net',
        status: 'active',
      },
    });
    console.log('  ✓ company ALO Labs (alo-labs)');
  } else {
    console.log('  = company alo-labs already exists');
  }

  // ── 3. Membership ──
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
  });
  if (!membership) {
    await db.companyUser.create({
      data: { id: randomUUID(), companyId: company.id, userId: user.id, role: 'admin' },
    });
    console.log('  ✓ membership admin → ALO Labs');
  } else {
    console.log('  = membership already exists');
  }

  // ── 4. Departments (from the 100-department registry) ──
  const registry = getDepartmentRegistry();
  const allDepts = registry.getAllDepartments();
  let deptUpserted = 0;
  for (const dept of allDepts) {
    const slug = dept.departmentCode.toLowerCase();
    await db.department.upsert({
      where: { slug },
      update: { name: dept.departmentName, status: dept.status },
      create: {
        id: randomUUID(),
        name: dept.departmentName,
        slug,
        description: dept.description,
        agentCount: dept.agentCount,
        sortOrder: dept.priority,
        status: dept.status,
      },
    });
    deptUpserted += 1;
  }
  console.log(`  ✓ departments upserted: ${deptUpserted}`);

  const deptBySlug = async (slug: string) =>
    db.department.findUnique({ where: { slug } });

  // ── 5. Starter AI employees ──
  const agents = [
    {
      agentId: 'STARTER-0001',
      name: 'Research Agent',
      slug: 'research-agent',
      departmentSlug: 'research',
      departmentName: 'Research',
      purpose: 'Researches topics, gathers information, verifies facts and records sources.',
      role: 'specialist',
      allowedSkills: JSON.stringify(['web_research', 'information_gathering', 'fact_verification', 'source_verification']),
      allowedTools: JSON.stringify(['web_search', 'database']),
    },
    {
      agentId: 'STARTER-0002',
      name: 'Analysis Agent',
      slug: 'analysis-agent',
      departmentSlug: 'data',
      departmentName: 'Data',
      purpose: 'Analyzes information, structures findings, computes comparisons and metrics.',
      role: 'specialist',
      allowedSkills: JSON.stringify(['analysis', 'structuring', 'data_cleaning']),
      allowedTools: JSON.stringify(['database']),
    },
    {
      agentId: 'STARTER-0003',
      name: 'Verification Agent',
      slug: 'verification-agent',
      departmentSlug: 'qa',
      departmentName: 'QA',
      purpose: 'Verifies factual claims, cross-checks sources, scores confidence, never fabricates citations.',
      role: 'qa',
      allowedSkills: JSON.stringify(['fact_verification', 'source_verification']),
      allowedTools: JSON.stringify(['web_search']),
    },
    {
      agentId: 'STARTER-0004',
      name: 'Writer Agent',
      slug: 'writer-agent',
      departmentSlug: 'content',
      departmentName: 'Content',
      purpose: 'Writes reports, documents, emails and deliverables from verified findings.',
      role: 'specialist',
      allowedSkills: JSON.stringify(['report_writing', 'document_generation', 'summarization', 'translation']),
      allowedTools: JSON.stringify(['file_storage']),
    },
  ];

  for (const a of agents) {
    const dept = await deptBySlug(a.departmentSlug);
    const existing = await db.agent.findUnique({ where: { agentId: a.agentId } });
    if (existing) {
      await db.agentCompanyAccess.upsert({
        where: { agentId_companyId: { agentId: existing.id, companyId: company.id } },
        update: {},
        create: { id: randomUUID(), agentId: existing.id, companyId: company.id, accessLevel: 'full' },
      });
      console.log(`  = agent ${a.agentId} already exists`);
    } else {
      const agent = await db.agent.create({
        data: {
          id: randomUUID(),
          agentId: a.agentId,
          name: a.name,
          slug: a.slug,
          departmentId: dept?.id ?? (await db.department.findFirst())!.id,
          departmentName: a.departmentName,
          purpose: a.purpose,
          role: a.role,
          type: 'specialist',
          allowedSkills: a.allowedSkills,
          allowedTools: a.allowedTools,
          status: 'active',
        },
      });
      await db.agentCompanyAccess.upsert({
        where: { agentId_companyId: { agentId: agent.id, companyId: company.id } },
        update: { accessLevel: 'full' },
        create: { id: randomUUID(), agentId: agent.id, companyId: company.id, accessLevel: 'full' },
      });
      console.log(`  ✓ agent ${a.agentId} ${a.name}`);
    }
  }

  // ── 6. Starter skills ──
  const skills = [
    { name: 'Web Research', slug: 'web-research', category: 'research', categorySlug: 'research', title: 'Web Research', purpose: 'Search the web, extract facts, record sources with URLs.' },
    { name: 'Fact Verification', slug: 'fact-verification', category: 'research', categorySlug: 'research', title: 'Fact Verification', purpose: 'Verify claims against sources; score confidence; never fabricate.' },
    { name: 'Source Verification', slug: 'source-verification', category: 'research', categorySlug: 'research', title: 'Source Verification', purpose: 'Check source quality: publisher, date, retrieval time, cross-checks.' },
    { name: 'Summarization', slug: 'summarization', category: 'writing', categorySlug: 'writing', title: 'Summarization', purpose: 'Condense long content faithfully without losing key facts.' },
    { name: 'Report Writing', slug: 'report-writing', category: 'writing', categorySlug: 'writing', title: 'Report Writing', purpose: 'Produce structured reports with citations from verified findings.' },
    { name: 'Document Generation', slug: 'document-generation', category: 'writing', categorySlug: 'writing', title: 'Document Generation', purpose: 'Generate DOCX/XLSX/PPTX/CSV artifacts (modern OOXML only).' },
    { name: 'Data Cleaning', slug: 'data-cleaning', category: 'data', categorySlug: 'data', title: 'Data Cleaning', purpose: 'Clean, normalize and validate datasets.' },
    { name: 'Code Generation', slug: 'code-generation', category: 'engineering', categorySlug: 'engineering', title: 'Code Generation', purpose: 'Write production-quality code from specifications.' },
  ];

  for (const s of skills) {
    const existing = await db.skill.findUnique({ where: { slug: s.slug } });
    if (existing) {
      await db.skillCompanyAccess.upsert({
        where: { skillId_companyId: { skillId: existing.id, companyId: company.id } },
        update: {},
        create: { id: randomUUID(), skillId: existing.id, companyId: company.id, accessLevel: 'full' },
      });
      console.log(`  = skill ${s.slug} already exists`);
      continue;
    }
    const skill = await db.skill.create({
      data: {
        id: randomUUID(),
        name: s.name,
        slug: s.slug,
        title: s.title,
        category: s.category,
        categorySlug: s.categorySlug,
        description: s.purpose,
        purpose: s.purpose,
        status: 'approved',
        version: '1.0.0',
        requiresApproval: false,
        riskLevel: 'low',
      },
    });
    await db.skillCompanyAccess.upsert({
      where: { skillId_companyId: { skillId: skill.id, companyId: company.id } },
      update: { accessLevel: 'full' },
      create: { id: randomUUID(), skillId: skill.id, companyId: company.id, accessLevel: 'full' },
    });
    console.log(`  ✓ skill ${s.slug}`);
  }

  // ── 7. Starter workflow ──
  const wfExisting = await db.workflow.findUnique({ where: { slug: 'research-report' } });
  if (!wfExisting) {
    const wf = await db.workflow.create({
      data: {
        id: randomUUID(),
        name: 'Research & Report',
        slug: 'research-report',
        description: 'Research a topic, verify facts, and produce a cited report.',
        triggers: JSON.stringify(['manual']),
        status: 'active',
      },
    });
    await db.workflowStep.create({
      data: {
        id: randomUUID(),
        workflowId: wf.id,
        stepNumber: 1,
        action: 'Research {{topic}} and gather verified facts with sources',
        config: JSON.stringify({ agentHint: 'research', skills: ['web_research', 'fact_verification'] }),
      },
    });
    await db.workflowStep.create({
      data: {
        id: randomUUID(),
        workflowId: wf.id,
        stepNumber: 2,
        action: 'Verify the findings and record citations',
        config: JSON.stringify({ agentHint: 'verification', skills: ['source_verification'] }),
      },
    });
    await db.workflowStep.create({
      data: {
        id: randomUUID(),
        workflowId: wf.id,
        stepNumber: 3,
        action: 'Write the final report',
        config: JSON.stringify({ agentHint: 'writing', skills: ['report_writing'] }),
      },
    });
    await db.workflowPermission.create({
      data: { id: randomUUID(), workflowId: wf.id, companyId: company.id, accessLevel: 'execute' },
    });
    console.log('  ✓ workflow research-report (3 steps)');
  } else {
    const permission = await db.workflowPermission.findFirst({
      where: { workflowId: wfExisting.id, companyId: company.id },
    });
    if (!permission) {
      await db.workflowPermission.create({
        data: { id: randomUUID(), workflowId: wfExisting.id, companyId: company.id, accessLevel: 'execute' },
      });
    }
    console.log('  = workflow research-report already exists');
  }

  console.log('\n✅ AgentOS seed complete.\n');
  console.log(`   Login email: ${ADMIN_EMAIL} (password supplied via environment)\n`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
