#!/usr/bin/env node
/**
 * Classify every API route by its authorisation mechanism.
 *
 * The master contract (Part D) says no protected route may be left
 * unclassified. That is only checkable if classification is mechanical: this
 * script reads each `route.ts`, matches it against the mechanisms that actually
 * exist in the codebase, and exits non-zero if any route falls through.
 *
 * Run with `--audit` for the human report, or as a CI gate (exit 1 on any
 * route that is neither recognised as public nor assigned a mechanism).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const API = join(ROOT, 'src/app/api');

/**
 * Mechanisms, in precedence order. A route is classified by the first that
 * matches, so wrapper-based auth wins over a stray `requireAuth` import.
 */
const MECHANISMS = [
  // A shared machine bearer token (`src/lib/api/machine-auth.ts`), constant-time
  // compared and fail-closed when unconfigured. It protects infrastructure routes
  // called by workflows rather than by a person.
  ['machine-token', /\brequireMachineToken\b/],
  ['secureRoute', /\bsecureRoute\b/],
  ['secureCrud', /\bsecureCrud\b/],
  ['internalRoute', /\binternalRoute\b/],
  ['clientRoute', /\bclientRoute\b/],
  ['v1Handler', /\bv1Handler\b/],
  ['platformHandler', /\bplatformHandler\b|\bplatformRoute\b/],
  ['withCompany', /\bwithCompany\b/],
  ['mail-session', /\bauthenticateMailSession\b/],
  ['requireAuth-family', /\brequireAuth\b|\brequireCompanyAuth\b|\brequireRole\b|\brequireCompanyAdmin\b/],
  // `legacyTenant` wraps session verification AND resolves a live CompanyUser
  // membership, so it is a stricter mechanism than a bare session check.
  ['legacyTenant', /\blegacyTenant\b/],
  ['own-session', /\bverifySessionToken\b|\bgetAuthUser\b|\bgetServerSession\b|\bauthenticateBearerSession\b/],
];

/**
 * Routes that are intentionally unauthenticated.
 *
 * Each entry needs a reason; "it has no auth" is not one. Anything not listed
 * here and not matching a mechanism is reported as a gap.
 */
const PUBLIC = [
  [/^\.\/auth\/login\/route\.ts$/, 'sign-in endpoint'],
  [/^\.\/auth\/register\/route\.ts$/, 'sign-up endpoint'],
  [/^\.\/auth\/logout\/route\.ts$/, 'session revocation; idempotent'],
  [/^\.\/auth\/password-reset\/route\.ts$/, 'recovery flow, token-gated'],
  [/^\.\/auth\/oauth\//, 'third-party handshake'],
  [/^\.\/auth\/mfa\/resend\/route\.ts$/, 'pre-auth challenge resend'],
  [/^\.\/health\//, 'liveness/readiness probes'],
  [/^\.\/health\/route\.ts$/, 'health probe'],
  [/^\.\/v1\/health\/route\.ts$/, 'health probe'],
  [/^\.\/v1\/ai\/health\/route\.ts$/, 'health probe'],
  [/^\.\/v1\/platform\/health\/route\.ts$/, 'health probe'],
  [/^\.\/public\//, 'deliberately public marketing surface'],
  [/^\.\/free-resources\/route\.ts$/, 'public lead magnet'],
  [/^\.\/open-source-models\/route\.ts$/, 'public catalogue'],
  [/^\.\/ecosystem\/route\.ts$/, 'public stack register; static catalogue, no tenant data'],
  [/^\.\/ecosystem\/\[slug\]\/route\.ts$/, 'public stack register detail; static catalogue, no tenant data'],
  [/^\.\/seo\/route\.ts$/, 'crawler metadata'],
  [/^\.\/whatsapp\/webhook\/route\.ts$/, 'provider callback, signature-verified'],
  [/^\.\/voice\/telephony\/webhook\/route\.ts$/, 'provider callback, signature-verified'],
  [/^\.\/social\/webhooks\//, 'provider callback, signature-verified'],
  [/^\.\/email\/track\/open\//, 'open-pixel beacon'],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const files = walk(API).sort();
const buckets = new Map();
const gaps = [];

for (const file of files) {
  const rel = './' + relative(API, file);
  const src = readFileSync(file, 'utf8');
  const hit = MECHANISMS.find(([, re]) => re.test(src));
  if (hit) {
    if (!buckets.has(hit[0])) buckets.set(hit[0], []);
    buckets.get(hit[0]).push(rel);
    continue;
  }
  const pub = PUBLIC.find(([re]) => re.test(rel));
  if (pub) {
    if (!buckets.has('public')) buckets.set('public', []);
    buckets.get('public').push(rel);
    continue;
  }
  gaps.push(rel);
}

/**
 * A duplicated `where:` key inside ONE object literal.
 *
 * TypeScript rejects this ("An object literal cannot have multiple properties
 * with the same name"), but only under the strict build — and the consequence is
 * silent: the LAST key wins, so adding a tenant filter above an existing `where`
 * does nothing at all. That happened during the tenant sweep
 * (agent-runs/[taskId] kept `where: { taskId }` after the scoped one), so it is
 * checked mechanically here as well as by the compiler.
 *
 * Scope is the enclosing braces, not a line window: separate calls in the same
 * function legitimately each have a `where`.
 */
function findDuplicateWhere(src) {
  const hits = [];
  const stack = []; // brace depth -> Set of keys seen at that depth
  let depth = 0;
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Track only the depth transitions that matter; a `where:` key belongs to
    // the innermost open brace at the time it appears.
    let dedented = line;
    const leadingCloses = (dedented.match(/^\s*\}/) || []).length;
    if (leadingCloses > 0) {
      depth = Math.max(0, depth - leadingCloses);
      if (stack[depth]) stack[depth].clear();
    }

    if (/^\s+where\s*[:,]\s/.test(line)) {
      const seen = stack[depth] ?? (stack[depth] = new Set());
      if (seen.has('where')) hits.push(i + 1);
      seen.add('where');
    }

    // Count remaining braces on the line to update depth for the next line.
    const opens = (dedented.match(/\{/g) || []).length;
    const closes = (dedented.match(/\}/g) || []).length - leadingCloses;
    if (opens > 0) {
      for (let k = 0; k < opens; k += 1) {
        depth += 1;
        stack[depth] = new Set();
      }
    }
    if (closes > 0) {
      depth = Math.max(0, depth - closes);
      for (let k = depth + 1; k < stack.length; k += 1) stack[k] = new Set();
    }
  }
  return hits;
}

const duplicateWhere = [];
for (const file of files) {
  const rel = './' + relative(API, file);
  for (const line of findDuplicateWhere(readFileSync(file, 'utf8'))) {
    duplicateWhere.push(`${rel}:${line}`);
  }
}

const audit = process.argv.includes('--audit');
const total = files.length;

if (audit) {
  console.log('Route authorisation classification\n');
  const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, list] of ordered) {
    console.log(`  ${name.padEnd(20)} ${String(list.length).padStart(4)}`);
  }
  console.log(`  ${'UNCLASSIFIED'.padEnd(20)} ${String(gaps.length).padStart(4)}`);
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(total).padStart(4)}\n`);
  if (gaps.length) {
    console.log('Unclassified routes:');
    for (const gap of gaps) console.log('  ' + gap);
  }
}

if (duplicateWhere.length > 0) {
  console.error('\nDuplicate `where:` keys found — the last one silently wins:');
  for (const d of duplicateWhere) console.error('  ' + d);
  process.exitCode = 1;
}

if (gaps.length > 0) {
  console.error(
    `\nFAIL: ${gaps.length} route file(s) have no recognised authorisation mechanism ` +
      'and are not declared public. Every protected route must be classified.',
  );
  process.exit(1);
}

console.log(`OK: all ${total} route files classified.`);
