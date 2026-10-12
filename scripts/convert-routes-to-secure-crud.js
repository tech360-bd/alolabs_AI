/**
 * One-off maintenance script (not part of the runtime).
 *
 * Converts the hand-written "generated style" CRUD routes — inline session
 * check, paginated list, create/update/delete by id, no tenant filter and no
 * role check — into declarative `secureCrud` routes.
 *
 * It only rewrites routes that match the exact generated shape, and it prints
 * every file it touches so the result can be reviewed file by file.
 *
 * Usage: node scripts/convert-routes-to-secure-crud.js [--write]
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');

/**
 * Per-resource authorisation policy.
 *
 * `writeRoles` is the allowlist for create/update/delete. Reads stay open to
 * any authenticated member of a tenant (the previous behaviour), writes now
 * require a role that is allowed to change that resource.
 *
 * Resources whose table has no `companyId` column cannot be row-filtered;
 * they are listed in `NO_TENANT_COLUMN` and additionally reported as a schema
 * gap (additive migration required) in the security report.
 */
const OPERATOR_WRITE = ['super_admin', 'admin', 'manager', 'operator'];
const ADMIN_WRITE = ['super_admin', 'admin'];

const POLICY = {
  'agent-company-access': { resource: 'agent.company-access', write: ADMIN_WRITE, tenant: true },
  'agent-performance': { resource: 'agent.performance', write: OPERATOR_WRITE },
  'agent-permissions': { resource: 'agent.permissions', write: ADMIN_WRITE },
  'agent-status-history': { resource: 'agent.status-history', write: OPERATOR_WRITE },
  'agent-usage-summaries': { resource: 'agent.usage-summaries', write: OPERATOR_WRITE },
  'agent-versions': { resource: 'agent.versions', write: OPERATOR_WRITE },
  'automation-suggestions': { resource: 'automation.suggestions', write: OPERATOR_WRITE },
  'company-memory': { resource: 'company.memory', write: OPERATOR_WRITE, tenant: true },
  'company-usage-summaries': { resource: 'company.usage-summaries', write: OPERATOR_WRITE, tenant: true },
  'crm/notes': { resource: 'crm.notes', write: OPERATOR_WRITE, ownership: { delegate: 'crmContact', fk: 'contactId', relation: 'contact' } },
  'department-memory': { resource: 'department.memory', write: OPERATOR_WRITE },
  'feature-flags': { resource: 'admin.feature-flags', write: ADMIN_WRITE },
  'model-assignments': { resource: 'admin.model-assignments', write: ADMIN_WRITE },
  'model-health': { resource: 'model.health', write: OPERATOR_WRITE },
  'rag/feedback': { resource: 'rag.feedback', write: OPERATOR_WRITE, tenant: true },
  'skill-permissions': { resource: 'skill.permissions', write: ADMIN_WRITE },
  'skill-validation-logs': { resource: 'skill.validation-logs', write: OPERATOR_WRITE },
  'skill-versions': { resource: 'skill.versions', write: OPERATOR_WRITE },
  'sop-updates': { resource: 'admin.sop-updates', write: ADMIN_WRITE },
  'task-errors': { resource: 'task.errors', write: OPERATOR_WRITE },
  'tool-approvals': { resource: 'tool.approvals', write: ADMIN_WRITE },
  'tool-runs': { resource: 'tool.runs', write: OPERATOR_WRITE },
  'workflow-improvements': { resource: 'workflow.improvements', write: OPERATOR_WRITE },
  'workflow-steps': { resource: 'workflow.steps', write: OPERATOR_WRITE },
  'workflow-usage-summaries': { resource: 'workflow.usage-summaries', write: OPERATOR_WRITE },
};

function extractSchema(source, name) {
  const match = source.match(new RegExp(`const ${name} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\);`));
  return match ? match[1] : null;
}

function extractSearch(source) {
  const match = source.match(/buildWhereClause\(\[([^\]]*)\]/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function findRoutes() {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') files.push(full);
    }
  })(path.join(ROOT, 'src/app/api'));
  return files;
}

const converted = [];
const skipped = [];

for (const file of findRoutes().sort()) {
  const source = fs.readFileSync(file, 'utf8');
  const isGenerated = /paginatedResponse/.test(source) && /buildWhereClause/.test(source) && /verifySessionToken/.test(source);
  if (!isGenerated) continue;

  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  const key = relative.replace('src/app/api/', '').replace('/route.ts', '');
  const policy = POLICY[key];
  const delegate = [...source.matchAll(/db\.(\w+)\.(findMany|count|create|update|delete)/g)].map((m) => m[1])[0];
  const createBody = extractSchema(source, 'createSchema');
  const updateBody = extractSchema(source, 'updateSchema');

  if (!policy || !delegate || !createBody || !updateBody) {
    skipped.push(`${relative} (policy=${!!policy} delegate=${delegate} create=${!!createBody} update=${!!updateBody})`);
    continue;
  }

  const label = delegate.charAt(0).toUpperCase() + delegate.slice(1);
  const search = extractSearch(source);
  const lines = [
    "import { z } from 'zod';",
    "import { secureCrud } from '@/lib/api/secure-crud';",
    '',
    '/**',
    ` * ${policy.resource} — authenticated, authorised, audited and rate limited.`,
    ' *',
    ' * Replaces a hand-written route that verified a session token inline but',
    ' * applied no role check and no tenant scope to the queries below.',
    ' */',
    '',
    `const createSchema = z.object({${createBody}\n});`,
    '',
    `const updateSchema = z.object({${updateBody}\n});`,
    '',
    'export const { GET, POST, PUT, DELETE } = secureCrud({',
    `  resource: '${policy.resource}',`,
    `  model: '${delegate}',`,
    `  label: '${label}',`,
  ];
  if (!policy.tenant && !policy.ownership) lines.push('  // This table has no tenant column of its own — see the security report.');
  if (!policy.tenant) lines.push('  tenantField: null,');
  if (policy.ownership) {
    lines.push(
      `  ownership: { delegate: '${policy.ownership.delegate}', fk: '${policy.ownership.fk}', relation: '${policy.ownership.relation}' },`
    );
  }
  lines.push('  createSchema,');
  lines.push('  updateSchema,');
  if (search.length) lines.push(`  searchFields: [${search.map((field) => `'${field}'`).join(', ')}],`);
  lines.push(`  writeRoles: [${policy.write.map((role) => `'${role}'`).join(', ')}],`);
  lines.push('});');
  lines.push('');

  const output = lines.join('\n');
  if (WRITE) fs.writeFileSync(file, output);
  converted.push(relative);
}

console.log(`converted: ${converted.length}`);
for (const file of converted) console.log(`  ${WRITE ? 'wrote' : 'would write'} ${file}`);
if (skipped.length) {
  console.log(`\nskipped (needs manual review): ${skipped.length}`);
  for (const entry of skipped) console.log(`  ${entry}`);
}
