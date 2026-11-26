# Global Platform Consolidation — Phase 0 Audit

**Status:** Phase 0 complete. Phase 1 onwards **not started**, pending review.
**Date:** 2026-11-26
**Auditor:** automated repository audit, verified against code and a live run

> **Methodology note.** Every number below was produced by a command in this
> session, not recalled. Two claims in the first draft were wrong (migration
> files, and the unauthorised-route count) and are corrected in place with the
> correction visible, because an audit that silently rewrites itself is worth
> less than one that shows its mistakes.

> This document exists to prevent a specific, expensive failure: rewriting things
> that already work. The brief assumes a gap between ALO Labs AgentOS and the
> target platform, and the honest finding is that **most of Phase 1 and Phase 2
> already exists and is tested**. The real gap is integration, not construction.

---

## 1. Repository identity

| Property | Value |
|---|---|
| Remote | `https://github.com/tech360-bd/alolabs_AI.git` |
| Branch | `arena/99a8a707-alolabs-ai` |
| HEAD | `73ad16d` |
| Base | `eb7672a3c89d2bbc3ea4dbc6fd81befdaeaa877d` (`main`) |
| Ahead of base | 9 commits |
| Working tree | **clean** (verified `git status --porcelain` empty) |
| Package | `alolabs-agentos` v1.0.0 |
| Licence | MIT (matches `LICENSE`) |
| Runtime | Node 22.22.3 |
| Framework | Next.js 16.4.6, React 19.2.3, Prisma 6.19.2 |

**Project identity confirmed:** this is the verified ALO Labs AgentOS repository,
not a parallel project. No Nuxt migration, no second application.

### Deployment configuration

Deployment is **not** performed by this session and must not be. Existing
workflows in `.github/workflows/`: `ci.yml`, `deploy.yml`, `docker.yml`,
`mysql.yml`, `security.yml`, `security-scan.yml`, `backup.yml`,
`backup-portability.yml`, `weekly-model-discovery.yml`.

---

## 2. Architecture as found

```
src/app/api/**        541 route handlers   (70 under /api/v1 — the platform API plane)
src/app/**/page.tsx    48 pages
src/components/       289 components
src/lib/              428 TypeScript modules
                      275,550 lines of src LOC
prisma/schema.prisma  266 models
__tests__ + src/__tests__   232 test files
```

Two datasource targets exist by design: SQLite for development/test and
MySQL/MariaDB for production, with a **generated** MySQL schema
(`scripts/generate-mysql-schema.ts`) rather than a second hand-maintained one.
### On migrations — corrected during this audit

My first pass recorded "no migrations directory". **That was wrong**, and it is
the exact failure the brief warns about (trusting an impression over evidence).
`prisma/migrations/mysql/` contains **15 ordered SQL files**, dated, with
**6 matching `*_rollback.sql` pairs**.

What is actually true, and the reason the first impression formed:

- The **hand-written** migrations cover the MySQL deployment path and each
  recent one has a rollback. That is a real, working rollback story.
- `npm run db:migrate` is `prisma migrate dev`, but Prisma's own `_prisma_migrations`
  table is not used by those hand-written files — they are applied out of band.
  So Prisma has *no* recorded migration history, and `prisma migrate` cannot
  reason about the current state.
- The SQLite development path uses `scripts/sqlite-push.ts`, which is
  additive-only and has no down path.

**Net:** rollback exists for MySQL and is credible; it does **not** exist for
SQLite dev, and Prisma itself does not track the schema. Phase 5 can rely on the
MySQL rollback pattern, but must not assume Prisma will manage it.

### Subsystems verified present

| Subsystem | Location | Size | Verified by |
|---|---|---|---|
| Agent runtime | `src/lib/agent-runtime/` | 3,575 LOC / 10 modules | pipeline, tool-loop, lifecycle, scheduler, timeout, state |
| Run engine | `src/lib/runs/index.ts` | 1,121 LOC | createRun, executeRun, cancelRun, checkpoints, approvals |
| AI gateway | `src/lib/ai-gateway/` | 551 LOC | gateway + types |
| Open AI Platform | `src/lib/platform/` | — | providers, fallback engine, model registry, rate limits |
| Workflow engine | `src/lib/workflow-engine/` | 292 LOC | runWorkflow, executeWorkflowRun, getWorkflowRun |
| Durable queue | `src/lib/job-queue.ts` + `mini-services/queue-service` | — | lease, heartbeat, retry, dead-letter |
| Event bus | `src/lib/event-bus/index.ts` | 193 LOC | in-process pub/sub for SSE |
| Voice / speech | `src/lib/voice/` | 9,430 LOC / 42 modules | ASR service, metering, WER/CER, call state |
| Skill catalog | `src/lib/agent-skills/` | generated | 838 skills (642 advisory, 196 quarantined) |

---

## 3. Existing capability inventory (verified, not claimed)

Legend: **REAL** = wired to persistence and tested · **PARTIAL** = exists but
missing a required property · **MISSING** = no implementation found · **REF** =
architecture reference only.

### 3.1 Persistent execution and streaming (Phase 1)

| Requirement | State | Evidence |
|---|---|---|
| Stable run identity per request | **REAL** | `createRun()` → `AgentOSRun` row + `agentos.run` job |
| Lifecycle `queued → running → … → terminal` | **REAL** | `RunStatus` union + `TERMINAL_STATUSES` in `src/lib/runs/index.ts:49-53` |
| Persist run state and execution events | **REAL** | `AgentOSRun` + `RunEvent` (typed event list incl. `agent.selected`, `model.selected`, `tool.started/completed`, `approval.requested`) |
| Persist agent/tool invocation metadata | **REAL** | `RunEvent.agentId`, `source`, `taskId` |
| Stream events to client | **REAL** | `GET /api/runs/[id]/events` — SSE, replays persisted events then tails live bus |
| Recover after browser refresh | **REAL** | SSE replay from `RunEvent` rows |
| Recover after worker restart | **REAL** | `AgentOSRun.checkpoint` JSON + `attempts`; `executeRun` restores checkpointed steps (l.629-631) |
| Resume from valid checkpoints | **REAL** | `parseCheckpoint` + `resumedStepIds` (l.507-545) |
| Cancellation | **REAL** | `cancelRun()` (l.208) + `run.cancelled` event |
| Retries with idempotency | **REAL** | queue `maxAttempts`, lease reclaim, per-claim event emission |
| Human approval | **REAL** | `resolveRunApproval()`, `expireStaleApprovals()`, `waiting_approval` status |
| Duplicate external action prevention | **PARTIAL** | queue guarantees exactly-once *claim*; no per-tool idempotency key seen |
| Run/resume/multi-agent tests | **REAL** | `__tests__/integration/run-resume`, `job-queue-durability`, `registered-queue-handlers` |

**Conclusion: Phase 1 is largely built.** The brief's Phase 1 is not a greenfield
build; it is a gap-closure on an existing engine. This must change the plan.

### 3.2 CRM and customer operations (Phase 2)

| Requirement | State | Evidence |
|---|---|---|
| Contacts / accounts / leads / opportunities | **REAL** | `Company`, lead + deal models in schema |
| Pipelines | **REAL** | pipeline/stage models present |
| Conversations / omnichannel | **REAL** | `Conversation`, `ConversationMessage`, `MessageTemplate` |
| Ticketing / SLA | **PARTIAL** | call-centre models present; SLA policy surface unclear |
| Customer consent | **REAL** | `CustomerConsent` |
| CRM AI actions audited | **PARTIAL** | `AgentGovernanceEvent` exists; coverage across CRM actions unverified |
| CRM tenant isolation | **RISK** | see §5 — legacy CRM uses `Company`, new platform uses `AiWorkspace` |

### 3.3 Agent registry, tools, workflow (Phase 3)

| Requirement | State | Evidence |
|---|---|---|
| Agent registry + versioning | **REAL** | `Agent`, `AgentVersion`, `AgentCatalogItem`, `AgentInstance` |
| Tool registry + permissions | **REAL** | `Tool`-family models, `AgentPermission`, `AgentResourceBudget` |
| Multi-agent orchestration + handoff | **REAL** | `src/lib/agent-runtime/pipeline.ts`, `orchestrator` references |
| Workflow engine | **PARTIAL** | 292 LOC: sequential steps + templates; no builder UI verified |
| Workflow versioning | **PARTIAL** | models exist; version semantics unverified |
| MCP integration | **PARTIAL** | `/api/mcp-servers` route + topic refs; no MCP client verified |
| Marketplace | **MISSING** | only navigation entries and vendored skill text match |

### 3.4 Developer cloud and infrastructure (Phase 4)

| Requirement | State | Evidence |
|---|---|---|
| Git connections / deploy lifecycle | **MISSING** | no provider adapter found |
| Build logs / preview environments | **MISSING** | — |
| Cron / background workers | **REAL** | queue + `instrumentation.node.ts` processor |
| Resource inventory / capacity monitoring | **PARTIAL** | `src/lib/platform/hardware.ts` (host probe only) |

### 3.5 Autoscaling (Phase 5)

**MISSING.** A repo-wide search for `autoscal|scaleUp|ScalePolicy|capacityReservation`
returned only matches inside vendored skill text. There is no policy engine, no
provider adapter, no dry-run mode.

### 3.6 Governance and security

| Requirement | State | Evidence |
|---|---|---|
| Tenant isolation | **PARTIAL / RISK** | two tenant roots, see §5 |
| RBAC | **REAL** | `CompanyRole`, `CompanyPermission`, `requirePlatformAdmin()` |
| Agent identity / service identity | **PARTIAL** | `AgentPermission` exists; service identity unverified |
| Policy engine | **PARTIAL** | approval engine + `AgentEvolutionPolicy`; no general policy language |
| Audit logs | **REAL** | `AgentGovernanceEvent`, `RunEvent`, `AgentStatusHistory` |
| Secrets management | **PARTIAL** | encryption helper exists; provider credentials still env-based |
| Data retention | **PARTIAL** | retention fields present; enforcement unverified |

### 3.7 Commercial operations

| Requirement | State | Evidence |
|---|---|---|
| Subscription plans | **REAL** | `SubscriptionPlan`, `Subscription` |
| Usage metering | **REAL** | `AiUsageRecord`, `AgentUsageSummary`, `CompanyUsageSummary`, token/cost accounting in gateway |
| Invoices | **REAL** | invoice routes + `invoice-number.ts` |
| Tenant quotas | **PARTIAL** | `AgentResourceBudget`, `CompanyBudget`; no unified quota service |
| Marketplace | **MISSING** | — |

### 3.8 Observability

| Requirement | State | Evidence |
|---|---|---|
| Structured logs | **REAL** | `x-request-id` propagated; platform route wrapper |
| Execution / tool traces | **REAL** | `RunEvent` timeline is the trace |
| Model latency + cost metrics | **PARTIAL** | recorded per request in `AiUsageRecord`; no aggregation dashboard verified |
| OpenTelemetry | **MISSING** | zero matches outside vendored text |
| Alerting | **PARTIAL** | `AgentAlert` model; delivery path unverified |

---

## 4. Test and CI baseline (measured, this session)

```
Test Files  231 passed | 1 skipped (232)
Tests      2562 passed | 15 skipped (2577)
exit code  0
```

Run with `DATABASE_URL` deliberately unset, to prove the default-SQLite path.
Because a green suite is only meaningful if it is trustworthy, the baseline was
itself repaired this session — three real defects were found and fixed before
these numbers were valid:

1. MySQL schema generator emitted `@db.LongText` for a **foreign-key** column
   (`AiProject.createdBy`), which InnoDB rejects. Now collects
   `@relation(fields: […])` and keeps those columns `VARCHAR(191)`.
2. An unset `DATABASE_URL` produced a bare `new PrismaClient()`, which Prisma 6
   refuses with *"Missing configured driver adapter"*. Any script or test
   importing `@/lib/db` without a URL crashed.
3. Twelve server-side suites were failing to **load** (not failing assertions)
   because they resolved `node:sqlite` inside `jsdom`. Now `@vitest-environment node`.

**Pre-existing gaps that block a full "green" claim:**

- `npm run build` is **not** verified in this environment (memory ceiling,
  ~2 GB free). CI runs it; this audit does not claim it.
- `npx tsc --noEmit` over the whole project **OOMs** here (exit 137). Type
  safety was verified per-area instead. This is an environment limit, not a code
  defect, but it means "typecheck passes" is unproven for the full graph.
- 15 tests skip under declared environment gates.

---

## 5. Findings that must be resolved before Phase 1

### F-1 · Two tenant roots (highest risk)

The schema has **266 models carrying `companyId` (345 occurrences)** and
**26 models carrying `workspaceId`**. `AiWorkspace` has an `organisationId` but
**no link to `Company`**. Two auth towers exist:

- `src/lib/api-auth.ts` → resolves `companyId` (legacy CRM + call centre)
- `src/lib/platform/principal.ts` → resolves `workspaceId` (AI platform)

Every new capability in Phases 1–6 has to pick one. Picking the wrong one
produces a cross-tenant data leak that no test currently catches, because no test
spans both towers. **This is the single most important architectural decision in
the whole programme and it must be made before any Phase 1 code is written.**

### F-2 · Migration history is out-of-band and split

Corrected from an earlier draft of this audit, which wrongly said no migrations
existed. The reality is more specific and still a real risk:

- 15 ordered SQL files in `prisma/migrations/mysql/`, 6 with rollback pairs —
  good, and the pattern Phase 5 should follow.
- They are applied **outside** Prisma's migration table, so `prisma migrate
  status` cannot tell you whether an environment is current.
- The SQLite path (`scripts/sqlite-push.ts`) is additive-only with **no down
  path**, so a development rollback is not possible.

Phase 5 adds tables (scaling policies, capacity reservations). It can, and
should, follow the existing MySQL forward+rollback file pattern — but it must
not claim Prisma-tracked migrations, and SQLite dev has no rollback at all.

### F-3 · Autoscaling has no foundation

Phase 5 assumes an infra control plane that does not exist. It cannot be built
before Phase 4 (provider adapters), and Phase 4 has no provider adapter either.
Phases 4 and 5 are the only genuinely greenfield work in the brief, and they are
sequenced last — which is correct.

### F-4 · "Marketplace" appears in navigation but not in code

`src/lib/dashboard/navigation.ts` and `department-registry` reference a
marketplace. Nothing implements it. Per the public-copy policy established
earlier, an unimplemented surface must be labelled unavailable, never a dead link.

---

## 6. External source evaluation

### 6.1 `github.com/topics/jarvis-ai` — 242 repositories

The topic is dominated by personal desktop voice assistants, not platform
components. Evaluated the three most-starred:

| Repository | Licence | Stars | Last push | Language | Verdict |
|---|---|---|---|---|---|
| `GauravSingh9356/J.A.R.V.I.S` | MIT | 1,504 | 2025-12-02 | Python | **Reject** — pyttsx3/pyttsx3 desktop automation, Tesseract OCR, Weather/News API. Zero overlap with a multi-tenant platform. |
| `kishanrajput23/Jarvis-Desktop-Voice-Assistant` | MIT | 1,097 | 2026-10-07 | Python | **Reject** — desktop system commands + speech recognition. Runs shell commands on a local machine, which our brief explicitly forbids for the assistant. |
| `blogminhquy/javis-os` | MIT | 926 | 2026-11-26 | Python | **Reference only** — MCP + websocket + agent orchestration "harness" concepts. Python, no tests of the kind we need, and our MCP support already exists as a route. |

**Nothing from this topic is adopted.** All three are single-user desktop tools;
importing them would violate constraint 7 (no competing implementations) and
constraint 14 (no mock capability). The topic is a naming coincidence, not a
component library. Recorded here so the decision is auditable rather than
repeated by the next person who searches that topic.

### 6.2 `neondatabase/autoscaling`

| Property | Value |
|---|---|
| Licence | Apache-2.0 |
| Stars / language | 265 / Go |
| Last push | 2025-12-16 |
| Description | Postgres **vertical** autoscaling in **Kubernetes** |

**Verdict: architecture reference only. Rejected as a dependency.**

Reasons: (a) it is Go and operates on Kubernetes pods and Postgres clusters — we
run Next.js on Node with a queue worker; (b) it is Neon's internal control plane
with Neon-specific assumptions, which the brief itself flags; (c) the brief
forbids replacing the production database with Neon and forbids automatic
production database resizing in the first release — which is the only thing this
repo does.

**What we will borrow:** its *policy shape* — reserve-then-scale decision order,
anti-overcommit check before scale-up, cooldown after scale-down. Those are
transferable design ideas, and they map directly onto the Phase 5 requirements
already written into the brief. Nothing is copied; the concepts are re-expressed
for an application-worker fleet.

### 6.3 The 20 commercial platforms

Evaluated as **competitive references for capability scope only**. No code, no
SDK, no vendor lock-in is implied. Their role in this programme is to define the
*kind* of capability a buyer expects; §3 above maps each to what we already have.
Notably: we already implement the parts that matter most (run identity, tool
governance, metering, approvals), and lack the parts that are hardest to copy
(provisioned infrastructure and a marketplace).

---

## 7. Production-risk assessment

| Risk | Severity | Mitigation required before Phase 1 |
|---|---|---|
| F-1 two tenant roots | **Critical** | Decide the canonical tenant root; write a spanning isolation test |
| F-2 out-of-band migrations, no SQLite down-path | **High** | Follow the MySQL forward+rollback file pattern; document that Prisma does not track state |
| Additive-only SQLite push | **High** | Rollback plan per schema change; MySQL path already has one |
| No full-graph typecheck in this env | Medium | Run in CI, treat CI as the gate |
| No full build in this env | Medium | Run in CI |
| Provider credentials env-based | Medium | Reuse existing encryption helper (already recorded as a gap) |
| 177 routes matching `error.message === 'Unauthorized'` | Medium | Pre-existing remediation item; do not add more |

---

## 8. Recommended sequence (changed by these findings)

The brief's order is right, but Phase 1's scope is wrong.

| Phase | Brief's assumption | Reality | Revised scope |
|---|---|---|---|
| 1 | Build persistent execution | ~85% exists | Close gaps: per-tool idempotency keys, resume test coverage, F-1 decision |
| 2 | Build CRM | Mostly exists | Unify the customer timeline across the two tenant roots |
| 3 | Build registry/workflow | Registry exists, workflow thin | Workflow builder + MCP client |
| 4 | Build developer cloud | Missing | Greenfield; needs provider adapter design |
| 5 | Build autoscaling | Missing, depends on 4 | Policy engine + dry-run, adapter-based |
| 6 | Governance + marketplace | Governance partial | Policy engine, marketplace |

**Before Phase 1 code: resolve F-1.** Everything downstream inherits that choice.

---

## 9. What this audit did not do

- Did not modify any application behaviour beyond the three test-infrastructure
  defects listed in §4, which were fixed to make the baseline trustworthy.
- Did not touch production, deploy, migrate data, or alter repository visibility.
- Corrected its own error about migrations in §2 rather than leaving a false
  claim in the record (§2 "On migrations", F-2).
- Did not create the seven remaining deliverable documents. They are scoped in
  §8 and will follow the F-1 decision, because writing a target architecture
  before choosing the tenant root would produce a document that has to be thrown
  away.
- Did not claim a passing build or full-graph typecheck, because neither was run
  successfully here (§4).

---

## 10. Next action

**Awaiting a decision on F-1 (canonical tenant root: `Company` or `AiWorkspace`).**
On decision, Phase 1 begins with the gap-closure list in §8, on its own branch,
with its own PR.
