#!/usr/bin/env node
/**
 * Workflow linter for .github/workflows.
 *
 * Encodes the rules that are easy to get wrong by hand and expensive to
 * discover in a failed run:
 *
 *   1. Every third-party and first-party action is pinned to a full 40-char
 *      commit SHA rather than a moving tag, so a compromised upstream tag
 *      cannot change what this repository executes.
 *      https://docs.github.com/en/actions/reference/security/secure-use
 *   2. Context availability. `secrets` is NOT usable in `jobs.<job_id>.if`,
 *      and `steps` is not usable in `jobs.<job_id>.strategy`. Referencing a
 *      context outside its allowed keys makes the workflow fail to run at all.
 *      https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability
 *   3. Least privilege: a top-level `permissions:` block.
 *   4. Every job has `timeout-minutes`, so a hung runner cannot burn the
 *      6-hour default at full price (10x on macOS).
 *
 * Exit code 1 on any finding, so it can gate CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// js-yaml is not a direct dependency of this package; it is installed because
// eslint depends on @eslint/eslintrc, which depends on js-yaml. Resolving it
// through require keeps that contract explicit, and failing loudly here is
// better than a confusing "Cannot find package" deep in the lint run.
let yaml;
try {
  yaml = createRequire(import.meta.url)('js-yaml');
} catch {
  console.error(
    'scripts/validate-workflows.mjs: could not resolve `js-yaml`.\n' +
      'It is expected to be present via eslint -> @eslint/eslintrc -> js-yaml.\n' +
      'Run the dependency install step first (`bun install --frozen-lockfile`),\n' +
      'or add js-yaml as an explicit devDependency.',
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDir = path.join(root, '.github/workflows');
const SHA = /^[0-9a-f]{40}$/;

/** Contexts allowed per workflow key, from the official context-availability table. */
const ALLOWED = {
  'concurrency': ['github', 'inputs', 'vars'],
  'env': ['github', 'secrets', 'inputs', 'vars'],
  'jobs.*.if': ['github', 'needs', 'vars', 'inputs'],
  'jobs.*.runs-on': ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'],
  'jobs.*.timeout-minutes': ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'],
  'jobs.*.env': ['github', 'needs', 'strategy', 'matrix', 'vars', 'secrets', 'inputs'],
  'jobs.*.strategy': ['github', 'needs', 'vars', 'inputs'],
  'jobs.*.services': ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'],
  'jobs.*.services.env': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'inputs'],
  'jobs.*.services.credentials': ['github', 'needs', 'strategy', 'matrix', 'env', 'vars', 'secrets', 'inputs'],
  'jobs.*.container': ['github', 'needs', 'strategy', 'matrix', 'vars', 'inputs'],
  'jobs.*.container.env': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'inputs'],
  'jobs.*.outputs': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'steps', 'inputs'],
  'jobs.*.steps.if': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'steps', 'inputs'],
  'jobs.*.steps.env': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'steps', 'inputs'],
  'jobs.*.steps.with': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'steps', 'inputs'],
  'jobs.*.steps.run': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'steps', 'inputs'],
  'jobs.*.steps.name': ['github', 'needs', 'strategy', 'matrix', 'job', 'runner', 'env', 'vars', 'secrets', 'steps', 'inputs'],
};

const CONTEXT_NAMES = new Set(Object.values(ALLOWED).flat());

/** Extract `${{ ... }}` bodies; `if:` values may also be bare expressions. */
function expressions(value, { bareIsExpression = false } = {}) {
  if (typeof value !== 'string') return [];
  const out = [];
  for (const m of value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) out.push(m[1]);
  if (!out.length && bareIsExpression && /[=!<>]=|&&|\|\|/.test(value)) out.push(value);
  return out;
}

function contextsIn(expr) {
  const found = new Set();
  for (const m of expr.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\.|\[)/g)) {
    if (CONTEXT_NAMES.has(m[1])) found.add(m[1]);
  }
  return found;
}

function checkContexts(problems, key, value, where, { bareIsExpression = false } = {}) {
  const allowed = ALLOWED[key];
  if (!allowed) return;
  for (const expr of expressions(value, { bareIsExpression })) {
    for (const ctx of contextsIn(expr)) {
      if (!allowed.includes(ctx)) {
        problems.push(
          `${where}: \`${ctx}\` is not available in \`${key}\` ` +
            `(allowed: ${allowed.join(', ')}) — expression: ` +
            '${{' + expr.trim() + '}}',
        );
      }
    }
  }
}

let findings = 0;
const files = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).sort();

for (const file of files) {
  const full = path.join(workflowsDir, file);
  const problems = [];
  const raw = fs.readFileSync(full, 'utf8');
  // SHAs whose `uses:` line carries a `# vN` comment. YAML drops comments, so
  // this readability check has to read the raw text rather than the parsed doc.
  const commentedShas = new Set(
    [...raw.matchAll(/@([0-9a-f]{40})\s*#\s*v?\d/g)].map((m) => m[1]),
  );
  let doc;
  try {
    doc = yaml.load(raw);
  } catch (err) {
    console.log(`FAIL  ${file}\n        - YAML parse error: ${err.message}`);
    findings++;
    continue;
  }

  const jobs = doc?.jobs ?? {};
  const triggers = doc?.on ?? doc?.[true];

  if (!triggers) problems.push('missing `on:` trigger');
  if (!Object.keys(jobs).length) problems.push('no jobs defined');
  if (!doc?.permissions) problems.push('missing top-level `permissions:` (least privilege)');

  checkContexts(problems, 'concurrency', doc?.concurrency?.group, 'concurrency');
  for (const [k, v] of Object.entries(doc?.env ?? {})) checkContexts(problems, 'env', v, `env.${k}`);

  for (const [jobId, job] of Object.entries(jobs)) {
    const at = `jobs.${jobId}`;
    if (!job?.['runs-on'] && !job?.uses) problems.push(`${at}: no runs-on and no reusable-workflow uses`);
    if (!job?.steps?.length && !job?.uses) problems.push(`${at}: no steps`);
    if (!job?.['timeout-minutes']) problems.push(`${at}: no timeout-minutes (a hung job burns the 6h default)`);

    checkContexts(problems, 'jobs.*.if', job?.if, `${at}.if`, { bareIsExpression: true });
    checkContexts(problems, 'jobs.*.runs-on', job?.['runs-on'], `${at}.runs-on`);
    for (const [k, v] of Object.entries(job?.env ?? {})) checkContexts(problems, 'jobs.*.env', v, `${at}.env.${k}`);
    for (const [k, v] of Object.entries(job?.strategy ?? {})) checkContexts(problems, 'jobs.*.strategy', v, `${at}.strategy.${k}`);

    // Service containers: `options` sits under jobs.*.services (no `env`
    // context) while `env`/`credentials` sit under keys that do allow it.
    for (const [svc, def] of Object.entries(job?.services ?? {})) {
      const sat = `${at}.services.${svc}`;
      checkContexts(problems, 'jobs.*.services', def?.image, `${sat}.image`);
      checkContexts(problems, 'jobs.*.services', def?.options, `${sat}.options`);
      for (const [k, v] of Object.entries(def?.env ?? {})) checkContexts(problems, 'jobs.*.services.env', v, `${sat}.env.${k}`);
      for (const [k, v] of Object.entries(def?.credentials ?? {})) checkContexts(problems, 'jobs.*.services.credentials', v, `${sat}.credentials.${k}`);
    }
    for (const [k, v] of Object.entries(job?.container?.env ?? {})) checkContexts(problems, 'jobs.*.container.env', v, `${at}.container.env.${k}`);
    checkContexts(problems, 'jobs.*.container', job?.container?.image, `${at}.container.image`);
    for (const [k, v] of Object.entries(job?.outputs ?? {})) checkContexts(problems, 'jobs.*.outputs', v, `${at}.outputs.${k}`);

    for (const [i, step] of (job?.steps ?? []).entries()) {
      const sat = `${at}.steps[${i}]${step?.name ? ` "${step.name}"` : ''}`;
      if (step?.uses) {
        const [name, ref] = String(step.uses).split('@');
        if (!SHA.test(ref ?? '')) {
          problems.push(`${sat}: \`${step.uses}\` is not pinned to a 40-char commit SHA`);
        } else if (!commentedShas.has(ref)) {
          // A trailing `# vN` comment keeps the pin readable and reviewable.
          // YAML strips comments, so this has to be checked against the raw text.
          problems.push(`${sat}: pinned \`${name}\` has no \`# vN\` comment naming the tag`);
        }
      }
      if (!step?.uses && !step?.run) problems.push(`${sat}: step has neither \`run\` nor \`uses\``);
      checkContexts(problems, 'jobs.*.steps.if', step?.if, `${sat}.if`, { bareIsExpression: true });
      for (const [k, v] of Object.entries(step?.env ?? {})) checkContexts(problems, 'jobs.*.steps.env', v, `${sat}.env.${k}`);
      for (const [k, v] of Object.entries(step?.with ?? {})) checkContexts(problems, 'jobs.*.steps.with', v, `${sat}.with.${k}`);
      checkContexts(problems, 'jobs.*.steps.name', step?.name, `${sat}.name`);
    }
  }

  if (problems.length) {
    console.log(`FAIL  ${file}`);
    for (const p of problems) console.log(`        - ${p}`);
    findings++;
  } else {
    console.log(`ok    ${file}  (${Object.keys(jobs).length} job(s))`);
  }
}

if (findings) {
  console.error(`\n${findings} workflow file(s) failed validation`);
  process.exit(1);
}
console.log(`\nAll ${files.length} workflows valid`);
