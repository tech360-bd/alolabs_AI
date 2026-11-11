# Security Baseline — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification.

## 1. Authentication

| Control | Status | Evidence |
|---|---|---|
| Opaque session tokens (48-byte CSPRNG) | PASS | `src/lib/auth.ts:9` |
| Tokens hashed at rest (SHA-256) | PASS | `src/lib/auth.ts:12-33` |
| Idle timeout (12 h default) | PASS | `src/lib/auth.ts:31` |
| Absolute TTL (24 h default) | PASS | `src/lib/auth.ts:30` |
| Lazy legacy re-keying | PASS | `src/lib/auth.ts` |
| JWT secret refuses to boot in prod without ≥32 chars | PASS | `src/lib/auth.ts:35-46` |
| Dev JWT secret is per-process random (never hardcoded) | PASS | `src/lib/auth.ts:42-45` |
| bcrypt(12) passwords | PASS | `src/lib/auth.ts:8, 73-75` |
| MFA | PASS | present and wired |
| Session index (revocation lookup) | PASS | `src/lib/session-index.ts` |
| API keys hashed at rest (SHA-256) | PASS | `prisma/schema.prisma:819`, `src/app/api/api-keys/route.ts:88-107` |
| API key plaintext returned once, never stored | PASS | `src/app/api/api-keys/route.ts:110-114` |
| API key expiration enforced at auth | PASS | `src/lib/v1-auth.ts:74` |
| API key scopes fail-closed | PASS | `src/lib/v1-auth.ts:82-87` |
| API key rotation (stores previousKeyHash) | PASS | `src/app/api/api-keys/[id]/route.ts:47-87` |
| API key revocation | PASS | `src/app/api/api-keys/[id]/route.ts:36-40` |
| Inbound webhook signature verification (WhatsApp `x-hub-signature-256`) | PASS | `src/app/api/whatsapp/webhook/route.ts:78-96` |

## 2. Authorization (RBAC)

| Control | Status | Evidence |
|---|---|---|
| `secureRoute`/`secureCrud` wrappers (auth + RBAC + tenant + zod + audit + rate limit) | PASS | `src/lib/api/secure-route.ts`, `src/lib/api/secure-crud.ts` — 204 of 444 routes |
| Role-based access (`requireRole`, `requireCompanyRole`) | PASS | `src/lib/api-auth.ts:86-120` |
| `ADMIN_ROLES` whitelist | PASS | `['super_admin', 'admin']` (`src/lib/api/secure-route.ts:47`) |
| **7 spec operator roles** (PLATFORM_SUPER_ADMIN, AI_WORKFORCE_ADMIN, AI_MODEL_ADMIN, SECURITY_ADMIN, INFRASTRUCTURE_ADMIN, TENANT_ADMIN, API_CONSUMER) | **FAIL** | 0 matches in `src/` or `prisma/` |
| ~97 legacy inline-verify routes (no role check / no tenant scope) | PARTIAL | auth validated, RBAC not; long-tail migration |

## 3. Tenant isolation

| Control | Status | Evidence |
|---|---|---|
| `companyId` on all multi-tenant models | PASS | verified on `CrmContact`, `CrmDeal`, `CrmActivity`, `CrmPipeline`, `Task`, `UsageLog`, `CostEstimate`, `Agent`, all RAG models |
| Row-level tenant filter on reads | PASS | `secureCrud` `tenantFilter` (`src/lib/api/secure-crud.ts:194-199`) |
| `assertTenant` on writes (404 on cross-tenant, not 403) | PASS | `src/lib/api/secure-route.ts:579-588` |
| Client-supplied `companyId` rejected/stripped | PASS | `src/lib/api/secure-route.ts:357-369, 376-379` |
| Tenant resolved server-side from API key | PASS | `src/lib/v1-auth.ts:64-105` |
| Spoofed-tenant attempts logged as security events | PASS | `src/lib/api/secure-route.ts:555-567` (`tenant_isolation_violation`) |
| `/v1/*` routes tenant-scoped | PASS | sampled 5 handlers, all filter by `identity.companyId` |

## 4. Response sanitization / information-leak prevention

| Control | Status | Evidence |
|---|---|---|
| Public response sanitization layer | **FAIL** | no `sanitize`/`redact`/`publicResponse` for outbound API shaping |
| Agent count hidden from public API | **FAIL** | `/v1/agents` returns `total` (`src/app/api/v1/agents/route.ts:34`) |
| Agent profiles hidden from public API | **FAIL** | `/v1/agents/:id` returns full row incl. `systemInstructions` |
| Agent prompts hidden from public API | **FAIL** | `systemInstructions` field returned verbatim |
| Model names hidden from public API | **FAIL** | `/v1/agents/:id/run` returns `model`; `/v1/models` returns catalog |
| Orchestration traces hidden | **FAIL** | `/v1/events` returns `RunEvent` rows |
| Internal tool registry hidden | **FAIL** | `/v1/tools` GET exposes registry |
| Voice agent prompts hidden | **FAIL** | `/v1/voice/agents` returns `systemInstructions` |
| Stack traces hidden from public errors | PARTIAL | Next.js default error handler; no explicit scrubber |
| Safe public error messages | PARTIAL | varies per route; no central policy |

## 5. Rate limiting & quotas

| Control | Status | Evidence |
|---|---|---|
| `secureRoute` rate limiting (240/min writes, 600/min reads default) | PASS | `src/lib/api/secure-route.ts:456-476` |
| Public contact form rate limit (5/10 min per IP) | PASS | `src/app/api/public/contact/route.ts:21-34` |
| `CompanyApiKey.rateLimit` field | PASS | `prisma/schema.prisma:825` |
| **Per-key rate limit enforcement on `/v1/*`** | **FAIL** | `v1Handler` never calls `checkRateLimit`; only `/v1/agents/execute` (via secureRoute) and `/v1/voice/calls` (ad-hoc) are limited |
| Request size limits | PARTIAL | Next.js default; no explicit per-route limit |
| Idempotency keys | **NOT FOUND** | no `Idempotency-Key` header handling |

## 6. Secrets management

| Control | Status | Evidence |
|---|---|---|
| No hardcoded secrets in `src/` | PASS | gitleaks clean; only test fixtures |
| `.env.example` committed, all secret vars blank | PASS | `.env.example` |
| `JWT_SECRET` required in production | PASS | `src/lib/auth.ts:38-40` |
| Secrets never in frontend code | PASS | no `NEXT_PUBLIC_*` secret vars |
| Secrets never in logs | PARTIAL | no explicit log-scrubber; relies on developers |
| **Credential vault** | **NOT FOUND** | no KMS/Vault integration; secrets in env vars only |

## 7. Audit logging

| Control | Status | Evidence |
|---|---|---|
| `AuditLog` model | PASS | `prisma/schema.prisma` |
| Every privileged change audited (via `secureCrud`) | PASS | `src/lib/api/secure-crud.ts:135-153` |
| `SecurityEvent` model | PASS | `prisma/schema.prisma:2078` |
| Spoofed-tenant attempts recorded | PASS | `src/lib/api/secure-route.ts:555-567` |
| Best-effort audit writes (never fail request) | PASS | `src/lib/api/secure-crud.ts:150-152` |

## 8. Webhook security

| Control | Status | Evidence |
|---|---|---|
| Inbound signature verification (WhatsApp) | PASS | `src/app/api/whatsapp/webhook/route.ts:78-96` |
| Inbound HMAC verification (telephony) | PASS | `src/lib/voice/webhook-security.ts:45-47` |
| `WebhookConfig.secret` for outbound | PARTIAL | field exists, not used for signing |
| **Outbound HMAC signing** | **FAIL** | no outbound signing code |
| **Outbound dispatcher** | **FAIL** | 0 `webhookDelivery.create` sites |

## 9. CSRF / XSS / injection

| Control | Status | Evidence |
|---|---|---|
| CSRF protection | PARTIAL | session cookies; no explicit CSRF token (relies on SameSite) |
| XSS protection | PASS | React escapes by default; CSP not verified |
| SQL injection | PASS | Prisma parameterized queries |
| SSRF protection | PARTIAL | `guardFetchAgainstPaidHosts` in tests; no production SSRF guard |
| Prompt injection defenses | PARTIAL | `responder-llm.ts` enforces AI identity disclosure; no systematic prompt-injection guard |
| Tool output validation | PARTIAL | `src/lib/agent-runtime/tool-loop.ts` |

## 10. Spec security tests (Section 14) — current coverage

| Spec test | Status | Evidence |
|---|---|---|
| 1. External consumer cannot view agent count | **FAIL** | `/v1/agents` returns `total` |
| 2. External consumer cannot view agent profiles | **FAIL** | `/v1/agents/:id` returns full row |
| 3. External consumer cannot retrieve internal prompts | **FAIL** | `systemInstructions` returned |
| 4. External consumer cannot view model configurations | **FAIL** | `/v1/models` returns catalog |
| 5. External consumer cannot access worker queues | PARTIAL | no direct queue API, but `/v1/events` exposes run events |
| 6. External consumer cannot access internal tools | **FAIL** | `/v1/tools` GET |
| 7. External consumer cannot change agent permissions | PASS | no public mutation endpoint for agent permissions |
| 8. External consumer cannot change model routing | PASS | no public mutation endpoint for routing |
| 9. External consumer cannot access another tenant's data | PASS | tenant isolation enforced (sampled) |
| 10. External consumer cannot access Super Admin APIs | PASS | `requireRole('super_admin')` on `/api/super-admin` |
| 11. External consumer cannot retrieve infrastructure details | PARTIAL | `/v1/health` returns DB/router/queue status |
| 12. External consumer cannot access source code | PASS | no source-serving endpoint |
| 13. External consumer cannot modify workforce config | PASS | no public mutation endpoint |
| 14. Unauthorized requests blocked | PASS | edge gate + per-route auth |
| 15. Privilege escalation blocked | PARTIAL | `secureRoute` enforces roles; ~97 legacy routes unguarded |
| 16. Tenant ID manipulation blocked | PASS | server-side resolution |
| 17. IDOR blocked | PASS | `assertTenant` returns 404 |
| 18. API key leakage prevented | PASS | hashed at rest, plaintext once |
| 19. Error response leakage | **FAIL** | no central sanitizer |
| 20. Webhook signature validation | PARTIAL | inbound yes, outbound no |
| 21. Cross-tenant data access | PASS | enforced + logged |
| 22. Rate limiting | PARTIAL | secureRoute yes, v1 surface no |
| 23. Token revocation | PASS | session index + API key revocation |
| 24. Role enforcement | PARTIAL | binary admin/viewer; 7 spec roles missing |

**Summary: 11 PASS, 8 PARTIAL, 8 FAIL, 0 NOT TESTED of 24 spec security tests.**
