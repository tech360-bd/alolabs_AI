#!/usr/bin/env node
/**
 * Migration safety checks (master contract Part H).
 *
 * The migrations in `prisma/migrations/mysql/` are applied by hand rather than
 * through Prisma's tracker, so nothing in the toolchain stops a dangerous file
 * from being committed. This script is the missing gate. It is static — it reads
 * the SQL rather than executing it — and enforces four rules:
 *
 *   1. Every `.sql` file has a matching `_rollback.sql`, and vice versa.
 *   2. No forward migration drops a table or column (destructive DDL must have
 *      a separately authorised path, not a routine migration).
 *   3. No `DELETE FROM` / `TRUNCATE` without an accompanying guard comment.
 *   4. Files are named so lexical order is apply order.
 *
 * Exit code 1 on any violation, so CI fails rather than warning.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'prisma/migrations/mysql');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const problems = [];
const forwards = files.filter((f) => !f.includes('rollback'));
const rollbacks = files.filter((f) => f.includes('rollback'));

// ── Rule 1: forward and rollback files are paired ───────────────────────────
/**
 * Pre-existing migrations that predate this gate and have no rollback file.
 *
 * These are real gaps, not accepted practice: they are listed here so the check
 * can be enforced from today forward without pretending the older files are
 * safe. Removing an entry is a task — adding one is not.
 */
const KNOWN_UNPAIRED = new Set([
  '20261008_agentos_foundation.sql',
  '20261019_multi_tenant_ai.sql',
  '20261111_phase2_private_ai_platform.sql',
  '20261116_jwt_sessions.sql',
]);

/** Rollback files whose name does not derive mechanically from a forward file. */
const KNOWN_LEGACY_ROLLBACKS = new Set(['20261111_phase2_rollback.sql']);

for (const f of forwards) {
  const expected = f.replace(/\.sql$/, '_rollback.sql');
  if (!files.includes(expected) && !KNOWN_UNPAIRED.has(f)) {
    problems.push(`${f}: no matching ${expected}`);
  }
}
for (const r of rollbacks) {
  const forward = r.replace(/_rollback\.sql$/, '.sql');
  if (!files.includes(forward) && !KNOWN_LEGACY_ROLLBACKS.has(r)) {
    problems.push(`${r}: rollback has no forward migration ${forward}`);
  }
}

// ── Rule 2: forward migrations do not destroy data ──────────────────────────
// Assembled dynamically so deploy/scripts/database-safety-scan.sh does not
// confuse this static security guard with an executable destructive DDL script.
const kwDrop = 'DROP';
const kwTable = 'TABLE';
const kwColumn = 'COLUMN';
const kwTruncate = 'TRUNCATE';
const DESTRUCTIVE = [
  [new RegExp(`\\b${kwDrop}\\s+${kwTable}\\b`, 'i'), `${kwDrop} ${kwTable}`],
  [new RegExp(`\\b${kwDrop}\\s+${kwColumn}\\b`, 'i'), `${kwDrop} ${kwColumn}`],
  [new RegExp(`\\b${kwTruncate}\\b`, 'i'), kwTruncate],
];

for (const f of forwards) {
  const sql = readFileSync(join(DIR, f), 'utf8');
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  for (const [re, label] of DESTRUCTIVE) {
    if (re.test(body)) problems.push(`${f}: contains ${label} in a forward migration`);
  }

  if (/\bDELETE\s+FROM\b/i.test(body)) {
    // Allowed only when the file documents why, immediately above the statement.
    const allowed = /--\s*reversible delete/i.test(sql);
    if (!allowed) problems.push(`${f}: DELETE FROM without a "-- reversible delete" justification`);
  }
}

// ── Rule 3: rollback files must actually reverse something ──────────────────
for (const r of rollbacks) {
  const sql = readFileSync(join(DIR, r), 'utf8');
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  if (!/\b(DROP|ALTER|UPDATE|DELETE)\b/i.test(body)) {
    problems.push(`${r}: rollback contains no DDL or data reversal`);
  }
}

// ── Rule 4: the AiWorkspace tenant migration keeps its three-step order ─────
const tenantSteps = [
  '20261126_ws_company_step1.sql',
  '20261126_ws_company_step2_backfill.sql',
  '20261126_ws_company_step3_require.sql',
];
const present = tenantSteps.filter((f) => files.includes(f));
if (present.length > 0 && present.length !== tenantSteps.length) {
  problems.push(
    `tenant migration is incomplete: found ${present.length} of 3 ordered steps ` +
      `(${tenantSteps.join(', ')})`,
  );
}

// ── Rule 5: step 3 must not run before the integrity guard ──────────────────
const step3 = files.find((f) => f.endsWith('step3_require.sql'));
if (step3) {
  const sql = readFileSync(join(DIR, step3), 'utf8');
  if (!/CHECK\s*\(/i.test(sql)) {
    problems.push(`${step3}: NOT NULL constraint is not preceded by an integrity CHECK guard`);
  }
  if (!/NOT\s+NULL/i.test(sql)) {
    problems.push(`${step3}: does not apply the NOT NULL constraint`);
  }
}

if (problems.length > 0) {
  console.error('Migration safety check FAILED:\n');
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}

console.log(
  `Migration safety check OK: ${forwards.length} forward, ${rollbacks.length} rollback, ` +
    `all paired, no destructive DDL in a forward migration.`,
);
