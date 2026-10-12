#!/usr/bin/env npx tsx
/**
 * Writes the reviewable workforce inventory from the deterministic plan:
 *   docs/workforce/departments.csv  (100 rows)
 *   docs/workforce/agents.csv       (2,000 rows)
 *   docs/workforce/PLAN.json        (plan version, plan hash, counts)
 *
 * No database is needed; the files describe the configuration that
 * `scripts/provision-workforce.ts` writes. Re-run after any plan change.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDepartmentRegistry } from '../src/lib/department-registry';
import { buildWorkforcePlan } from '../src/lib/workforce/plan';

function csv(value: unknown): string {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(path: string, headers: string[], rows: unknown[][]) {
  writeFileSync(path, [headers.join(','), ...rows.map((r) => r.map(csv).join(','))].join('\n') + '\n', 'utf8');
}

const plan = buildWorkforcePlan(getDepartmentRegistry().getAllDepartments());
const out = join(process.cwd(), 'docs', 'workforce');
mkdirSync(out, { recursive: true });

writeCsv(
  join(out, 'departments.csv'),
  ['sequence', 'department_slug', 'code', 'name', 'group', 'status', 'agent_quota', 'orchestrator_agent_id', 'budget_limit', 'tools', 'knowledge_sources', 'allowed_models', 'allowed_providers'],
  plan.departments.map((d) => [
    d.sequence, d.slug, d.code, d.name, d.group, d.status, d.agentCount, d.orchestratorAgentId, d.budgetLimit,
    d.tools, d.knowledgeSources, d.allowedModels, d.allowedProviders,
  ]),
);

writeCsv(
  join(out, 'agents.csv'),
  ['agent_id', 'sequence', 'tenant', 'department_slug', 'role_key', 'role', 'type', 'name', 'model_policy', 'memory_profile', 'skills', 'allowed_tools', 'forbidden_tools', 'max_tokens_per_task', 'daily_token_budget', 'evaluation_suite', 'lifecycle_status'],
  plan.agents.map((a) => [
    a.agentId, a.sequence, 'alo-labs', a.departmentSlug, a.roleKey, a.role, a.type, a.name, a.modelConfig.policy,
    a.memoryPolicy.profile, a.allowedSkills, a.allowedTools, a.forbiddenTools, a.resourceLimits.maxTokensPerTask,
    a.resourceLimits.dailyTokenBudget, a.evaluationProfile.suiteId, a.status,
  ]),
);

writeFileSync(
  join(out, 'PLAN.json'),
  JSON.stringify(
    {
      planVersion: plan.planVersion,
      planHash: plan.planHash,
      departments: plan.departments.length,
      agents: plan.agents.length,
      agentsPerDepartment: plan.departments.map((d) => plan.agents.filter((a) => a.departmentSlug === d.slug).length)
        .every((n) => n === 20),
      lifecycleAtProvisioning: 'provisioned',
      note: 'Configuration inventory. Agents are not operational until execution verification promotes them.',
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log(`wrote ${plan.departments.length} departments and ${plan.agents.length} agents; planHash=${plan.planHash}`);
