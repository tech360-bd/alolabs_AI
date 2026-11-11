# Phase-by-Phase Execution Plan — ALO LABS Private AI Platform

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Status: **PHASE 1 COMPLETE — WAITING FOR OWNER APPROVAL before Phases 2-9.**

Per the Final Owner Directive: "START WITH READ-ONLY AUDIT. PRESENT EXISTING-VS-TARGET ARCHITECTURE. PRESENT THE PHASE-BY-PHASE EXECUTION PLAN. WAIT FOR OWNER APPROVAL. ONLY THEN BEGIN APPROVED DEVELOPMENT. NEVER DEPLOY TO PRODUCTION WITHOUT EXPLICIT APPROVAL."

---

## PHASE 1: READ-ONLY AUDIT ✅ COMPLETE (this branch)

**Deliverables (all on `docs/private-ai-platform-phase1-audit` branch):**
- `docs/audit/private-ai-platform/EXISTING_SYSTEM_INVENTORY.md`
- `docs/audit/private-ai-platform/EXISTING_FEATURES.md`
- `docs/audit/private-ai-platform/API_INVENTORY.md`
- `docs/audit/private-ai-platform/DATABASE_INVENTORY.md`
- `docs/audit/private-ai-platform/AI_INVENTORY.md`
- `docs/audit/private-ai-platform/INFRASTRUCTURE_INVENTORY.md`
- `docs/audit/private-ai-platform/SECURITY_BASELINE.md`
- `docs/audit/private-ai-platform/TEST_BASELINE.md`
- `docs/audit/private-ai-platform/IMPLEMENTATION_GAP_REPORT.md`
- `docs/architecture/private-ai-platform/EXISTING_VS_TARGET_ARCHITECTURE.md`
- This plan.

**No production changes. No code changes. No database changes.**

**🛑 HALT POINT — owner approval required before Phase 2.**

---

## PHASE 2: SECURITY & PRESERVATION (after approval)

**Goal:** close the P0 information-disclosure gaps and the API-key management hole before building anything new. Preserve all existing functionality.

**Branch:** `feat/private-ai-platform-phase2-security`

**Scope (additive only):**
1. **Response sanitization layer** — new `src/lib/api/public-response.ts`: strips agent names/IDs/counts, prompts, model names, routing metadata, tool registry, orchestration traces from any `/v1/*` response. Applied as a post-handler wrapper.
2. **Hide workforce on existing `/v1/agents*`** — `/v1/agents` no longer returns `total` or full agent rows; returns opaque service-level metadata only. `/v1/agents/:id` returns sanitized projection (no `systemInstructions`, no `runtimeProfile`). `/v1/agents/:id/run` returns result + public task ID, not `agentId`/`agentName`/`model`.
3. **Tenant-scope API-key management** — new `/api/v1/api-keys/**` route group: list/create/rotate/revoke scoped to caller's `companyId`. Existing `/api/api-keys/**` left intact (backward compat) but deprecated.
4. **Per-key rate limit enforcement** — `v1Handler` reads `CompanyApiKey.rateLimit` and enforces it.
5. **`/v1/tasks` allows API keys** — remove the 403 for `identity.kind === 'apiKey'`; scope to caller's `companyId`.
6. **Outbound webhook dispatcher + HMAC signing** — new `src/lib/webhooks/dispatcher.ts`: on task completion / entitlement change, sign payload with `WebhookConfig.secret` (HMAC-SHA256), POST to URL, record `WebhookDelivery`.

**Database changes:** none (uses existing `CompanyApiKey`, `WebhookConfig`, `WebhookDelivery` models).

**Tests:** `__tests__/api/v1-response-sanitization.test.ts`, `__tests__/api/v1-api-keys-tenant-scoping.test.ts`, `__tests__/api/v1-rate-limit-per-key.test.ts`, `__tests__/integration/outbound-webhook-delivery.test.ts`.

**Acceptance:** spec security tests 1-6, 19, 20 move from FAIL → PASS.

**🛑 HALT POINT — owner approval required before Phase 3.**

---

## PHASE 3: PRIVATE CONTROL PLANE (after approval)

**Goal:** implement the 7 spec operator roles and the internal-control-plane separation.

**Branch:** `feat/private-ai-platform-phase3-control-plane`

**Scope:**
1. **7 roles as enforceable values** — extend `User.role` to accept `platform_super_admin`, `ai_workforce_admin`, `ai_model_admin`, `security_admin`, `infrastructure_admin`, `tenant_admin`; extend `CompanyUser.role` to accept `api_consumer`. Update `ADMIN_ROLES` and `requireRole` helpers.
2. **Role-based panel visibility** — dashboard shell filters panels by role; `API_CONSUMER` sees only customer-scoped panels (Phase 4 portal).
3. **Super Admin Control Center** — 7 sub-centers (Platform, AI Workforce, AI Model, Security, Infrastructure, Tenant, API Service), each gated to its role.
4. **Audit every privileged change** — extend `secureCrud` audit to record the specific operator role.

**Database changes:** additive migration — `User.role` and `CompanyUser.role` are free-form `String` already, so no schema change; only application-level enforcement + a `RoleMigration` record table for audit.

**Tests:** `__tests__/api/v1-7-role-rbac.test.ts`.

**Acceptance:** spec security tests 7, 15, 23, 24 move to PASS.

**🛑 HALT POINT — owner approval required before Phase 4.**

---

## PHASE 4: PUBLIC SERVICE PLANE (after approval)

**Goal:** build the `/v1/ai/**` gateway + service catalog + entitlements + customer portal.

**Branch:** `feat/private-ai-platform-phase4-service-plane`

**Scope:**
1. **`/api/v1/ai/**` endpoint family** — 10 endpoints (`chat`, `completions`, `tasks`, `agents/execute`, `content/generate`, `knowledge/search`, `automation/execute`, `voice/sessions`, `analysis`, `predictions`). Each: API-key auth, tenant scope, entitlement check, rate limit, response sanitization, audit. They delegate to the existing orchestrator/RAG/voice runtime internally.
2. **`Service` + `Entitlement` + `Quota` models** — additive migration. Seed from existing `SubscriptionPlan` features.
3. **`/v1/services` GET** — public service catalog (descriptions only; no internal implementation details).
4. **`/v1/usage` GET** — caller's own usage (tenant-scoped, no cross-tenant).
5. **Spec-defined scopes** — `ai:chat`, `ai:completions`, `ai:knowledge:search`, etc. as a scope catalog enforced by `v1Handler`.
6. **Customer portal** — new `/portal/**` route group: API key management (scoped), usage, task history, webhooks, service catalog, subscription. `API_CONSUMER` role only; hides all internal panels.

**Database changes:** additive — new `Service`, `Entitlement`, `Quota` tables; `CompanyApiKey.scopes` values formalized.

**Tests:** `__tests__/api/v1-ai-*.test.ts` (per endpoint), `__tests__/api/v1-service-entitlements.test.ts`, `__tests__/api/v1-usage-tenant-scoped.test.ts`.

**Acceptance:** spec criteria "Public API Gateway works", "Customers can consume permitted services", "Customers cannot view internal agent counts" (Phase 2 sanitizer + Phase 4 portal).

**🛑 HALT POINT — owner approval required before Phase 5.**

---

## PHASE 5: PROJECT DISCOVERY (after approval)

**Goal:** authorized external-project AI capability discovery + assessment + recommendation.

**Branch:** `feat/private-ai-platform-phase5-discovery`

**Scope:**
1. **`ProjectDiscovery` + `CapabilityAssessment` + `ServiceRecommendation` models** — additive.
2. **Mode A (API discovery)** — `/v1/projects/discover` POST: customer supplies project API URL + scoped token + approved permissions; ALO LABS inspects authorized resources only; classifies capabilities as EXISTING/WORKING/PARTIAL/BROKEN/UNVERIFIED/MISSING/BLOCKED.
3. **Mode B (connector SDK)** — `packages/alolabs-connector/` lightweight SDK that reports permitted capability metadata to the gateway.
4. **Mode C (source repo)** — `/v1/projects/discover` accepts a Git URL or uploaded archive; analyzes AI dependencies, model configs, agent frameworks, chatbot modules, voice AI, integration patterns. No secrets collected.
5. **Recommendation engine** — maps discovered capabilities to ALO LABS services; generates integration plan; checks entitlements.

**Database changes:** additive — 3 new tables.

**Tests:** `__tests__/api/v1-projects-discover.test.ts`, `__tests__/integration/discovery-modes.test.ts`.

**Acceptance:** spec tests 2, 3 move to PASS.

**🛑 HALT POINT — owner approval required before Phase 6.**

---

## PHASE 6: AI WORKFORCE HARDENING (after approval)

**Goal:** enforce that the internal workforce is never exposed through any public surface; harden orchestration.

**Branch:** `feat/private-ai-platform-phase6-workforce`

**Scope:**
1. **Audit every `/v1/*` response** for internal-identifier leakage (automated test suite).
2. **Agent lifecycle state machine** — Draft → Reviewed → Approved → Available → Assigned → Executing → Evaluated → Improved → Versioned (enforce transitions).
3. **Workforce engine quotas** — concurrency limits, retry limits, timeouts, dead-letter queues, graceful shutdown (partially exists; complete it).
4. **Internal orchestration privacy** — ensure no chain-of-thought, routing decisions, or tool definitions leak.

**Database changes:** none (lifecycle fields exist).

**Tests:** `__tests__/api/v1-workforce-hidden.test.ts` (fuzz every `/v1/*` response for agent names, counts, prompts, models).

**Acceptance:** spec tests 5, 6 move to PASS.

**🛑 HALT POINT — owner approval required before Phase 7.**

---

## PHASE 7: KNOWLEDGE & INTELLIGENCE (after approval)

**Goal:** complete the knowledge engine + business intelligence + predictive analytics.

**Branch:** `feat/private-ai-platform-phase7-intelligence`

**Scope:**
1. **`tenant-knowledge.ts`** — replace 28-line stub with full tenant-scoped knowledge access control.
2. **Memory categories** — platform/tenant/department/agent/task/user-preferences/operational; all access-controlled.
3. **Business Intelligence engine** — operational/service/cost/workforce/usage/failure analytics with evidence + confidence.
4. **Predictive analytics** — resource forecasting, workload forecasting, anomaly detection. Each prediction carries result + evidence + data period + model version + confidence + limitations + recommended action.
5. **Controlled learning pipeline** — dataset lineage, model versioning, evaluation, drift detection, rollback, human review. No automatic production promotion.

**Database changes:** additive — `Prediction`, `Forecast`, `Dataset`, `ModelVersion` tables.

**Tests:** `__tests__/api/v1-predictions.test.ts`, `__tests__/integration/controlled-learning.test.ts`.

**Acceptance:** spec tests 11, 12 move to PASS.

**🛑 HALT POINT — owner approval required before Phase 8.**

---

## PHASE 8: CUSTOMER ECOSYSTEM (after approval)

**Goal:** complete the customer portal with documentation, SDKs, billing, webhooks.

**Branch:** `feat/private-ai-platform-phase8-customer`

**Scope:**
1. **API documentation** — `docs/api/API_REFERENCE.md`, `AUTHENTICATION.md`, `SDK_INTEGRATION.md`, `WEBHOOKS.md`.
2. **SDK** — `packages/alolabs-sdk/` (TypeScript + Python) for the `/v1/ai/**` surface.
3. **Billing** — transparent customer billing tied to `Service` + `Entitlement` + `UsageLog`; no internal cost exposure.
4. **Customer webhook configuration** — self-service in portal.

**Database changes:** none.

**Tests:** `__tests__/api/v1-billing.test.ts`.

**Acceptance:** spec test 14 moves to PASS.

**🛑 HALT POINT — owner approval required before Phase 9.**

---

## PHASE 9: PRODUCTION HARDENING (after approval)

**Goal:** security tests, load tests, monitoring, recovery, documentation, production readiness.

**Branch:** `feat/private-ai-platform-phase9-hardening`

**Scope:**
1. **All 24 spec security tests** with evidence (Section 14).
2. **All 15 spec acceptance tests** with evidence (Section 15 / Part 23).
3. **Load tests** — `/v1/ai/**` under expected concurrency.
4. **Monitoring** — `/v1/health` extended; alerting on sanitization failures.
5. **Recovery** — rollback plan, backup verification.
6. **Final report** — `docs/audit/private-ai-platform/FINAL_REPORT.md` with every requirement as PASS/PARTIAL/FAIL/BLOCKED/NOT TESTED + evidence.

**Acceptance:** owner sign-off for production deployment.

**🛑 FINAL HALT — explicit owner approval required for any production deployment.**

---

## Branching & PR strategy

- Each phase = one feature branch off `origin/main`.
- Each phase = one PR to `main`.
- No phase merges until its HALT POINT is cleared by owner.
- No phase deploys to production without explicit owner approval.
- All database migrations are additive (`CREATE TABLE` / `ALTER TABLE ADD COLUMN` only); no `DROP`.
- All new routes are additive; no existing route is renamed or removed.
- Existing PR #28 (website redesign + CRM security) is independent and can merge on its own.

## What I will NOT do without explicit approval

- Push to `main`.
- Deploy to production.
- Run destructive commands (`rm -rf`, `git clean -fd`, `git reset --hard`, `DROP DATABASE`, `prisma migrate reset`).
- Modify production network/process configuration.
- Restart `cloudflared` (FX-4 — owner server action).
