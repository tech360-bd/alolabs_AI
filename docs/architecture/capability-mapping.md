# Capability Mapping and Cross-Tenant Test Matrix

**Purpose:** map every capability from the programme brief onto what exists, and
define the test that proves its tenant boundary.
**Date:** 2026-11-26 · Verified against HEAD `82d3e18` plus this phase's documents.

Legend — **EXISTS** (implemented and used) · **PARTIAL** (implemented, missing a
required property) · **MISSING** · **REFERENCE** · **REJECTED**

---

## 1. Capability map

### Phase 1 — Persistent execution and streaming

| Capability | Module | State | Tenant boundary today | Action |
|---|---|---|---|---|
| Run identity | `src/lib/runs/index.ts:129` | EXISTS | `AgentOSRun.companyId` (nullable) | Make required; remove fallback |
| Status lifecycle | `runs/index.ts:49-53` | EXISTS | inherits run | — |
| Event timeline | `RunEvent` + `recordRunEvent` | EXISTS | via run | — |
| SSE replay | `api/runs/[id]/events` | EXISTS | `run.companyId === user.companyId` | keep + per-event check |
| Live streaming | `src/lib/event-bus` | EXISTS | none per event | add `companyId` to events (T-5) |
| Checkpoint resume | `runs/index.ts:497-545` | EXISTS | via run | add cross-tenant resume test |
| Cancellation | `runs/index.ts:208` | EXISTS | API-filtered | covered by T-8 test |
| Approvals | `resolveRunApproval` | EXISTS | API-filtered | covered by T-8 test |
| Retries | `job-queue` lease/attempts | EXISTS | none | T-1 fix |
| Idempotent external actions | — | PARTIAL | none | per-tool idempotency key (Phase 3) |
| Worker tenant revalidation | `agentos-dispatcher` | **MISSING** | none | **T-1 fix** |

### Phase 2 — CRM and customer operations

| Capability | Module | State | Boundary | Action |
|---|---|---|---|---|
| Contacts/leads/opportunities | Company-scoped models | EXISTS | `companyId` | — |
| Conversations | `Conversation`, `ConversationMessage` | EXISTS | `companyId` | — |
| Consent | `CustomerConsent` | EXISTS | `companyId` | — |
| Ticket/SLA | call-centre models | PARTIAL | `companyId` | verify SLA policy surface |
| Unified customer timeline | — | **MISSING** | — | span CRM + AI conversations |
| Cross-tower customer view | — | **MISSING** | — | blocked on T-3 |

### Phase 3 — Registry, tools, workflow

| Capability | Module | State | Action |
|---|---|---|---|
| Agent registry + versioning | `Agent`, `AgentVersion` | EXISTS | — |
| Tool permissions | `AgentPermission`, `agentCompanyScope()` | EXISTS | — |
| Multi-agent orchestration | `src/lib/agent-runtime/pipeline.ts` | EXISTS | add tenant test |
| Workflow engine | `src/lib/workflow-engine` (292 LOC) | PARTIAL | builder UI absent |
| MCP client | `/api/mcp-servers` route only | PARTIAL | client not verified |
| Marketplace | — | MISSING | Phase 6 |

### Phases 4–6 — Founder on nothing

| Capability | State |
|---|---|
| Git/deploy adapters, build logs, preview envs | **MISSING** (Phase 4) |
| Autoscaling policy engine, dry-run, capacity | **MISSING** (Phase 5) |
| Policy engine, marketplace, billing integration | **MISSING/PARTIAL** (Phase 6) |

### External sources

| Source | Verdict | Rationale |
|---|---|---|
| `topics/jarvis-ai` (242 repos, top 3 evaluated) | **REJECTED** | MIT Python desktop assistants; one executes local shell commands, which the brief forbids the assistant from having |
| `neondatabase/autoscaling` | **REFERENCE** | Apache-2.0, Go, k8s, Neon-specific; policy shape only |
| 20 commercial platforms | **REFERENCE** | Capability scope only; no code or SDK |

---

## 2. Cross-tenant test matrix

Requirement per approval §6. Two-sided proof: each **must fail before the fix**.

File: `__tests__/security/tenant-isolation.test.ts` (to be created in the
implementation phase — **not** in this documentation-only phase).

| # | Test | Threat | Expected pre-fix |
|---|---|---|---|
| 1 | Company A cannot read Company B records | T-3 | some pass, platform routes fail |
| 2 | Company A cannot update/delete Company B records | T-3 | fails |
| 3 | Workspace A1 cannot access A2 without permission | T-3 | fails |
| 4 | Workspace A1 cannot access Company B's workspace | T-3 | fails |
| 5 | Company admin reaches only authorised workspaces | T-3 | fails |
| 6 | Workspace user cannot reach company-restricted resources | T-3 | fails |
| 7 | API routes enforce the same policy as workers | T-1 | fails (worker has none) |
| 8 | SSE replay rejects unauthorised subscription | T-5 | passes (subscribe-time check) |
| 9 | Checkpoint resume cannot cross tenants | T-2 | fails |
| 10 | Approval/retry/cancel cannot cross tenants | T-8 | partial |
| 11 | Missing or invalid tenant context fails closed | T-4 | **fails** (empty `workspaceId: ''` accepted) |
| 12 | Both towers produce consistent outcomes | T-3/T-6 | fails |
| 13 | `'default-company'` never acts as a tenant | T-2 | fails |
| 14 | CRM regression: existing behaviour unchanged | — | passes (baseline) |
| 15 | AI platform regression: existing behaviour unchanged | — | passes (baseline) |

Current coverage: positions 8, 14 and 15 partially exist
(`client-portal-separation`, `f6-webhook-delivery-tenant-isolation`, the platform
suite). **No test currently exercises both towers in one assertion** — verified by
scanning every test file that imports the platform principal for any `api-auth`
reference; there are none.

That single sentence is the most important line in this document: the two
authorisation systems have never been compared, so their disagreement has never
been observable.

---

## 3. Definition of done for this phase

| # | Criterion | Status |
|---|---|---|
| 1 | Company documented as canonical root | ✅ `agentos-target-architecture.md` |
| 2 | AiWorkspace→Company ownership defined with evidence | ✅ `canonical-tenant-model.md` §4 |
| 3 | Both towers have a unification strategy | ✅ `authentication-authorization-unification.md` |
| 4 | All tenant-owned categories classified | ✅ `canonical-tenant-model.md` §5 |
| 5 | Threat model complete | ✅ `tenant-isolation-threat-model.md` (T-1…T-8) |
| 6 | Test matrix implemented **or** gaps precisely documented | ✅ documented here §2 |
| 7 | No Phase 1 functionality duplicated or removed | ✅ nothing in `src/` changed |
| 8 | Changes, results, risks, migration proposals documented | ✅ this phase's docs |
| 9 | Reviewable PR with CI evidence | ✅ docs-only commit; suite green |
| 10 | No production data or deployment changed | ✅ dev DB read-only |
