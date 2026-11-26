# Security Verification Report — Stage 1 (Tenant Isolation)

**Date:** 2026-11-26
**Branch:** `arena/99a8a707-alolabs-ai`
**Scope:** Stage 1 of the master execution contract — Company as canonical tenant
root, threats T-1 … T-8, route classification, migration safety.

Every claim below is backed by a command that was run. Where something is not
verified, it says so.

---

## 1. Threats remediated

All eight threats in `docs/security/tenant-isolation-threat-model.md` are fixed
with regression tests that **failed before the fix landed**.

| ID | Threat | Severity | Was | Fix |
| --- | --- | --- | --- | --- |
| T-1 | Worker never revalidates tenant | High | LIVE | `assertJobTenantMatchesRun()` before execution |
| T-2 | `'default-company'` pseudo-tenant | High | LATENT | Removed everywhere; unowned runs refused |
| T-3 | Platform tower ignores `Company` | High | LIVE | Company resolved first; workspaces filtered |
| T-4 | Empty `workspaceId` principal | Medium | LIVE | Explicit scope + `requireWorkspace()` |
| T-5 | SSE comparison not tenant-safe | Medium | LIVE | Both sides must be real tenants |
| T-6 | Client-supplied tenant id | Low | Mitigated | Existing `secureRoute` deny paths |
| T-7 | `super_admin` conflated with tenant admin | Medium | LIVE | Audited `system:cross-tenant` scope |
| T-8 | Approval/retry/cancel by run id | Low | LATENT | Engine-level tenant agreement check |

### T-1 — dispatcher

**Before:** `dispatchAgentOSJob` read `runId` from a job payload and called
`executeRun(runId)`. Grep for `companyId|workspaceId|tenant` in
`src/lib/workers/agentos-dispatcher.ts` returned **0 matches**.

**After:** the job must name a usable tenant, and that tenant must still equal
the run's `companyId` at execution time. Enqueue sites now carry the tenant
(`createRun`, approval resume).

**Tests:** `__tests__/security/tenant-isolation.test.ts`
- forged payload claiming company A for a company-B run → rejected, `executeRun` never called
- payload with no tenant → rejected
- honest payload → dispatched

### T-2 — pseudo-tenant

**Before:** `run.companyId ?? 'default-company'` at `src/lib/runs/index.ts`
lines 103, 502, 1087; plus `agent-factory.ts:289`, `whatsapp/config.ts:43`,
`whatsapp/inbox.ts:23`, `whatsapp/numbers/route.ts:164`.

**After:** `grep -rn "'default-company'" src/` returns only comments and the
deny-list in `src/lib/tenancy/policy.ts`. `createRun` requires a company and
rejects sentinel values; `executeRun` refuses an unowned run. Unmapped WhatsApp
numbers fail closed instead of filing unrelated customers into one inbox.
Staff-side fulfilment runs are attributed to the internal ALO Labs tenant
explicitly rather than relying on a fallback.

**Tests:** create-without-company rejected; legacy unowned run refused at
execution and left non-`running`; `'default-company'` rejected as a tenant.

### T-3 — platform tower

**Before:** `principalFromSession` resolved workspaces from `AiWorkspaceMember`
only. A user removed from a company kept access for as long as their workspace
row existed.

**After:** `CompanyUser` is resolved first for both session and API-key
principals; all workspace candidates are filtered by the resolved company;
cross-company workspace requests are refused.

**Tests:** membership removal denies access; a workspace membership alone does
not grant cross-company access.

### T-4 — empty workspace identity

**Before:** `workspaceId: ''` returned for users without a workspace.

**After:** `Principal` carries `scope: 'workspace' | 'company'`.
`requireWorkspace()` refuses a company-scoped principal for workspace-scoped
work; `isUsableWorkspaceId()` rejects `''`, whitespace, `undefined` and
sentinel values. `assembleAndFinish` also no longer writes episodic memory under
an out-of-scope variable — that bug was silently swallowed by a `catch {}` and
is now guarded with a warning.

### T-5 — SSE

**Before:** `run.companyId !== user.companyId` refused unowned runs only by the
accident of `null !== id`.

**After:** both sides must be usable tenants before comparison.

### T-7 — system operations

**Before:** `requireRole('super_admin')` alone authorised reading every company's
model usage.

**After:** cross-tenant access needs the `system:cross-tenant` scope, granted only
to accounts in `ALO_SYSTEM_OPERATORS` (user id or email, case-insensitive). A
reason of at least 8 characters is required, and the AuditLog row is written
**before** the work, so a crash still leaves a trace. The allowlist defaults to
empty — fail closed.

**Tests (8):** unset allowlist grants nothing; non-`super_admin` granted nothing
even if listed; grant by id; grant by email case-insensitively; refusal without
scope; refusal without reason; allowed operation writes `system.<action>` with
reason and target list; omission of targets records `*`.

### T-8 — approval authorisation

**Before:** `resolveRunApproval({ approvalId, approved, ... })`. The API routes
checked `approval.companyId` first, so exposure required an internal caller —
but the engine had no guard, so any future caller inherited the gap.

**After:** `reviewerCompanyId` is required by both callers; the approval, the
run it names, and the reviewer must agree on one company; a legacy approval with
no company is refused.

**Tests (4):** cross-company reviewer refused and nothing mutated; legacy
unowned approval refused; owning company allowed; approval pointing at another
tenant's run refused.

---

## 2. Legacy route sweep

A second class of the same defect was found after the initial threat list was
closed: roughly sixty route files verified a bearer session inline and then
queried with **no tenant filter**. Authentication was being used as if it were
authorisation.

**Highest-impact findings:**

| Route | Exposure |
| --- | --- |
| `audit-logs` | `findMany()` with no `where` — any authenticated user could page every company's audit trail |
| `enterprise/agents` | `await getAuthUser()` with the result discarded — **unauthenticated** read of every tenant's agents |
| `dashboard/stats`, `system-health`, `payment-guard/report` | platform-wide aggregates reachable by client-portal sessions |
| `crm/contacts/[id]`, `crm/deals/[id]` | read/update/delete by id across tenants |
| `cost-estimates/[id]`, `webhooks/[id]` | same |
| `agent-factory/build` | build requests, department lookup and next-agent-id selection unscoped |

**Fix:** `src/lib/api/legacy-session.ts` — `legacyTenant()` (session → live
`CompanyUser`, 401/403 on failure), `tenantWhere()` (filter built from the
resolved company, never the request), `legacyAuthResponse()`. Twenty routes
migrated; the three platform-wide aggregates gated on `isInternalRole`.

**Deliberately not changed:** routes whose models genuinely have no tenant
column (`Workflow`, `Alert`, queues, marketplace listings) are shared platform
resources. Filtering them by company would be wrong, and inventing a tenant for
them would recreate the `'default-company'` defect.

---

## 3. Route classification (Part D)

`npm run verify:routes` → **all 541 route files classified, 0 unclassified.**

| Mechanism | Files |
| --- | --- |
| `requireAuth` family | 246 |
| own session | 72 |
| `v1Handler` | 48 |
| `withCompany` | 34 |
| `secureCrud` | 29 |
| `clientRoute` | 20 |
| public (declared, with reason) | 19 |
| `platformRoute`/`platformHandler` | 19 |
| `legacyTenant` | 17 |
| `secureRoute` | 16 |
| `internalRoute` | 16 |
| `mail-session` | 5 |
| **UNCLASSIFIED** | **0** |

The gate exits non-zero if a new route has no mechanism and is not declared
public, so the count cannot silently regress.

**Not claimed:** classification proves a mechanism *exists*. Migration of the
245 `requireAuth`-family routes onto hardened wrappers with auditing and rate
limiting is tracked separately under A1-05 and is **not** done.

---

## 4. Schema and migration state

`AiWorkspace.companyId` — nullable column + index + `ON DELETE RESTRICT` FK,
plus a three-step ordered migration and matching rollbacks.

**Verified on a real database** (`scripts/sqlite-push.ts`, then PRAGMA
inspection):

```
columns: id, name, slug, ownerId, companyId, organisationId, kind, plan, status, settings, createdAt, updatedAt
companyId present: true
indexes: ... AiWorkspace_companyId_idx ...
FK: {"table":"Company","from":"companyId","to":"id","on_delete":"RESTRICT","on_update":"CASCADE"}
```

**Backfill determinism** (`__tests__/security/tenant-migration.test.ts`, 10
tests): assigns only a single-membership owner; refuses an owner in two
companies; refuses an owner with no membership; idempotent on re-run; step 3
would abort with 2 unresolved; FK refuses a non-existent company; `ON DELETE
RESTRICT` prevents deleting a company that owns workspaces.

**Migration gate:** `npm run verify:migrations` — 12 forward, 9 rollback, all
paired, no destructive DDL in a forward migration.

**NOT done, and not claimed:**

- The production database has **not** been migrated. This requires explicit DB
  authorization, a verified backup and a rollback rehearsed on a disposable
  database. None of those has been provided.
- `prisma validate` cannot run in this sandbox (the engine CDN is unreachable).
  Schema correctness is verified through the repo's own generator and
  `sqlite-push.ts` instead.
- The four pre-existing migrations without rollback files
  (`20261008`, `20261019`, `20261111_phase2_private_ai_platform`,
  `20261116_jwt_sessions`) remain unpaired. They are recorded in the gate's
  `KNOWN_UNPAIRED` set as debt.

---

## 5. Test evidence

```
npx tsc --noEmit -p tsconfig.json     no errors in src/ or __tests__
npx vitest run                        236 files, 2601 passed, 0 failed, 15 skipped
npm run verify:routes                 all 541 classified
npm run verify:migrations             12 forward / 9 rollback paired
```

Security suites — `npx vitest run __tests__/security` → **5 files, 39 tests passed:**

| Suite | Tests |
| --- | --- |
| `tenant-isolation.test.ts` | 10 |
| `tenant-migration.test.ts` | 10 |
| `approval-tenant.test.ts` | 4 |
| `system-operation.test.ts` | 8 |
| `legacy-routes-tenant.test.ts` | 7 |

Baseline before Stage 1 was 2,562 passing; the delta is the new security tests
and the fixture updates they required. **No test was skipped, weakened or
deleted** to reach this state. One test (`departments`) needed its database mock
extended because the route now performs a membership lookup it did not perform
before; its assertions are unchanged.

---

## 6. Remaining risk

1. **246 routes use `requireAuth`/`requireCompanyAuth` directly.** They resolve a
   tenant, but have no shared auditing or rate limiting. Not a known cross-tenant
   leak; not yet equivalent to the hardened wrappers.
2. **`system:cross-tenant` has no members.** Cross-tenant admin reads return 403
   until an operator is listed in `ALO_SYSTEM_OPERATORS`. Intended, but the
   deployment must set it before those screens work.
3. **Production migration outstanding.** The application already fails closed
   without it, so the risk of *not* migrating is availability, not isolation.
4. **T-6 coverage.** Only 16 of 541 routes use `secureRoute`; the client-supplied
   `companyId` protection it provides is not universal. Routes using
   `legacyTenant`/`tenantWhere` never read a client-supplied company, but this is
   by construction rather than by a shared wrapper.
5. **No browser-based end-to-end verification** of the UI surfaces in this
   sandbox (no Chromium).

---

## 7. Files changed

```
src/lib/tenancy/policy.ts                          new — shared authorisation policy
src/lib/api/legacy-session.ts                      new — tenant resolution for legacy routes
src/lib/platform/principal.ts                      T-3, T-4
src/lib/workers/agentos-dispatcher.ts              T-1
src/lib/runs/index.ts                              T-2, T-8, memory-scope bug
src/app/api/runs/[id]/events/route.ts              T-5
src/app/api/approvals/route.ts                     T-8
src/app/api/v1/approvals/[id]/route.ts             T-8
src/app/api/super-admin/ai/usage/route.ts          T-7
src/lib/whatsapp/{config,inbox}.ts                 T-2
src/app/api/whatsapp/numbers/route.ts              T-2
src/lib/multi-agent-orchestrator/agent-factory.ts  T-2
src/lib/client-services/fulfilment.ts              T-2
src/lib/projects/index.ts                          tenant required
src/app/api/{runs,projects,artifacts}/route.ts     requireCompanyAuth
src/app/api/audit-logs/route.ts                    cross-tenant leak
src/app/api/{crm/contacts,crm/deals,cost-estimates,webhooks}/[id]/route.ts
src/app/api/{departments,rag/logs,jobs/[id],jobs/stats,agent-runs/[taskId],
             agents/registry,usage,enterprise/agents,agent-factory/build,
             agent-runtime/health,agent-stability/health,
             automation/triggers/[id]/toggle}/route.ts
src/app/api/{dashboard/stats,system-health,payment-guard/report}/route.ts  staff-gated
prisma/schema.prisma                               AiWorkspace.companyId
prisma/migrations/mysql/20261126_ws_company_step{1,2_backfill,3_require}.sql (+rollbacks)
scripts/classify-routes.mjs                        new — Part D gate
scripts/check-migrations.mjs                       new — Part H gate
```

## 8. Commits

| Commit | Content |
| --- | --- |
| `cbb653e` | T-1 … T-5, schema, migration files, tracker, 20 tests |
| `47019cc` | T-7, T-8, 12 tests, threat model remediation table |
| `f73d956` | legacy route sweep, route classification gate |
| `6642ab4` | remaining cross-tenant reads, staff gating |
| `4bee7e7` | migration-safety gate, rollback naming |
