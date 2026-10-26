#!/usr/bin/env node
/**
 * validate-route-auth — CI guard for API route authentication coverage.
 *
 * WHY THIS EXISTS
 * ---------------
 * src/proxy.ts is the Next.js 16 global edge gate (Next 16 renamed the
 * middleware convention; PROXY_FILENAME === 'proxy'). It is fail-CLOSED: any
 * /api/* request whose path+method is not in PUBLIC_API_ROUTES must present a
 * Bearer token or an X-API-Key, else 401.
 *
 * But the edge only verifies credential PRESENCE. It cannot reach Prisma, so the
 * authoritative session and tenant check is per-route, via requireAuth() from
 * @/lib/api-auth (or an equivalent helper). A route that is not in the edge
 * allowlist and also forgets its in-file auth check is reachable by anyone who
 * sends `Authorization: Bearer anything`.
 *
 * That is a silent failure mode: nothing errors, the route just quietly serves
 * data. This guard turns it into a build failure.
 *
 * WHAT IT CHECKS
 * --------------
 *  A. Auth coverage — every API route handler that the edge allowlist does NOT
 *     cover must reference a known auth helper, unless it appears in the
 *     documented EXCEPTIONS table below.
 *  B. Prefix over-match — the edge matches allowlist entries with
 *     `pathname === r.path || pathname.startsWith(r.path)`. An entry without a
 *     trailing slash therefore also exposes every route beneath its prefix.
 *     This reports routes made public by that behaviour, so a new route cannot
 *     be silently exposed by an existing prefix entry.
 *
 * The allowlist is PARSED from src/proxy.ts, never duplicated here, so the guard
 * cannot drift from the thing it is checking. If parsing yields nothing the
 * guard fails loudly rather than passing vacuously.
 *
 * Dependency-free by design: bun.lock cannot be regenerated in restricted
 * environments and CI runs `bun install --frozen-lockfile`, so this must not
 * add a package.
 *
 * Usage: node scripts/validate-route-auth.mjs
 * Exit:  0 when all invariants hold, 1 with a list of violations otherwise.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const violations = [];
const notes = [];
const fail = (msg) => violations.push(msg);

// ─── 1. Parse the authoritative allowlist out of src/proxy.ts ────────────────

const proxyPath = 'src/proxy.ts';
if (!existsSync(join(root, proxyPath))) {
  console.error(`validate-route-auth: FATAL — ${proxyPath} not found; cannot determine the edge allowlist.`);
  process.exit(1);
}
const proxySrc = read(proxyPath);

/** @type {{path: string, methods: string[]}[]} */
const allowlist = [];
const entryRe = /\{\s*path:\s*'([^']+)'\s*,\s*methods:\s*\[([^\]]*)\]\s*\}/g;
for (const m of proxySrc.matchAll(entryRe)) {
  const methods = [...m[2].matchAll(/'([A-Z]+)'/g)].map((x) => x[1]);
  allowlist.push({ path: m[1], methods });
}

if (allowlist.length === 0) {
  // Guard against a proxy.ts refactor silently disabling this check.
  console.error('validate-route-auth: FATAL — parsed 0 entries from PUBLIC_API_ROUTES.');
  console.error('  The allowlist format in src/proxy.ts probably changed; update this script.');
  process.exit(1);
}

// The edge also treats these query strings as public regardless of path.
const publicQueryParams = [...proxySrc.matchAll(/PUBLIC_QUERY_PARAMS[\s\S]*?\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));

// ─── 2. Enumerate API route files and the methods they export ────────────────

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Known auth helpers. A route referencing any of these is considered to perform
 * its own authoritative check. Deliberately broad: the point is to catch routes
 * with NO auth concept at all, not to police which helper they chose.
 */
const AUTH_HELPER_RE =
  /@\/lib\/api-auth|@\/lib\/route-auth|@\/lib\/auth|@\/lib\/v1\b|@\/lib\/v1'|v1Handler|secureRoute|requireAuth|withAuth|authenticate|verifySession|verifySessionToken|verifyToken|getSession|getLockoutStatus/;

const apiDir = join(root, 'src/app/api');
if (!existsSync(apiDir)) {
  console.error('validate-route-auth: FATAL — src/app/api not found.');
  process.exit(1);
}

/** @type {{rel: string, routePath: string, methods: string[], hasAuth: boolean}[]} */
const routes = [];
for (const file of walk(apiDir)) {
  if (!file.endsWith(`${sep}route.ts`) && !file.endsWith(`${sep}route.js`)) continue;
  const rel = relative(root, file);
  const routePath = '/api/' + relative(apiDir, dirname(file)).split(sep).join('/');
  const src = readFileSync(file, 'utf8');
  const methods = [...src.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((m) => m[1]);
  routes.push({ rel, routePath, methods, hasAuth: AUTH_HELPER_RE.test(src) });
}

// ─── 3. Documented exceptions ────────────────────────────────────────────────
// Each entry must state WHY it is acceptable, so the list cannot become a place
// to quietly dump routes nobody reviewed.

/** @type {Record<string, string>} */
const EXCEPTIONS = {
  '/api/enterprise/roadmap':
    'Serves static content from @/lib/enterprise-roadmap. Verified: no db import, ' +
    'no companyId, no process.env, no tenant data. Not in the edge allowlist, so a ' +
    'Bearer header is still required to reach it at all.',
  '/api/auth/mfa/resend':
    'No-op stub that returns a fixed { success: true } message and touches no state ' +
    '(see gap G5). Tracked for removal or real implementation; nothing to protect yet.',
};

// ─── 4. Check A — auth coverage ──────────────────────────────────────────────

/** Does the edge allowlist cover this path+method? */
function edgeCovers(routePath, method) {
  return allowlist.some(
    (r) =>
      (routePath === r.path || routePath.startsWith(r.path)) &&
      r.methods.includes(method),
  );
}

let checked = 0;
for (const r of routes) {
  if (r.methods.length === 0) continue; // no exported handler; nothing serves
  for (const method of r.methods) {
    if (edgeCovers(r.routePath, method)) continue; // intentionally public
    checked++;
    if (r.hasAuth) continue;
    if (EXCEPTIONS[r.routePath]) continue;
    fail(
      `${r.rel}: ${method} ${r.routePath} is not in the proxy.ts allowlist and references no auth helper. ` +
      `It is reachable with any ` +
      `'Authorization: Bearer x' header. Add requireAuth()/secureRoute()/v1Handler, ` +
      `or add it to PUBLIC_API_ROUTES if it is genuinely public.`,
    );
  }
}

// Stale exceptions are a smell: if a route gains auth or disappears, its
// exception should be removed so the list stays honest.
for (const path of Object.keys(EXCEPTIONS)) {
  if (!routes.some((r) => r.routePath === path)) {
    notes.push(`exception for ${path} is stale — no such route exists any more; remove it`);
  }
}

// ─── 5. Check B — prefix over-match in the edge allowlist ────────────────────

for (const entry of allowlist) {
  if (entry.path.endsWith('/')) continue; // trailing slash scopes the prefix correctly
  const shadowed = routes.filter(
    (r) => r.routePath !== entry.path && r.routePath.startsWith(entry.path),
  );
  for (const r of shadowed) {
    const overlapping = r.methods.filter((m) => entry.methods.includes(m));
    if (overlapping.length === 0) continue;
    // A route the author listed explicitly is public on purpose; only routes
    // exposed *incidentally* by a broader prefix are worth reporting.
    if (allowlist.some((a) => a.path === r.routePath)) continue;
    if (EXCEPTIONS[r.routePath]) continue;
    if (r.hasAuth) continue; // still performs its own check, so not exposed
    fail(
      `${r.rel}: ${overlapping.join('/')} ${r.routePath} is made public by the ` +
      `startsWith match on allowlist entry '${entry.path}' in src/proxy.ts, and has no auth helper of its own.`,
    );
  }
}

// ─── 6. Report ───────────────────────────────────────────────────────────────

console.log(
  `validate-route-auth: ${routes.length} API route files, ` +
  `${checked} non-public handler(s) checked, ` +
  `${allowlist.length} allowlist entries, ` +
  `${Object.keys(EXCEPTIONS).length} documented exception(s)`,
);
if (publicQueryParams.length) {
  console.log(`validate-route-auth: query-param bypasses present [${publicQueryParams.join(', ')}] — not analysed`);
}
for (const n of notes) console.log(`  note: ${n}`);

if (violations.length) {
  console.error(`\nvalidate-route-auth: FAILED with ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log('validate-route-auth: OK — every non-public API handler references an auth helper');
