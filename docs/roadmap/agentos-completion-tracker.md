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
| 1 | Tenant security (T-1 … T-8, schema, route classification) | **IN_PROGRESS** — T-1…T-8 fixed and tested; all 542 routes classified; 19 legacy routes scoped through `legacyTenant`; factory build-log leak closed (see A1.4); production migration still gated on owner authorisation |
| 2 | Runtime acceptance (run engine 20 behaviours) | NOT_STARTED |
| 3 | Core AgentOS (gateway, agents, orchestration, memory) | NOT_STARTED |
| 4 | Customer operations (CRM, channels, workflows) | NOT_STARTED |
| 5 | Developer + infrastructure (cloud, scaling) | NOT_STARTED |
| 6 | Enterprise (admin, RBAC, audit, billing) | NOT_STARTED |
| 7 | Integration and hardening (full test matrix) | NOT_STARTED |
| 8 | Close every requirement, handover reports | **IN_PROGRESS** — `docs/reports/security-verification-report.md` written |

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
| **Verification** | `npx vitest run` → **236 files / 2601 passed, 0 failed** (15 skipped) |
| **Status** | `IN_PROGRESS` |

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
| **Tests** | `__tests__/security/tenant-isolation.test.ts` (T-2 cases); `__tests__/unit/agentos-runs-pipeline.test.ts` |
| **Commit / PR** | Stage 1 branch |
| **Verification** | Both suites green; full suite 2572 passed |
| **Status** | `TESTED` |

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
| **Verification** | `tsc` clean; suite green |
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
| **Verification** | **All 541 route files classified, 0 unclassified.** 245 requireAuth-family · 90 own-session · 48 v1Handler · 34 withCompany · 29 secureCrud · 20 clientRoute · 19 public · 19 platformHandler · 16 secureRoute · 16 internalRoute · 5 mail-session |
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
| **Verification** | 2572 passed |
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
| **Verification** | Full suite 2572 passed |
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
| **Verification** | 2572 passed |
| **Status** | `IN_PROGRESS` |

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
| **Verification** | Full suite 2572 passed |
| **Status** | `TESTED` |

## A1.10 Knowledge and RAG

| Field | Value |
| --- | --- |
| **ID** | `A1-10` |
| **Description** | Document ingestion, chunking, embedding, retrieval with citations. |
| **Existing evidence** | `src/lib/qdrant.ts` (tenant-filtered vector store). |
| **Required** | Every retrieval filtered by `companyId`. |
| **Source files** | `src/lib/qdrant.ts`, knowledge ingestion modules. |
| **Deps** | DB: knowledge models. External: Qdrant. |
| **Security** | `qdrant.ts` passes `companyId` into filters. |
| **Tests** | Stage 3 cross-tenant retrieval tests. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.11 Model gateway and failover

| Field | Value |
| --- | --- |
| **ID** | `A1-11` |
| **Description** | Multi-provider routing with fallback on provider failure. |
| **Existing evidence** | `src/app/api/v1/platform/admin/fallbacks/route.ts`; model registry. |
| **Required** | Failover verified; no silent provider downgrade without a recorded event. |
| **Source files** | `src/lib/ai/**`, platform admin fallbacks. |
| **Deps** | DB: model config. External: provider APIs. |
| **Security** | Provider credentials never exposed to clients. |
| **Tests** | Stage 3 provider-timeout and failover tests. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

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
| **Existing evidence** | Neon autoscaling reviewed as reference only (audit §6.2). |
| **Required** | App + worker scaling only in the first release. |
| **Source files** | Deployment config. |
| **Deps** | Infrastructure. |
| **Security** | No production DB mutation from scaling. |
| **Tests** | Stage 5 load tests. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.14 Integrations

| Field | Value |
| --- | --- |
| **ID** | `A1-14` |
| **Description** | Third-party integrations with credential isolation per tenant. |
| **Existing evidence** | `src/lib/integrations/**`. |
| **Required** | Credentials scoped to a company; no cross-tenant credential use. |
| **Source files** | `src/lib/integrations/**` |
| **Deps** | DB: integration + credential models. |
| **Security** | Credentials resolved per tenant. |
| **Tests** | Stage 6 integration tests. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.15 Billing, metering and quotas

| Field | Value |
| --- | --- |
| **ID** | `A1-15` |
| **Description** | Usage metering per tenant, quota enforcement, no simulated usage. |
| **Existing evidence** | `/api/v1/platform/usage`; token accounting in run outcomes. |
| **Required** | Real metered usage; quota refusals recorded. |
| **Source files** | `src/lib/**` usage, platform usage route. |
| **Deps** | DB: usage records. API: platform usage. |
| **Security** | A tenant sees only its own usage. |
| **Tests** | Stage 6 billing tests. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.16 Observability

| Field | Value |
| --- | --- |
| **ID** | `A1-16` |
| **Description** | Traces, metrics, structured logs, alerting on run failures. |
| **Existing evidence** | `AuditLog`, `RunEvent`, structured logging. |
| **Required** | Denials are observable — a tenant mismatch must be visible to an operator. |
| **Source files** | `src/lib/**` logging, audit. |
| **Deps** | DB: `AuditLog`. |
| **Security** | Denial events recorded (T-1 audit requirement). |
| **Tests** | Stage 6 observability tests. |
| **Commit / PR** | Stage 1 branch (denial errors throw with reason) |
| **Verification** | Partial |
| **Status** | `IN_PROGRESS` |

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
| **Tests** | Stage 6 RBAC tests. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.18 Security, secrets and data protection

| Field | Value |
| --- | --- |
| **ID** | `A1-18` |
| **Description** | Secret handling, encryption, data-at-rest and in-transit protection. |
| **Existing evidence** | Pending security remediation list (O14 limiter, weak `validate-route-auth.mjs`, trusted XFF, socket origin, dual lockfiles). |
| **Required** | Each item fixed, not documented. |
| **Source files** | `src/lib/api/**`, middleware, scripts. |
| **Deps** | — |
| **Security** | This row *is* the security work. |
| **Tests** | Stage 7 hardening matrix. |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.19 Full API and UI integration

| Field | Value |
| --- | --- |
| **ID** | `A1-19` |
| **Description** | Every capability wired UI → service → API → DB → authz → observability, with loading / empty / error / permission-denied / success states. |
| **Existing evidence** | 48 pages, 289 components; 541 routes. |
| **Required** | No disconnected UI, mock APIs, placeholder buttons or empty modules. |
| **Source files** | `src/app/**`, `src/components/**` |
| **Deps** | All. |
| **Security** | Permission-denied is a first-class state, not an empty list. |
| **Tests** | UI smoke matrix (Stage 7). |
| **Commit / PR** | — |
| **Verification** | Not yet run |
| **Status** | `NOT_STARTED` |

## A1.20 Tests, deployment, rollback and ops

| Field | Value |
| --- | --- |
| **ID** | `A1-20` |
| **Description** | Full test matrix, forward + rollback migration tests, backup/restore verification, runbooks. |
| **Existing evidence** | `prisma/migrations/mysql/**` (15 files + 6 rollback pairs); 3 new step files added in Stage 1. |
| **Required** | Migrations tested forward **and** rollback on a disposable DB; backup/restore proven. |
| **Source files** | `prisma/migrations/**`, `scripts/**`, `docs/operations/**` |
| **Deps** | Disposable database. |
| **Security** | No production migration without backup + tested rollback + explicit authorization. |
| **Tests** | Migration validation (Stage 1 remainder). |
| **Commit / PR** | Stage 1 branch (migration files) |
| **Verification** | Schema push verified: column, index and `ON DELETE RESTRICT` FK present. |
| **Status** | `IN_PROGRESS` |

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
| Rollbacks | `*_rollback.sql` ×3 | **WRITTEN** |

**Production migration is BLOCKED pending explicit DB authorization, a verified
backup and a tested rollback on a disposable database.** Local schema work is
complete and the application already fails closed without it.

## Known limitations at this point

1. The 15-row cross-tenant matrix is partially covered (10 rows).
2. The system-operator allowlist defaults to empty, so no account currently
   holds `system:cross-tenant`. Cross-tenant admin reads will return 403 until an
   operator is explicitly listed — that is the intended fail-closed behaviour.
3. Route **classification** is complete (0 unclassified), but 245 routes still
   use `requireAuth`/`requireCompanyAuth` directly rather than a hardened
   wrapper. They resolve a tenant; they do not yet share the auditing and
   rate-limiting of `secureRoute`. Migration is incremental and tracked under
   A1-05.
6. 52 legacy route files still need review for whether the model they query has
   a tenant column (`Workflow`, `Alert`, queues and marketplace listings are
   shared platform resources and correctly have none).
4. Production migration not applied — deliberately gated.
5. `prisma validate` cannot run in this sandbox (engine CDN unreachable); schema
   correctness is verified via the repo's own generator + `sqlite-push.ts`.
