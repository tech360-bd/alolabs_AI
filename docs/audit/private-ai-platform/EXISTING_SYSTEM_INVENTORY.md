# Existing System Inventory — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Base: `origin/main 90a4132` · Method: read-only source verification. Every finding cites a file path. No production changes.

## Repository

| Item | Value | Evidence |
|---|---|---|
| Remote | `https://github.com/tech360-bd/alolabs_AI.git` | `.git/config` |
| Default branch | `main` | `remotes/origin/HEAD` |
| Origin/main HEAD | `90a4132` (Merge PR #27 — calling-center gap closure) | `git log origin/main` |
| Open PRs | #28 (feat/public-website-redesign — 3D hero + CRM security, mergeable, CI green) | GitHub API |
| Tech stack | Next.js 16.4.3, React 19.2.3, TypeScript 5.9.3, Prisma 6.19.2, Tailwind 4, Radix UI | `package.json` |
| Runtime | Node ≥20 / Bun 1.3.4; port contract **3011** | `ecosystem.config.js`, `Caddyfile` |
| Test framework | Vitest 4.1.10, Testing Library, jsdom | `package.json`, `vitest.config.ts` |

## Application scale

| Metric | Count | Evidence |
|---|---|---|
| API route handlers | **444** `route.ts` files under `src/app/api/**` | `find src/app/api -name route.ts` |
| `/api/v1/**` public gateway routes | **39** | `find src/app/api/v1 -name route.ts` |
| Prisma models | **221** (in both `schema.prisma` SQLite-dev and `schema.mysql.prisma` MySQL-prod) | `prisma/schema.prisma`, `prisma/schema.mysql.prisma` |
| MySQL migrations | 8 hand-written SQL files (2026-10-08 → 2026-11-11) | `prisma/migrations/mysql/` |
| Dashboard panels | 155 registered in `DASHBOARD_PANELS` | `src/lib/dashboard/navigation.ts:449` |
| Test files | 144 under `__tests__/` + `src/__tests__/` | `find` |
| AI provider implementations | 12 real provider files in `src/lib/ai-router/` | `ls src/lib/ai-router/` |

## Database

- **Dev**: SQLite via `prisma/schema.prisma`.
- **Production**: MySQL/MariaDB via `prisma/schema.mysql.prisma` (parity maintained by `scripts/generate-mysql-schema.ts`; `.env.example:38-40` states production is MySQL-only, enforced by `src/lib/production-database.ts`).
- **Migrations**: 8 hand-written SQL files in `prisma/migrations/mysql/`, newest `20261111_voice_gap_closure.sql` (current with schema).

## Auth model

- **Sessions**: opaque 48-byte CSPRNG tokens, SHA-256-hashed at rest in `Settings` keyed by `session:<sha256(token)>`. Idle timeout (12 h) + absolute TTL (24 h). Lazy re-keying of legacy raw-token rows. (`src/lib/auth.ts:12-33`)
- **JWT**: separate from sessions; used for API-key issuance. Secret refuses to boot in production without ≥32 chars; dev uses per-process random secret. (`src/lib/auth.ts:35-46`)
- **Passwords**: bcrypt(12). (`src/lib/auth.ts:73-75`)
- **MFA**: present and wired.
- **API keys**: `CompanyApiKey.keyHash` (sha256, unique); plaintext returned once at creation, never stored. Scopes stored as JSON, checked fail-closed. Expiration enforced at auth time. (`prisma/schema.prisma:819-831`, `src/lib/v1-auth.ts:64-105`)

## Edge gate

- `src/proxy.ts` (Next 16 proxy, no `middleware.ts`).
- Public allowlist: `/api/health`, `/api/ping`, `/api/public/`, `/api/whatsapp/webhook`, `/api/voice/telephony/webhook`.
- All non-allowlisted `/api/*` require Bearer/X-API-Key presence; authoritative verification per-route.
- Private pages `/dashboard` require session cookie.

## What is already strong (preserved)

1. **Tenant isolation is real** — `companyId` enforced server-side; cross-tenant records return 404 (not 403); spoofed-tenant attempts recorded as `tenant_isolation_violation` security events. (`src/lib/api/secure-route.ts:357-369, 555-567, 579-588`)
2. **API keys are hashed at rest** — sha256, plaintext never persisted. (`src/app/api/api-keys/route.ts:88-107`)
3. **12 real AI provider implementations** — Ollama, OpenAI-compatible, OpenRouter, Groq, DeepSeek, Mistral, Qwen, Llama, Phi, Gemma, Z.AI, UnoRouter. Circuit breakers, fallback chains, decision recording. (`src/lib/ai-router/`)
4. **2,000-agent workforce target** is hard-coded, verified, and seeded. (`src/lib/workforce/constants.ts:11-17`, `scripts/verify-2000-workforce.ts`)
5. **Real orchestrator** — `src/lib/orchestrator.ts` (1,381 lines) with routing candidates, adaptive reasoning paths, multi-agent collaboration.
6. **Real RAG engine** — `src/lib/rag-engine.ts` (536 lines) with chunking, embedding, hybrid search, Qdrant integration.

## What is missing vs the Private-AI-as-a-Service spec

See `IMPLEMENTATION_GAP_REPORT.md` for the ranked 15 gaps. Headline: the `/v1/ai/**` endpoint family does not exist, no response sanitization layer exists, none of the 7 spec roles exist, and no customer portal distinct from admin exists.
