# Implementation Gap Report — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification. Ranked by impact.

## Top 15 gaps (ranked)

| # | Gap | Spec section | Current state | Impact |
|---|---|---|---|---|
| 1 | **No `/v1/ai/**` endpoint family** | §3, Part 5 | 0 of 10 spec endpoints exist (`/v1/ai/chat`, `/v1/ai/completions`, `/v1/ai/tasks`, `/v1/ai/agents/execute`, `/v1/ai/content/generate`, `/v1/ai/knowledge/search`, `/v1/ai/automation/execute`, `/v1/ai/voice/sessions`, `/v1/ai/analysis`, `/v1/ai/predictions`) | External consumers have no versioned AI-service entry point |
| 2 | **No response sanitization layer — internal workforce exposed** | §6, §7, §11, Part 20 | `/v1/agents/:id` returns `systemInstructions` (prompt) + `runtimeProfile`; `/v1/agents` returns `total` (count); `/v1/agents/:id/run` returns `agentId`, `agentName`, `model`, validation scores; `/v1/events` returns `RunEvent` traces; `/v1/tools` exposes tool registry; `/v1/voice/agents` returns `systemInstructions` | **Critical information disclosure** — violates core "hidden workforce" principle |
| 3 | **None of the 7 spec operator roles exist** | §9, Part 18 | 0 matches for `PLATFORM_SUPER_ADMIN`, `AI_WORKFORCE_ADMIN`, `AI_MODEL_ADMIN`, `SECURITY_ADMIN`, `INFRASTRUCTURE_ADMIN`, `TENANT_ADMIN`, `API_CONSUMER` in `src/` or `prisma/`; authorization is binary `super_admin`/`admin` | No granular internal operator RBAC; cannot enforce least privilege |
| 4 | **No customer-facing portal distinct from admin** | §8, Part 17 | No `customer-*`/`consumer-*`/`developer-*` panels in dashboard; API-keys panel is admin-scoped, session-only, not tenant-scoped | External customers have no self-service surface |
| 5 | **No outbound webhook dispatcher** | §3, Part 17 | `WebhookConfig` + `WebhookDelivery` models exist, registration CRUD exists, but 0 `webhookDelivery.create` sites and 0 outbound `fetch()` calls in `src/lib/` | Customers can register webhooks that never fire |
| 6 | **No HMAC signing of outbound customer payloads** | §10, Part 17 | Only inbound HMAC (`src/lib/voice/webhook-security.ts:45-47`, `src/lib/api-gateway.ts:64-77`) | Outbound payloads unauthenticated |
| 7 | **No `/v1/usage` endpoint** | §3 | Closest is admin-only `/api/dashboard/usage` (session auth, cross-tenant aggregates) | Customers cannot view own usage |
| 8 | **No `/v1/services` endpoint and no `Service`/`Entitlement` model** | §3, §12, Part 22 | Only `SubscriptionPlan`/`Subscription` and `Company` boolean feature flags | No service catalog; no structured entitlements |
| 9 | **No "project discovery" / "connect your project" flow** | §4, Part 6 | `src/lib/projects/index.ts` is plain CRUD; no codebase ingestion, assessment, or capability mapping | Cannot auto-discover customer AI capabilities |
| 10 | **API-key `rateLimit` field not enforced on v1 surface** | §10 | `v1Handler` (`src/lib/v1.ts:37-74`) never calls `checkRateLimit`; only `/v1/agents/execute` (via secureRoute) and `/v1/voice/calls` (ad-hoc) are limited | No per-key quota enforcement |
| 11 | **API-keys management not tenant-scoped, not v1-versioned** | §8, Part 17 | `src/app/api/api-keys/route.ts:25-33` lists all companies' keys, no `companyId` filter; session-auth only; no `/v1/api-keys/**` | Any authenticated user can list all keys |
| 12 | **No spec-defined scopes (`ai:chat`, `ai:knowledge:search`, etc.)** | §10 | Scopes auto-derived as `${resource}:${action}` (e.g., `agents:read`); no AI-capability scope catalog | Cannot grant scoped AI service access |
| 13 | **`/v1/tasks` denies API keys** | §3, §8 | `src/app/api/v1/tasks/route.ts:14-16` throws 403 for `identity.kind === 'apiKey'` | External consumers cannot retrieve task history |
| 14 | **Internal agent counts leak via public API** | §2, §11 | `/v1/agents` returns `total` + full agent list (`src/app/api/v1/agents/route.ts:34`) | Direct violation of "do not expose internal agent counts, even in aggregate" |
| 15 | **No dedicated RBAC / privilege-escalation / api-keys / outbound-webhook test files** | §14, Part 23 | Existing security tests cover `secureRoute` decisions and v1 auth, but no tests exercise the 7-role model, scoped API keys end-to-end, or outbound webhook delivery | Cannot prove security claims with evidence |

## Acceptance criteria status (Section 15 / Part 27)

| Criterion | Status | Evidence |
|---|---|---|
| Existing project functionality preserved | PASS | no destructive changes in this audit |
| Public API Gateway works | PARTIAL | 39 v1 routes exist; `/v1/ai/**` family missing |
| External API authentication works | PASS | `src/lib/v1-auth.ts:64-105` |
| Tenant isolation verified | PASS | sampled 5 v1 handlers; `assertTenant` enforced |
| Authorized project discovery works | **FAIL** | discovery system does not exist |
| Capability assessment works | **FAIL** | assessment engine does not exist |
| Internal service orchestration works | PARTIAL | orchestrator exists; response not sanitized |
| API responses are sanitized | **FAIL** | no sanitization layer |
| Customers can consume permitted services | **FAIL** | no service catalog / entitlements |
| Customers cannot view internal agent counts | **FAIL** | count exposed via `/v1/agents` |
| Customers cannot inspect internal workforce | **FAIL** | prompts, profiles, models exposed |
| Customers cannot change internal configurations | PASS | no public mutation endpoint |
| Super Admin retains protected internal control | PASS | `requireRole('super_admin')` |
| Privileged changes are audited | PASS | `secureCrud` audit log |
| Revoked API credentials stop working | PASS | `isActive=false` + `expiresAt` enforced |
| End-to-end tests pass | PARTIAL | 144 test files; spec acceptance tests largely NOT TESTED |

## Summary verdicts

| Dimension | PASS | PARTIAL | FAIL | NOT FOUND |
|---|---|---|---|---|
| API gateway | 2 | 2 | 1 | 2 |
| Response sanitization | 0 | 0 | 8 | 1 |
| RBAC roles | 0 | 1 | 1 | 0 |
| Customer portal | 0 | 0 | 1 | 1 |
| Webhooks (outbound) | 0 | 1 | 2 | 0 |
| Service catalog | 0 | 1 | 1 | 1 |
| Project discovery | 0 | 0 | 0 | 2 |
| Rate limiting | 1 | 1 | 1 | 1 |
| API key management | 3 | 2 | 1 | 1 |
| Security tests (24 spec tests) | 11 | 8 | 8 | 0 |
| **Totals** | **17** | **16** | **25** | **10** |

## What is already strong (do not rebuild)

1. Tenant isolation (companyId, 404 on cross-tenant, security events)
2. API key hashing at rest (sha256)
3. 12 real AI provider implementations + router with circuit breakers
4. 2,000-agent workforce target (hard-coded, verified, seeded)
5. Real orchestrator (1,381 lines) + multi-agent collaboration
6. Real RAG engine (536 lines) + Qdrant + hybrid search
7. `secureRoute`/`secureCrud` wrappers (204 of 444 routes hardened)
8. Audit logging on every privileged change
9. Voice contact center runtime (conversation brain, campaigns, billing)
10. Opaque session tokens hashed at rest + MFA + bcrypt(12)

The upgrade is **additive**: build the `/v1/ai/**` gateway, the response sanitization layer, the 7-role model, the customer portal, the project discovery engine, the service catalog/entitlements, and the outbound webhook dispatcher ON TOP of the existing hardened infrastructure. Do not rebuild what works.
