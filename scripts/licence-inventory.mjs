#!/usr/bin/env node
/**
 * Licence inventory — reads the *installed* tree, not a hand-maintained table.
 *
 * The existing docs/LICENCE_REGISTER.md asserts licence facts about this
 * project and its dependencies. An assertion in a markdown file is not
 * evidence: it goes stale the moment a dependency is bumped, and nothing fails
 * when it does. This script derives the same facts from disk so the claim can
 * be re-checked, and so the Super Admin panel can show the result of an actual
 * inspection rather than a copy of a doc.
 *
 * What it inspects:
 *   1. The repository's own LICENSE file and package.json `license` field.
 *   2. Every installed production dependency's declared licence.
 *   3. Transitive licences, flagged for copyleft and for missing declarations.
 *   4. Optional external services the platform can talk to (documented, not
 *      installed) — these are the ones that actually create obligations.
 *
 * Output: JSON on stdout (for the API) or a table with --pretty.
 *
 * Usage:
 *   node scripts/licence-inventory.mjs --pretty
 *   node scripts/licence-inventory.mjs > .arena-tmp/licences.json
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pretty = process.argv.includes('--pretty');

/** Licences that impose obligations on distribution or on a hosted service. */
const COPYLEFT = [
  'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0',
  'MPL-2.0', 'EPL-2.0', 'CDDL-1.0', 'SSPL-1.0', 'OSL-3.0',
];
const NETWORK_COPYLEFT = ['AGPL-3.0', 'SSPL-1.0'];

/** Classify a declared licence string. */
function classify(license) {
  if (!license || license === 'UNKNOWN' || license === 'UNLICENSED') return 'unknown';
  const upper = license.toUpperCase();
  if (NETWORK_COPYLEFT.some((l) => upper.includes(l))) return 'network-copyleft';
  if (COPYLEFT.some((l) => upper.includes(l))) return 'copyleft';
  if (upper.includes('PROPRIETARY') || upper.includes('COMMERCIAL')) return 'proprietary';
  if (upper.includes('CC-BY-NC') || upper.includes('NON-COMMERCIAL') || upper.includes('NONCOMMERCIAL')) return 'non-commercial';
  if (upper.includes('APACHE') || upper.includes('MIT') || upper.includes('BSD') || upper.includes('ISC') || upper.includes('0BSD')) return 'permissive';
  return 'other';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// ── 1. This repository ─────────────────────────────────────────────────────

const pkg = readJson(join(repoRoot, 'package.json')) ?? {};
const licenseFiles = readdirSync(repoRoot).filter((name) => /^(licen[cs]e|copying)/i.test(name));

const readme = existsSync(join(repoRoot, 'README.md')) ? readFileSync(join(repoRoot, 'README.md'), 'utf8') : '';
const readmeClaim = /MIT License/i.test(readme) ? 'MIT' : null;
const readmeLinksMissingFile = /\]\(LICENSE\)/.test(readme) && !licenseFiles.length;

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {
  /* not a git checkout (packaged build) */
}

const application = {
  name: pkg.name ?? 'unknown',
  version: pkg.version ?? 'unknown',
  commit,
  declaredLicense: pkg.license ?? pkg.licenses ?? null,
  licenseFiles,
  readmeClaim,
  /** The honest summary, including contradictions. */
  findings: [],
};
if (!licenseFiles.length) {
  application.findings.push(
    'No LICENSE file exists in the repository root. Without one, default copyright applies: '
    + 'nobody may legally copy, modify or redistribute the code, not even under the README\'s claimed terms.',
  );
}
if (!application.declaredLicense) {
  application.findings.push('package.json has no "license" field, so package managers and scanners report UNLICENSED.');
}
if (readmeClaim && !licenseFiles.length) {
  application.findings.push(
    `README claims "${readmeClaim}" and links to a LICENSE file that does not exist — the claim is currently unenforceable.`,
  );
}
if (readmeClaim && application.declaredLicense && readmeClaim !== application.declaredLicense) {
  application.findings.push(`README (${readmeClaim}) and package.json (${application.declaredLicense}) disagree.`);
}

// ── 2. Installed dependency tree ───────────────────────────────────────────

function dependencyOf(name, from) {
  // npm hoists most packages to the root node_modules; scoped packages live in
  // @scope/. Look in the root first, then beside the dependent, then under the
  // dependent's own node_modules (npm's nested-conflict layout).
  const candidates = [
    join(repoRoot, 'node_modules', name, 'package.json'),
    join(from, 'node_modules', name, 'package.json'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const rootModules = join(repoRoot, 'node_modules');
const dependencyRows = [];
const seen = new Set();

function visit(name, from, depth, direct) {
  const key = `${name}`;
  const manifestPath = dependencyOf(name, from);
  if (!manifestPath) return;
  const manifest = readJson(manifestPath);
  if (!manifest) return;

  if (!seen.has(key)) {
    seen.add(key);
    const declared = typeof manifest.license === 'string'
      ? manifest.license
      : Array.isArray(manifest.licenses)
        ? manifest.licenses.map((l) => (typeof l === 'string' ? l : l.type)).filter(Boolean).join(' OR ')
        : 'UNKNOWN';
    dependencyRows.push({
      name,
      version: manifest.version ?? 'unknown',
      license: declared,
      category: classify(declared),
      direct,
      depth,
      repository: typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url ?? null,
    });
  }

  if (depth >= 2) return; // two levels is enough to catch the usual suspects
  const dependencies = { ...(manifest.dependencies ?? {}) };
  for (const child of Object.keys(dependencies)) {
    visit(child, dirname(manifestPath), depth + 1, false);
  }
}

if (existsSync(rootModules)) {
  for (const name of Object.keys(pkg.dependencies ?? {})) visit(name, repoRoot, 0, true);
  for (const name of Object.keys(pkg.devDependencies ?? {})) visit(name, repoRoot, 0, true);
}

const byCategory = dependencyRows.reduce((acc, row) => {
  acc[row.category] = (acc[row.category] ?? 0) + 1;
  return acc;
}, {});

const flagged = dependencyRows.filter((row) => row.category !== 'permissive' && row.category !== 'other');

// Verify the specific claims in the existing register, so a stale doc fails loudly.
const REGISTER_CLAIMS = [
  { name: 'next', license: 'MIT' },
  { name: 'react', license: 'MIT' },
  { name: 'typescript', license: 'Apache-2.0' },
  { name: '@prisma/client', license: 'Apache-2.0' },
  { name: 'zod', license: 'MIT' },
  { name: 'tailwindcss', license: 'MIT' },
  { name: 'vitest', license: 'MIT' },
];

const claimChecks = REGISTER_CLAIMS.map((claim) => {
  const row = dependencyRows.find((candidate) => candidate.name === claim.name);
  if (!row) return { ...claim, actual: null, status: 'not-installed' };
  const same = row.license.toUpperCase().includes(claim.license.toUpperCase());
  return { ...claim, actual: row.license, status: same ? 'matches' : 'MISMATCH' };
});

// ── 3. External services (documented obligations, not installed here) ──────
//
// These create the real legal exposure for a self-hosted platform, and none of
// them is a dependency we can read from node_modules.

const externalServices = [
  {
    name: 'Ollama', role: 'Local inference runtime', license: 'MIT',
    commercialUse: 'allowed', obligation: 'None beyond attribution.',
    integrated: false, note: 'Reached over HTTP via OLLAMA_BASE_URL; not vendored.',
  },
  {
    name: 'vLLM', role: 'GPU inference server', license: 'Apache-2.0',
    commercialUse: 'allowed', obligation: 'Include NOTICE file if redistributed.',
    integrated: false, note: 'Reached over HTTP via VLLM_BASE_URL.',
  },
  {
    name: 'LiteLLM', role: 'Multi-provider gateway', license: 'MIT (core)',
    commercialUse: 'allowed', obligation: 'Some optional packages are separately licensed — check before redistributing a bundle.',
    integrated: false, note: 'Reached over HTTP via LITELLM_BASE_URL.',
  },
  {
    name: 'Qwen2.5 family', role: 'Default local weights', license: 'Apache-2.0 (most sizes)',
    commercialUse: 'allowed', obligation: 'Verify the specific model card at each pin; some sizes use the Tongyi licence.',
    integrated: false, note: 'Weights are pulled by the operator, not shipped.',
  },
  {
    name: 'Llama 3.2 family', role: 'Local weights', license: 'Meta Llama Community License',
    commercialUse: 'allowed under terms', obligation: 'NOT OSI-approved. Acceptable-use policy, 700M MAU cap, "Built with Llama" attribution.',
    integrated: false, note: 'Weights are pulled by the operator, not shipped.',
  },
  {
    name: 'ComfyUI', role: 'Image/video workflows', license: 'GPL-3.0',
    commercialUse: 'allowed', obligation: 'GPL applies to ComfyUI itself. Keep it a separate process reached over HTTP; do not link or vendor it into this codebase.',
    integrated: false, note: 'Planned; must remain an isolated service.',
  },
  {
    name: 'Aider', role: 'Coding agent', license: 'Apache-2.0',
    commercialUse: 'allowed', obligation: 'None beyond NOTICE.',
    integrated: false, note: 'Planned; runs in an isolated worker, never on the app host.',
  },
  {
    name: 'Activepieces', role: 'Workflow automation', license: 'MIT (core) / EE features separately licensed',
    commercialUse: 'core allowed', obligation: 'Enterprise-edition features are NOT free — check which features are EE before exposing them.',
    integrated: false, note: 'Planned.',
  },
  {
    name: 'NocoBase', role: 'App builder', license: 'AGPL-3.0 (core)',
    commercialUse: 'allowed with obligations', obligation: 'AGPL: if you modify it and serve it over a network, you must offer the modified source. Run unmodified as a separate service, or publish changes.',
    integrated: false, note: 'Must never read or write AgentOS Prisma tables directly.',
  },
  {
    name: 'Directus', role: 'Data platform', license: 'BSL-1.1 (changed from GPLv3)',
    commercialUse: 'restricted by revenue', obligation: 'Business Source Licence: free below an annual-revenue threshold, commercial licence above it. BSL is NOT open source until the change date.',
    integrated: false, note: 'Revenue threshold must be checked before commercial deployment.',
  },
  {
    name: 'CapRover', role: 'Hosting adapter', license: 'Apache-2.0',
    commercialUse: 'allowed', obligation: 'None beyond NOTICE.',
    integrated: false, note: 'Credentials encrypted at rest; restricted worker.',
  },
  {
    name: 'Dokku', role: 'Hosting adapter', license: 'MIT',
    commercialUse: 'allowed', obligation: 'None.',
    integrated: false, note: 'Credentials encrypted at rest; restricted worker.',
  },
];

// ── 4. Cost model — the distinction the directive asks for ─────────────────

const costModel = [
  {
    kind: 'Software licence',
    examples: 'Ollama, vLLM, LiteLLM, AgentOS itself',
    cost: 'One-off or zero',
    detail: 'No per-request charge. The obligation is compliance (attribution, copyleft), not money.',
  },
  {
    kind: 'API usage',
    examples: 'A paid OpenAI/Anthropic-compatible endpoint behind LiteLLM',
    cost: 'Per token, variable',
    detail: 'Only reachable when an administrator sets ALO_ALLOW_REMOTE_MODELS=true and configures a paid provider. Never required for the platform to function.',
  },
  {
    kind: 'Infrastructure',
    examples: 'GPU host, storage, egress',
    cost: 'Per hour / per GB',
    detail: 'The dominant cost of a self-hosted deployment. Independent of request volume at idle.',
  },
];

// ── Output ─────────────────────────────────────────────────────────────────

const inventory = {
  generatedAt: new Date().toISOString(),
  application,
  dependencies: {
    total: dependencyRows.length,
    byCategory,
    flagged,
    registerClaims: claimChecks,
  },
  externalServices,
  costModel,
  summary: {
    directDependencies: (Object.keys(pkg.dependencies ?? {}).length),
    devDependencies: (Object.keys(pkg.devDependencies ?? {}).length),
    copyleftInTree: dependencyRows.filter((r) => r.category === 'copyleft' || r.category === 'network-copyleft').length,
    unknownLicenses: dependencyRows.filter((r) => r.category === 'unknown').length,
    applicationLicenceResolved: Boolean(application.declaredLicense && licenseFiles.length),
  },
};

if (pretty) {
  console.log(`\nALO Open AI Platform — licence inventory`);
  console.log(`Generated ${inventory.generatedAt}`);
  console.log(`\nApplication: ${application.name}@${application.version} (${application.commit.slice(0, 12)})`);
  console.log(`  declared licence : ${application.declaredLicense ?? 'NONE'}`);
  console.log(`  LICENSE file     : ${licenseFiles.join(', ') || 'MISSING'}`);
  console.log(`  README claims    : ${readmeClaim ?? 'nothing'}`);
  if (application.findings.length) {
    console.log('\n  Findings:');
    for (const finding of application.findings) console.log(`   ! ${finding}`);
  }
  console.log(`\nDependencies: ${inventory.dependencies.total} inspected`);
  for (const [category, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${category.padEnd(18)} ${count}`);
  }
  if (flagged.length) {
    console.log('\n  Non-permissive:');
    for (const row of flagged.slice(0, 20)) {
      console.log(`   ${row.category.padEnd(17)} ${row.name}@${row.version} (${row.license})`);
    }
  }
  console.log('\nRegister claims re-checked against the installed tree:');
  for (const check of claimChecks) {
    const mark = check.status === 'matches' ? 'ok  ' : 'FAIL';
    console.log(`  ${mark} ${check.name.padEnd(16)} claimed ${check.license} · actual ${check.actual ?? 'not installed'} (${check.status})`);
  }
  console.log('\nExternal services (obligations that actually matter):');
  for (const service of externalServices) {
    console.log(`  ${service.name.padEnd(16)} ${service.license}`);
    console.log(`    ${service.obligation}`);
  }
  console.log('');
} else {
  process.stdout.write(JSON.stringify(inventory, null, 2));
}
