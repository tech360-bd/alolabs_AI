# ALO Labs Target Architecture

> Date: 2026-11-11 · Branch: `feat/public-website-redesign` · Base: `origin/main 90a4132`.

## Current state (verified)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Edge (Cloudflare Tunnel → Caddy :443 → Next.js :3011)              │
│  src/proxy.ts — Next 16 proxy (no middleware.ts)                    │
│  - public allowlist: /api/health, /api/ping, /api/public/,           │
│    /api/whatsapp/webhook, /api/voice/telephony/webhook              │
│  - everything else requires Bearer/X-API-Key presence              │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js 16.4 App Router (single process, PM2-managed)              │
│  - Public site: /, /site/*, /brand, /design, /invoice, /login       │
│  - Authenticated app: /dashboard (155 panels via ?view=)            │
│  - 444 API route handlers under /api/**                              │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Auth: opaque 48-byte session tokens, SHA-256-hashed at rest in     │
│  Settings; JWT for API keys; bcrypt(12) passwords; MFA              │
│  src/lib/auth.ts, src/lib/api-auth.ts, src/lib/v1-auth.ts           │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Data: Prisma 6.19 → MySQL/MariaDB (prod) / SQLite (dev)           │
│  221 models, 8 migrations (mysql/), dual schema kept in sync by    │
│  scripts/generate-mysql-schema.ts                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Hardening trajectory

- **Hardened wrappers** (`secureRoute` / `secureCrud` / `v1Handler` / `withCompany`): 204 of 444 routes. This branch adds multi-parent `ownership`, `filterSchema`, dotted `searchFields`, and `afterCreate` hooks to `secureCrud`.
- **Legacy inline-verify pattern**: ~97 routes remain. Migration is the long tail; priority is mutating routes (whatsapp/send, sms, email/send, automation/execute, api-keys, queues/*).
- **Tenant isolation**: `companyId` on all multi-tenant models; `secureCrud` enforces row-level filter on reads + `assertTenant` on writes (404 on cross-tenant, not 403).

## Public website target (this branch)

- 3D hero: React Three Fiber constellation, lazy-loaded, DPR-capped, `prefers-reduced-motion` + no-WebGL/mobile static fallback. Truthful LIVE/STATIC scene badge.
- Design tokens: CSS variables derived from official brand colors (#003ABC blue, #FF6A00 orange, deep-navy surfaces).
- Truthful content only: "Selected work" (AgentOS Live, Voice Contact Center In development, Engineering Intelligence Internal), "Technology" from actual `package.json`.

## What is NOT changing (protecting what works)

- Official logo/wordmark assets preserved untouched.
- Existing routes, sitemap, robots, metadata stay; enhancements only.
- Port contract 3011 unchanged.
- Auth model (opaque session tokens, not JWT-for-sessions) unchanged.
