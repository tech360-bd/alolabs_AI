# Union Merge Report — `engralaminn-collab/alolabs.net_ai` → `tech360-bd/alolabs_AI`

**Date:** 2026-10-26
**Source:** https://github.com/engralaminn-collab/alolabs.net_ai.git @ `4792f23` (main, 2026-10-16)
**Destination:** https://github.com/tech360-bd/alolabs_AI.git @ `bd50b29` (main, 2026-10-24)
**Result:** every file from both repositories is present in one project — **1,441 files**
(1,416 already here + 25 cloned in). Nothing was deleted; duplicate code was deduplicated,
and both sides' features are kept.

---

## 1. How the merge was done (three-way, not a blind copy)

The two repos have unrelated git histories, but this repo's root commit
(`87349b8 "Import sanitized ALO Labs AI source"`) differs from source commit
**`0a6df7e`** (2026-10-12) by only **8 sanitized files**. That commit is the true fork
point, so it was used as the merge base:

| | Files |
|---|---|
| Changed only on the source side since the fork | **58** (incl. 25 brand-new files) → taken from source |
| Changed only on this side since the fork | ~287 → kept as-is |
| Changed on **both** sides | **12** → hand-merged (see §3) |
| Identical in both repos | 1,038 → untouched |
| Deleted on either side | 0 |

All 12 source `arena/*` branches have **0 commits not in `main`**, so `main` contains
everything the source repo has. The merge was performed with a real `git merge`
(destination HEAD grafted onto the fork base), producing only **10 conflicted files**,
each resolved by hand below. A final audit verified: **0 files missing from either side.**

Sandbox sanitization was preserved: the 8 files sanitized at import time (test/doc API-key
fixtures etc.) kept the destination's sanitized contents — no secret was re-introduced.

---

## 2. What the clone brought in (source-only changes, 58 files)

**New subsystems (25 new files)**
- `src/lib/production-database.ts` + test — production datasource policy (MySQL/MariaDB enforced in production, SQLite refused)
- `src/lib/session-token.ts`, `src/lib/session-index.ts` + `session-keyspace.test.ts` — hashed session tokens + per-user session index
- `src/lib/internal-url.ts` + test — `internalBaseUrl()` / `publicBaseUrl()` replacing hardcoded `http://localhost:3000`
- `.github/workflows/mysql.yml`, `__tests__/helpers/paid-services.ts`, `scripts/ci-paid-services.sh` + `ci-paid-services.test.ts` — default-deny paid-services gating for CI
- `__tests__/unit/ai-provider-timeout-failover.test.ts` (pairs with the router change, §3)
- `__tests__/integration/mysql-compatibility.test.ts`, `__tests__/unit/lib/production-database.test.ts`
- `scripts/validate-{compose,route-auth,workflow-security,workflows}.mjs` — dependency-free CI guards
- `deploy/caddy/*.Caddyfile`, `deploy/scripts/setup-deploy-target.sh`
- `docs/CI_PAID_SERVICES.md`, `docs/DEPLOYMENT-RUNBOOK.md`, `docs/PRODUCTION_MYSQL.md`, `audit/ARENA-AUDIT-RESULTS.md`, `audit/MILESTONE-A-GAP-ANALYSIS.md`

**Source-upgraded files (33)** — `src/lib/auth.ts`, `src/lib/db.ts` (lazy client + production
datasource assertion, `describeDatasource()`), `src/lib/session-manager.ts`,
`src/app/api/health/*` (real `SELECT 1` verification, honestly derived status),
`src/app/api/auth/sessions/route.ts`, `src/instrumentation.node.ts`, `src/proxy.ts`
(explicit `/api/health/ping` allowlist entry), `Dockerfile`, `docker-compose*.yml`,
`Caddyfile`, `nginx.conf.example`, systemd unit, `deploy/scripts/deploy.sh`,
hardened GitHub workflows (SHA-pinned actions), `SETUP_GUIDE.md`, and matching tests.

Everything that existed only here (170 files: command-agent, free-model routing,
multi-tenant AI, AI-employee identities, S3 storage rewrite of `minio.ts`, inference
tiers, media generation, workforce tooling, …) is **kept untouched**, as are
`prisma/schema*.prisma` (this side is a strict superset) and both lockfiles
(merged `package.json` adds only one script, no dependency changes — the source's
`minio` dependency was *not* re-added because this side deliberately replaced it
with AWS SDK v3 for security reasons, documented in `src/lib/minio.ts`).

---

## 3. Files changed on both sides — how each conflict was resolved

| File | Resolution |
|---|---|
| `.env.example` | Auto-merged. Union of all keys; port is `3011` everywhere (older `3000` duplicates superseded); MySQL production block + SQLite dev default both documented. |
| `README.md` | Auto-merged. Source's accurate Docker service table kept; this side's older table (port 3000) superseded. |
| `package.json` | Union of scripts (adds source's `lint:workflows`); dependency set = this side's superset; newer versions kept (`next ^16.4.3`, `zod ^4.6.6`). |
| `.github/workflows/backup.yml` | Both sides implemented the same secret-validation gate → deduplicated to this side's shared script (`.github/scripts/validate-production-secrets.sh`); source's SHA-pinned `ssh-action`, ungated-backup rationale comment, and this side's failure annotations all kept. |
| `.github/workflows/deploy.yml` | Source's explicit-approval gate (`workflow_dispatch` + `confirm_production_deploy`) + this side's separate `deployment-config` validation job (deploy `needs` it) + SHA-pinned actions + source's private-staging-dir hardening + this side's `APP_DIR` resolution. |
| `.github/workflows/ci.yml` + `deploy.yml` | Both referenced `steps.paid.outputs.skip_paid` but **neither side defined that step** (pre-existing source bug). Added the missing *Resolve paid-services policy* step mirroring `backup-portability.yml`'s canonical pattern. Removed a duplicated `permissions:` block in `ci.yml`. |
| `docs/CI-CD-GUIDE.md` | Documented `SKIP_PAID_SERVICES` in the secrets table — `validate-workflow-security` fails on the pristine source without it; now passes. |
| `scripts/migrate-sqlite-to-mysql.ts` | Both safety stances combined: this side's *dry-run-only legacy importer* guard **and** source's non-empty-target pre-flight (`--allow-overwrite`), explicit `MYSQL_TARGET_URL` requirement, and `mysql://` URL validation with password masking. |
| `src/lib/ai-router/router.ts` | Source's `shouldAttemptFailover()` (fail over on provider **timeout**/503, unified streaming + non-streaming) combined with this side's `allowFailover` context gate, free-only/allowed-model failover filtering, decision telemetry, and a re-added `attemptStreamFailover()`. Extra guard: a **caller-initiated abort never fails over** (this side's providers merge the caller signal with the provider timeout — exactly the case the source's comment warned about). |
| `src/lib/storage/local-storage.ts` | Source's explanatory comment kept (both sides removed the same dead eslint directive). |
| `src/lib/workers/handlers.ts` | This side's authenticated multi-tenant `AIWorker` rewrite kept; source's `internalBaseUrl()` applied to the 5 remaining `NEXT_PUBLIC_APP_URL ?? http://localhost:3000` call sites. |
| `src/app/api/email/reply/route.ts` | Result = this side's version: source only changed a helper (`callAI`) that this side had already replaced with `executeCompanyAIChat`; no code lost. |
| `src/app/api/llm/stream/route.ts` | Result = this side's version: source only fixed a hardcoded localhost URL inside `autoSelectModel`, which this side's rewrite removed entirely (no internal HTTP call remains). |
| `src/app/api/media/ai-tag/route.ts` | Result = this side's version: source exposed a *public* image URL to a third-party VLM; this side sends storage bytes as base64 instead, so no public URL is needed. |

### Test adaptations required by the union (4 files, behavior preserved)
- `__tests__/unit/ai-provider-timeout-failover.test.ts` — loopback test providers are now
  registered with `{ isLocal: true }`, because this side's router billing-gates
  non-local providers unless the caller context explicitly allows paid use.
- `__tests__/api/health.test.ts`, `__tests__/api/health-v2.test.ts`,
  `src/__tests__/api/health.test.ts` — set a dummy `OPENAI_API_KEY` before router
  initialisation: the source health route honestly reports `degraded` when **zero**
  providers are configured, and this side registers providers (incl. ZAI) on an
  explicit opt-in basis only. The tests assert the fully-healthy shape.

---

## 4. Verification (2026-10-26, this sandbox)

| Check | Result |
|---|---|
| File union audit | **1,441 files; 0 missing from either repo** |
| `npm run typecheck` (`tsc --noEmit`) | ✅ clean, 0 errors |
| `node scripts/validate-compose.mjs` | ✅ OK |
| `node scripts/validate-route-auth.mjs` | ✅ OK — 409 route files, every non-public handler references an auth helper |
| `node scripts/validate-workflow-security.mjs` | ✅ OK (fails on the pristine source — fixed here) |
| `node scripts/validate-workflows.mjs` | ✅ all 8 workflows valid |
| ESLint (all merged/new source files) | ✅ 0 problems |
| `vitest run` | **1,343 passed**, 31 failed, 36 skipped (110 files: 101 passed) |

The 31 failing tests are all in *"real SQLite database"* integration suites
(workforce provisioning, FK integrity, backup/restore, job queue, run-resume,
agent-health). They fail because this sandbox cannot download the Prisma query
engine or the `better-sqlite3` native binding (restricted network), with
`Prisma Client could not locate the Query Engine for runtime "debian-openssl-3.0.x"`.
**This was proven pre-existing**: the same suite was run against the unmerged
destination tree (`git stash`) and fails identically. They are expected to pass in
GitHub CI, where `bun install` can fetch native binaries.

### Behaviour changes to be aware of after this merge
1. **Production database**: first DB touch under `NODE_ENV=production` now requires a
   `mysql://`/`mariadb://` `DATABASE_URL` (see `docs/PRODUCTION_MYSQL.md`). SQLite remains
   for dev/test only.
2. **Sessions**: storage moved to hashed session tokens + per-user index
   (`src/lib/session-token.ts`) — existing sessions are invalidated on deploy.
3. **Health endpoint**: `/api/health` now actually verifies the database and provider
   registration; expect honest `degraded`/`unhealthy` statuses (and HTTP status) when
   misconfigured, instead of always-healthy.
4. **CI**: paid/production steps are default-denied (`SKIP_PAID_SERVICES`, see
   `docs/CI_PAID_SERVICES.md`); the production deploy additionally requires a manual
   dispatch with `confirm_production_deploy=true`.
