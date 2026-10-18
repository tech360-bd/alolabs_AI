#!/usr/bin/env node
/**
 * Workflow definition checker (zero-dependency).
 *
 * Validates workflow definitions (the `workflow_id / slug / department / steps[]`
 * JSON format) against the AgentOS Workflow/WorkflowStep schema and the
 * canonical 100-department / 2,000-agent workforce in this repository.
 *
 * Usage:
 *   node scripts/check-workflow-definitions.mjs [--dir <path>] [--quiet]
 *
 * Defaults to workflows/definitions. Expects a workflows_registry.json in the
 * same directory (ignored if absent). Exit code 0 = no errors, 1 = errors.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dirArgIndex = args.indexOf('--dir');
const DEFINITIONS_DIR = dirArgIndex >= 0 && args[dirArgIndex + 1]
  ? path.resolve(args[dirArgIndex + 1])
  : path.join(ROOT, 'workflows', 'definitions');
const QUIET = args.includes('--quiet');

const errors = [];
const warnings = [];
const err = (file, message) => errors.push({ file, message });
const warn = (file, message) => warnings.push({ file, message });

// ─── Repository truth ────────────────────────────────────────────────────────

/** canonical 100 departments from src/lib/department-registry/registry.ts */
function loadCanonicalDepartments() {
  const file = path.join(ROOT, 'src', 'lib', 'department-registry', 'registry.ts');
  const source = readFileSync(file, 'utf8');
  return new Set([...source.matchAll(/departmentName:\s*'([^']+)'/g)].map((m) => m[1]));
}

/** canonical 2,000 agents from docs/workforce/agents.csv */
function loadCanonicalAgents() {
  const file = path.join(ROOT, 'docs', 'workforce', 'agents.csv');
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const nameIndex = header.indexOf('name');
  const deptIndex = header.indexOf('department_slug');
  const agents = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (cols.length <= Math.max(nameIndex, deptIndex)) continue;
    agents.set(cols[nameIndex], cols[deptIndex]);
  }
  return agents;
}

/** legacy agent templates in scripts/seed.ts (51-department seed) */
function loadLegacyAgents() {
  const file = path.join(ROOT, 'scripts', 'seed.ts');
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const agentNameTemplates');
  const end = source.indexOf('// ─── AGENT ROLES', start);
  const block = source.slice(start, end === -1 ? undefined : end);
  const names = new Set();
  for (const match of block.matchAll(/'([^']+Agent[^']*)'/g)) names.add(match[1]);
  return names;
}

/** workflow name/slug pairs already shipped by the seed scripts */
function loadSeededWorkflows() {
  const seeded = [];
  const sources = [
    { file: path.join(ROOT, 'scripts', 'seed.ts'), marker: 'const workflows = [' },
    { file: path.join(ROOT, 'scripts', 'seed-v2.ts'), marker: 'const WORKFLOWS: WorkflowDef[] = [' },
  ];
  for (const { file, marker } of sources) {
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf(marker);
    if (start === -1) continue;
    const end = source.indexOf('\n];', start);
    const block = source.slice(start, end === -1 ? undefined : end);
    for (const match of block.matchAll(/name:\s*'([^']+)',\s*slug:\s*'([^']+)'/g)) {
      seeded.push({ name: match[1], slug: match[2], source: path.basename(file) });
    }
  }
  return seeded;
}

// ─── Definition checks ───────────────────────────────────────────────────────

const REQUIRED_STRING_FIELDS = ['workflow_id', 'name', 'slug', 'description', 'department'];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const ACTION_PATTERN = /^[a-z][a-z0-9_]*$/;

function checkDefinition(file, raw) {
  let def;
  try {
    def = JSON.parse(raw);
  } catch (error) {
    err(file, `invalid JSON: ${error.message}`);
    return null;
  }
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    err(file, 'top-level value must be an object');
    return null;
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof def[field] !== 'string' || !def[field].trim()) {
      err(file, `missing or empty required string "${field}"`);
    }
  }
  if (typeof def.workflow_id === 'string' && !ID_PATTERN.test(def.workflow_id)) {
    err(file, `workflow_id "${def.workflow_id}" must be snake_case`);
  }
  if (typeof def.slug === 'string' && !SLUG_PATTERN.test(def.slug)) {
    err(file, `slug "${def.slug}" must be kebab-case`);
  }
  if (!Array.isArray(def.triggers) || def.triggers.length === 0) {
    err(file, 'triggers must be a non-empty array');
  } else {
    const seen = new Set();
    for (const trigger of def.triggers) {
      if (typeof trigger !== 'string' || !trigger.trim()) {
        err(file, 'every trigger must be a non-empty string');
        continue;
      }
      const key = trigger.toLowerCase();
      if (seen.has(key)) warn(file, `duplicate trigger "${trigger}"`);
      seen.add(key);
      if (!trigger.includes(' ') && trigger.length <= 6) {
        warn(file, `over-broad single-word trigger "${trigger}" (command matching uses substring contains)`);
      }
    }
  }

  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    err(file, 'steps must be a non-empty array');
    return def;
  }

  const stepNumbers = new Set();
  const stepActions = new Set();
  def.steps.forEach((step, index) => {
    const where = `steps[${index}]`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      err(file, `${where} must be an object`);
      return;
    }
    if (!Number.isInteger(step.step) || step.step < 1) {
      err(file, `${where}.step must be a positive integer`);
    } else if (stepNumbers.has(step.step)) {
      err(file, `duplicate step number ${step.step}`);
    } else {
      stepNumbers.add(step.step);
    }
    if (typeof step.agent !== 'string' || !step.agent.trim()) {
      err(file, `${where}.agent must be a non-empty string`);
    } else if (!/Agent$/.test(step.agent)) {
      warn(file, `${where}.agent "${step.agent}" does not end in "Agent"`);
    }
    if (typeof step.action !== 'string' || !ACTION_PATTERN.test(step.action)) {
      err(file, `${where}.action "${step.action}" must be snake_case`);
    } else if (stepActions.has(step.action)) {
      warn(file, `duplicate action "${step.action}" within workflow`);
    } else {
      stepActions.add(step.action);
    }
  });

  const numbers = [...stepNumbers].sort((a, b) => a - b);
  numbers.forEach((value, index) => {
    if (value !== index + 1) {
      err(file, `step numbers must be contiguous starting at 1 (found ${numbers.join(', ')})`);
    }
  });

  // An importer maps "agent" → Agent row; the workflow engine gets its step
  // instruction from config.instruction/config.prompt, otherwise falls back to
  // the raw action, losing the step's intent.
  for (const [index, step] of def.steps.entries()) {
    if (!step || typeof step !== 'object') continue;
    if (!step.config || (typeof step.config === 'object' && Object.keys(step.config).length === 0)) {
      warn(file, `steps[${index}] has no config.instruction — the engine will fall back to the raw action text`);
    }
  }

  return def;
}

// ─── Load ────────────────────────────────────────────────────────────────────

if (!existsSync(DEFINITIONS_DIR)) {
  console.error(`Definitions directory not found: ${DEFINITIONS_DIR}`);
  process.exit(1);
}

const files = readdirSync(DEFINITIONS_DIR).filter((f) => f.endsWith('.json')).sort();
const definitions = [];
let registry = null;

for (const file of files) {
  const fullPath = path.join(DEFINITIONS_DIR, file);
  const raw = readFileSync(fullPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    err(file, `invalid JSON: ${error.message}`);
    continue;
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.workflows)) {
    registry = { file, value: parsed };
    continue;
  }
  // checkDefinition re-parses to report format errors consistently.
  const def = checkDefinition(file, raw);
  if (def) definitions.push({ file, def });
}

if (!registry) warn('workflows_registry.json', 'registry file not found in definitions directory');

// ─── Cross-file checks ──────────────────────────────────────────────────────

const canonicalDepartments = loadCanonicalDepartments();
const canonicalAgents = loadCanonicalAgents();
const legacyAgents = loadLegacyAgents();
const seededWorkflows = loadSeededWorkflows();

const byId = new Map();
const bySlug = new Map();
const byName = new Map();

for (const { file, def } of definitions) {
  if (typeof def.workflow_id === 'string') {
    if (byId.has(def.workflow_id)) err(file, `workflow_id "${def.workflow_id}" already used by ${byId.get(def.workflow_id)}`);
    else byId.set(def.workflow_id, file);
  }
  if (typeof def.slug === 'string') {
    if (bySlug.has(def.slug)) err(file, `slug "${def.slug}" already used by ${bySlug.get(def.slug)}`);
    else bySlug.set(def.slug, file);
  }
  if (typeof def.name === 'string') {
    const key = def.name.toLowerCase();
    if (byName.has(key)) err(file, `name "${def.name}" already used by ${byName.get(key)}`);
    else byName.set(key, file);
  }

  // DB unique constraints vs. seed scripts
  const nameCollision = seededWorkflows.find((w) => w.name.toLowerCase() === String(def.name).toLowerCase());
  if (nameCollision) err(file, `name "${def.name}" collides with seeded workflow in ${nameCollision.source} (Workflow.name is @unique)`);
  const slugCollision = seededWorkflows.find((w) => w.slug === def.slug);
  if (slugCollision) err(file, `slug "${def.slug}" collides with seeded workflow in ${slugCollision.source} (Workflow.slug is @unique)`);

  // Department lookup
  if (typeof def.department === 'string') {
    if (!canonicalDepartments.has(def.department)) {
      const alias = [...canonicalDepartments].find(
        (name) => name.toLowerCase().includes(def.department.toLowerCase().split(' ')[0].toLowerCase()),
      );
      warn(file, `department "${def.department}" is not in the canonical 100-department registry${alias ? ` (closest: "${alias}")` : ''}`);
    }
  }

  // Agent lookup
  const referencedAgents = new Set();
  const missingAgents = new Set();
  for (const step of def.steps ?? []) {
    if (!step || typeof step.agent !== 'string') continue;
    referencedAgents.add(step.agent);
    if (!canonicalAgents.has(step.agent)) missingAgents.add(step.agent);
  }
  for (const agent of missingAgents) {
    const legacy = legacyAgents.has(agent) ? ' (exists only in the legacy 51-department seed)' : '';
    warn(file, `agent "${agent}" is not in the canonical 2,000-agent workforce${legacy}`);
  }
}

// ─── Registry checks ────────────────────────────────────────────────────────

if (registry) {
  const { file, value } = registry;
  if (value.total_workflows !== definitions.length) {
    err(file, `total_workflows is ${value.total_workflows} but ${definitions.length} definitions were found`);
  }
  const entries = Array.isArray(value.workflows) ? value.workflows : [];
  if (entries.length !== definitions.length) {
    err(file, `registry lists ${entries.length} workflows but ${definitions.length} definitions were found`);
  }
  const registryIds = new Set();
  const registrySlugs = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      err(file, 'registry entry must be an object');
      continue;
    }
    if (registryIds.has(entry.id)) err(file, `duplicate registry id "${entry.id}"`);
    if (registrySlugs.has(entry.slug)) err(file, `duplicate registry slug "${entry.slug}"`);
    registryIds.add(entry.id);
    registrySlugs.add(entry.slug);
    if (!byId.has(entry.id)) err(file, `registry id "${entry.id}" has no matching definition file`);
    if (!bySlug.has(entry.slug)) err(file, `registry slug "${entry.slug}" has no matching definition file`);
    const def = definitions.find((d) => d.def.workflow_id === entry.id)?.def;
    if (def && def.name !== entry.name) err(file, `registry name "${entry.name}" disagrees with definition name "${def.name}"`);
  }
  for (const [id, defFile] of byId) {
    if (!registryIds.has(id)) err(defFile, `workflow_id "${id}" is missing from the registry`);
  }
  for (const [slug, defFile] of bySlug) {
    if (!registrySlugs.has(slug)) err(defFile, `slug "${slug}" is missing from the registry`);
  }
}

// ─── Trigger overlap checks ────────────────────────────────────────────────

const triggerOwners = new Map();
for (const { file, def } of definitions) {
  for (const trigger of def.triggers ?? []) {
    if (typeof trigger !== 'string') continue;
    const key = trigger.toLowerCase();
    if (!triggerOwners.has(key)) triggerOwners.set(key, []);
    triggerOwners.get(key).push({ file, name: def.name });
  }
}
for (const [trigger, owners] of triggerOwners) {
  if (owners.length > 1) {
    err('triggers', `trigger "${trigger}" is shared by ${owners.map((o) => o.name).join(', ')}`);
  }
}
// Substring containment (e.g. "study" inside "study abroad") is resolved at
// routing time: src/lib/command-routing.ts always chooses the longest trigger,
// ties break on workflow name. It is therefore not reported here.

// ─── Totals ────────────────────────────────────────────────────────────────

const totalSteps = definitions.reduce((sum, { def }) => sum + (Array.isArray(def.steps) ? def.steps.length : 0), 0);
const allAgents = new Set();
const resolvedAgents = new Set();
for (const { def } of definitions) {
  for (const step of def.steps ?? []) {
    if (typeof step?.agent !== 'string') continue;
    allAgents.add(step.agent);
    if (canonicalAgents.has(step.agent)) resolvedAgents.add(step.agent);
  }
}

if (!QUIET) {
  console.log(`Definitions checked: ${definitions.length}`);
  console.log(`Steps: ${totalSteps}`);
  console.log(`Unique agents referenced: ${allAgents.size} (resolved to canonical workforce: ${resolvedAgents.size})`);
  console.log(`Departments: ${new Set(definitions.map(({ def }) => def.department)).size} referenced, ${definitions.filter(({ def }) => canonicalDepartments.has(def.department)).length}/${definitions.length} exact matches`);
  console.log(`Seeded workflow collisions: ${seededWorkflows.length} seed definitions compared`);
  console.log('');
}

const fileLabels = [...definitions.map(({ file }) => file), registry?.file ?? 'workflows_registry.json'];
for (const file of fileLabels) {
  const fileErrors = errors.filter((entry) => entry.file === file);
  const fileWarnings = warnings.filter((entry) => entry.file === file);
  if (!QUIET) {
    const status = fileErrors.length ? 'FAIL' : fileWarnings.length ? 'PASS (warnings)' : 'PASS';
    console.log(`${status.padEnd(16)} ${file}  ${fileErrors.length} error(s), ${fileWarnings.length} warning(s)`);
  }
}

if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const entry of errors) console.log(`  ✗ [${entry.file}] ${entry.message}`);
}
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const entry of warnings) console.log(`  ! [${entry.file}] ${entry.message}`);
}

console.log(`\nSummary: ${definitions.length} definitions, ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
