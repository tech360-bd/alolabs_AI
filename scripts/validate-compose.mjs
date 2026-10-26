#!/usr/bin/env node
/**
 * ALO Labs AgentOS — compose / deploy configuration validator.
 *
 * CI runs `docker compose config` only when Docker is available, and that
 * check cannot see cross-file agreements anyway. This script is dependency
 * free (no YAML library — bun.lock cannot be regenerated without bun, and CI
 * installs with --frozen-lockfile) and asserts the invariants that silently
 * rotted before:
 *
 *   1. Every service referenced by docker-compose.prod.yml is defined in
 *      docker-compose.yml. An override or `depends_on` for an undefined
 *      service makes `docker compose up` abort outright.
 *   2. Every `depends_on` target exists.
 *   3. The app port contract (3011) agrees across Dockerfile, both compose
 *      files, Caddyfile and deploy/prometheus.yml.
 *   4. No stale `localhost:3000` upstream remains in Caddyfile — Caddy runs in
 *      its own container, where localhost is Caddy itself.
 *   5. Every bind-mounted host path exists in the repository.
 *
 * Usage: node scripts/validate-compose.mjs
 * Exit:  0 when all invariants hold, 1 with a list of violations otherwise.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = '3011';

const read = (rel) => readFileSync(join(root, rel), 'utf8');
const violations = [];
const fail = (msg) => violations.push(msg);

// ─── Minimal compose service extraction ────────────────────────────────────
// Compose files here use two-space indentation, so top-level keys sit at
// column 0 and service names at exactly two spaces. This is deliberately a
// targeted scan rather than a YAML parser.
function topLevelKeys(text) {
  const keys = [];
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9_.-]+):/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

function servicesOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (start === -1) return [];
  const names = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[^\s#]/.test(line)) break; // next top-level key ends the block
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/** Service names referenced by depends_on, in both list and map form. */
function dependsOnTargets(text) {
  const lines = text.split('\n');
  const targets = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s+)depends_on:\s*$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const cur = line.match(/^\s*/)[0].length;
      if (cur <= indent) break;
      const entry = /^\s*(?:-\s*)?([A-Za-z0-9_-]+):?\s*(?:#.*)?$/.exec(line);
      // Only the first nesting level names a service; `condition:` is deeper.
      if (entry && cur === indent + 2 && !/^(condition|restart|required)$/.test(entry[1])) {
        targets.push(entry[1]);
      }
    }
  }
  return [...new Set(targets)];
}

/** Bind mounts of the form ./host/path:/container/path. */
function bindMounts(text) {
  const out = [];
  const re = /["']?(\.\/[^\s"':]+):\/[^\s"']+/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return [...new Set(out)];
}

const baseText = read('docker-compose.yml');
const prodText = read('docker-compose.prod.yml');
const dockerfile = read('Dockerfile');
const caddyfile = read('Caddyfile');
const promConfig = read('deploy/prometheus.yml');

const baseServices = servicesOf(baseText);
const prodServices = servicesOf(prodText);

// ─── 1. prod may only override services the base defines ───────────────────
for (const svc of prodServices) {
  if (!baseServices.includes(svc)) {
    fail(`docker-compose.prod.yml overrides "${svc}", which docker-compose.yml does not define`);
  }
}

// ─── 2. every depends_on target exists ─────────────────────────────────────
const known = new Set(baseServices);
for (const [file, text] of [['docker-compose.yml', baseText], ['docker-compose.prod.yml', prodText]]) {
  for (const target of dependsOnTargets(text)) {
    if (!known.has(target)) fail(`${file}: depends_on references undefined service "${target}"`);
  }
}

// ─── 3. port contract ──────────────────────────────────────────────────────
if (!/ENV PORT=3011/.test(dockerfile)) fail('Dockerfile: missing "ENV PORT=3011"');
if (!/EXPOSE 3011/.test(dockerfile)) fail('Dockerfile: missing "EXPOSE 3011"');
if (!new RegExp(`PORT: "?${APP_PORT}"?`).test(baseText)) {
  fail(`docker-compose.yml: app environment must set PORT: "${APP_PORT}"`);
}
if (!baseText.includes(`:3011"`)) fail(`docker-compose.yml: app must publish container port ${APP_PORT}`);
if (!new RegExp(`(localhost|127\\.0\\.0\\.1):${APP_PORT}/api/health`).test(baseText)) {
  fail(`docker-compose.yml: app healthcheck must probe 127.0.0.1:${APP_PORT}/api/health`);
}
if (!new RegExp(`targets: \\['app:${APP_PORT}'\\]`).test(promConfig)) {
  fail(`deploy/prometheus.yml: app scrape target must be app:${APP_PORT}`);
}
if (!/\{\$APP_UPSTREAM:app:3011\}/.test(caddyfile)) {
  fail('Caddyfile: reverse_proxy must use {$APP_UPSTREAM:app:3011}');
}

// ─── 4. no stale localhost upstream in Caddyfile ───────────────────────────
for (const m of caddyfile.matchAll(/reverse_proxy\s+(localhost:\d+)/g)) {
  if (!caddyfile.includes('reverse_proxy localhost:{query.XTransformPort}')) continue;
  // The :81 dev block intentionally proxies to a caller-supplied port; any
  // other literal localhost upstream is the bug this validator exists for.
  if (!m[1].includes('{query.XTransformPort}')) {
    fail(`Caddyfile: "${m[1]}" is unreachable from the caddy container — use {$APP_UPSTREAM:app:3011}`);
  }
}

// ─── 4b. the prod override must not reintroduce a custom entrypoint ─────────
// It previously ran `bunx prisma db push && exec bun server.js`. The image is
// node:20-slim with no bun, and `prisma` is a devDependency absent from the
// runner stage, so that entrypoint could never start. The image's own
// CMD ["node","server.js"] is correct and must be left alone.
{
  const prodApp = prodText.split(/^ {2}app:\s*$/m)[1]?.split(/^ {2}[A-Za-z0-9_-]+:\s*$/m)[0] ?? '';
  if (/^\s{4}entrypoint:/m.test(prodApp)) {
    fail('docker-compose.prod.yml: app must not override entrypoint — the image CMD ["node","server.js"] is correct');
  }
}

// ─── 4c. runtime base image must be glibc ──────────────────────────────────
// prisma/schema.prisma declares binaryTargets "debian-openssl-3.0.x", a
// glibc/OpenSSL-3.0 binary that will not load on Alpine (musl). bcrypt and
// better-sqlite3 are likewise built per libc.
if (/^FROM node:\d+-alpine/m.test(dockerfile)) {
  fail('Dockerfile: node:*-alpine (musl) cannot run the "debian-openssl-3.0.x" Prisma engine — use node:20-slim');
}
if (!/^FROM node:20-slim AS runner/m.test(dockerfile)) {
  fail('Dockerfile: runner stage must be node:20-slim');
}

// ─── 4d. bare-metal deploy surfaces must honour the same port ──────────────
// The container stack is not the only way this app is deployed. The systemd
// unit and the nginx configs were drifting onto 3000 independently of compose:
// Next.js standalone defaults to 3000 when PORT is unset, so the unit started
// an app nobody could reach, because deploy/nginx/agentos.conf proxies 3011.
const optionalSurfaces = [
  ['deploy/systemd/alolabs-agent-hub.service', [/Environment=PORT=3011/]],
  ['deploy/nginx/agentos.conf', [/server 127\.0\.0\.1:3011;/]],
  ['nginx.conf.example', [/server 127\.0\.0\.1:3011;/]],
  ['ecosystem.config.js', [/PORT: 3011/]],
];
for (const [rel, patterns] of optionalSurfaces) {
  if (!existsSync(join(root, rel))) continue; // surface removed; nothing to assert
  const text = read(rel);
  for (const p of patterns) {
    if (!p.test(text)) fail(`${rel}: must pin the app to port ${APP_PORT} (found no match for ${p})`);
  }
  if (/127\.0\.0\.1:3000|PORT=3000|PORT: 3000/.test(text)) {
    fail(`${rel}: still references port 3000 — the app listens on ${APP_PORT}`);
  }
}

// ─── 4e. application source must not hardcode the wrong port ───────────────
// Server-to-self HTTP calls used to fall back to http://localhost:3000, a port
// nothing in this repository listens on, so every worker-driven chat, email,
// notification, backup and upload call would fail with ECONNREFUSED in any
// deployment that did not happen to set NEXT_PUBLIC_APP_URL. Those call sites
// now go through src/lib/internal-url.ts. This guard keeps them there.
//
// Only src/ is scanned: the compose files legitimately contain 3000 for
// Grafana's *container* port (published as 3001), and .env.example is asserted
// separately below. Comment lines are skipped so explanatory prose that quotes
// the old broken value does not trip the gate, and tests are excluded because
// they must be able to name the stale value in order to assert it is rejected.
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const isTestFile = (p) => /[./__](test|spec)\.(ts|tsx)$/.test(p) || p.includes(`${sep}__tests__${sep}`);

const srcDir = join(root, 'src');
if (existsSync(srcDir)) {
  for (const file of walk(srcDir)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const rel = relative(root, file);
    if (isTestFile(file)) continue;
    let inBlockComment = false;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Track /* ... */ so quoted prose is not treated as code.
      if (inBlockComment) {
        if (line.includes('*/')) inBlockComment = false;
        continue;
      }
      if (line.trimStart().startsWith('/*')) {
        if (!line.includes('*/')) inBlockComment = true;
        continue;
      }
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (/localhost:3000|127\.0\.0\.1:3000/.test(line)) {
        fail(`${rel}:${i + 1}: hardcoded port 3000 — the app listens on ${APP_PORT}; use internalBaseUrl()/publicBaseUrl() from src/lib/internal-url.ts`);
      }
    }
  }
}

// .env.example is copied to .env by operators; APP_PORT there overrides the
// compose default ${APP_PORT:-3011}, so a stale 3000 silently republishes the
// app on the wrong host port while Caddy still proxies to 3011.
if (existsSync(join(root, '.env.example'))) {
  const envExample = read('.env.example');
  const appPortLine = envExample.match(/^APP_PORT=(\S*)/m);
  if (appPortLine && appPortLine[1] !== APP_PORT) {
    fail(`.env.example: APP_PORT=${appPortLine[1]} but the app listens on ${APP_PORT}`);
  }
  if (/localhost:3000/.test(envExample)) {
    fail(`.env.example: still references localhost:3000 — the app listens on ${APP_PORT}`);
  }
}

// ─── 5. bind-mounted host paths exist ──────────────────────────────────────
for (const [file, text] of [['docker-compose.yml', baseText], ['docker-compose.prod.yml', prodText]]) {
  for (const rel of bindMounts(text)) {
    if (!existsSync(join(root, rel))) fail(`${file}: bind mount "${rel}" does not exist in the repository`);
  }
}

// ─── report ────────────────────────────────────────────────────────────────
console.log(`validate-compose: ${baseServices.length} base services [${baseServices.join(', ')}]`);
console.log(`validate-compose: ${prodServices.length} prod overrides [${prodServices.join(', ')}]`);

if (violations.length) {
  console.error(`\nvalidate-compose: FAILED with ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log(`validate-compose: OK — port contract ${APP_PORT} consistent, no phantom services, all bind mounts present`);
