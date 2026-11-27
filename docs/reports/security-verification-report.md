# Security & Tenant Isolation Verification Report

**Date:** 2026-11-27  
**Branch:** `arena/5010a0d6-alolabs-ai` (base `ea92476564e11c4c297bff380c39c02cd86eeeb3` on `main`)  
**Scope:** Canonical `Company` → `AiWorkspace` tenant hierarchy, T-1 … T-8 remediation across both auth towers (`api-auth` / `secureRoute` / `legacyTenant` and `platformRoute` / `Principal`), worker/SSE/memory/RAG/automation/API-key/gateway boundaries, dual SQLite + MySQL schema parity, and paired non-destructive migrations.

Every statement below is backed by an automated command executed in this workspace. Anything gated on external infrastructure or explicit production database authorization is stated explicitly.

---

## 1. Threat Model Remediation (T-1 … T-8)

All eight threats in `docs/security/tenant-isolation-threat-model.md` and the cross-surface legacy route exposures are remediated and covered by real-SQLite regression tests.

| ID | Threat | Severity | Remediation Implemented | Regression Evidence |
| --- | --- | --- | --- | --- |
| **T-1** | Queue worker executes jobs without revalidating tenant | High | `assertJobTenantMatchesRun()` enforced across `agentos.run`, `agentos.workflow`, `agentos.crm.lead-followup`, and `agentos.command` in `src/lib/workers/agentos-dispatcher.ts`; `lead-followup.ts` stamps `companyId` at enqueue. | `__tests__/security/tenant-isolation.test.ts` |
| **T-2** | `'default-company'` / null pseudo-tenant fallback | High | Removed `'default-company'` fallback; `isUsableTenantId()` rejects empty/placeholder IDs; `createRun`, `executeRun`, `retryRun`, and `cancelRun` fail closed without a real `companyId`; `Task.companyId` stamped on run task creation. | `__tests__/security/tenant-isolation.test.ts`, `__tests__/integration/run-engine-behaviours.test.ts` |
| **T-3** | Platform tower (`AiWorkspace`) bypassed `CompanyUser` | High | `resolvePrincipal` resolves `CompanyUser` first for session and API-key principals; `canAdministerWorkspace(principal, workspaceId)` filters by `companyId`; `provisionDefaultWorkspace` resolves `CompanyUser` and sets `AiWorkspace.companyId`. | `__tests__/security/tenant-isolation.test.ts`, `__tests__/platform/http-guards.test.ts` |
| **T-4** | Empty `workspaceId` on company-only principals | Medium | `platformRoute` enforces `requireWorkspace(principal, { allowCompanyScope })` by default; only `/api/v1/platform/{me,models,health,workspaces,workspaces/ensure}` opt into `allowCompanyScope: true`. | `__tests__/platform/http-guards.test.ts` (18/18 passed) |
| **T-5** | SSE `/api/runs/[id]/events` stream tenant check & bus leak | Medium | Upfront `isUsableTenantId` verification on both `run.companyId` and `user.companyId`, plus per-event `isUsableTenantId(event.companyId) && event.companyId === callerTenant` live bus filter and `Last-Event-ID` replay support. | `__tests__/integration/run-engine-behaviours.test.ts` |
| **T-6** | Client-supplied `companyId` spoofing / null-tenant record bypass | High | `assertTenant` in `src/lib/api/secure-route.ts` rejects `null`/`undefined` `recordCompanyId` with 404; `assertOwnedBy` in `src/lib/memory/ownership.ts` fails closed on missing `ownerId`; legacy routes reject mismatched `body.companyId` / `query.companyId` with 403. | `__tests__/unit/lib/api-security.test.ts`, `__tests__/security/cross-surface-tenant.test.ts` |
| **T-7** | `super_admin` conflated with cross-tenant data access | Medium | Audited `system:cross-tenant` scope gated by `ALO_SYSTEM_OPERATORS` allowlist and mandatory audit reason (`AuditLog` written prior to query execution). | `__tests__/security/system-operation.test.ts` (8/8 passed) |
| **T-8** | Approval, retry, and cancel by bare ID across tenants | High | `resolveRunApproval` verifies `reviewerCompanyId` matches both `Approval.companyId` and `AgentOSRun.companyId` (`src/app/api/v1/approvals/[id]/route.ts` passes `identity.companyId`); `retryRun` and `cancelRun` enforce `callerCompanyId`. | `__tests__/security/approval-tenant.test.ts`, `__tests__/integration/run-engine-behaviours.test.ts` |

---

## 2. Cross-Surface Legacy Route Hardening

An audit of all `own-session` routes identified endpoints that verified a session token without scoping queries to `CompanyUser`. In addition to the initial 17 routes, **22 additional routes** were migrated onto `legacyTenant` / `requireCompanyAuth` / `requireRole` (bringing `legacyTenant` coverage to **39 route files** and reducing `own-session` from 72 to 49):

- **RAG & Knowledge:** `rag/documents`, `rag/documents/[id]`, `rag/chunks/[id]`, `rag/query`, `rag/logs` — scoped through `RagCollection.companyId`; cross-tenant document/chunk reads, updates, deletes, and vector/keyword queries fail closed.
- **Automation & Workflows:** `automation/triggers`, `automation/triggers/[id]`, `automation/triggers/[id]/toggle`, `automation/logs`, `automation/execute` — scoped by `AutomationTrigger.companyId`; `Workflow` ownership verified via `Department.companyId` or `WorkflowPermission` (`companyId`, `allowed: true`); fixed `NaN` `sortOrder` bug on `AutomationAction` creation.
- **API Keys, Gateway Signing & Integrations:** `api-management`, `gateway/sign`, `integrations`, `enterprise/integrations`, `webhooks/[id]`, `marketplace/[id]/reviews` — scoped to `tenant.companyId`; `gateway/sign` verifies supplied `apiKey` belongs to caller's company before HMAC signing; `api-management` hashes secrets with SHA-256 and never returns plaintext hashes on `GET`.
- **Memory & Artifacts:** `memory/route.ts`, `memory/[id]/route.ts` — `assertOwnedBy` fails closed on empty owner; `GET /api/memory` stats and `agentId` queries filter by caller scope; `Artifact` download/read enforces `companyId`.
- **Usage, Jobs, Tasks & Observability:** `usage`, `usage/check`, `dashboard/usage`, `tenant-gateway/distribution`, `observability/dashboard`, `protection`, `cost-estimate`, `cost-estimates/[id]`, `jobs`, `jobs/[id]`, `jobs/stats`, `outputs/[taskId]`, `task-steps/[taskId]`, `skill-runs/[taskId]`, `feedback`, `company/command`, `agent-factory/build`.

---

## 3. Route Authorization & Classification Gates

Executed commands and exact results:

```text
$ node scripts/classify-routes.mjs --audit
  requireAuth-family    247
  own-session            49
  v1Handler              48
  legacyTenant           39
  withCompany            34
  secureCrud             29
  clientRoute            20
  public                 19
  platformHandler        19
  secureRoute            17
  internalRoute          16
  mail-session            5
  UNCLASSIFIED            0
  TOTAL                 542
OK: all 542 route files classified.

$ node scripts/validate-route-auth.mjs
validate-route-auth: 542 API route files, 856 non-public handler(s) checked, 19 allowlist entries, 1 documented exception(s)
validate-route-auth: OK — every non-public API handler references an auth helper
```

---

## 4. Dual-Schema Parity & Migration Safety

- **SQLite / MySQL Parity:** `prisma/schema.prisma`, `prisma/schema.mysql.prisma`, and `prisma/schema.mysql.push.prisma` are synchronized across all **266 models** and **669 indexed fields** (`npm run verify:mysql` → `0` parity errors, `0` index collisions).
- **Schema Additions:**
  - `AiWorkspace.companyId` (`ON DELETE RESTRICT`, indexed) with 3-step forward + rollback SQL (`20261126_ws_company_step{1,2_backfill,3_require}.sql`).
  - `AgentBuildRequest.companyId` (`ON DELETE SET NULL`, indexed) with paired forward + rollback SQL (`20261127_agent_build_request_company.sql` & `_rollback.sql`).
- **Migration Gate:**
  ```text
  $ npm run verify:migrations
  Migration safety check OK: 15 forward, 12 rollback, all paired, no destructive DDL in a forward migration.
  ```
- **Production Database Status:** Production MySQL migrations have **not** been executed from this sandbox (no live production DB credentials exist in the sandbox, and applying DDL to production requires a verified backup and explicit operator authorization).

---

## 5. Verification Matrix Summary

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (`src/`) | `npm run typecheck` | **PASS** (0 errors) |
| Typecheck (`__tests__/`) | `npm run typecheck:tests` | **PASS** (0 errors) |
| ESLint | `npm run lint` | **PASS** (0 errors) |
| Prisma Delegates | `npm run check:prisma-delegates` | **PASS** (227 delegates) |
| MySQL Schema Parity | `npm run verify:mysql` | **PASS** (266/266 models, 0 errors) |
| Workflow Definitions | `npm run check:workflows` | **PASS** (17 definitions, 109 steps, 0 errors) |
| Agent Skills Integrity | `npm run skills:verify` | **PASS** (838 skills, 0 problems) |
| Route Classification & Auth | `npm run verify:security && node scripts/validate-route-auth.mjs` | **PASS** (542 files, 856 handlers, 0 unclassified) |
| Security Test Suites | `npx vitest run __tests__/security` | **PASS** (7 files, 50 tests passed) |
| Run Engine 20 Behaviours | `npx vitest run __tests__/integration/run-engine-behaviours.test.ts` | **PASS** (20 behaviours across 7 real-DB tests) |
| Full Vitest Suite | `npx vitest run` | **PASS** (244 passed, 0 failed, 1 skipped [MySQL live service], 2,689 tests passed, 15 skipped) |
| Node Native Tests | `node --test __tests__/**/*.node*.mjs` | **PASS** (7/7 passed) |
| Standalone Production Build | `PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run build` | **PASS** (Next.js standalone + mini-services verified, 9,191 files, no leaked data/keys); packaged `queue-service.cjs` / `realtime-service.cjs` load cleanly |
