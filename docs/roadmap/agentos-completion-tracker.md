# AgentOS Completion Tracker

The single source of truth for what is done, what is not, and what is proven.
Every capability in the master execution contract (A1) appears here. A row may
only be marked `VERIFIED_COMPLETE` when its acceptance tests pass **and** the
evidence is a command that was actually run and whose output is recorded.

## Status vocabulary

| Status | Means |
| --- | --- |
| `NOT_STARTED` | No work begun. |
| `IN_PROGRESS` | Implementation underway, tests not yet written or not yet green. |
| `BLOCKED` | Cannot proceed. Blocker, evidence, impact and next action are recorded in the row. |
| `IMPLEMENTED` | Code exists and typechecks; acceptance tests not yet green. |
| `TESTED` | Acceptance tests written **and passing** locally. |
| `MERGED` | Merged to `main`, merge commit recorded. |
| `DEPLOYED` | Running in the target environment via the approved workflow. |
| `VERIFIED_COMPLETE` | Deployed **and** behaviour verified with recorded evidence. |

Honest reporting rule: nothing above `TESTED` may be claimed without a recorded
command. Nothing may be called 100% complete while any A1 requirement is below
`VERIFIED_COMPLETE`.

## Stage map

| Stage | Scope | State |
| --- | --- | --- |
| 0 | Baseline verification | **COMPLETE** — recalibrated on a green `main` (`e0d6577`): CI, MySQL, deploy-safety and security-scan workflows all passing |
| 1 | Tenant security (T-1 … T-8, schema, route classification) | **TESTED** — T-1…T-8 fixed and tested; all 542 routes classified; **39 legacy routes** scoped through `legacyTenant`; factory build-log leak closed (see A1.4); 35+ additional routes (`rag`, `automation`, `jobs`, `usage`, `cost-estimate`, `observability`, `protection`, `webhooks`, `integrations`, `api-management`, `gateway/sign`, `marketplace`, `outputs`, `task-steps`, `skill-runs`, `company/command`, `tenant-gateway`) moved onto an explicit tenant gate; production migration still gated on owner authorisation |
| 2 | Runtime acceptance (20 run-engine behaviours + 22 failure scenarios) | **TESTED** — `run-engine-behaviours.test.ts` (20 behaviours) and `runtime-acceptance-{behaviours,failures}.test.ts` all green |
| 3 | Core AgentOS (gateway, agents, orchestration, memory) | **TESTED** — platform suites, 2,000-agent provisioning, tenant-scoped memory, RAG isolation |
| 4 | Customer operations (CRM, channels, workflows) | **TESTED** — CRM/voice/workflow integration suites + tenant-scoped automation routes |
| 5 | Developer + infrastructure (cloud, scaling) | **TESTED** — capacity contract, API keys, HMAC signing, standalone packaging verified |
| 6 | Enterprise (admin, RBAC, audit, billing) | **TESTED** — `system:cross-tenant` auditing, approvals, tenant-scoped observability/protection |
| 7 | Integration and hardening (full test matrix) | **TESTED** — full vitest matrix, route gates, MySQL parity, migration safety all green |
| 8 | Close every requirement, handover reports | **TESTED** — `docs/reports/{security-verification-report,FINAL_COMPLETION_SUMMARY,FINAL_COMPLETION_BASELINE}.md` written |

---

## Baseline restoration (2026-11-27)

`main` was red when this stage resumed: PR #66 merged while its CI was failing.
Restoring it exposed four further defects, all now fixed on `main` at `e0d6577`.

| # | Defect | Impact | Fix |
| --- | --- | --- | --- |
| 1 | Build-blocking TypeScript errors: `0n` BigInt literal at an ES2017 target, `TaskType` removed while still imported, four `canAdministerWorkspace` calls with the old arity, an out-of-scope `companyId`, and a `tenantWhere` default that Prisma rejects | The production build could not compile | Corrected each; `TaskType`/`TASK_REQUIREMENTS` restored as the single source of truth |
| 2 | `GET /api/agent-factory/build` returned **every tenant's** build requests | Cross-tenant disclosure of agent names, department ids and config payloads | `companyId` added to the three factory build-request models (nullable, no backfill — legacy rows fail closed); migration `20261127_factory_build_request_tenant.sql` + rollback; test proves A sees only A |
| 3 | A deployment marked `unreachable` was excluded from routing **permanently** | One transient outage silently shrank the fallback chain for good | Liveness is decided by the live probe; health still orders and reports |
| 4 | `providers.integration.test.ts` had never run in CI | CI set `DATABASE_URL=file:./ci.db`, which nothing created, so availability returned 503 and the chain never executed | Suite provisions its own throw-away database |
| 5 | Two CI gates had never executed because the test step failed first: the destructive-SQL scan flagged the migration checker's own pattern list, and the route-auth gate did not know `legacyTenant`/`platformRoute` | 52 handlers reported as unauthenticated; one false destructive-DDL hit | Scan tokens built at runtime; both helpers documented and recognised. Both gates verified still able to fail |

Current gate state on `main` (`e0d6577`): CI, MySQL schema, Production
database-safe deployment and Security Scan all **pass**; 241 test files /
2634 passed / 0 failed / 15 skipped; route classification 542 of 542; migrations
13 forward / 10 rollback all paired.

## Branch verification (`arena/5010a0d6-alolabs-ai`, merged with `main` at `5e5c9a4`)

Re-verified after merging current `main` into this branch (twice — `f0230c8`
then `5e5c9a4`). Exact commands and outputs, from the final state:

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck (`src/`) | `npm run typecheck` | **PASS** — 0 errors |
| Typecheck (`__tests__/`) | `npm run typecheck:tests` | **PASS** — 0 errors |
| Lint | `npm run lint` | **PASS** — 0 errors |
| Route classification + migration safety | `npm run verify:security` | **PASS** — 544/544 classified, 0 unclassified; 15 forward / 12 rollback paired, 0 destructive DDL *(re-run 2026-11-27)* |
| Route auth gate | `node scripts/validate-route-auth.mjs` | **PASS** — 544 files, 856 non-public handlers, 21 allowlist entries, 2 documented exceptions |
| Dual-schema parity | `npm run verify:mysql` | **PASS** — 266/266 models, 669 indexed fields, 0 parity errors, 0 collisions |
| Prisma delegates | `npm run check:prisma-delegates` | **PASS** — 227 delegates |
| Workflows / skills | `npm run check:workflows` · `npm run skills:verify` | **PASS** — 17 definitions / 109 steps; 838 skills, 0 problems |
| Security suites | `npx vitest run __tests__/security` | **PASS** — 7 files, 50 tests |
| Full matrix | `npx vitest run` | **PASS** — 246 files passed / 1 skipped (live MySQL), **2,717 tests passed**, 0 failed, 15 skipped *(2026-11-27)* |
| Native runner | `node --test __tests__/**/*.node*.mjs` | **PASS** — 7/7 |
| Production build | `PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run build` | **PASS** — exit 0; standalone bundle 11,373 files verified; packaged `realtime-service.cjs` / `queue-service.cjs` load cleanly *(2026-11-27)* |

What the merge passes found, and what was fixed:

1. **Packaged mini-services crashed on load.** The SQLite adapter resolved its
   `require` from `createRequire(import.meta.url)`; esbuild rewrites `import.meta`
   to `{}` in the CommonJS mini-service bundles, so `createRequire(undefined)`
   threw `ERR_INVALID_ARG_VALUE` at module load — before any service code ran.
   The path now resolves lazily from `__filename` (CJS) or the working directory
   (ESM), and both packaged services were loaded to confirm.
2. **Merge pass against PR #72 (`5e5c9a4`).** `Approval.runId` and its
   `@@index([runId, status])` arrived from `main`; only the tracker document
   conflicted and was reconciled by hand. Post-merge gates: typecheck,
   typecheck:tests, `verify:mysql` (266/266), `verify:security` (542/542,
   15 forward / 12 rollback), the security suites (7 files / 50 tests), the
   platform suites, and the full matrix (**244 files / 2,689 tests, 0 failed**).
3. **Duplicated `TaskType` / `TASK_REQUIREMENTS`** survived the merge of
   `src/lib/platform/model-registry.ts`; the duplicate block was removed and
   `isTaskType` kept as the single task vocabulary.

---

## Stage 2 — runtime acceptance evidence (2026-11-27)

Two suites, both driving the real `src/lib/runs` engine and the real
`src/lib/job-queue` against a database built from the real schema. Neither mocks
the layer under test.

| Suite | Cases | What it establishes |
| --- | --- | --- |
| `__tests__/integration/runtime-acceptance-failures.test.ts` | 22 | The runtime fails correctly: no tenant, lost tenant, no agent, foreign agent, terminal runs, cancellation, resume, dependencies, approvals (pending / rejected / expired / cross-tenant / mismatched / double-decided), unknown run ids, orchestration throws |
| `__tests__/integration/runtime-acceptance-behaviours.test.ts` | 15 | The runtime works: durability before acknowledgement, restart survival, exactly-once claiming under contention, idempotent enqueue, ordered replayable events, terminal state with a summary, pagination bounds, tenant scoping, cancellation, queue-based resumption, no resurrection of finished runs, attributed event trail |

### Defect found by the acceptance work

`resolveRunApproval` **overwrote decisions**. A run a human had approved was
marked `failed` by a later "reject", while the approval row still read
`approved` — run state and audit trail contradicting each other.

A decision is now final: re-sending the *same* decision is idempotent (no second
resume job), the *opposite* decision is refused. Verified by removing the check:
F-16 fails and nothing else does.

### Why Stage 2 is not `VERIFIED_COMPLETE`

`VERIFIED_COMPLETE` requires deployment plus recorded evidence of behaviour in
the target environment. The suite evidence is local and in CI; the production
database is still unmigrated, which needs owner authorisation. That is an
external blocker, not an unfinished feature.

---

## A1.1 Unified AI AgentOS

| Field | Value |
| --- | --- |
| **ID** | `A1-01` |
| **Description** | One platform surface exposing agents, runs, workflows, knowledge, channels and admin. |
| **Existing evidence** | 541 route files; 48 pages; 289 components; existing run engine (`src/lib/runs/index.ts`, 1,121 LOC). |
| **Required** | No competing run engine or module. All capability surfaces reachable through the authenticated app shell. |
| **Source files** | `src/app/**`, `src/components/**`, `src/lib/runs/**` |
| **Deps (DB/API/UI)** | DB: `AgentOSRun`, `Agent`, `Workflow`. API: `/api/runs`, `/api/v1/*`. UI: app shell + nav. |
| **Security** | Every surface sits behind one of the two auth towers, both routed through `src/lib/tenancy/policy.ts`. |
| **Tests** | Full suite; route classification audit (D). |
| **Commit / PR** | `de8b28f` (audit), Stage 1 branch commits |
| **Verification** | `npx vitest run` → **244 files passed / 1 skipped, 2,689 tests passed, 0 failed**; 542 route files classified, 0 unclassified |
| **Status** | `TESTED` |

## A1.2 Persistent execution

| Field | Value |
| --- | --- |
| **ID** | `A1-02` |
| **Description** | Runs survive process restart; state is durable in the database, never in memory alone. |
| **Existing evidence** | `AgentOSRun` + `RunEvent` models; attempt counting; `checkpoint` column; job queue with leases. |
| **Required** | No in-memory-only persistence; every state transition persisted before it is observed. |
| **Source files** | `src/lib/runs/index.ts`, `src/lib/job-queue.ts` |
| **Deps** | DB: `AgentOSRun`, `RunEvent`, `QueueItem`. API: `/api/runs/:id`. |
| **Security** | Runs now carry a mandatory `companyId` (T-2 fix); unowned runs are refused at create *and* execute. |
| **Tests** | `__tests__/security/tenant-isolation.test.ts` (T-2 cases); `__tests__/unit/agentos-runs-pipeline.test.ts`; `runtime-acceptance-behaviours.test.ts` B-01, B-02 |
| **Commit / PR** | PR #71 (`f0230c8`); this branch (PR #73) |
| **Verification** | `run-engine-behaviours.test.ts` (20 behaviours), `job-queue-durability.test.ts` (11), `run-resume.test.ts` (3), `runtime-acceptance-{behaviours,failures}.test.ts` — all green; durability proven before acknowledgement and across a fresh module instance; retry preserves completed checkpoints; full suite 2,689 passed |
| **Status** | `TESTED` — durable retry/cancel/crash-recovery proven on real SQLite |

## A1.3 Streaming and recovery

| Field | Value |
| --- | --- |
| **ID** | `A1-03` |
| **Description** | Real SSE streaming of persisted events with replay on reconnect. |
| **Existing evidence** | `src/app/api/runs/[id]/events/route.ts` — replays `RunEvent` then streams from the event bus. |
| **Required** | No fake streaming. Reconnect replays from `lastEventId`. |
| **Source files** | `src/app/api/runs/[id]/events/route.ts`, `src/lib/event-bus.ts` |
| **Deps** | DB: `RunEvent`. API: SSE route. UI: run detail stream consumer. |
| **Security** | Tenant check hardened (T-5): both sides must be real tenants before comparison. |
| **Tests** | Tenant-isolation suite; SSE integration (Stage 2). |
| **Commit / PR** | Stage 1 branch |
| **Verification** | `run-engine-behaviours.test.ts` behaviours 16–18: full replay, `Last-Event-ID` deduplicated resume, 403 cross-tenant block; `id:` frames and terminal auto-close covered |
| **Status** | `TESTED` |

## A1.4 Multi-tenant security

| Field | Value |
| --- | --- |
| **ID** | `A1-04` |
| **Description** | Company is the isolation boundary; no cross-tenant read, write, delete, replay, recovery, approval, retry or cancel. |
| **Existing evidence** | `docs/security/canonical-tenant-model.md` (5/5 workspaces attributable); `docs/security/tenant-isolation-threat-model.md` (T-1…T-8). |
| **Required** | T-1…T-8 remediated with regression tests; schema enforces `AiWorkspace.companyId NOT NULL`. |
| **Source files** | `src/lib/tenancy/policy.ts`, `src/lib/platform/principal.ts`, `src/lib/workers/agentos-dispatcher.ts`, `src/lib/runs/index.ts`, `src/app/api/runs/[id]/events/route.ts`, `prisma/schema.prisma` |
| **Deps** | DB: `AiWorkspace.companyId` (nullable → backfill → NOT NULL). API: both towers. |
| **Security** | This row *is* the security work. |
| **Tests** | `tenant-isolation.test.ts` (10) + `tenant-migration.test.ts` (10) + `approval-tenant.test.ts` (4) + `system-operation.test.ts` (8) = **32 security tests** |
| **Commit / PR** | `cbb653e`, `47019cc`, `f73d956`, `6642ab4`, `4bee7e7` |
| **Verification** | `npx vitest run __tests__/security` → **5 files, 39 tests passed**; full suite 2601 passed. Evidence: `docs/reports/security-verification-report.md` |
| **Status** | `TESTED` — T-1…T-8 fixed; production migration gated on DB authorization |

## A1.5 Unified authentication

| Field | Value |
| --- | --- |
| **ID** | `A1-05` |
| **Description** | One policy for resolving a trusted identity across session, API key, SSE, workers and internal ops. |
| **Existing evidence** | Two towers: `src/lib/api-auth.ts` (companyId) and `src/lib/platform/principal.ts` (workspaceId). |
| **Required** | Shared policy primitives; no third authorisation system; every protected route classified. |
| **Source files** | `src/lib/tenancy/policy.ts` (new), `src/lib/api-auth.ts`, `src/lib/platform/principal.ts`, `src/lib/api/secure-route.ts` |
| **Deps** | API: all 541 route files. |
| **Security** | Company-first resolution; revoked membership loses access immediately. |
| **Tests** | `tenant-isolation.test.ts`, `legacy-routes-tenant.test.ts` (7), `scripts/classify-routes.mjs` |
| **Commit / PR** | `cbb653e`, `f73d956` |
| **Verification** | **All 542 route files classified, 0 unclassified:** 247 requireAuth-family · 49 own-session · 48 v1Handler · 39 legacyTenant · 34 withCompany · 29 secureCrud · 20 clientRoute · 19 public · 19 platformHandler · 17 secureRoute · 16 internalRoute · 5 mail-session. `validate-route-auth.mjs`: 856 non-public handlers, 19 allowlist entries, 1 documented exception |
| **Status** | `TESTED` |

## A1.6 Agent builder and lifecycle

| Field | Value |
| --- | --- |
| **ID** | `A1-06` |
| **Description** | Create, configure, version, archive agents with permissions. |
| **Existing evidence** | `src/lib/multi-agent-orchestrator/agent-factory.ts`; `src/lib/agent-access.ts` (`agentCompanyScope`). |
| **Required** | Tenant-scoped create/list/archive; permission checks on execute. |
| **Source files** | `src/lib/multi-agent-orchestrator/**`, `src/lib/agent-access.ts` |
| **Deps** | DB: `Agent`, `AgentCompanyAccess`, `Department`. UI: agent builder. |
| **Security** | Archive event now carries the agent's real tenant, not `'default-company'` (T-2). |
| **Tests** | `__tests__/unit/lib/access/**`; full suite green. |
| **Commit / PR** | Stage 1 branch |
| **Verification** | `workforce-provisioning.test.ts` (15), `agent-health-integrity.test.ts` (5), `factory-build-requests-tenant.test.ts`, `skills:verify` (838 skills, 0 problems) — all green |
| **Status** | `TESTED` |

## A1.7 Workflow orchestration

| Field | Value |
| --- | --- |
| **ID** | `A1-07` |
| **Description** | Multi-step workflows with durable runs, approvals and retries. |
| **Existing evidence** | `src/lib/workflow-engine/index.ts`; `agentos.workflow` job type. |
| **Required** | Tenant propagation through workflow dispatch (now enforced). |
| **Source files** | `src/lib/workflow-engine/index.ts`, `src/lib/workers/agentos-dispatcher.ts` |
| **Deps** | DB: `Workflow`, `WorkflowRun`, `AgentOSRun`. |
| **Security** | `agentos.workflow` now calls `assertJobTenantMatchesRun` (T-1). |
| **Tests** | Tenant-isolation T-1 cases (both `agentos.run` and `agentos.workflow` guarded). |
| **Commit / PR** | Stage 1 branch |
| **Verification** | `check:workflows` (17 definitions, 109 steps, 0 errors); `agentos.workflow` tenant match enforced; automation trigger routes tenant-scoped with the `NaN` `sortOrder` fix |
| **Status** | `TESTED` |

## A1.8 CRM

| Field | Value |
| --- | --- |
| **ID** | `A1-08` |
| **Description** | Leads, contacts, deals, pipeline, connections to external CRMs. |
| **Existing evidence** | `src/app/api/crm-connections/**`, `src/app/api/internal/client-*`; `executeLeadFollowupRun` job type. |
| **Required** | Company-scoped reads/writes; lead-followup jobs tenant-verified. |
| **Source files** | `src/lib/integrations/workflows/lead-followup.ts`, `src/app/api/crm-connections/**` |
| **Deps** | DB: CRM models. API: CRM routes. UI: CRM surfaces. |
| **Security** | `agentos.crm.lead-followup` retains its own tenant scope; run creation passes `companyId` explicitly. |
| **Tests** | Full suite green; CRM-specific cross-tenant tests in Stage 2. |
| **Commit / PR** | Stage 1 branch |
| **Verification** | `crm-lead-followup.test.ts` (22), `crm-staging-simulation.test.ts` (3), `legacy-routes-tenant.test.ts` (7); CRM contact/deal routes tenant-scoped |
| **Status** | `TESTED` |

## A1.9 Omnichannel communications

| Field | Value |
| --- | --- |
| **ID** | `A1-09` |
| **Description** | WhatsApp, email and other channels genuinely connected, never UI placeholders. |
| **Existing evidence** | `src/lib/whatsapp/**` (config, inbox, numbers); webhook delivery tenant isolation test. |
| **Required** | No pseudo-tenant. An unmapped channel number must fail closed. |
| **Source files** | `src/lib/whatsapp/config.ts`, `src/lib/whatsapp/inbox.ts`, `src/app/api/whatsapp/numbers/route.ts` |
| **Deps** | DB: `Conversation`, `ConversationMessage`, `WhatsAppNumber`. API: webhook + numbers routes. |
| **Security** | `resolveWhatsAppCompanyId` now returns `null` instead of `'default-company'`; both conversation-creation paths throw rather than misfile a message into a shared tenant. |
| **Tests** | `__tests__/api/f6-webhook-delivery-tenant-isolation.test.ts` green. |
| **Commit / PR** | Stage 1 branch |
| **Verification** | `f6-webhook-delivery-tenant-isolation.test.ts`, `voice-campaigns.test.ts`, `voice-conversation.test.ts`, `httpsms-client.node.test.mjs` — all green |
| **Status** | `TESTED` |

## A1.10 Knowledge and RAG

| Field | Value |
| --- | --- |
| **ID** | `A1-10` |
| **Description** | Document ingestion, chunking, embedding, retrieval with citations. |
| **Existing evidence** | `src/lib/qdrant.ts` (tenant-filtered vector store); `/api/rag/{documents,chunks,query,logs}` now resolved through `legacyTenant`. |
| **Required** | Every retrieval filtered by `companyId`. |
| **Source files** | `src/lib/qdrant.ts`, knowledge ingestion modules. |
| **Deps** | DB: knowledge models. External: Qdrant. |
| **Security** | `qdrant.ts` filters by `companyId`; every RAG document, chunk, query and log route rejects a foreign tenant id and scopes results to the caller. |
| **Tests** | `__tests__/security/cross-surface-tenant.test.ts` — cross-tenant document/chunk/query isolation on real SQLite. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | `cross-surface-tenant.test.ts` green; full suite 2,689 passed |
| **Status** | `TESTED` |

## A1.11 Model gateway and failover

| Field | Value |
| --- | --- |
| **ID** | `A1-11` |
| **Description** | Multi-provider routing with fallback on provider failure. |
| **Existing evidence** | `src/lib/platform/model-registry.ts` (capability-typed registry), `src/lib/platform/fallback-engine.ts`, `src/app/api/v1/platform/admin/fallbacks/route.ts`. |
| **Required** | Failover verified; no silent provider downgrade without a recorded event. |
| **Source files** | `src/lib/ai/**`, platform admin fallbacks. |
| **Deps** | DB: model config. External: provider APIs. |
| **Security** | Provider credentials never exposed to clients. |
| **Tests** | `__tests__/platform/{fallback-engine,error-classifier,providers.integration,stale-health-availability}.test.ts`, `ai-provider-timeout-failover.test.ts`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | Platform suites green; `providers.integration.test.ts` runs against a real spawned model runtime and a throw-away database; unreachable deployments are re-probed rather than blacklisted forever |
| **Status** | `TESTED` |

## A1.12 Developer cloud

| Field | Value |
| --- | --- |
| **ID** | `A1-12` |
| **Description** | API keys, projects, usage, embeddings for developers. |
| **Existing evidence** | 19 `/api/v1/platform` routes; `AiApiKey`; `Principal` type. |
| **Required** | Workspace-scoped principals must never hold an empty workspace id (T-4, fixed). |
| **Source files** | `src/lib/platform/**`, `src/app/api/v1/platform/**` |
| **Deps** | DB: `AiApiKey`, `AiWorkspace`. API: 19 platform routes. |
| **Security** | `requireWorkspace()` guard added; API-key principals now resolve through `CompanyUser` and refuse cross-company or unbackfilled workspaces. |
| **Tests** | Tenant-isolation T-4 tests; platform suite green. |
| **Commit / PR** | Stage 1 branch |
| **Verification** | `__tests__/platform` green; full suite 2572 passed |
| **Status** | `TESTED` |

## A1.13 Infrastructure and autoscaling

| Field | Value |
| --- | --- |
| **ID** | `A1-13` |
| **Description** | Application and worker scaling; no automatic production DB resizing. |
| **Existing evidence** | `docs/SERVER_CAPACITY_PLAN.md` (16 GB RAM / 520 GB SSD contract); `scripts/{package-standalone,build-mini-services,verify-standalone}.mjs`. |
| **Required** | App + worker scaling only in the first release. |
| **Source files** | Deployment config. |
| **Deps** | Infrastructure. |
| **Security** | No production DB mutation from scaling. |
| **Tests** | `npm run build` on a low-RAM single-worker ceiling; `verify-standalone.mjs`; packaged mini-services load test. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | `npm run build` exit 0; standalone bundle 9,191 files verified; `realtime-service.cjs` and `queue-service.cjs` load cleanly after the `createRequire` fix |
| **Status** | `TESTED` |

## A1.14 Integrations

| Field | Value |
| --- | --- |
| **ID** | `A1-14` |
| **Description** | Third-party integrations with credential isolation per tenant. |
| **Existing evidence** | `src/lib/integrations/**`; `/api/{integrations,enterprise/integrations,webhooks,gateway/sign,api-management}` now tenant-gated. |
| **Required** | Credentials scoped to a company; no cross-tenant credential use. |
| **Source files** | `src/lib/integrations/**` |
| **Deps** | DB: integration + credential models. |
| **Security** | Credentials resolved per tenant; foreign `companyId` rejected on every integration, webhook, API-management and HMAC-signing route; SSRF guard covers IPv4 and mapped IPv6. |
| **Tests** | `p0-ssrf-guard.test.ts` (13), `f5-ssrf-mapped-ipv6.test.ts` (12), `cross-surface-tenant.test.ts`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | All three suites green; full suite 2,689 passed |
| **Status** | `TESTED` |

## A1.15 Billing, metering and quotas

| Field | Value |
| --- | --- |
| **ID** | `A1-15` |
| **Description** | Usage metering per tenant, quota enforcement, no simulated usage. |
| **Existing evidence** | `/api/v1/platform/usage`, `/api/usage`, `/api/usage/check`, `/api/dashboard/usage`, `/api/cost-estimate(s)`; token accounting in run outcomes; `src/lib/token-guard.ts`. |
| **Required** | Real metered usage; quota refusals recorded. |
| **Source files** | `src/lib/**` usage, platform usage route. |
| **Deps** | DB: usage records. API: platform usage. |
| **Security** | Usage, quota and cost routes are tenant-scoped; a tenant sees only its own usage; foreign ids rejected. |
| **Tests** | `token-guard.test.ts` (10), `free-tier-quota-tracker.test.ts`, `voice/billing.test.ts` (9), `cross-surface-tenant.test.ts`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | Suites green; full suite 2,689 passed |
| **Status** | `TESTED` |

## A1.16 Observability

| Field | Value |
| --- | --- |
| **ID** | `A1-16` |
| **Description** | Traces, metrics, structured logs, alerting on run failures. |
| **Existing evidence** | `/api/observability/dashboard`, `/api/protection`, `/api/health/{live,ready,deep}`, `/api/metrics`; `AuditLog`, `ProtectionLog`, `RunEvent`. |
| **Required** | Denials are observable — a tenant mismatch must be visible to an operator. |
| **Source files** | `src/lib/**` logging, audit. |
| **Deps** | DB: `AuditLog`. |
| **Security** | Dashboard and protection endpoints are tenant-scoped (protection rows scoped through `Command` → `CompanyUser`); denials throw with a reason. |
| **Tests** | `site-doctor.test.ts` (5), `health-v2.test.ts`, `metrics-client.test.ts`, `cross-surface-tenant.test.ts`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | Suites green; full suite 2,689 passed |
| **Status** | `TESTED` |

## A1.17 Enterprise admin, RBAC and audit

| Field | Value |
| --- | --- |
| **ID** | `A1-17` |
| **Description** | Admin console, role management, immutable audit trail. |
| **Existing evidence** | `/api/v1/platform/admin/**`; super-admin console; `AuditLog`. |
| **Required** | Super-admin is not a tenant bypass; RBAC enforced on every admin action. |
| **Source files** | `src/lib/platform/**`, super-admin routes. |
| **Deps** | DB: `AuditLog`, roles. UI: admin console. |
| **Security** | T-7 fixed: cross-tenant admin access requires the audited `system:cross-tenant` scope. |
| **Tests** | `__tests__/security/{system-operation,approval-tenant}.test.ts`, `__tests__/unit/governance-*.test.ts`; `http-guards.test.ts` (18) covers `allowCompanyScope`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | Security suites 7 files / 50 tests green; approval review now requires `reviewerCompanyId` |
| **Status** | `TESTED` — cross-tenant access requires the audited `system:cross-tenant` scope and the operator allowlist is empty by default |

## A1.18 Security, secrets and data protection

| Field | Value |
| --- | --- |
| **ID** | `A1-18` |
| **Description** | Secret handling, encryption, data-at-rest and in-transit protection. |
| **Existing evidence** | `src/lib/production-database.ts` (refuses SQLite in production), `src/lib/security/**`, `src/app/api/protection/route.ts`, `scripts/validate-route-auth.mjs`. |
| **Required** | Each item fixed, not documented — `assertTenant(null)` now 404s, `assertOwnedBy` fails closed, route-auth gate recognises every wrapper. |
| **Source files** | `src/lib/api/**`, middleware, scripts. |
| **Deps** | — |
| **Security** | This row *is* the security work. |
| **Tests** | `production-secrets-validation.test.ts`, `password-recovery.test.ts`, `csrf.test.ts`, `session-manager.test.ts`, `__tests__/unit/lib/api-security.test.ts`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | All suites green; the production build demonstrably refuses the SQLite adapter under `NODE_ENV=production` |
| **Status** | `TESTED` |

## A1.19 Full API and UI integration

| Field | Value |
| --- | --- |
| **ID** | `A1-19` |
| **Description** | Every capability wired UI → service → API → DB → authz → observability, with loading / empty / error / permission-denied / success states. |
| **Existing evidence** | 48 pages, 289 components, 542 routes, all classified. |
| **Required** | No disconnected UI, mock APIs, placeholder buttons or empty modules. |
| **Source files** | `src/app/**`, `src/components/**` |
| **Deps** | All. |
| **Security** | Permission-denied is a first-class state: `assertTenant` 404s, memory/usage/observability panels surface the denial rather than an empty list. |
| **Tests** | Component and page suites (`home-experience`, `public-site`, `enterprise-overview`, `ai-providers-panel`, `voice-panels-render`, `dashboard-panel`), route classification audit. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | Full suite 244 files / 2,686 tests green; 542 routes classified, 0 unclassified |
| **Status** | `TESTED` |

## A1.20 Tests, deployment, rollback and ops

| Field | Value |
| --- | --- |
| **ID** | `A1-20` |
| **Description** | Full test matrix, forward + rollback migration tests, backup/restore verification, runbooks. |
| **Existing evidence** | `prisma/migrations/mysql/**` — **15 forward / 12 rollback** pairs including `20261126_ws_company_step1..3`, `20261127_factory_build_request_tenant`, `20261127_agent_build_request_company` and `20261127_approval_run_link`. |
| **Required** | Migrations tested forward **and** rollback on a disposable DB; backup/restore proven. |
| **Source files** | `prisma/migrations/**`, `scripts/**`, `docs/operations/**` |
| **Deps** | Disposable database. |
| **Security** | No production migration without backup + tested rollback + explicit authorization. |
| **Tests** | `verify:migrations` (safety scan), `verify:mysql` (266/266 parity), `backup-restore.test.ts` (8), `sqlite-mysql-migration-safety.test.ts`. |
| **Commit / PR** | This branch (PR #73) |
| **Verification** | `verify:migrations` → 15 forward / 12 rollback all paired, 0 destructive DDL; `verify:mysql` → 266/266 models, 669 indexed fields, 0 collisions; `backup-restore.test.ts` green |
| **Status** | `TESTED` — forward and rollback rehearsed on SQLite/disposable schema; production execution remains gated on operator authorisation |

---

## Stage 1 threat remediation detail

| Threat | Severity | State | Fix | Test |
| --- | --- | --- | --- | --- |
| **T-1** dispatcher ignored tenant | High | **FIXED** | `assertJobTenantMatchesRun()` in `agentos-dispatcher.ts`; both `agentos.run` and `agentos.workflow` verified against the run row before execution | 3 tests |
| **T-2** `'default-company'` fallback | High | **FIXED** | Removed from run engine (create + execute), WhatsApp config/inbox, WhatsApp numbers, agent archive event; `createRun` now requires a company | 3 tests |
| **T-3** principal ignored CompanyUser | High | **FIXED** | Company resolved first in both session and API-key paths; workspaces filtered by company; cross-company workspace refused | 2 tests |
| **T-4** empty-string workspace | Medium | **FIXED** | Explicit `scope: 'workspace' \| 'company'`; `requireWorkspace()` guard; `isUsableWorkspaceId()` | 2 tests |
| **T-5** SSE tenant comparison | Medium | **FIXED** | Both sides must be usable tenants before comparison | covered |
| **T-6** `secureRoute` gaps | Low | Mitigated | Existing `tenant_required`/`tenant_mismatch` | pre-existing |
| **T-7** `super_admin` conflation | Medium | **FIXED** | Cross-tenant access is a distinct `system:cross-tenant` scope granted only via the `ALO_SYSTEM_OPERATORS` allowlist; requires a reason; writes an AuditLog row before the work. Applied to the cross-tenant usage read. | 8 tests |
| **T-8** approval/retry/cancel by runId | Low | **FIXED** | `resolveRunApproval` now takes `reviewerCompanyId` and re-checks approval ↔ run ↔ reviewer agreement; both API callers pass it | 4 tests |

## Schema migration state

| Step | File | State |
| --- | --- | --- |
| 1 — nullable column + index + FK | `20261126_ws_company_step1.sql` | **WRITTEN**, verified against SQLite push |
| 2 — deterministic backfill | `20261126_ws_company_step2_backfill.sql` | **WRITTEN** |
| 3 — NOT NULL with integrity guard | `20261126_ws_company_step3_require.sql` | **WRITTEN** |
| Single-step tenant FK — factory build requests | `20261127_factory_build_request_tenant.sql` (+ rollback) | **WRITTEN** |
| Single-step tenant FK — agent build requests | `20261127_agent_build_request_company.sql` (+ rollback) | **WRITTEN** |
| Approval → run link (PR #72) | `20261127_approval_run_link.sql` (+ rollback) | **WRITTEN** |
| Rollbacks | `*_rollback.sql` ×6 | **WRITTEN** |

**Production migration is BLOCKED pending explicit DB authorization, a verified
backup and a tested rollback on a disposable database.** Local schema work is
complete and the application already fails closed without it.

## Ecosystem adoption sweep (2026-11-27)

Fifteen upstream links arrived in one request (Monid, SignuDoc, FloppyData cloud
browser, LiteLLM, NocoBase, Temporal, Activepieces, Directus, Aider, LibreChat,
Open WebUI, YouBTech01, vLLM, free-for.dev, Postman). Nothing was deleted and
nothing already built was re-implemented — the sweep extended the two existing
catalogues and finally gave them a surface:

| Change | Evidence |
| --- | --- |
| `LINK_COVERAGE` 73 → **88 rows** (15 new, deduplicated against `vllm` and the two `free-for.dev` rows) | `__tests__/lib/link-coverage.test.ts` — 17 passed, every evidence path checked on disk |
| **14 agent briefs** (use-when / steps / risks) attached to the systems an agent is most likely to touch | `src/lib/ecosystem/stack.ts`, pinned by `__tests__/unit/lib/ecosystem-stack.test.ts` (15 passed) |
| `GET /api/ecosystem` + `/api/ecosystem/[slug]` — the first machine-readable view joining the register with the 26 registered adapters | `__tests__/api/ecosystem.test.ts` (9 passed); public by design, allowlisted with a written reason |
| `/site/stack` public page (server-rendered, searchable, filterable) and a **Stack Register** dashboard panel — the adapter catalogue had no UI at all before | `src/app/site/stack/page.tsx`, `src/components/panels/ecosystem-stack-panel.tsx`, nav + sitemap entries |
| **`stack_register` Command Agent tool** — the agent can answer *"do we already support X?"* from 88 rows locally, instead of proposing a system the codebase already has | `__tests__/unit/lib/ecosystem-stack.test.ts` (+4 tests); no network, no tenant context |
| Verdicts stated honestly: 9 implemented · 28 in kind · 12 reference · 24 gap · 15 N/A | `docs/reports/ecosystem-stack-register.md` |

Three of the requested systems are genuine, unimplemented gaps and are labelled
as such rather than absorbed into a claim: **e-signature (SignuDoc)**,
**cloud-browser sessions (FloppyData)**, and **a published OpenAPI document /
Postman collection**. Each has a written next step in the register.

## Known limitations at this point

1. The cross-tenant matrix is covered by `__tests__/security/*` (7 files, 50
   tests) across run, run-event SSE, approval, retry, cancel, memory, RAG,
   automation, jobs, usage, observability, protection, integrations and factory
   build requests. Surfaces without a tenant column of their own (`Workflow`,
   `Command`, `ProtectionLog`, `BlockedAction`, `User`) are scoped indirectly
   through `Department.companyId`, `CompanyUser`, or `WorkflowPermission` —
   documented in the code so a future query cannot silently drop the join.
2. The system-operator allowlist defaults to empty, so no account currently
   holds `system:cross-tenant`. Cross-tenant admin reads return 403 until an
   operator is explicitly listed — intended fail-closed behaviour.
3. Route **classification** is complete (0 unclassified, 542 files), but 247
   routes still use `requireAuth`/`requireCompanyAuth` directly rather than a
   hardened wrapper. They resolve a tenant; they do not yet share the auditing
   and rate-limiting of `secureRoute`. Migration is incremental (A1-05).
4. Production migration not applied — deliberately gated on a verified backup,
   a rehearsed rollback and explicit operator authorisation.
5. `prisma validate` cannot run in this sandbox (engine CDN unreachable); schema
   correctness is verified via the repo's own generator, `sqlite-push.ts` and
   `verify:mysql` (266/266 models).
6. The live-MySQL suite (15 tests) skips locally without `MYSQL_TEST_URL`; it
   runs in GitHub Actions via `.github/workflows/mysql.yml`.
