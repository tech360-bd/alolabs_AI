# ALO Labs AgentOS — Phase A: API security & tenant isolation

Commit: `1ae93cd` — branch `arena/b2e5d878-alolabs-net-ai`.
Scope: API security + tenant isolation only (no schema migration, no deployment).

---

## 1. What was added

### Central guard — `src/lib/api/secure-route.ts` (new)
`secureRoute(options, handler)` wraps a route and, in a fixed order:

1. **Pre-auth rate limit** (optional) — one shared bucket for all anonymous callers, so spoofing `x-forwarded-for` cannot buy extra attempts.
2. **Authentication** — session user (`getAuthUser`) or API key (`authenticateV1`). Modes: `required` / `optional`.
3. **Tenant resolution** — `companyId` is taken **from the principal only**.
4. **Rate limiting keyed on the principal** (`resource:action:kind:userId|keyId`), never on headers.
5. **API-key scope check** (`resource:read|write|execute`).
6. **Role authorisation** (`roles`, `companyRoles`; `super_admin`/`admin` bypass).
7. **Tenant-authority assertion** — a `companyId` in body / params / query that does not match the principal is rejected **403** and recorded as a **critical** `tenant_isolation_violation` event; the value is then stripped so no handler can read it. (Assertion happens before Zod, stripping after, because some legacy create schemas require `companyId`.)
8. **Zod validation** — params (400), query (400), body (422, or 400 where the old contract used 400).
9. **Security events** — `securityEvent` rows, redacted, best-effort (never fatal).
10. **Uniform errors** — `{ success, error: { code, message }, requestId }` plus `x-request-id`.

Helpers: `tenantTarget(principal, requested)` — `super_admin` may name any tenant, everyone else is pinned to their own (403 on mismatch) — used by hand-written routes; `redact()`; `errorResponse()`; `jsonResponse()`; `ApiHttpError`; `badRequest/notFound/forbidden/...`.

### Declarative CRUD guard — `src/lib/api/secure-crud.ts` (new)
`secureCrud({ resource, delegate, createSchema, updateSchema, writeRoles, ownership, requireTenant })`:
- Reads: tenant filter applied to `findMany`/`count`/`findUnique`; reads stay open to any authenticated tenant member (previous behaviour preserved).
- Writes: gated by `writeRoles` (`super_admin/admin` for agent company-access, agent permissions, feature flags, model assignments, skill permissions, SOP updates, tool approvals; `super_admin/admin/manager/operator` elsewhere) with **auditable** events (`unauthorized_write_attempt`).
- `ownership`: tenancy inherited through a parent row (`delegate` + `fk` + `relation`) — verified on create, on update and on FK re-parenting; foreign parents yield 404.
- `requireTenant` (default on): an authenticated tenant member is demanded even for tables without a `companyId`.

### Converter — `scripts/convert-routes-to-secure-crud.js` (new, one-off, not runtime)
Rewrote the 25 "generated style" routes into `secureCrud` declarations from an explicit per-resource policy map (the map is the record of the write-role decisions).

---

## 2. Route audit: 107 route files, 590 exported handlers

Method: segment every `route.ts` by exported handler and look for an identity marker (`getAuthUser`, `requireAuth`, `requireCompanyAuth`, `requireRole`, `v1Handler`, `secureRoute`, `secureCrud`, cookie/header/session lookups, …). That reduced 590 handlers to **17 with no identity check at all**; 6 of them are intentionally public (auth login/logout/register/password-reset, health probes, WhatsApp webhook), leaving **11 real findings**, all now fixed.

### Fixed — no authentication at all
| Endpoint | Was | Now |
|---|---|---|
| `GET /api/billing/invoices` | anonymous, `?companyId=` enumerated every tenant's invoices | authenticated + tenant-scoped |
| `GET /api/billing/payments` | anonymous, all payments | authenticated + tenant-scoped |
| `GET /api/billing/subscriptions` | anonymous, all subscriptions | authenticated + tenant-scoped |
| `GET /api/billing/subscriptions/[id]` | anonymous, any id | tenant-scoped `findFirst` → 404 |
| `POST /api/sync` | **no auth**, `companyId` straight from the body | authenticated, tenant from principal |
| `GET /api/marketplace/installs` | **no auth**, `?companyId=` enumeration | authenticated + tenant-scoped |
| `POST /api/marketplace/installs` | **no auth**, `companyId`/`userId` from body | authenticated, values from principal |
| `POST /api/marketplace/templates` | **no auth**, anyone could publish | `super_admin`/`admin` |
| `POST /api/infra/ping` | anyone could probe internal datastores | `super_admin`/`admin`, rate limited |

### Fixed — client-controlled tenant / cross-tenant access
| Endpoint | Was | Now |
|---|---|---|
| `POST /api/agent-runtime/execute` | runs attributed to hard-coded `default-company`; agent lookup unfiltered; `DELETE` cancelled any task | tenant-scoped agent lookup (`agentCompanyAccess`), runs under the caller's tenant, role-gated + rate limited |
| `POST/DELETE /api/v1/agents/execute` | `companyId = user.userId`; unfiltered agent lookup; `deleteMany` by agent id only | tenant from principal, tenant-scoped lookup, role-gated |
| `DELETE /api/logs` | any authenticated user could prune **all tenants'** logs | `super_admin`/`admin`, date validated |
| `POST /api/logs` | `companyId` from body, level unvalidated | tenant from principal, Zod-validated, rate limited |
| `DELETE /api/memory`, `/api/memory/[id]` | delete any memory id after an existence check | ownership check → 404 |
| `GET/DELETE /api/enterprise/conversations` | fell back to `{userId:'anonymous', role:'viewer'}`; archive any conversation by id | authentication required; ownership (user or company) verified → 404 |
| `POST/DELETE /api/incidents` | `companyId` from body; update/delete any id | tenant from principal; `findFirst` scoped to tenant |
| `GET/POST /api/ai-security/events` | `companyId` from body; listing unfiltered (all tenants' security events) | tenant-scoped listing; tenant from principal; payloads redacted |
| `GET /api/company/{tasks,usage,agents/allowed,workflows/allowed}` | authenticated but `?companyId=` named any tenant | pinned to the principal's tenant (403 on mismatch) |
| `GET/POST/PUT/DELETE /api/token-budget` | `?companyId=` / body `companyId` named any tenant | `tenantTarget` |
| `GET/POST/PUT /api/token-usage` | body `companyId` any tenant; `PUT` updated **any id** | `tenantTarget`; `PUT` scoped by tenant → 404 |
| `GET/PATCH/POST/DELETE /api/company-access` | any authenticated user could read the full access matrix and **grant access** to any company | `super_admin`/`admin` + `tenantTarget`; delete scoped to tenant |
| `/api/tenant-admin/{config,quotas,users}` | a tenant `admin` could administer **any** company | `super_admin` may name any tenant; `admin` pinned to own |
| `POST /api/whatsapp/webhook` | invalid HMAC only logged a warning, message processed | missing/invalid signature → 401 + recorded |

Plus **25 generated-CRUD routes** moved onto `secureCrud` (agent-company-access, agent-performance, agent-permissions, agent-status-history, agent-usage-summaries, agent-versions, automation-suggestions, company-memory, company-usage-summaries, crm/notes, department-memory, feature-flags, model-assignments, model-health, rag/feedback, skill-permissions, skill-validation-logs, skill-versions, sop-updates, task-errors, tool-approvals, tool-runs, workflow-improvements, workflow-steps, workflow-usage-summaries).

---

## 3. Tests

`__tests__/unit/lib/api-security.test.ts` (32), `__tests__/unit/lib/api-secure-crud.test.ts` (13), `__tests__/api/route-authorization.test.ts` (22), `__tests__/api/route-hardening.test.ts` (59) — **126 tests, all passing**. They import the real route modules and mock only auth, rate limiting, Prisma delegates and in-process services.

Proven per route class:
- anonymous → 401, no DB call;
- cross-tenant read → empty/404 (never another tenant's row);
- cross-tenant write (`companyId` in body/query) → 403 + critical `tenant_isolation_violation`, no write;
- insufficient role → 403 (admin-only writes refuse operator/manager/viewer; reads still work for viewers);
- invalid payload → 400/422 with field detail;
- ownership: foreign parent / foreign id → 404, no mutation;
- valid authorized request → same status and shape as before (200/201/202), tenant stamped server-side;
- security events recorded, and a test asserts the HMAC secret never appears in a recorded event.

Command:
```
export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/e2b-ca.crt
npx vitest run __tests__/unit/lib/api-security.test.ts \
  __tests__/unit/lib/api-secure-crud.test.ts \
  __tests__/api/route-authorization.test.ts __tests__/api/route-hardening.test.ts
```

Full suite: **919 passed, 28 skipped, 5 suites failed** — the 5 failures are `integration/*` and are pre-existing and environmental (`Cannot find module '.prisma/client/default'`; the Prisma engine cannot be downloaded in this sandbox). Baseline at HEAD: 793 passed, same 5 failures → **no regressions, +126 tests**.

---

## 4. Verification status — verified vs unverified

**Verified**
- Unit/security tests above: 126/126.
- Full test suite: no regressions (919 vs 793 passing; identical 5 environmental failures).
- `tsc --noEmit`: 417 errors, **all pre-existing**; diffed against a clean `HEAD` worktree — **zero new errors**, one pre-existing error fixed.
- `eslint` clean on every changed file.

**CI (`gh pr checks 11`) — cannot be evidenced.** Three workflows ran (CI: "TypeScript, tests, lint, and build"; Security Scan: "Dependency Audit" + "Secret Scan"). All failed in 1–2 seconds with **zero executed steps** (the API reports `"steps": []`), which means no runner ever picked the job up. This is pre-existing and unrelated to this change: every workflow run in the repository fails the same way, including the runs for the already-merged PR #10 and for `main` pushes (`gh api .../actions/runs`). So GitHub Actions results are **unverified**, not "passing" and not "failing on my code".

**Not verified (blocked, stated plainly)**
- `next build` / production build: fails at the type-check step on the same 417 pre-existing errors. Root cause is `prisma generate` failing here (`binaries.prisma.sh` is unreachable from the sandbox), so `@prisma/client` has no generated types. Not caused by this change; the build therefore cannot be evidenced here.
- Integration tests against a real database: same Prisma blocker.
- No runtime/UI verification against `https://alolabs.net` — the deployed site is the portfolio, not this application.

**Deployment decision: NOT deploy-ready on this evidence.** CI (lint/typecheck/test) cannot run in this environment either (no GitHub runners are available to this session), and the production build is unverifiable. Do not deploy until `prisma generate` + `next build` + the integration suites pass in an environment with network access.

---

## 5. Remaining gaps (deliberate, reported)

1. **`ServerLog` / `ErrorLog` have no `companyId`.** Log pruning is inherently global; it is now admin-only but cannot be row-filtered. Adding a tenant column is an additive migration — deferred (no schema migration in this session).
2. **Legacy rows with `NULL companyId`.** Reads are now strictly tenant-scoped, so rows created before this change (incidents, logs, conversations, …) become invisible until an admin backfills them. This is the safe direction (don't show data with no owner) but needs a backfill step before/with deployment.
3. **`src/lib/runs/index.ts` and `src/lib/multi-agent-orchestrator/agent-factory.ts`** still contain `'default-company'` as a `??` fallback / event-bus publication. They only fire when a run row has no tenant or in internal in-process events, so they are not route-level leaks, but the libraries should take a `companyId` parameter.
4. **`Department` has no `companyId`** (schema), so `/api/enterprise/department-ai` cannot filter departments per tenant; runs are now attributed to the caller's tenant but department selection remains global.
5. **Routes not yet re-reviewed in depth** (authenticated + role-checked already, but not rewritten onto the central guard): the `/api/v1/*` family (already authenticated with per-key scopes via `v1Handler`, no rate limiting yet), `/api/admin/*`, `/api/settings`, `/api/users/*`, `/api/approvals*`, `/api/ai-workforce/*`, `/api/cron`, `/api/deploy`, `/api/emergency*`, `/api/disaster-recovery`, `/api/seo`, `/api/email/*`, `/api/sms/*`, `/api/storage/files*`, `/api/security/secrets`, `/api/security-events`, `/api/training/*`, `/api/rag/*`, `/api/agent-learning/*`, `/api/agent-memory`, `/api/enterprise/*` (other than the ones fixed). Recommended next slice: `/api/v1/*` rate limiting + `/api/users|settings|approvals` onto `secureRoute`.
6. **Rate limiting state** is in-process; multi-instance deployments need the Redis-backed limiter (already in `src/lib/security/rate-limiter`) wired in.
7. **Planned, not done:** additive composite indexes on `(companyId, …)` for the hot tenant-scoped tables (a migration would ship unverified — the Prisma engine cannot run here).

---

## 6. Files changed (61)

- New: `src/lib/api/secure-route.ts`, `src/lib/api/secure-crud.ts`, `scripts/convert-routes-to-secure-crud.js`, `__tests__/unit/lib/api-security.test.ts`, `__tests__/unit/lib/api-secure-crud.test.ts`, `__tests__/api/route-authorization.test.ts`, `__tests__/api/route-hardening.test.ts`, `ALO_LABS_API_SECURITY_PHASE_A.md`.
- 25 generated-CRUD routes rewritten onto `secureCrud`.
- 29 hand-written routes hardened: `agent-runtime/execute`, `v1/agents/execute`, `sync`, `logs`, `memory`, `memory/[id]`, `enterprise/conversations`, `enterprise/agents/run`, `enterprise/department-ai`, `billing/invoices`, `billing/payments`, `billing/subscriptions`, `billing/subscriptions/[id]`, `marketplace/installs`, `marketplace/templates`, `infra/ping`, `incidents`, `ai-security/events`, `company/tasks`, `company/usage`, `company/agents/allowed`, `company/workflows/allowed`, `token-budget`, `token-usage`, `company-access`, `tenant-admin/config`, `tenant-admin/quotas`, `tenant-admin/users`, `whatsapp/webhook`.

Net: **+4,323 / −3,768** lines (the deletions are the replaced inline auth/validation boilerplate).
