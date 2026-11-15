# ALO Labs AgentOS — Complete Repository Audit

**Repository:** `tech360-bd/alolabs_AI`
**Branch audited:** `arena/d02e7b8a-alolabs-ai` @ `ae33423` (Merge PR #38, 2026-11-14)
**Audit date:** 2026-11-15
**Auditor:** Arena Agent
**Method:** direct file reads, schema extraction, CLI execution against a real
SQLite database, full test suite, typecheck, production build.

Every statement below is backed by a file path, a command, or a test result.
Nothing is inferred from a page, seed script or UI component existing.

---

## 1. Repository facts

| Item | Value | Evidence |
|---|---|---|
| Default branch | `main` | `git branch -a` |
| Branches present | `main`, `arena/d02e7b8a-alolabs-ai` | `git branch -a` |
| `phase6-autonomous-ai-workforce` branch | **absent** | `git branch -a` |
| Draft PR #23 | **merged** 2026-11-09, not open | `gh pr list --state all` |
| Open PRs | 0 (PRs #1–#38 all merged) | `gh pr list --state all` |
| Latest merged PR | #38 `feat/v1-ai-research-and-docs` | `git log --oneline -20` |
| Package | `alolabs-agentos@1.0.0`, private | `package.json` |
| Stack | Next.js 16.4.3 (Turbopack), React 19, Prisma 6.19.2, TypeScript | `package.json` |
| Node engine | `>=20`, sandbox ran v22.22.3 | `package.json` |

> **Correction to the master prompt's assumption:** `phase6-autonomous-ai-workforce`
> and a *Draft* PR #23 do not exist as described. PR #23 is merged. There is no
> unmerged workforce branch to preserve — the workforce code is already on `main`.

## 2. Codebase size (measured)

| Surface | Count | Command |
|---|---|---|
| API route handlers (`route.ts`) | 451 | `find src/app/api -name route.ts \| wc -l` |
| Prisma models | 228 | `grep -c "^model " prisma/schema.prisma` |
| Test files | 159 | `find __tests__ src/__tests__ -name "*.test.*" \| wc -l` |
| React components | 245 | `find src/components -name "*.tsx" \| wc -l` |
| Library modules | 316 | `find src/lib -name "*.ts" \| wc -l` |
| CI workflows | 8 | `ls .github/workflows` |
| Docs | 100+ files | `ls docs` |

This is a mature, large codebase. A rebuild would be destructive and was not
attempted.

## 3. Verified working features

These were confirmed by reading the implementation *and* executing it.

### 3.1 Workforce (100 departments / 2,000 agents / 2,000 employees)

**Executed against a real database** (`db/custom.db`, 228 tables, 591 DDL
statements applied by `scripts/sqlite-push.ts`):

```
npx tsx scripts/seed-100-departments.ts --apply
npx tsx scripts/provision-workforce.ts --apply
npx tsx scripts/provision-ai-employee-identities.ts --apply
npx tsx scripts/verify-2000-workforce.ts --verify
```

Result (from the tool's own JSON):

| Metric | Value |
|---|---|
| `departmentsOwned` | **100** |
| `agentsOwned` | **2000** |
| `agentsProvisioned` | **2000** |
| `agentsDrifted` / `departmentsDrifted` | 0 / 0 |
| `agentsOrphaned` | 0 |
| `agentsCrossTenantKeyClash` | 0 |
| `agentsMissingAccess` | 0 |
| `identities` | **2000** |
| `identitiesMissing` / `orphaned` | 0 / 0 |
| `invalidExecutionEvidence` | 0 |

Deterministic plan check (pure, no DB):

```
npx tsx  (buildWorkforcePlan(getDepartmentRegistry().getAllDepartments()))
→ 100 departments, 2000 agents, 20 per department,
  2000 unique agentIds, 2000 unique employee keys,
  planHash 509e801a5e24a8c1b1af236dbc5f73ad829e22f42b495d18f5dca6cf5e09a7a7
→ sample: AGENT-0001 "Executive Office Director Agent" (reasoning), AIEMP-0001
```

**Working:** `src/lib/workforce/plan.ts` (deterministic 100×20 builder),
`provision.ts` (never deletes, refuses on conflict), `verify.ts` (field/forbidden
tool/knowledge-scope/drift checks), `employee-identities.ts` (AIEMP-0001..2000,
one director per department, SHA-256 config hash).

### 3.2 AI gateway, routing and failover

`src/lib/ai-router/router.ts` (1,177 lines) — verified by tests:
- Circuit breaker: `CIRCUIT_FAILURE_THRESHOLD=5`, `COOLDOWN=60s`, `HEALTH=30s`.
- Failover predicate `shouldAttemptFailover` covers 503, timeout, open circuit,
  quota exhaustion.
- Streaming failover **stops after any token was emitted** — prevents duplicated
  or garbled output.
- Every decision is persisted to `ModelRoutingDecision` via the installed
  recorder (`src/lib/ai-router/index.ts`).

`src/lib/multi-tenant-ai/service.ts` (952 → 1,010 lines):
- `MAX_ROUTE_ATTEMPTS = 4`, ordered candidates (local < verified-free < paid),
  one `ModelUsageRecord` + audit event per attempt.
- Embeddings route through `free_embeddings`.
- `deferCompanyAIMedia` fails closed.

`src/lib/multi-tenant-ai/policy.ts` (264 lines):
- `isFreeTierVerified` requires `verified_free` + official docs + commercial use
  allowed + no automatic billing + verification ≤30 days.
- `isFreshQuotaSnapshot` ≤1 hour.
- `isPaidPricingVerified` ≤30 days with an exact price match.

### 3.3 Provider layer

- 20 configurable provider kinds (`CONFIGURABLE_PROVIDER_KINDS`).
- Encrypted keys at rest (AES-256-GCM), fingerprint only in APIs.
- SSRF guards on `baseUrl` (metadata, link-local, credentials-in-URL blocked).
- Local endpoints must be literal loopback or RFC1918/ULA.
- Free-only adapters enforce an upstream $0 pricing gate (`free-models.ts`);
  UnoRouter additionally requires a `:free` id suffix.

### 3.4 Security and governance

- bcrypt (12 rounds), JWT ≥32 chars in prod, opaque sessions SHA-256 hashed at
  rest with TTL + idle timeout.
- Field encryption `v1:iv:tag:ct` via `ENCRYPTION_KEY`/`APP_SECRET`.
- Prompt-injection / secret / PII validators with risk scoring.
- Deny-by-default tool policy, no wildcards, approval gating for high-risk tools.
- CSRF double-submit; per-IP rate limits; explicit public-route allowlist.

### 3.5 Infrastructure

- Docker Compose (app 3011 behind Caddy, Redis 7, Qdrant, MinIO); prod overrides
  add auth and resource limits.
- PM2 (`ecosystem.config.js`).
- Durable job queue: atomic claim, lease, heartbeat, jittered exponential
  backoff, `idempotencyKey`, dead-letter, cancellation.
- In-process cron scheduler with 4 pre-registered jobs.

### 3.6 CI

8 workflows. `ci-paid-services.sh` is default-deny: `SKIP_PAID_SERVICES`
unset/typo → paid services skipped.

## 4. Incomplete features found (and closed in this branch)

| # | Gap | Evidence | Status |
|---|---|---|---|
| 1 | No global FREE-ONLY switch. Free-only existed only as per-provider `freeOnly` + per-company `allowPaid`. A company with `paidApiAllowed` could spend even in "free" deployments. | Grep for `FREE_ONLY` across `src/` returned nothing. | **Closed** — `src/lib/ai-router/free-only-mode.ts`, wired into router + service + provider-admin. |
| 2 | Seven advertised free providers were never registered. `.env.example` documents `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SAMBANOVA_API_KEY`, `NVIDIA_API_KEY`, `HF_TOKEN`, `GITHUB_MODELS_TOKEN`; `providersFromEnvironment()` built none of them. | `provider-registry.ts` env block. | **Closed** — `free-provider-specs.ts`. |
| 3 | No idempotency for direct AI calls. Covered: task submission (`IdempotencyKey`), queue delivery (`QueueItem.idempotencyKey`). Not covered: `executeCompanyAIChat`. | `grep -rn idempotency src/lib` | **Closed** — `multi-tenant-ai/idempotency.ts`. |
| 4 | No weekly open-source/model discovery job. Only a one-off generated skill catalogue (2026-11-02). | `grep` on `cron-jobs.ts`; `src/lib/discovery/engine.ts` is capability discovery, not model discovery. | **Closed** — `ai-discovery/weekly-discovery.ts` + cron entry. |
| 5 | No Model Control Center UI. Super Admin had providers/policy/evidence/usage tabs but no unified model dashboard, failover monitor or cost monitor. | `super-admin-ai-control-plane.tsx` tabs. | **Closed** — `/api/super-admin/ai/model-center` + `model-control-center.tsx` panel. |

## 5. Broken / blocked features

| # | Issue | Evidence | Disposition |
|---|---|---|---|
| B1 | `better-sqlite3` native addon cannot build in the audit sandbox (node-gyp downloads headers from an unreachable host). | `npm rebuild better-sqlite3` → ECONNRESET to nodejs.org. | **Environmental, not a code defect.** Worked around with a sandbox-only shim (`scripts/dev/`) so DB verification could proceed. Production installs with network access are unaffected. |
| B2 | 14 DB-integration tests fail in this sandbox. | Full suite run. | **Pre-existing.** Reproduced identically on the untouched base commit `ae33423` in a clean worktree (5 failures in `job-queue-durability` + `prisma-foreign-keys`, 9 in `backup-restore` + `agent-health-integrity` + `sqlite-foreign-keys`). Not caused by this branch. |
| B3 | No live Postgres/MySQL, Ollama, or Redis in the audit sandbox. | `DATABASE_URL`, `REDIS_URL` unset; Ollama unreachable. | **Not verifiable here.** No claim of live inference verification is made. `scripts/verify-inference.ts` exists for that purpose and is honest about failing when no gateway is reachable. |

> Note: the master prompt refers to "existing PostgreSQL". The repository is
> **MySQL/MariaDB in production** and SQLite in development
> (`src/lib/production-database.ts` refuses a SQLite datasource in production).
> There is no PostgreSQL datasource. This is documented rather than changed.

## 6. Missing features (documented, not implemented)

| # | Feature | Why not implemented |
|---|---|---|
| M1 | Automatic model *registration* from discovery | Deliberate: the master prompt forbids auto-adopting a new model. Discovery produces review candidates only. |
| M2 | Model health-check UI action per model | Provider-level health check exists (`testProviderConfig`). Per-model probing is not implemented because most providers do not expose a per-model probe. |
| M3 | "Current tasks" per agent in the workforce monitor | Agent execution is approval-gated and instance-based; no read-only aggregate yet exists. Listed as a remaining limitation rather than faked. |

## 7. Security problems found

| # | Finding | Severity | Status |
|---|---|---|---|
| S1 | In FREE-ONLY mode there was no code-level guarantee against a paid call, because the only gate was per-company policy. | High (cost) | Fixed — router filter + service gate + provider-registration guard. |
| S2 | A duplicate AI call could double-consume quota and duplicate tool side effects. | Medium | Fixed — idempotency reservation. |
| S3 | `npm ci` reports 12 vulnerabilities (11 moderate, 1 high) in the dependency tree. | Medium | **Reported, not fixed.** Upgrading transitive dependencies is out of scope for a preservation-first change and needs its own reviewed PR. |

## 8. Database and infrastructure risks

| # | Risk | Detail |
|---|---|---|
| D1 | 228 models in one schema; SQLite dev vs MySQL prod parity is tested by `__tests__/unit/mysql-schema-compatibility.test.ts` | Passing. |
| D2 | `ModelUsageRecord.correlationId` is not unique | Used by the new idempotency layer with an explicit race re-read. A unique partial index would be stronger but needs a migration; deferred and documented. |
| D3 | Provisioning writes `companyId` = Company **id** for Agent/Department, but identity rows use the tenant **slug** | Verified in data: `Agent.companyId = cmwhuafqy0000smnzo79ivid1` (`alo-labs`). Any new query must resolve both. The new verification script does. |

## 9. Implementation plan (executed)

1. Preserve everything; add only new modules and narrow edits. ✅
2. Global FREE-ONLY mode with tests. ✅
3. Register the advertised free providers. ✅
4. Idempotency for AI calls. ✅
5. Weekly discovery job + report CLI. ✅
6. Model Control Center API + panel. ✅
7. DB-backed workforce verification script. ✅
8. Typecheck + full test suite + production build. ✅
9. Reports + PR. ✅

## 10. Build and test results

| Gate | Result | Command |
|---|---|---|
| TypeScript (`tsc --noEmit`) | **PASS**, 0 errors | `npx tsc --noEmit -p tsconfig.json` |
| Production build | **PASS**, exit 0, standalone server emitted | `npm run build` |
| Test suite | **1,850 passed**, 14 failed (all pre-existing), 15 skipped | `npx vitest run` |
| Workforce DB verification | **PASS**, 100 / 2,000 / 2,000 | `scripts/verify-2000-workforce.ts --verify` |
| Execution probe verification | **PASS**, 14/14 checks | `scripts/verify-workforce-execution.ts --execute` |

> The build's in-process type checker is memory-hungry. Transient "Failed to
> type check" results occurred under memory pressure while standalone `tsc`
> reported zero errors; a clean run of `npm run build` succeeds. This is a
> sandbox memory characteristic (3.9 GB), not a code error.
