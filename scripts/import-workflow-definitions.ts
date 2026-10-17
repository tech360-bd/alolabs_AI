#!/usr/bin/env npx tsx
/**
 * Import canonical workflow definitions into the database.
 *
 *   npx tsx scripts/import-workflow-definitions.ts            # dry-run (default)
 *   npx tsx scripts/import-workflow-definitions.ts --apply    # write
 *   npx tsx scripts/import-workflow-definitions.ts --apply --company alo-labs
 *
 * Idempotent by Workflow.slug: existing workflows are updated in place and
 * their steps replaced only when the definition differs. Steps are ordered by
 * the definition's `step` field. Every workflow is granted to the target
 * company so it can be run from the UI/API.
 *
 * Refuses to run if any step references a department or agent that is not in
 * the canonical registry/workforce, or if a step lacks config.instruction.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { db } from '../src/lib/db';
import { getDepartmentRegistry } from '../src/lib/department-registry';

const ROOT = path.resolve(__dirname, '..');
const DEFINITIONS_DIR = path.join(ROOT, 'workflows', 'definitions');

interface DefinitionStep {
  step: number;
  agent: string;
  action: string;
  config?: Record<string, unknown>;
}

interface Definition {
  workflow_id: string;
  name: string;
  slug: string;
  description?: string;
  triggers?: string[];
  department: string;
  steps: DefinitionStep[];
}

function loadDefinitions(): Definition[] {
  return readdirSync(DEFINITIONS_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'workflows_registry.json')
    .sort()
    .map((file) => {
      const parsed = JSON.parse(readFileSync(path.join(DEFINITIONS_DIR, file), 'utf8')) as Definition;
      return { ...parsed, file } as Definition & { file: string };
    });
}

function loadWorkforceAgents(): Set<string> {
  const csv = readFileSync(path.join(ROOT, 'docs', 'workforce', 'agents.csv'), 'utf8').trim().split(/\r?\n/);
  const header = csv[0].split(',');
  const nameIndex = header.indexOf('name');
  return new Set(csv.slice(1).map((line) => line.split(',')[nameIndex]));
}

function validate(defs: Definition[], departments: Set<string>, agents: Set<string>): string[] {
  const problems: string[] = [];
  for (const def of defs) {
    const where = `${def.slug}`;
    if (!departments.has(def.department)) problems.push(`${where}: unknown department "${def.department}"`);
    if (!Array.isArray(def.steps) || def.steps.length === 0) problems.push(`${where}: no steps`);
    const seen = new Set<number>();
    for (const step of def.steps) {
      if (seen.has(step.step)) problems.push(`${where}: duplicate step ${step.step}`);
      seen.add(step.step);
      if (!agents.has(step.agent)) problems.push(`${where}: step ${step.step} unknown agent "${step.agent}"`);
      const instruction = step.config?.instruction;
      if (typeof instruction !== 'string' || instruction.trim().length === 0) {
        problems.push(`${where}: step ${step.step} has no config.instruction`);
      }
    }
  }
  return problems;
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const companyIndex = process.argv.indexOf('--company');
  const companySlug = companyIndex > -1 ? process.argv[companyIndex + 1] : 'alo-labs';

  const registry = getDepartmentRegistry();
  const departments = new Set(registry.getAllDepartments().map((d) => d.departmentName));
  const defs = loadDefinitions();
  const agents = loadWorkforceAgents();

  const problems = validate(defs, departments, agents);
  if (problems.length > 0) {
    console.error(`Refusing to import ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return 1;
  }

  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    console.error(`Company "${companySlug}" not found; nothing imported.`);
    return 1;
  }

  const plans = [];
  for (const def of defs) {
    const existing = await db.workflow.findUnique({
      where: { slug: def.slug },
      include: { workflowSteps: { orderBy: { stepNumber: 'asc' } } },
    });

    const triggerJson = JSON.stringify(def.triggers ?? []);
    const steps = [...def.steps].sort((a, b) => a.step - b.step);

    const currentSteps = existing?.workflowSteps ?? [];
    const unchanged =
      Boolean(existing) &&
      existing!.name === def.name &&
      (existing!.description ?? '') === (def.description ?? '') &&
      existing!.triggers === triggerJson &&
      currentSteps.length === steps.length &&
      steps.every((step, index) => {
        const row = currentSteps[index];
        return (
          row.stepNumber === step.step &&
          row.action === step.action &&
          row.agentId === step.agent &&
          row.config === JSON.stringify(step.config ?? {})
        );
      });

    plans.push({ def, existing, steps, triggerJson, unchanged });
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${plans.length} definitions, company ${company.slug}`);
  console.log(`  create: ${plans.filter((p) => !p.existing).length}`);
  console.log(`  update: ${plans.filter((p) => p.existing && !p.unchanged).length}`);
  console.log(`  unchanged: ${plans.filter((p) => p.unchanged).length}`);

  for (const plan of plans) {
    const status = !plan.existing ? 'create' : plan.unchanged ? 'unchanged' : 'update';
    console.log(`  ${status.padEnd(9)} ${plan.def.slug.padEnd(20)} ${plan.steps.length} step(s) → ${plan.def.department}`);
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return 0;
  }

  for (const plan of plans) {
    if (plan.unchanged) continue;
    await db.$transaction(async (tx) => {
      const workflow = plan.existing
        ? await tx.workflow.update({
            where: { id: plan.existing.id },
            data: {
              name: plan.def.name,
              description: plan.def.description ?? '',
              triggers: plan.triggerJson,
              status: 'active',
            },
          })
        : await tx.workflow.create({
            data: {
              name: plan.def.name,
              slug: plan.def.slug,
              description: plan.def.description ?? '',
              triggers: plan.triggerJson,
              status: 'active',
            },
          });

      await tx.workflowStep.deleteMany({ where: { workflowId: workflow.id } });
      await tx.workflowStep.createMany({
        data: plan.steps.map((step) => ({
          workflowId: workflow.id,
          stepNumber: step.step,
          agentId: step.agent,
          action: step.action,
          config: JSON.stringify(step.config ?? {}),
        })),
      });

      const permission = await tx.workflowPermission.findFirst({
        where: { workflowId: workflow.id, companyId: company.id },
      });
      if (permission) {
        await tx.workflowPermission.update({
          where: { id: permission.id },
          data: { accessLevel: 'execute' },
        });
      } else {
        await tx.workflowPermission.create({
          data: { workflowId: workflow.id, companyId: company.id, accessLevel: 'execute' },
        });
      }
    });
  }

  console.log(`\nImported ${plans.filter((p) => !p.unchanged).length} workflow(s).`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(2);
  })
  .finally(() => db.$disconnect());
