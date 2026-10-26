#!/usr/bin/env node
/**
 * validate-workflow-security — CI guard for GitHub Actions hygiene.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three separate defects in this repository's workflows were found by hand and
 * would silently return:
 *
 *  1. Every action was referenced by a MUTABLE tag (`actions/checkout@v4`,
 *     `appleboy/ssh-action@v1`, ...). A tag can be re-pointed at any commit by
 *     whoever controls the third-party repo, so a compromised upstream becomes
 *     code execution inside a job that holds the production SSH key.
 *  2. `ci.yml` declared no `permissions:` block, so its `GITHUB_TOKEN`
 *     inherited the repository default, which may be write.
 *  3. `docs/CI-CD-GUIDE.md` documented `DEPLOY_HOST` / `DEPLOY_USER` /
 *     `DEPLOY_SSH_KEY`, while the workflows actually read `PRODUCTION_HOST` /
 *     `PRODUCTION_USER` / `PRODUCTION_SSH_KEY` / `PRODUCTION_PORT`. Following
 *     the guide created three secrets nothing reads and omitted one that is
 *     mandatory, so the deploy failed its own secret-validation step.
 *
 * Checks A-C below make each of those a build failure. Check D enforces the
 * official guidance to pass secrets through `env:` rather than interpolating
 * them straight into a shell script.
 *
 * This script is dependency-free on purpose: bun.lock cannot be regenerated in
 * restricted environments and CI runs `bun install --frozen-lockfile`, so a
 * YAML library is not available here. It is a deliberate line-based scan, not a
 * YAML parser — which is why it fails loudly if it finds nothing to scan.
 *
 * Refs (official documentation):
 *   https://docs.github.com/en/actions/reference/security/secure-use
 *   https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
 *   https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WF_DIR = '.github/workflows';
const DOC = 'docs/CI-CD-GUIDE.md';

/** Secrets GitHub provides automatically; never need documenting. */
const AUTO_SECRETS = new Set(['GITHUB_TOKEN']);

/** A pinned action ref is a full-length commit SHA, not a tag or branch. */
const PINNED = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;

const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
};

function readWorkflows() {
  if (!existsSync(WF_DIR)) {
    console.error(`validate-workflow-security: ${WF_DIR} does not exist`);
    process.exit(1);
  }
  const files = readdirSync(WF_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
  if (files.length === 0) {
    // Refuse to pass vacuously: an empty scan is not a green result.
    console.error(`validate-workflow-security: no workflow files found in ${WF_DIR}`);
    process.exit(1);
  }
  return files.map((f) => ({ name: f, path: join(WF_DIR, f), text: readFileSync(join(WF_DIR, f), 'utf8') }));
}

const indentOf = (line) => line.match(/^\s*/)[0].length;

/**
 * Collect the lines belonging to a `run:` block scalar, so check D does not
 * mistake an unrelated `with:` value for shell code.
 */
function runBlockLines(lines, startIdx) {
  const keyIndent = indentOf(lines[startIdx]);
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      out.push({ idx: i, text: line });
      continue;
    }
    if (indentOf(line) <= keyIndent) break;
    out.push({ idx: i, text: line });
  }
  return out;
}

const workflows = readWorkflows();
const violations = [];
let actionCount = 0;
let pinnedCount = 0;
const secretsUsed = new Map(); // name -> [file:line]

for (const wf of workflows) {
  const lines = wf.text.split('\n');

  // ---- Check A: every action pinned to an immutable commit SHA -------------
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)\s*(?:#.*)?$/);
    if (!m) return;
    const ref = m[1];
    // Local, same-repository actions (./path) have no upstream to pin.
    if (ref.startsWith('./') || ref.startsWith('docker://')) return;
    actionCount++;
    if (PINNED.test(ref)) {
      pinnedCount++;
    } else {
      violations.push(
        `${wf.name}:${i + 1} action is not pinned to a full commit SHA: ${ref}. ` +
          `A mutable tag can be re-pointed at any commit upstream, and these jobs hold ` +
          `production credentials. Resolve the current SHA with: ` +
          `gh api repos/${ref.split('@')[0]}/commits/${ref.split('@')[1]} --jq .sha`
      );
    }
  });

  // ---- Check B: least-privilege permissions --------------------------------
  const hasTopLevel = lines.some((l) => /^permissions:/.test(l));
  if (!hasTopLevel) {
    // Find each job under a column-0 `jobs:` and require job-level permissions.
    const jobsStart = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    if (jobsStart === -1) {
      violations.push(`${wf.name}: no top-level permissions: block and no jobs: to inspect`);
    } else {
      const jobIdx = [];
      for (let i = jobsStart + 1; i < lines.length; i++) {
        if (/^[A-Za-z0-9_#]/.test(lines[i]) && lines[i].trim() !== '') break; // next top-level key
        const m = lines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
        if (m) jobIdx.push({ name: m[1], idx: i });
      }
      for (const job of jobIdx) {
        const body = runBlockLines(lines, job.idx);
        const hasJobPerms = body.some(({ text }) => /^\s{4}permissions:/.test(text));
        if (!hasJobPerms) {
          violations.push(
            `${wf.name}: job '${job.name}' has no permissions: block and the workflow has no ` +
              `top-level default. The GITHUB_TOKEN then inherits the repository default, which ` +
              `may be write. Add 'permissions:\\n  contents: read' at the top of the workflow.`
          );
        }
      }
    }
  }

  // ---- Check C+D: secrets --------------------------------------------------
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) {
      const name = m[1];
      if (!secretsUsed.has(name)) secretsUsed.set(name, []);
      secretsUsed.get(name).push(`${wf.name}:${i + 1}`);
    }
    if (/^\s*(?:-\s*)?run:/.test(line)) {
      // The secret may be interpolated on the `run:` line itself (inline scalar)
      // or on any following, more-indented line (block scalar). Checking only
      // the block lines silently misses `run: echo ${{ secrets.FOO }}`, which is
      // the common form — that was a false pass in the first version of this
      // guard, caught by probing each check individually.
      const inline = line.replace(/^\s*(?:-\s*)?run:/, '');
      const candidates = [{ idx: i, text: inline }, ...runBlockLines(lines, i)];
      for (const { idx, text } of candidates) {
        if (/\$\{\{\s*secrets\./.test(text)) {
          violations.push(
            `${wf.name}:${idx + 1} interpolates a secret directly into a shell script. ` +
              `Pass it through the step's env: block and reference "$VAR" instead, so the ` +
              `value cannot alter shell parsing and is not exposed by \`set -x\`.`
          );
          break;
        }
      }
    }
  });
}

// ---- Check C: every secret used by a workflow is documented -----------------
const docText = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';
if (!docText) {
  violations.push(`${DOC} is missing — secret names cannot be reconciled against the documentation`);
}
const undocumented = [];
for (const [name, sites] of secretsUsed) {
  if (AUTO_SECRETS.has(name)) continue;
  if (!docText.includes(name)) undocumented.push(`${name} (used at ${sites.join(', ')})`);
}
if (undocumented.length) {
  violations.push(
    `secret(s) referenced by workflows but never mentioned in ${DOC}: ${undocumented.join('; ')}. ` +
      `This is how the DEPLOY_*/PRODUCTION_* drift happened — the documented names did not exist.`
  );
}

// ---- report ----------------------------------------------------------------
const secretNames = [...secretsUsed.keys()].sort();
console.log(
  `validate-workflow-security: ${workflows.length} workflow(s), ${actionCount} action reference(s) ` +
    `(${pinnedCount} pinned), ${secretNames.length} distinct secret(s): ${secretNames.join(', ') || 'none'}`
);

if (violations.length) {
  console.error(`validate-workflow-security: FAILED with ${violations.length} violation(s)`);
  for (const v of violations) fail(v);
  process.exit(1);
}
console.log('validate-workflow-security: OK — actions pinned, permissions least-privilege, secrets documented');
process.exit(0);
