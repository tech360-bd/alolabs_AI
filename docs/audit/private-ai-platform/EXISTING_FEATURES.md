# Existing Features — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification.

## Feature matrix (PASS / PARTIAL / FAIL / NOT FOUND)

### Public website (preserved)
| Feature | Status | Evidence |
|---|---|---|
| Homepage with 3D hero (R3F) | PASS | `src/components/site/hero-3d.tsx` (PR #28, mergeable) |
| 10 `/site/*` pages + `/platform/voice-contact-center` | PASS | `src/app/site/` |
| Contact form → CRM lead capture | PASS | `src/app/api/public/contact/route.ts` (validation, honeypot, rate limit, SMTP) |
| SEO sitemap + robots.txt | PASS | `src/app/sitemap.ts`, `public/robots.txt` |
| Brand assets (official SVG set) | PASS | `public/brand/alo-*.svg` |

### Authentication & sessions
| Feature | Status | Evidence |
|---|---|---|
| Opaque session tokens, hashed at rest | PASS | `src/lib/auth.ts:12-33` |
| JWT for API-key issuance | PASS | `src/lib/auth.ts:59-69` |
| bcrypt(12) passwords | PASS | `src/lib/auth.ts:73-75` |
| MFA | PASS | present and wired |
| Session idle timeout + TTL | PASS | `src/lib/auth.ts:30-31` |
| Legacy token re-keying | PASS | `src/lib/auth.ts` (lazy migration) |

### API key management
| Feature | Status | Evidence |
|---|---|---|
| Keys hashed at rest (sha256) | PASS | `prisma/schema.prisma:819`, `src/app/api/api-keys/route.ts:88-107` |
| Rotation (stores previousKeyHash) | PASS | `src/app/api/api-keys/[id]/route.ts:47-87` |
| Revocation (isActive=false) | PASS | `src/app/api/api-keys/[id]/route.ts:36-40` |
| Expiration enforced at auth | PASS | `src/lib/v1-auth.ts:74` |
| Scopes (JSON, fail-closed) | PARTIAL | `prisma/schema.prisma:824`; scopes auto-derived as `${resource}:${action}`, no `ai:*` catalog |
| **Tenant scoping on management endpoints** | **FAIL** | `src/app/api/api-keys/route.ts:25-33` lists all companies' keys, no `companyId` filter |
| **`/v1/api-keys/**` versioned surface** | **NOT FOUND** | no `src/app/api/v1/api-keys/` |

### `/api/v1/**` public gateway
| Feature | Status | Evidence |
|---|---|---|
| 39 v1 route handlers exist | PASS | `find src/app/api/v1 -name route.ts` |
| `v1Handler` wrapper (uniform envelope) | PASS | `src/lib/v1.ts:37-74` |
| X-API-Key / Bearer auth | PASS | `src/lib/v1-auth.ts:64-105` |
| Tenant resolved server-side from key | PASS | `identity.companyId` from key hash lookup |
| **`/v1/ai/**` endpoint family** | **FAIL** | no `/v1/ai/` directory; 0 of 10 spec endpoints exist |
| **`/v1/usage`** | **NOT FOUND** | admin-only `/api/dashboard/usage` exists, not v1 |
| **`/v1/services`** | **NOT FOUND** | no `Service` model in schema |
| **Per-key rate limit enforcement** | **PARTIAL** | `CompanyApiKey.rateLimit` field exists but `v1Handler` never calls `checkRateLimit`; only `/v1/agents/execute` (via secureRoute) and `/v1/voice/calls` (ad-hoc) are limited |

### AI infrastructure
| Feature | Status | Evidence |
|---|---|---|
| 12 model provider implementations | PASS | `src/lib/ai-router/{ollama,openai-compatible,openrouter,groq,deepseek,mistral,qwen,llama,phi,gemma,zai,unorouter}-provider.ts` |
| Router with circuit breakers + fallback | PASS | `src/lib/ai-router/router.ts` (1,110 lines) |
| Agent registry (2,000-profile target) | PASS | `src/lib/workforce/constants.ts:11-17`, `scripts/verify-2000-workforce.ts` |
| Orchestrator (routing, delegation, multi-agent) | PASS | `src/lib/orchestrator.ts` (1,381 lines), `src/lib/multi-agent-orchestrator/` |
| Agent runtime (pipeline, execution, scheduler, tool-loop, lifecycle) | PASS | `src/lib/agent-runtime/` (9 files) |
| RAG engine (chunking, embedding, hybrid search, Qdrant) | PASS | `src/lib/rag-engine.ts` (536 lines), `src/lib/qdrant.ts` (443 lines) |
| Voice contact center runtime | PASS | `src/app/api/v1/voice/**` (campaigns, calls, agents, billing, analytics) |
| **Anthropic provider** | **NOT FOUND** | only OpenAI-compatible adapter; no `anthropic-provider.ts` |

### Workforce & orchestration
| Feature | Status | Evidence |
|---|---|---|
| 100 departments × 20 agents = 2,000 | PASS | `src/lib/workforce/constants.ts:11-17` |
| Task queues, scheduling, escalation | PASS | `src/lib/agent-runtime/scheduler.ts`, `src/lib/runs/planner.ts` |
| Multi-agent collaboration | PASS | `src/lib/multi-agent-orchestrator/` |
| **Workforce hidden from public API** | **FAIL** | `/v1/agents` returns `total` (agent count) + full agent list; `/v1/agents/:id` returns `systemInstructions` (prompt) + `runtimeProfile` |

### Knowledge & memory
| Feature | Status | Evidence |
|---|---|---|
| Document ingestion, chunking, embeddings | PASS | `src/lib/rag-engine.ts`, `src/app/api/rag/{ingest,documents,chunks}` |
| Hybrid search (vector + keyword) | PASS | `src/lib/rag-engine.ts`, Qdrant integration |
| RagCollection/RagDocument/RagChunk/RagQuery/RagAnswer/RagFeedback models | PASS | `prisma/schema.prisma:1045-1133` |
| Tenant isolation on RAG | PASS | `companyId` on all RAG models |
| **`tenant-knowledge.ts`** | **PARTIAL** | 28-line stub at `src/lib/tenant-knowledge.ts` |

### Super admin
| Feature | Status | Evidence |
|---|---|---|
| Super-admin dashboard | PASS | `src/components/panels/super-admin-panel.tsx` (1,258 lines) |
| Super-admin API (requireRole) | PASS | `src/app/api/super-admin/route.ts:8` |
| **7 spec operator roles** (PLATFORM_SUPER_ADMIN, AI_WORKFORCE_ADMIN, AI_MODEL_ADMIN, SECURITY_ADMIN, INFRASTRUCTURE_ADMIN, TENANT_ADMIN, API_CONSUMER) | **FAIL** | 0 matches in `src/` or `prisma/`; authorization is binary `super_admin`/`admin` |

### Customer portal (separate from admin)
| Feature | Status | Evidence |
|---|---|---|
| **Customer-facing portal distinct from admin** | **NOT FOUND** | no `customer-*`/`consumer-*`/`developer-*` panels in `src/components/panels/` or `src/components/enterprise/panels/` |

### Project discovery
| Feature | Status | Evidence |
|---|---|---|
| **Project AI discovery system** | **NOT FOUND** | `src/lib/projects/index.ts` is plain CRUD; no capability assessment |
| **"Connect your project" flow** | **NOT FOUND** | no `/v1/projects/discovery*` or dashboard discovery panel |

### Response sanitization / information-leak prevention
| Feature | Status | Evidence |
|---|---|---|
| **Public response sanitization layer** | **NOT FOUND** | no `sanitize`/`redact`/`publicResponse` in `src/lib/` for outbound API shaping |
| Agent prompts exposed in public API | FAIL | `/v1/agents/:id` returns `systemInstructions` |
| Agent counts exposed in public API | FAIL | `/v1/agents` returns `total` |
| Model names exposed in public API | FAIL | `/v1/agents/:id/run` returns `model` |
| Orchestration traces exposed | FAIL | `/v1/events` returns `RunEvent` rows tied to internal `runId`s |

### Webhooks (outbound to customers)
| Feature | Status | Evidence |
|---|---|---|
| WebhookConfig + WebhookDelivery models | PASS | `prisma/schema.prisma:979-996, 1761-1776` |
| Registration CRUD | PASS | `src/app/api/webhooks/route.ts` |
| **Outbound dispatcher** | **FAIL** | 0 `webhookDelivery.create` sites; 0 outbound `fetch()` calls in `src/lib/` |
| **HMAC signing of outbound payloads** | **FAIL** | only inbound HMAC (`src/lib/voice/webhook-security.ts:45-47`) |

### Subscription & service management
| Feature | Status | Evidence |
|---|---|---|
| SubscriptionPlan + Subscription models | PASS | `prisma/schema.prisma:1234-1271` (agentLimit, skillLimit, workflowLimit, monthlyTokens, monthlyRequests) |
| Company feature flags (paidApiAllowed, smsAllowed, etc.) | PARTIAL | `prisma/schema.prisma:729-800` — boolean flags, not structured entitlements |
| **Service catalog / Entitlement model** | **NOT FOUND** | no `Service`/`Entitlement`/`Quota` model |
| **`/v1/services` endpoint** | **NOT FOUND** | |

### Security & RBAC
| Feature | Status | Evidence |
|---|---|---|
| `secureRoute`/`secureCrud` wrappers (auth + RBAC + tenant + zod + audit + rate limit) | PASS | `src/lib/api/secure-route.ts`, `src/lib/api/secure-crud.ts` — used by 204 of 444 routes |
| Tenant isolation (companyId, 404 on cross-tenant) | PASS | `src/lib/api/secure-route.ts:579-588` |
| Audit log on every privileged change | PASS | `src/lib/api/secure-crud.ts:135-153` |
| Secrets sweep (no hardcoded credentials in src/) | PASS | gitleaks baseline + CI |
| **7-role RBAC model** | **FAIL** | binary `super_admin`/`admin` only |
| **~97 legacy inline-verify routes** | **PARTIAL** | use `verifySessionToken` with no role check / no tenant scope; long-tail migration |

## Summary counts

| Verdict | Count |
|---|---|
| PASS | 28 |
| PARTIAL | 8 |
| FAIL | 11 |
| NOT FOUND | 9 |
| **Total features evaluated** | **56** |
