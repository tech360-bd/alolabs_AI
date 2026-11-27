#!/usr/bin/env node
/**
 * ALO Labs AgentOS — host capacity validator.
 *
 * The host is 16 GB RAM / 520 GB SSD and is SHARED with other projects. This
 * project is supposed to get its share first. Two silent failures made that
 * untrue before:
 *
 *   1. `deploy.resources.limits` was used in docker-compose.prod.yml. Compose
 *      outside Swarm mode IGNORES it, so nothing was capped while the file
 *      looked authoritative. Every enforced limit must be a plain `mem_limit`
 *      / `cpus` key.
 *   2. Nothing summed the limits. Seven services each "reasonably" capped can
 *      still add up past the host's RAM.
 *
 * This script is dependency free (no YAML library) and asserts:
 *
 *   A. docker-compose.capacity.yml exists and every service it names is
 *      defined in docker-compose.yml (compose aborts on phantom overrides).
 *   B. No `deploy.resources` block reintroduces non-enforced limits in the
 *      prod overlay.
 *   C. The capacity overlay sums to <= the declared share of host RAM, and
 *      the core stack (services started by default, i.e. no `profiles`) has
 *      headroom for a production build.
 *   D. Every capacity service caps container log growth (json-file rotation),
 *      because unbounded logs are the #1 silent disk filler.
 *   E. The systemd slice's MemoryMax matches the capacity overlay's total and
 *      its MemoryMin is a real reservation, not 0.
 *
 * Usage: node scripts/validate-capacity.mjs
 * Exit:  0 when the budget holds, 1 with a list of violations otherwise.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const violations = [];
const warnings = [];
const fail = (msg) => violations.push(msg);
const warn = (msg) => warnings.push(msg);

// ─── Declared host budget ────────────────────────────────────────────────────
// Change these two numbers together with docker-compose.capacity.yml and the
// systemd slice. They are the contract for "project 1 gets its share first".
const HOST_RAM_MB = 16 * 1024; // 16 GiB
const APP_SHARE_MB = 10 * 1024; // ceiling this project may use on the host
const BUILD_HEADROOM_MB = 2 * 1024; // `next build` peak (typecheck + compile)

// ─── Minimal compose parsing ────────────────────────────────────────────────
function servicesOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (start === -1) return [];
  const names = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[^\s#]/.test(line)) break;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/** Lines belonging to one service block (until the next 2-space key). */
function serviceBlock(text, name) {
  const lines = text.split('\n');
  const head = new RegExp(`^ {2}${name}:\\s*$`);
  const start = lines.findIndex((l) => head.test(l));
  if (start === -1) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) break;
    if (/^[^\s#]/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/**
 * Parse "3g" / "1536m" / "512M" style values to MiB.
 * Compose allows interpolation with a default (`${APP_MEM_LIMIT:-3g}`); the
 * budget must be checked against that default, because that is what actually
 * runs when the operator sets nothing.
 */
function toMib(raw) {
  const interpolated = /^\$\{[A-Za-z_][A-Za-z0-9_]*:-([^}]*)\}$/.exec(String(raw).trim());
  const literal = interpolated ? interpolated[1] : String(raw).trim();
  const m = /^([0-9.]+)\s*([kmgt]?)b?$/i.exec(literal);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = m[2].toLowerCase();
  const factor = { '': 1 / (1024 * 1024), k: 1 / 1024, m: 1, g: 1024, t: 1024 * 1024 }[unit];
  return Math.round(amount * factor);
}

const CAPACITY = 'docker-compose.capacity.yml';
const PROD = 'docker-compose.prod.yml';
const BASE = 'docker-compose.yml';
const SLICE = 'deploy/systemd/alolabs-agentos-slice.conf';

// ─── A. capacity overlay exists and has no phantom services ────────────────
if (!existsSync(join(root, CAPACITY))) {
  fail(`${CAPACITY} is missing — nothing enforces memory/CPU limits on a non-Swarm host`);
}

const baseText = read(BASE);
const baseServices = servicesOf(baseText);

if (existsSync(join(root, CAPACITY))) {
  const capText = read(CAPACITY);
  const capServices = servicesOf(capText);
  if (capServices.length === 0) fail(`${CAPACITY}: no services defined`);

  for (const svc of capServices) {
    if (!baseServices.includes(svc)) {
      fail(`${CAPACITY} overrides "${svc}", which ${BASE} does not define`);
    }
  }

  // ─── C. the budget sums ──────────────────────────────────────────────────
  let totalMb = 0;
  let coreMb = 0;
  const rows = [];
  for (const svc of capServices) {
    const block = serviceBlock(capText, svc);
    const memLine = /^\s*mem_limit:\s*(\S+)/m.exec(block);
    if (!memLine) {
      fail(`${CAPACITY}: service "${svc}" has no mem_limit — it is uncapped`);
      continue;
    }
    const mb = toMib(memLine[1]);
    if (mb === null) {
      fail(`${CAPACITY}: service "${svc}" has an unparsable mem_limit "${memLine[1]}"`);
      continue;
    }
    totalMb += mb;

    // Core services are those the base file does NOT gate behind a profile.
    const baseBlock = serviceBlock(baseText, svc);
    const isProfile = /^\s*profiles:/m.test(baseBlock);
    if (!isProfile) coreMb += mb;
    rows.push({ svc, mb, core: !isProfile });
  }

  if (totalMb > APP_SHARE_MB) {
    fail(
      `${CAPACITY}: sum of mem_limit is ${totalMb} MiB, above this project's declared ` +
        `share of ${APP_SHARE_MB} MiB on a ${HOST_RAM_MB} MiB host`,
    );
  }
  if (coreMb + BUILD_HEADROOM_MB > APP_SHARE_MB) {
    fail(
      `${CAPACITY}: core stack (${coreMb} MiB) + build headroom (${BUILD_HEADROOM_MB} MiB) ` +
        `exceeds the ${APP_SHARE_MB} MiB share — a production build would OOM the host`,
    );
  }

  // ─── D. log rotation on every capped service ─────────────────────────────
  for (const svc of capServices) {
    const block = serviceBlock(capText, svc);
    if (!/^\s*logging:/m.test(block)) {
      fail(`${CAPACITY}: service "${svc}" has no logging rotation — docker json-file grows unbounded`);
    } else if (!/max-size:/.test(block) || !/max-file:/.test(block)) {
      fail(`${CAPACITY}: service "${svc}" logging is missing max-size/max-file`);
    }
  }

  // ─── E. slice agrees with the overlay ────────────────────────────────────
  if (existsSync(join(root, SLICE))) {
    const slice = read(SLICE);
    const maxMatch = /^MemoryMax=(\d+)([MGT])$/m.exec(slice);
    const minMatch = /^MemoryMin=(\d+)([MGT])$/m.exec(slice);
    if (!maxMatch) {
      fail(`${SLICE}: no MemoryMax line`);
    } else {
      const maxMb = toMib(maxMatch[1] + maxMatch[2].toLowerCase());
      if (maxMb !== totalMb) {
        fail(
          `${SLICE}: MemoryMax=${maxMatch[0].split('=')[1]} (${maxMb} MiB) does not match the ` +
            `${CAPACITY} total (${totalMb} MiB) — the two walls disagree`,
        );
      }
      if (minMatch) {
        const minMb = toMib(minMatch[1] + minMatch[2].toLowerCase());
        if (minMb === 0) fail(`${SLICE}: MemoryMin=0 is not a reservation`);
        else if (minMb > totalMb / 2) {
          warn(
            `${SLICE}: MemoryMin (${minMb} MiB) is more than half of MemoryMax (${totalMb} MiB); ` +
              'a reservation this large makes the host unswappable under pressure',
          );
        }
      } else {
        fail(`${SLICE}: no MemoryMin line — nothing reserves this project's share`);
      }
    }
  } else {
    fail(`${SLICE} is missing — no systemd reservation for a shared host`);
  }

  // ─── Report table ────────────────────────────────────────────────────────
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`validate-capacity: host ${HOST_RAM_MB} MiB, project share ${APP_SHARE_MB} MiB`);
  console.log(`  ${pad('service', 22)} ${pad('limit', 10)} scope`);
  for (const r of rows) {
    console.log(`  ${pad(r.svc, 22)} ${pad(`${r.mb} MiB`, 10)} ${r.core ? 'core' : 'profile'}`);
  }
  console.log(`  ${pad('TOTAL', 22)} ${pad(`${totalMb} MiB`, 10)}`);
  console.log(`  ${pad('CORE (default up)', 22)} ${pad(`${coreMb} MiB`, 10)} + ${BUILD_HEADROOM_MB} MiB build headroom`);
  console.log(`  ${pad('LEFT FOR OTHERS', 22)} ${HOST_RAM_MB - APP_SHARE_MB} MiB`);
}

// ─── B. no non-enforced deploy.resources in the prod overlay ───────────────
if (existsSync(join(root, PROD))) {
  const prodText = read(PROD);
  const prodLines = prodText.split('\n');
  for (let i = 0; i < prodLines.length; i++) {
    if (/^\s+deploy:\s*$/.test(prodLines[i]) && /resources:/.test(prodLines[i + 1] ?? '')) {
      fail(
        `${PROD}:${i + 1}: deploy.resources is a Swarm-only no-op outside Swarm — ` +
          `use mem_limit/cpus in ${CAPACITY} instead`,
      );
    }
  }
}

// ─── report ────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`validate-capacity: WARN ${w}`);

if (violations.length) {
  console.error(`\nvalidate-capacity: FAILED with ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log('validate-capacity: OK — budget fits, limits are enforced, logs rotate, slice matches');
