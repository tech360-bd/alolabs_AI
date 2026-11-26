# Tenant Isolation Threat Model

**Scope:** ALO Labs AgentOS, `Company`-rooted tenancy.
**Date:** 2026-11-26 · **Status:** Phase 1 design; no code changed.
**Companion:** `docs/security/canonical-tenant-model.md` (evidence),
`docs/artifacts/…` (this document's threats are traced to code below).

Severity uses *exploitability × impact*. A finding marked **LIVE** means the code
path exists today; **LATENT** means no data currently triggers it.

---

## Trust boundaries

```
┌─ untrusted ──────────────────────────────────────────┐
│  browser · API client · webhook sender · worker job  │
└──────────────┬───────────────────────────────────────┘
               │  ← B1: authentication
┌──────────────▼───────────────────────────────────────┐
│  principal  (session cookie | API key)               │
└──────────────┬───────────────────────────────────────┘
               │  ← B2: tenant resolution (server-side only)
┌──────────────▼───────────────────────────────────────┐
│  Company context                                     │
└──────────────┬───────────────────────────────────────┘
               │  ← B3: workspace membership
┌──────────────▼───────────────────────────────────────┐
│  AiWorkspace context                                 │
└──────────────┬───────────────────────────────────────┘
               │  ← B4: row-level filter on every query
┌──────────────▼───────────────────────────────────────┐
│  tenant-owned rows                                   │
└──────────────────────────────────────────────────────┘
```

The attack is the same in every case: **cross a boundary without the server
re-deriving the context**. Every threat below is an instance.

---

## Threats

### T-1 · Background job acts without tenant revalidation — **HIGH, LIVE**

**Where:** `src/lib/workers/agentos-dispatcher.ts`, `src/lib/job-queue.ts`.
**Observed:** a grep for `companyId|workspaceId|tenant|revalidat` in the
dispatcher returns **nothing**. The dispatcher loads a job and calls
`executeRun(runId)` using only the run id.

**Consequence:** a job payload is trusted. The run's tenant is whatever the row
says at execution time, and nothing re-derives it from the job's provenance or
re-checks that the enqueuing tenant still owns the run. If a run row were ever
re-parented, or a job forged, the worker would execute it without objection.

**Required fix:** carry `companyId` in the job payload, and on claim assert
`run.companyId === payload.companyId`, failing closed on mismatch.

---

### T-2 · Pseudo-tenant `'default-company'` collapses tenants — **HIGH, LATENT**

**Where:** `src/lib/runs/index.ts` lines **103, 502, 1087**:
```ts
const companyId = run.companyId ?? 'default-company';
```
Also `src/lib/multi-agent-orchestrator/agent-factory.ts:289`,
`src/lib/whatsapp/inbox.ts:23`, `src/app/api/whatsapp/numbers/route.ts:164`.

**Why it matters:** `AgentOSRun.companyId` is **nullable**. A run created without
a tenant is then executed by the worker under the literal string
`'default-company'`. Any run whose tenant was lost becomes reachable by every
other run in the same state — and the SSE guard
`run.companyId !== user.companyId` compares against that same sentinel, so two
different tenants' orphaned runs are indistinguishable.

**Measured today:** `AgentOSRun` rows = **0**, so there is no live exposure.
The path is nevertheless reachable by any code path that omits `companyId`.

**Required fix:** `companyId` becomes required at creation; the fallback is
removed and replaced by a hard failure. This is proposed, not performed.

---

### T-3 · `platformRoute` authorises without `Company` — **HIGH, LIVE**

**Where:** `src/lib/platform/principal.ts:203-215`.
```ts
const memberships = await db.aiWorkspaceMember.findMany({ where: { userId } , … });
```
Authorisation is `AiWorkspaceMember` only. `CompanyUser` is never consulted, and
`AiWorkspace` has no `companyId` to consult. A user removed from a company but
still holding a workspace membership row keeps full workspace access.

**Required fix:** B2 before B3 — company membership is a prerequisite (§3 of the
target architecture), enforced in one shared resolver used by both towers.

---

### T-4 · Workspaceless principal carries `workspaceId: ''` — **MEDIUM, LIVE**

**Where:** `src/lib/platform/principal.ts:240`.
A signed-in account with no workspace receives a principal whose
`workspaceId` is the empty string rather than a rejection.

**Consequence:** handlers that interpolate `workspaceId` into a query without
validating emptiness will match rows whose `workspaceId` is `''`. Today no such
rows exist, but the pattern is an unguarded default.

**Required fix:** an empty workspace id must fail closed at the resolver, with the
"create a workspace" flow given an explicit, separately-scoped endpoint (one
already exists: `/api/v1/platform/workspaces/ensure`).

---

### T-5 · SSE authorisation precedes but does not cover live events — **MEDIUM, LIVE**

**Where:** `src/app/api/runs/[id]/events/route.ts:38`.
The ownership check is correct for the initial request. But the live tail
subscribes to the **in-process event bus** keyed by `correlationId`/run id. Two
tenants' runs cannot share an id, so this is sound *provided* run ids are never
reused and the bus is per-process. It becomes unsound in a multi-replica
deployment, where a bus instance may carry events for runs owned by another
replica's tenant and the subscriber has no per-event tenant check.

**Required fix:** attach `companyId` to every bus event and drop non-matching
events at delivery, so the check is per-event rather than per-subscription.

---

### T-6 · Client-supplied tenant id — **LOW, MITIGATED**

**Where:** `src/lib/api/secure-route.ts` already treats a client `companyId` as a
claim and emits `tenant_mismatch` when it disagrees with the principal. This is
the correct pattern and is the model the platform tower must adopt.

**Residual risk:** only **16** of 541 route files use it. **197** route files call
`requireAuth`/`requireCompanyAuth` directly, and the remainder use neither wrapper.

---

### T-7 · `super_admin` is a tenant role — **MEDIUM**

`super_admin` grants cross-tenant administration from a normal session. It is
necessary operationally, but it is not a separate privilege tier with its own
audit trail.

**Required fix:** treat system operations as a distinct capability with mandatory
audit records, per §5 of the threat model's parent approval.

---

### T-8 · Approval, retry and cancellation cross boundaries — **LOW, LATENT**

`resolveRunApproval`, `cancelRun` and retry paths key on `runId` only. The API
layer filters by tenant first, so the exposure is limited to an internal caller
that already holds a run id. With T-1 fixed, this closes as a side effect.

---

## Threat matrix

| ID | Threat | Severity | State | Blocks Phase 1? |
|---|---|---|---|---|
| T-1 | Worker never revalidates tenant | **High** | LIVE | **Yes** |
| T-2 | `'default-company'` pseudo-tenant | **High** | LATENT | **Yes** |
| T-3 | Platform tower ignores `Company` | **High** | LIVE | **Yes** |
| T-4 | Empty `workspaceId` principal | Medium | LIVE | Yes |
| T-5 | SSE bus not per-event scoped | Medium | LIVE | No (single replica) |
| T-6 | Client-supplied tenant id | Low | MITIGATED | No |
| T-7 | `super_admin` conflated with tenant admin | Medium | LIVE | No |
| T-8 | Approval/retry/cancel by run id | Low | LATENT | No |

---

## What is *not* a vulnerability

Recorded so the next auditor does not re-open these:

- **`AiWorkspaceMember` alone is not isolation** — that is T-3, an omission, not a
  design choice to preserve.
- **Two tenant models existing** is not itself a flaw; the flaw is that neither
  knows about the other. Fixing the join fixes the model.
- **`Company` being large (345 references)** is not risky. It is the boundary we
  are standardising on precisely *because* it is where controls already live.

---

## Verification plan

Every threat above maps to a test in `docs/architecture/capability-mapping.md`
§"Cross-tenant test matrix". A threat is closed only when its test fails on the
pre-fix code and passes after. That two-sided proof is the acceptance standard
for this phase, and it is why the matrix is written before the fix.
