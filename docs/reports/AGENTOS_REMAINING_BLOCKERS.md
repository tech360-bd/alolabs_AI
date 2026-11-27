# AgentOS — outstanding blockers and exact authorization required

**Date:** 2026-11-27. This file exists so that "100% complete" cannot be claimed by
omission. Every stage of the completion brief is listed with its status label and
the precise thing standing in the way.

Labels: **VERIFIED COMPLETE** · **IMPLEMENTED, NOT RUNTIME-VERIFIED** ·
**BLOCKED BY OWNER AUTHORIZATION** · **BLOCKED BY EXTERNAL DEPENDENCY** ·
**NOT COMPLETE**.

---

## P0 — Repository, tenant security, runtime

| Item | Status | Note |
| --- | --- | --- |
| Repository identity / branch / HEAD verified | **VERIFIED COMPLETE** | `tech360-bd/alolabs_AI`, branch `arena/5010a0d6-alolabs-ai`; see baseline |
| T-1 job/run tenant mismatch | **VERIFIED COMPLETE** | `assertJobTenantMatchesRun` in the dispatcher; suite green |
| T-2 default pseudo-tenant removed | **VERIFIED COMPLETE** | `createRun` throws; probe asserts `'default-company'` is rejected |
| T-3 principal resolution | **VERIFIED COMPLETE** | `platform/principal.ts`, Company-first |
| T-4 explicit workspace/company scope | **VERIFIED COMPLETE** | `requireWorkspace` in `platformRoute` |
| T-5 SSE tenant comparison | **VERIFIED COMPLETE** | both sides required to be real tenants before comparison |
| T-6 (original threat) | **VERIFIED COMPLETE** | see `docs/security/tenant-isolation-threat-model.md`; fix and tests landed in the tenant-security workstream |
| T-7 cross-tenant system scope | **VERIFIED COMPLETE** | `resolveSystemScopes` + `assertSystemOperation`; reused by the Command Center |
| T-8 approval/run/reviewer consistency | **VERIFIED COMPLETE** | `resolveRunApproval` enforces one company |
| Run lifecycle 20 behaviours | **VERIFIED COMPLETE (19/20 runtime)** | `docs/reports/runtime-acceptance-report.md`; the 20th (provider timeout under load) needs a live provider |
| Command Center dispatch path | **VERIFIED COMPLETE** | `npm run verify:operator` 15/15 |

## Stage 3 — Shared-host capacity

| Item | Status | Note |
| --- | --- | --- |
| Compose/systemd budget review, log rotation, snapshot retention, backup safety | **NOT COMPLETE** in this session | The capacity workstream lives on `arena/197acd9a-alolabs-ai`; it was **not** merged here and must not be silently dropped. Inspect that branch before starting anything new. |
| `validate-capacity` / `validate-compose` gates in CI | **NOT COMPLETE** | Not present in `package.json` in this tree |
| Pressure testing on a safe host | **BLOCKED BY OWNER AUTHORIZATION** | Requires a staging host; disruptive tests on the shared host are explicitly gated |

## Stage 4/5 — Production database and migrations

| Item | Status | Note |
| --- | --- | --- |
| Migration safety gate | **VERIFIED COMPLETE** | 15 forward / 12 rollback paired, no destructive DDL |
| Dual-schema parity | **VERIFIED COMPLETE** | 266/266 models |
| Live MySQL integration tests | **BLOCKED BY EXTERNAL DEPENDENCY** | 15 skipped without `MYSQL_TEST_URL` |
| Company ↔ AiWorkspace production mapping / migration | **BLOCKED BY OWNER AUTHORIZATION** | Needs a verified production backup, mapping report, staging rehearsal and an approved window |
| Rollback for the four legacy migrations | **NOT COMPLETE** | Must be resolved (paired SQL or a documented compensating recovery) before any production migration |

## Stage 6 — Skipped tests and error handling

| Item | Status | Note |
| --- | --- | --- |
| 15 skipped MySQL tests | **BLOCKED BY EXTERNAL DEPENDENCY** | documented, not counted as passed |
| `assembleAndFinish` episodic-memory fix | **VERIFIED COMPLETE** | fixed in the earlier workstream; guarded warning + tenant scope |

## Stage 7 — Core capabilities

| Module | Status |
| --- | --- |
| AI Gateway (providers, models, keys, fallback, metering) | **VERIFIED COMPLETE** |
| Agent Builder / orchestration | **VERIFIED COMPLETE** for runs, approvals, retries; **NOT COMPLETE** for multi-agent fan-out |
| Memory & RAG | **VERIFIED COMPLETE** (tenant-scoped, tested) |
| Workflow automation | **VERIFIED COMPLETE** (17 definitions / 109 steps, gate green) |
| CRM & communication hub | **VERIFIED COMPLETE** |
| Developer Cloud / deployment tracking | **NOT COMPLETE** — no deployment agent is bound to a host |
| Storage & files | **VERIFIED COMPLETE** (tenant-scoped upload/download, signed URLs) |
| Billing & usage | **VERIFIED COMPLETE** |
| Enterprise administration | **VERIFIED COMPLETE** |

## Stage 8 — Command Center

See `docs/reports/SUPER_ADMIN_ACCEPTANCE.md`: **9/20 verified**, 1 implemented but
not runtime-verified, 1 blocked by dependency, 9 not complete. The nine are all
downstream of two capabilities:

1. **A headless browser** — `npm i -D playwright && npx playwright install chromium`
   (network + ~170 MB of binaries). Not possible in this sandbox: only package
   registry hosts are reachable.
2. **A bound coding agent** — a provider credential plus the agent adapter
   configured for the project. Without it, `run_tests` and `inspect_repository`
   can plan and record but not execute.

Neither is a code gap; both are deployment decisions that need the owner.

## Stage 9 — Environment & integration manager

**NOT COMPLETE.** What exists: provider credentials are stored encrypted with
envelope encryption and validated through the AI Gateway; configuration is
versioned per provider. What is missing: per-environment variable inventory,
write-only secret entry for arbitrary variables, change history with rollback, and
a host-side apply step. This needs:

- a schema addition (`EnvironmentConfig` + `EnvironmentConfigVersion`) in all three
  Prisma schemas with paired migrations;
- an allowlisted deployment-agent operation to apply a config to one service.

Prepared plan is in `docs/ENVIRONMENT_AND_SECRET_MANAGEMENT.md` (marked
`NOT IMPLEMENTED`), and the intent `create_environment` already classifies and
gates the request so nothing is dispatched optimistically.

## Stage 10–13 — Integrations, frontend/backend, security, observability

| Item | Status |
| --- | --- |
| Integration inventory | **VERIFIED COMPLETE** — 26 adapters, 88-row register with per-row verdicts (`/site/stack`) |
| Frontend/backend integration audit | **NOT COMPLETE** for the whole product; verified for the panels touched here |
| Final security review | **NOT COMPLETE** as a full sweep; the new surfaces are reviewed and tested (SSRF matrix, RBAC, tenant boundaries, audit) |
| Observability & alerts | **NOT COMPLETE** — thresholds are documented, not verified against a running Prometheus/Grafana |

## Stage 14–15 — Gates and documentation

| Item | Status |
| --- | --- |
| Typecheck / lint / tests / build / route / migration / link gates | **VERIFIED COMPLETE** — see `FINAL_CI_AND_TEST_VERIFICATION.md` |
| Super Admin / browser / operator docs | **VERIFIED COMPLETE** (this session) |
| Capacity, host recovery, config-recovery runbooks | **NOT COMPLETE** — depend on Stage 3/9 work |

## Explicit owner authorizations required

1. **Production deployment** of this branch after merge.
2. **Production Company ↔ AiWorkspace migration** (backup + mapping + staging
   rehearsal + window).
3. **Secret rotation** for any live provider credential.
4. **Adding an operator** to `ALO_SYSTEM_OPERATORS` (cross-tenant capability).
5. **Disruptive load testing** on the shared host.
6. **Installing browser binaries** (`playwright install chromium`, ~170 MB) and a
   provider credential to make Command Center items 2–15 executable.

Nothing above has been performed. No production operation was attempted in this
session.
