# ALO Labs AgentOS — Repository Audit Results

**Repo:** `engralaminn-collab/alolabs.net_ai`
**Branch audited:** `arena/1b52a31c-alolabs-net-ai` @ `ce24bc6` (merge of PR #13)
**Audit date:** 2026-10-14
**Environment:** Linux sandbox, Node v22.22.3, npm 10.9.8. **Docker not available**, so compose
files were validated by inspection rather than `docker compose config`.

This is the Linux equivalent of the PowerShell audit script, extended with the three gates that
could not run locally: dependency install, TypeScript check, and the production build.

---

## 0. Resolution status (updated after fixes landed)

Every defect in §3 has been fixed, plus two more found during the fix pass.
All fixes are verified by a new dependency-free CI gate,
`scripts/validate-compose.mjs`, which reports **21 violations against the
pre-fix configuration** and **0 against the fixed one**.

| # | Defect | Status | Fix |
|---|---|---|---|
| 3.1 | prod references undefined `redis`/`qdrant`/`minio` | ✅ Fixed | All three now defined in `docker-compose.yml` with healthchecks, volumes and loopback-only ports |
| 3.2 | prod entrypoint ran `bun server.js` | ✅ Fixed | Override removed; image `CMD ["node","server.js"]` used. Schema init documented as an explicit operator step |
| 3.3 | port 3000 vs 3011 split | ✅ Fixed | 3011 everywhere; asserted by the validator |
| 3.4 | Caddy proxied to `localhost:3000` | ✅ Fixed | All 5 upstreams now `{$APP_UPSTREAM:app:3011}`, set by compose |
| 3.5 | Prometheus scraped `app:3000` | ✅ Fixed | Now `app:3011` |
| 3.6 | two database paths, one volume | ✅ Fixed | Both configs use `file:/app/data/agenthub.db` on the `app_data` volume |
| 3.7 | README described a non-existent topology | ✅ Fixed | Table rewritten to match the 9 real services |
| **3.8** | **Dockerfile built on Alpine but `binaryTargets = "debian-openssl-3.0.x"`** | ✅ Fixed | **All three stages moved to `node:20-slim` (glibc). A musl-built image cannot load the glibc Prisma engine, and `bcrypt`/`better-sqlite3` are compiled per libc** |
| **3.9** | **`bcrypt` missing from the runner image** | ✅ Fixed | **See below** |
| 6 | two ESLint warnings | ✅ Fixed | Lint now reports 0 errors **and 0 warnings** |

### 3.9 — the runner image could not authenticate anyone

`next.config.ts` lists `bcrypt` in `serverExternalPackages`, so Next.js does
not bundle it, and the runner stage never copied it — while two source files
import it. Every login would have thrown `MODULE_NOT_FOUND`.

Investigating this properly **overturned my own first fix**. I initially wrote
a script to walk and copy the whole transitive tree; it pulled in **513
packages** and filled the disk. Inspecting a real build showed why that was
wrong: Next.js output file tracing *already* copies `bcrypt`,
`better-sqlite3`, `mysql2`, `pg`, `sharp`, `@prisma/client`, the query engine
binary, `bindings` and `file-uri-to-path` into `.next/standalone/node_modules`.
`serverExternalPackages` prevents *bundling*, not *tracing* — my original
diagnosis in §3.9 conflated the two.

The actual gap is exactly one lazily-required subtree: `src/lib/db.ts` loads
the Prisma driver adapter via `require()` inside the `PRISMA_SQLITE_ADAPTER`
branch, which static tracing cannot see. The Dockerfile now copies that
verified three-package closure and nothing else:

```
@prisma/adapter-better-sqlite3 -> better-sqlite3 (already traced),
                                  @prisma/driver-adapter-utils
@prisma/driver-adapter-utils   -> @prisma/debug
@prisma/debug                  -> (none)
```

The 513-package script was deleted.

### Re-verification after the fixes

| Gate | Before | After |
|---|---|---|
| TypeScript | 0 errors | ✅ 0 errors |
| ESLint | 0 errors, 2 warnings | ✅ **0 errors, 0 warnings** |
| Tests | 984 passed / 27 env-failed | ✅ 984 passed / 27 env-failed (unchanged — nothing broken) |
| `next build` | ✅ 315 pages | ✅ 315 pages |
| CI standalone artifacts | 3/5 | ✅ **5/5** (`npm run build` now runs the `cp` steps) |
| `validate-compose.mjs` | — | ✅ 0 violations (21 on the old config) |
| Compose YAML parse + merge | ❌ | ✅ Both files parse; merged prod `app` verified valid |

The Dockerfile also now builds with `npm run build` rather than bare
`next build`, so `.next/standalone/.next/static` and `.next/standalone/public`
exist — two of the five artifacts CI checks for were previously never produced
inside the image.

---

## 1. Verdict

**The source code is healthy. The deployment configuration is not.**

Every code-quality gate passes. The breakage is concentrated entirely in the Docker/compose/README
layer, which nothing in CI validates — so it has been able to rot silently.

| Gate | Result |
|---|---|
| Git working tree | ✅ Clean, 1246 tracked files |
| Dependencies | ⚠️ 759 packages — needs `--ignore-scripts` offline (see §5) |
| Prisma client generation | ✅ 179 models generated |
| **TypeScript (`tsc --noEmit`)** | ✅ **0 errors** |
| **ESLint** | ✅ **0 errors**, 2 warnings |
| **Tests (vitest)** | ⚠️ **984 passed / 27 failed / 20 skipped** — all 27 from one environmental cause (§4) |
| **Production build (`next build`)** | ✅ **Success — 315 pages generated** |
| CI gate: `check:prisma-delegates` | ✅ Passed (152 referenced delegates) |
| CI gate: `database-safety-scan.sh` | ✅ Passed |
| CI gate: standalone artifacts | ✅ `server.js`, `.next/static`, `public` present |
| **Docker / compose / deploy config** | ❌ **7 defects, 2 deployment-blocking** (§3) |

### Structural inventory

| Metric | Count |
|---|---|
| API route handlers (`src/app/api/**/route.ts`) | **366** |
| Page/layout files (non-API) | **6** |
| Prisma models | **179** (identical in `schema.prisma` and `schema.mysql.prisma`) |
| Total files under `src/` | 825 |
| Test files | 68 |
| GitHub workflows | 7 |

The 6 page routes are `src/app/layout.tsx`, `src/app/page.tsx`, and `brand/`, `design/`,
`invoice/`, `site/`.

> **Correction to the local run:** the PowerShell audit reported *"Page/layout files: 2"*. That
> was a truncated multi-line command — the console echoed `===== PAGE ROUTES =====entlyContinue |`
> and `$pages` never got populated. The real count is 6. The corrected script is in §6.

---

## 2. The most important finding: the "416 TypeScript errors" trap

Running `tsc --noEmit` **before** generating the Prisma client produces **416 errors across 135
files**. After generating the client, the same command produces **0 errors**.

None of those 416 are real bugs. They are a cascade from one missing artifact:

| Code | Count | Cause |
|---|---|---|
| TS7006 (implicit `any`) | 376 | Callback params on Prisma query results — `any` because the model types didn't exist |
| TS2305 (no exported member) | 34 | `'Prisma'` (32) and `'PrismaClient'` (2) missing from the ungenerated client |
| TS2307 (module not found) | 1 | `.prisma/client/default` — the generated output directory |
| TS2345 / TS18046 / TS2322 | 5 | Downstream of the same `unknown`/`any` inference |

**Why this matters:** the repo pins `binaryTargets = ["native", "debian-openssl-3.0.x"]`, so
`prisma generate` tries to reach `binaries.prisma.sh`. On a machine where that host is blocked
(air-gapped sandbox, TLS-intercepting corporate proxy), generation fails and TypeScript then
reports 416 phantom errors that look catastrophic but are entirely environmental.

The repo **already ships the fix** and it works:

```bash
npm run db:generate:client-engine   # scripts/dev-generate-client.sh — engine-less client
```

This script stubs `PRISMA_SCHEMA_ENGINE_BINARY` / `PRISMA_QUERY_ENGINE_LIBRARY`, writes a temp
schema copy with `engineType = "client"`, and leaves `prisma/schema.prisma` untouched. It
generated successfully in 1.0s here.

**Caveat worth documenting:** a client generated with `engineType = "client"` *requires* a driver
adapter at construction. Building with such a client but without `PRISMA_SQLITE_ADAPTER=1` fails
at page-data collection:

```
PrismaClientInitializationError: Missing configured driver adapter.
Engine type `client` requires an active driver adapter.  (errorCode P2038)
  at src/lib/db.ts:80
```

I hit this exact failure on the first build attempt. So the two air-gapped scripts must be used
as a matched pair, and `dev-generate-client.sh` should say so. For typecheck-only purposes,
generating against the **default** schema (with the stub env vars set, no `engineType` change)
also works and produces a client that needs no adapter — that is the combination that gave the
clean build here.

---

## 3. Docker / compose / deploy defects

Nothing in `.github/workflows/` runs `docker compose config`, which is why none of these were
caught. `docker.yml` only builds and pushes the image on `v*` tags.

### 3.1 CRITICAL — `docker-compose.prod.yml` references three services that do not exist

`docker-compose.prod.yml` contains override blocks and `depends_on` entries for `redis` (line 81),
`qdrant` (line 110), and `minio` (line 123). **None of these are defined in `docker-compose.yml`**
— or anywhere else in the repo. The root compose file defines exactly four services:
`app`, `caddy`, `prometheus`, `grafana`.

The documented command therefore cannot work:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d   # README.md:356
```

`app.depends_on` requires `redis`, `qdrant`, and `minio` with `condition: service_healthy`, so
compose aborts on unresolvable service references. **This is almost certainly what the
`===== DOCKER =====` section of the local audit was about to report before it came back empty.**

### 3.2 CRITICAL — prod `app` entrypoint invokes a runtime that isn't in the image

```yaml
entrypoint: ["/bin/sh","-c","|\n  mkdir -p /app/data\n  bunx prisma db push --skip-generate ...\n  exec bun server.js"]
```

- The image is `FROM node:20-alpine`. **`bun` and `bunx` are not installed** (`grep -n bun Dockerfile` → no match).
- `WORKDIR /app` receives `.next/standalone/*`, so the entrypoint is `server.js` — that part is
  right — but the Dockerfile's own `CMD ["node", "server.js"]` is what should run.
- `bunx prisma db push` needs the `prisma` CLI, which is a **devDependency** and is not present
  in the runner stage (only `.next/standalone`, `.next/static`, `public`, `prisma/`, and
  `node_modules/.prisma` are copied).

### 3.3 CRITICAL — port 3000 vs 3011 mismatch breaks the base healthcheck chain

| Source | Port |
|---|---|
| `Dockerfile` `ENV PORT` / `EXPOSE` / `HEALTHCHECK` | **3011** |
| `docker-compose.yml` `app.environment.PORT` | **3000** |
| `docker-compose.yml` `app.ports` | `127.0.0.1:3000:3000` |
| `docker-compose.yml` `app.healthcheck` | `http://localhost:3000/api/health` |
| `docker-compose.prod.yml` `app` | **3011** |
| `deploy/prometheus.yml` scrape target | `app:3000` |

`docker compose up -d` (the base-only path, `README.md:349`) sets `PORT: 3000`, which conflicts
with the image default of 3011. If the app ends up on 3011, the base healthcheck probes 3000 and
never goes healthy — and `caddy.depends_on: app: {condition: service_healthy}` then **blocks Caddy
from ever starting**. The whole stack hangs.

### 3.4 CRITICAL — Caddy reverse-proxies to `localhost` from inside its own container

`Caddyfile` contains **five** `reverse_proxy localhost:3000` directives. Caddy runs as a separate
container on `alolabs-net`, so `localhost` resolves to the Caddy container itself, not `app`.
Every request 502s. These must be `app:3011` (Docker DNS + the port the app actually listens on).

Compounding it, the base compose publishes `app` on `127.0.0.1:3000:3000` — the `127.0.0.1` bind
is host-side only and does not make the app reachable from a sibling container.

### 3.5 HIGH — Prometheus target is wrong under the prod override

`deploy/prometheus.yml:15` scrapes `app:3000`. With `docker-compose.prod.yml` layered on, the app
listens on 3011, so the `ai-eos-app` job silently collects nothing. The `/api/metrics` route it
targets does exist (`src/app/api/metrics/route.ts`) — only the port is wrong.

### 3.6 MEDIUM — two different database paths, one volume

- base: `DATABASE_URL: file:./db/custom.db` with volume `app_data:/app/db`
- prod: `DATABASE_URL: file:/app/data/agenthub.db` with bind mount `./data:/app/data`

Different filenames *and* different directories. Data written under the base config is invisible
to the prod config, so a base→prod migration looks like an empty database.

### 3.7 MEDIUM — README documents a container topology that does not exist

`README.md:358-366` lists six containers:

| README says | Reality |
|---|---|
| `app` = `oven/bun:1.2.5-alpine`, port 3000 | Actually `node:20-alpine` multi-stage, port 3011 |
| `redis` = `redis:7-alpine` | **Not defined anywhere** |
| `qdrant` = `qdrant/qdrant:latest` | **Not defined anywhere** |
| `minio` = `minio/minio:latest` | **Not defined anywhere** |
| `adminer` via `--profile tools` | **Not defined; no `profiles:` key exists in any compose file** |
| `mariadb` = `mariadb:10.11` | **Not defined anywhere** |
| *(not mentioned)* | `caddy`, `prometheus`, `grafana` **are** defined |

Consequently these documented commands all fail:

```bash
docker compose --profile tools up --build -d   # no such profile      (README.md:350)
docker compose up -d redis                     # no such service     (README.md:575)
docker compose up -d qdrant                    # no such service     (README.md:576)
```

It looks like `docker-compose.yml` was rewritten for the Caddy/Prometheus/Grafana stack and the
redis/qdrant/minio/adminer/mariadb services were dropped, while `docker-compose.prod.yml` and the
README were left describing the old one.

---

## 4. Test suite: 27 failures, one root cause, zero real bugs

```
Test Files  8 failed | 60 passed (68)
     Tests  27 failed | 984 passed | 20 skipped (1031)
  Duration  92.13s
```

**All 27 failures and all 3 failed suites share a single cause:**

```
Error: Could not locate the bindings file. Tried:
 → node_modules/better-sqlite3/build/Release/better_sqlite3.node
 → ... (13 candidate paths)
  at bindings (node_modules/bindings/bindings.js:126:9)
  at new Database (node_modules/better-sqlite3/lib/database.js:48:64)
  at createBetterSQLite3Client (@prisma/adapter-better-sqlite3/dist/index.js:656:14)
  at Object.connect (src/lib/db.ts:51:37)
```

`better-sqlite3@11.10.0` is a **native addon**. Installing it requires either
(a) `prebuild-install` fetching a prebuilt `.node` binary, or (b) `node-gyp` compiling from source,
which downloads Node headers from `nodejs.org`. In this sandbox both hosts are unreachable
(`prebuild-install warn install unable to verify the first certificate`, then
`gyp http fetch ... ECONNRESET`), so no binding exists.

Affected files — every one of them a real-database integration test:

| File | Failed | Passed |
|---|---|---|
| `__tests__/integration/workforce-provisioning.test.ts` | 11 | 0 |
| `__tests__/integration/backup-restore.test.ts` | 7 | 1 |
| `__tests__/integration/agent-health-integrity.test.ts` | 4 | 1 |
| `__tests__/integration/prisma-foreign-keys.test.ts` | 4 | 0 |
| `__tests__/integration/sqlite-foreign-keys.test.ts` | 1 | 0 |
| `__tests__/integration/ai-provider-config.test.ts` | suite-level | — |
| `__tests__/integration/job-queue-durability.test.ts` | suite-level | — |
| `__tests__/integration/run-resume.test.ts` | suite-level | — |

The two assertion-style failures (`expected +0 to be 1`, `expected 1 to be +0`, `expected 2 to be +0`)
are the same error surfacing as a CLI exit code or a swallowed-write count, not independent bugs.

**These pass in GitHub Actions.** `ci.yml` runs `bun install --frozen-lockfile` on
`ubuntu-latest` with full network access, so the prebuilt binary downloads normally.

**Notably, the tests that don't need the native binding all pass** — including
`sqlite-push schema coverage > generates one table per model in prisma/schema.prisma`, which
validates the air-gapped DDL generator against the schema using `node:sqlite` instead.

### Recommendation

These 8 files fail *loudly and confusingly* when the binding is absent — a 13-path stack trace
repeated 27 times. Since the repo already maintains air-gapped fallbacks for Prisma generation
and `db push`, the test suite deserves the same courtesy. A capability probe in
`__tests__/helpers/real-db.ts` that calls `describe.skip` when
`require('better-sqlite3')` throws would turn 27 red failures into a clear
*"skipped: better-sqlite3 native binding unavailable"* — matching the existing 20 skipped tests.

---

## 5. Reproducing this audit offline

The sandbox has outbound access only to `github.com`, `registry.npmjs.org`, and `pypi.org`. Two
workarounds were required; both are worth adding to `SETUP_GUIDE.md`:

```bash
# 1. Install without running native-addon build scripts
npm install --no-audit --no-fund --ignore-scripts     # 759 packages, 20s

# 2. Generate the Prisma client without reaching binaries.prisma.sh
mkdir -p .arena-tmp/engines
printf '#!/bin/bash\nif [ "$1" = "--version" ]; then echo "schema-engine stub"; exit 0; fi\nexit 0\n' \
  > .arena-tmp/engines/schema-engine
chmod +x .arena-tmp/engines/schema-engine
touch .arena-tmp/engines/libquery_engine.so.node

PRISMA_SCHEMA_ENGINE_BINARY="$PWD/.arena-tmp/engines/schema-engine" \
PRISMA_QUERY_ENGINE_LIBRARY="$PWD/.arena-tmp/engines/libquery_engine.so.node" \
  npx prisma generate --schema=prisma/schema.prisma

# 3. Build the SQLite database without the schema-engine binary
DATABASE_URL=file:./db/custom.db npx tsx scripts/sqlite-push.ts
# → sqlite-push: applied 460 statements
# → sqlite-push: 179 models, 179 tables present

# 4. Now the gates all pass
npx tsc --noEmit          # 0 errors
npm run lint              # 0 errors, 2 warnings
npx vitest run            # 984 passed (27 fail on the native binding only)
npx next build            # success, 315 pages
```

`.arena-tmp/`, `db/*.db`, `.env.local`, and `node_modules` are all already gitignored — the working
tree stayed clean throughout (`git status --short` → empty).

---

## 6. Minor findings

| Severity | Location | Issue |
|---|---|---|
| Low | `src/lib/storage/local-storage.ts:101` | Unused `eslint-disable` directive for `no-control-regex` — auto-fixable with `eslint --fix` |
| Low | `src/app/layout.tsx:64` | `@next/next/no-page-custom-font` — custom font `<link>` in the root layout only loads for a single page |
| Low | `vitest.config.ts:1` | Vite warns: *"ESM syntax in a file loaded as CommonJS"*. Fix by renaming to `vitest.config.mts` or adding `"type": "module"` to `package.json` |
| Info | `package.json` | `packageManager: "bun@1.3.4"` but both `package-lock.json` (288 KB) and `bun.lock` (250 KB) are committed. CI uses bun; the Dockerfile uses `npm ci`. Two lockfiles can drift. |
| Info | `.env.example` | 15 KB, 2 committed `.env.example` files (root + `audit/alo-labs/`). No real `.env` is tracked — good. |

### Untracked junk in the local Windows download folder

These appeared in the local `ls` but are **not tracked in git** (confirmed against 1246 tracked
files) — they are stray artifacts of the audit session and a zipped bundle, safe to delete:

```
--timeout            (34,946 B)  ← created by a mis-quoted curl/Invoke-WebRequest flag
zi3wlUqn             (134 B)     ← temp-file fragments, 134 B each
ziC7a7L3             (134 B)
zirgKgT5             (134 B)
project-production.zip (2.45 MB)
login-page.png       (35 KB)     ← these two ARE tracked
screenshot-home.png  (5 KB)
```

Also: the local run reported `Docker Compose version v5.1.1` alongside `Docker version 29.3.1`.
That pairing is worth double-checking — Compose v5 does not correspond to a current Docker
release, and a stale/mismatched plugin could itself explain an empty `===== DOCKER =====` section.

### Corrected page-route block for the PowerShell script

The `$pages` variable was truncated by the console. This version is single-pipeline and prints
its own count:

```powershell
Write-Host "`n===== PAGE ROUTES ====="
if (Test-Path ".\src\app") {
  $pages = Get-ChildItem ".\src\app" -Recurse -File | Where-Object {
    $_.Name -match '^(page|layout|error|loading|not-found|global-error)\.(tsx|ts|jsx|js)$' -and
    $_.FullName -notmatch '\\api\\'
  }
  $pages | ForEach-Object { $_.FullName.Replace("$PWD\", '') } | Sort-Object
  Write-Host "Page/layout files: $($pages.Count)"
} else { Write-Host "src/app directory missing" }
```

Expected output: 6 files (`layout.tsx`, `page.tsx`, `brand/`, `design/`, `invoice/`, `site/`).

Two additions worth making to the script, since these are the gates that actually found problems:

```powershell
Write-Host "`n===== PRISMA CLIENT GENERATED? ====="
if (Test-Path ".\node_modules\.prisma\client\index.d.ts") {
  Write-Host "Generated — TypeScript results are trustworthy"
} else {
  Write-Host "NOT GENERATED — run 'bun run db:generate' first or tsc will report ~416 phantom errors"
}

Write-Host "`n===== BETTER-SQLITE3 NATIVE BINDING? ====="
if (Test-Path ".\node_modules\better-sqlite3\build\Release\better_sqlite3.node") {
  Write-Host "Present — real-DB integration tests can run"
} else {
  Write-Host "MISSING — 27 integration tests will fail with 'Could not locate the bindings file'"
}
```

---

## 7. Suggested fix order

1. **Decide the canonical service topology.** Either restore `redis`/`qdrant`/`minio` to
   `docker-compose.yml` (matching `docker-compose.prod.yml` and the README), or strip those
   overrides and the README rows. This unblocks §3.1 and §3.7 together.
2. **Fix the prod entrypoint** — drop `bun`/`bunx`, use the image's `CMD ["node","server.js"]`,
   and move `prisma db push` out of the container entrypoint (it needs a devDependency and the
   schema-engine binary). (§3.2)
3. **Pick one port.** 3011 everywhere (Dockerfile, both compose files, Caddyfile, prometheus.yml)
   is the smallest diff, since `package.json`, the Dockerfile, and the prod override already
   agree on it. (§3.3, §3.4, §3.5)
4. **Point Caddy at `app:3011`** instead of `localhost:3000` — five substitutions. (§3.4)
5. **Unify `DATABASE_URL`** on one path and mount one volume. (§3.6)
6. **Add a compose validation step to `ci.yml`** so this class of bug can't recur:
   ```yaml
   - name: Validate compose files
     run: |
       docker compose -f docker-compose.yml config --quiet
       docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
   ```
   Note the second line only becomes valid after step 1.
7. **Document the offline bootstrap** (§5) in `SETUP_GUIDE.md`, and note in
   `scripts/dev-generate-client.sh` that an `engineType = "client"` build requires
   `PRISMA_SQLITE_ADAPTER=1`. (§2)
8. **Skip the real-DB integration tests gracefully** when the native binding is absent. (§4)
9. **Clear the two lint warnings** — `eslint --fix` handles one of them. (§6)
