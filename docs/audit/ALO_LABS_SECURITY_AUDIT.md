# ALO Labs Security Audit

> Date: 2026-11-11 · Branch: `feat/public-website-redesign` · Base: `origin/main 90a4132` · Method: source verification only — every finding cites a file path.

## 1. Authentication

- Opaque 48-byte session tokens (CSPRNG), SHA-256-hashed at rest in `Settings` keyed by `session:<sha256(token)>`. Idle timeout (12 h default) + absolute TTL (24 h default). Lazy re-keying of legacy raw-token rows on first use (`src/lib/auth.ts:12-33`).
- JWT secret refuses to boot in production without ≥32 chars (`src/lib/auth.ts:35-46`); dev uses a per-process random secret, never a hardcoded string.
- bcrypt(12) password hashing (`src/lib/auth.ts:73-75`).
- MFA, session index, audit log all present and wired.
- Inbound webhook receivers verify platform signatures: WhatsApp/social `x-hub-signature-256` verified and rejected on missing/invalid (`src/app/api/whatsapp/webhook/route.ts:78-96`).

## 2. Authorization (RBAC)

- Global roles: `super_admin`, `admin`, …; company membership roles: `owner`, `admin`, `manager`, `operator`, `viewer`.
- Helpers: `requireAuth`, `requireCompanyAuth`, `requireCompanyRole`, `requireCompanyAdmin`, `requireRole` (`src/lib/api-auth.ts`).
- Hardened route wrappers: `secureRoute` / `secureCrud` (`src/lib/api/secure-route.ts`, `src/lib/api/secure-crud.ts`) enforce auth + RBAC + tenant scope + zod validation + audit + rate limit declaratively. Used by 204 of 444 routes.
- Page gate: `src/app/dashboard/page.tsx:25` verifies session against DB server-side; edge `src/proxy.ts` requires session cookie for `/dashboard`.

## 3. Tenant isolation

- Tenant column: `companyId` on all multi-tenant models (verified on `CrmContact`, `CrmDeal`, `CrmActivity`, `CrmPipeline`, `Task`, `UsageLog`, `CostEstimate`).
- `secureCrud` enforces row-level tenant filter on every read, and `assertTenant` on every update/delete — cross-tenant records return 404 (not 403) so the API cannot be used to probe which ids exist in other tenants.

## 4. Findings & fixes (this branch)

| ID | Finding | Severity | Status |
|---|---|---|---|
| SEC-1 | `/api/crm/{contacts,deals,activities,pipelines,lead-score}` verified session but applied **no tenant scope and no role check** — any authenticated user could read/write every company's CRM data (`CrmContact.companyId` indexed but unused). Cross-tenant read/write. | **P0** | **FIXED** — all 5 routes rewritten with `secureCrud`/`secureRoute`: tenant-scoped reads, role-checked writes, parent-tenant verification on creates/updates/deletes. See FX-5/FX-6/FX-7/FX-8/FX-9. |
| SEC-2 | `/api/tasks` GET called `db.task.findMany({})` unscoped; sibling `/api/v1/tasks` correctly scopes `companyId + userId`. | P1 | **FIXED** — now scopes to caller's `companyId + userId` (super_admin sees all). See FX-10. |
| SEC-3 | `/api/dashboard/cost` returned global cost/payment-guard aggregates + `costByCompany` breakdown to any authenticated user. | P1 | **FIXED** — non-admins now get a tenant-filtered view (no `costByCompany`); admins see the cross-tenant aggregates. `PaymentGuardLog` (global table, no `companyId`) is admin-only. See FX-11. |
| SEC-4 | `/api/enterprise/roadmap` never verified the Bearer token; edge `src/proxy.ts:271` only checked header *presence*. | P1 | **FIXED** — now calls `requireAuth()`; 401 on missing/invalid session. See FX-12. |
| SEC-5 | `scripts/seed.ts:472` and `scripts/seed-v2.ts:707` hardcoded super-admin `Admin@123` (runnable, would create a known-credential admin). | P1 | **FIXED** — both now require `SEED_ADMIN_PASSWORD` env (≥12 chars) and fail closed, matching `scripts/seed-agentos.ts:31`. See FX-13. |
| SEC-6 | `/api/webhooks/` (management CRUD surface, not inbound receivers) sat on the public edge allowlist (`src/proxy.ts:28`); handlers self-verified but a future handler that forgot would be silently public. | P2 | **FIXED** — removed from allowlist; inbound receivers (`/api/whatsapp/webhook`, `/api/voice/telephony/webhook`) added explicitly. See FX-14. |
| SEC-7 | ~97 legacy inline-verify routes still use `verifySessionToken` with no role check / no tenant scope (whatsapp/send, sms, email/send, automation/execute, api-keys, queues, jobs, marketplace, rag/*). Auth validated, RBAC not. | P1 (aggregate) | Open — long-tail migration to `secureCrud`/`secureRoute`. Not blocking this PR. |
| SEC-8 | In-memory per-IP rate limit on `/api/public/contact` (lost on restart, not shared across instances). | P2 | Accepted — public endpoint, low blast radius; documented in route comment. |

## 5. Secrets sweep

- No `sk-`/`AKIA`/hardcoded passwords in `src/` (only test fixtures in `src/__tests__/lib/auth.test.ts`).
- Only `.env.example` committed; all secret vars blank; `JWT_SECRET` required in production.
- `gitleaks` baseline present (`.gitleaks.toml`); CI workflow `backup-portability.yml` runs secret scanning.
