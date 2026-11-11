# Existing vs Target Architecture — ALO LABS Private AI Platform

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Read-only.

## Existing architecture (verified)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Edge (Cloudflare Tunnel → Caddy :443 → Next.js :3011)              │
│  src/proxy.ts — Next 16 proxy (no middleware.ts)                  │
│  Public allowlist: /api/health, /api/ping, /api/public/,            │
│    /api/whatsapp/webhook, /api/voice/telephony/webhook              │
│  ⚠️ PRODUCTION INCIDENT: alolabs.net DOWN (CF error 1033, origin    │
│    tunnel offline) — owner must restart cloudflared                 │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js 16.4 App Router (single process, PM2-managed)              │
│  - Public website: /, /site/*, /brand, /design, /invoice, /login     │
│  - Authenticated dashboard: /dashboard (155 panels via ?view=)      │
│  - 444 API route handlers:                                          │
│      • 39 /api/v1/** (public gateway, API-key auth)                 │
│      • ~204 hardened via secureRoute/secureCrud                     │
│      • ~97 legacy inline-verify (auth yes, RBAC no)                 │
│      • 1 /api/public/contact (public enquiry form)                  │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Auth (src/lib/auth.ts, api-auth.ts, v1-auth.ts)                    │
│  - Opaque 48-byte session tokens, SHA-256-hashed at rest           │
│  - bcrypt(12) passwords, MFA, session index                         │
│  - API keys: sha256-hashed, scopes (JSON, fail-closed), expiration  │
│  - Roles: super_admin/admin/manager/operator/viewer (User) +       │
│            owner/admin/manager/operator/employee (CompanyUser)      │
│  ⚠️ NO 7 spec roles (PLATFORM_SUPER_ADMIN, AI_WORKFORCE_ADMIN,      │
│     AI_MODEL_ADMIN, SECURITY_ADMIN, INFRASTRUCTURE_ADMIN,          │
│     TENANT_ADMIN, API_CONSUMER)                                    │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AI Infrastructure (src/lib/ai-router/, orchestrator.ts, rag-engine) │
│  - 12 real providers: Ollama, OpenAI-compatible, OpenRouter, Groq,   │
│    DeepSeek, Mistral, Qwen, Llama, Phi, Gemma, Z.AI, UnoRouter      │
│  - Router with circuit breakers, fallback chains, decision recording │
│  - 2,000-agent workforce (100 depts × 20), verified                 │
│  - Orchestrator (1,381 lines): routing, delegation, multi-agent     │
│  - RAG engine (536 lines) + Qdrant + hybrid search                  │
│  - Voice contact center runtime (campaigns, calls, billing)         │
│  ⚠️ WORKFORCE EXPOSED: /v1/agents returns count + prompts + models  │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Data: Prisma 6.19 → MySQL/MariaDB (prod) / SQLite (dev)           │
│  221 models, 8 migrations, dual-schema parity by script             │
│  + Qdrant (vectors), MinIO (objects)                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Target architecture (per spec)

```
┌─────────────────────────────────────────────────────────────────────┐
│  EXTERNAL APPLICATIONS (websites, CRM, ERP, eCommerce, SaaS, mobile)│
└─────────────────────────────────────────────────────────────────────┘
        │  authorized API calls only
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PUBLIC SERVICE PLANE (api.alolabs.net/v1/)                         │
│  - /v1/ai/chat, /v1/ai/completions, /v1/ai/tasks, /v1/ai/agents/   │
│    execute, /v1/ai/content/generate, /v1/ai/knowledge/search,       │
│    /v1/ai/automation/execute, /v1/ai/voice/sessions, /v1/ai/      │
│    analysis, /v1/ai/predictions                                    │
│  - /v1/tasks/{id}, /v1/usage, /v1/services, /v1/health             │
│  - /v1/projects/discover (authorized discovery)                     │
│  - Customer authentication (scoped API keys, OAuth2)                │
│  - Service entitlements + quotas + rate limits (per-key enforced)   │
│  - Response sanitization layer (strips internal identifiers)        │
│  - Outbound webhooks (HMAC-signed)                                  │
│  - Customer portal (self-service: keys, usage, task history)        │
└─────────────────────────────────────────────────────────────────────┘
        │  ═══ CONTROLLED BOUNDARY ═══
        │  (only sanitized results pass through;
        │   internal identifiers never cross)
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PRIVATE CONTROL PLANE (internal only)                               │
│  - Super Admin Control Center (7 roles: PLATFORM_SUPER_ADMIN,       │
│    AI_WORKFORCE_ADMIN, AI_MODEL_ADMIN, SECURITY_ADMIN,             │
│    INFRASTRUCTURE_ADMIN, TENANT_ADMIN, API_CONSUMER)               │
│  - Internal Agent Registry (2,000 profiles — HIDDEN from public)    │
│  - Internal Model Registry + Provider Routing (HIDDEN)              │
│  - AI Workforce Engine (orchestrator, delegation, scheduling)       │
│  - Internal Tool Registry (HIDDEN from public)                      │
│  - Knowledge & Memory Engine (tenant-isolated)                      │
│  - Project Discovery Engine (authorized only)                       │
│  - Capability Assessment + Recommendation Engine                    │
│  - Business Intelligence + Predictive Analytics                    │
│  - Audit Center + Security Center                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## What changes (additive only — no rebuild)

| Layer | Existing (preserve) | New (add) |
|---|---|---|
| Edge | Cloudflare + Caddy + proxy.ts | (unchanged) |
| App | Next.js 16.4 + 444 routes | + `/api/v1/ai/**` family (10 endpoints); + `/api/v1/usage`, `/api/v1/services`, `/api/v1/projects/discover`; + `/api/v1/api-keys/**` (tenant-scoped); + response sanitization middleware |
| Auth | session tokens, API keys, bcrypt, MFA | + 7 spec roles as enforceable `User.role` / `CompanyUser.role` values; + spec-defined scopes (`ai:chat`, `ai:knowledge:search`, etc.) |
| AI infra | 12 providers, orchestrator, RAG, 2,000 agents | (unchanged — already strong); + Anthropic/Gemini-native/Cloudflare AI/HF providers (optional) |
| Database | 221 models, MySQL prod | + `Service`, `Entitlement`, `Quota`, `ProjectDiscovery`, `CapabilityAssessment`, `ServiceRecommendation` models; + `WebhookDelivery` dispatch log populated |
| Customer portal | (none) | + new `/portal/**` route group with customer-scoped panels (keys, usage, tasks, webhooks, discovery reports) |
| Webhooks | registration only | + outbound dispatcher + HMAC signing |
| Tests | 144 files | + sanitization tests, revocation tests, tenant-scoping tests, 7-role RBAC tests, outbound-webhook tests, cross-tenant RAG tests |

## What does NOT change

- Official brand assets, public website routes, sitemap, robots.txt.
- Port contract 3011, PM2, Caddy.
- Auth model (opaque session tokens, not JWT-for-sessions).
- Existing 444 API routes (no renames, no removals — only additive `/v1/ai/**`).
- Database (no destructive migrations; additive `CREATE TABLE` only).
- 2,000-agent workforce (already meets spec target).
- 12 AI providers (already real implementations).

## Owner decisions needed before Phase 2

1. **Domain**: confirm `api.alolabs.net` subdomain will route to the same origin (Caddy rule) — or a separate origin?
2. **Role migration**: should existing `super_admin` users be auto-migrated to `PLATFORM_SUPER_ADMIN`, or require explicit assignment?
3. **Customer portal placement**: `/portal/**` as a separate route group, or a new dashboard role (`API_CONSUMER`) that hides internal panels?
4. **Service catalog**: seed from existing `SubscriptionPlan` features, or define a fresh `Service` model?
5. **Discovery modes**: implement Mode A (API) + Mode B (connector) first, or all three (Mode C source-repo)?
6. **Outbound webhooks**: deliver on task completion only, or also on entitlement changes / security events?
7. **Infrastructure discrepancies**: Nginx vs Caddy? PostgreSQL vs MySQL? Redis present? Docker? (see `INFRASTRUCTURE_INVENTORY.md`)
