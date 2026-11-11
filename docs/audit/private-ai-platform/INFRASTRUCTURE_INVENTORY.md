# Infrastructure Inventory — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only — source files + public HTTP probes. No SSH access to production host.

## Verified from source/config files

| Component | Status | Evidence |
|---|---|---|
| Next.js 16.4.3 application | PASS | `package.json`, `next.config.ts` |
| Port contract **3011** | PASS | `ecosystem.config.js` (PM2), `Caddyfile` |
| PM2 process manager | PASS | `ecosystem.config.js` |
| Caddy reverse proxy | PASS | `Caddyfile` |
| Cloudflare (DNS/edge) | PASS | `src/proxy.ts` is Next 16 proxy; Cloudflare tunnel confirmed by live 1033 error |
| Prisma 6.19.2 ORM | PASS | `package.json`, `prisma/` |
| SQLite (dev) | PASS | `prisma/schema.prisma` |
| MySQL/MariaDB (prod) | PASS | `prisma/schema.mysql.prisma`, `.env.example:38-40`, `src/lib/production-database.ts` |
| Qdrant (vector DB) | PASS | `src/lib/qdrant.ts` (443 lines) |
| MinIO (object storage) | PASS | `src/lib/minio.ts` |
| Vitest 4.1.10 test framework | PASS | `package.json`, `vitest.config.ts` |
| gitleaks secret scanning | PASS | `.gitleaks.toml`, CI workflow |
| CI (GitHub Actions) | PASS | `.github/workflows/` (mysql.yml, backup-portability.yml) |

## Live production probe (2026-11-11 02:42–02:45 UTC)

| Route | HTTP status | Notes |
|---|---|---|
| `https://alolabs.net/` | 530 | Cloudflare `error code: 1033` (Argo Tunnel origin unreachable) |
| `https://alolabs.net/site/solutions` | 403 | same |
| `https://alolabs.net/site/about` | 403 | same |
| `https://alolabs.net/site/contact` | 403 | same |
| `https://alolabs.net/login` | 403 | same |
| `https://alolabs.net/sitemap.xml` | 403 | same |
| `https://alolabs.net/robots.txt` | 530 | same |
| `https://www.alolabs.net/` | 403 | same |

**Verdict: alolabs.net is DOWN for all visitors.** The Cloudflare edge can resolve the tunnel name but cannot connect to the origin — `cloudflared` on the origin host is not running or the host is offline. This is a **P0 production incident** (FX-4) independent of this audit. No code change can fix an origin outage; the owner must restart `cloudflared` on alo-server-lap.

## Spec-mentioned infrastructure — verification status

| Spec item | Status | Evidence |
|---|---|---|
| HP Ubuntu server (alo-server-lap) | **BLOCKED** | no SSH access from this session; live probe shows origin offline |
| Linux user `alamin` | **BLOCKED** | cannot verify without SSH |
| Ollama | PARTIAL | `src/lib/ai-router/ollama-provider.ts` is a real client; production Ollama instance not reachable for verification (origin down) |
| Node.js | PASS | `package.json` engines, `ecosystem.config.js` |
| PM2 | PASS | `ecosystem.config.js` |
| Nginx | **NOT FOUND** in repo | Caddy is the reverse proxy (`Caddyfile`); spec mentions Nginx but the repo uses Caddy. Owner to clarify if Nginx exists upstream of Caddy. |
| PostgreSQL | **NOT FOUND** | repo uses MySQL/MariaDB for production (`.env.example:38-40`); spec mentions PostgreSQL but no PG config exists. Owner to clarify. |
| MariaDB | PASS | `prisma/schema.mysql.prisma` provider=mysql |
| Redis | **NOT FOUND** in repo | no Redis client in `src/lib/`; no `REDIS_URL` in `.env.example`. Spec mentions Redis but repo has no Redis integration. Owner to clarify if Redis exists on the host. |
| Cloudflare | PASS | confirmed by live probe (error 1033 is a Cloudflare-specific error) |
| Docker | **NOT FOUND** in repo | no `Dockerfile`, no `docker-compose.yml`. Owner to clarify if Docker is used on the host. |

## Spec discrepancies (owner clarification needed)

1. **Nginx vs Caddy**: spec mentions Nginx; repo uses Caddy. Is Nginx upstream of Caddy, or is this a spec assumption?
2. **PostgreSQL vs MySQL/MariaDB**: spec mentions PostgreSQL; repo is MySQL/MariaDB-only for production. Which is the actual production database?
3. **Redis**: spec mentions Redis; repo has no Redis integration. Is Redis on the host but unused by the app, or not present?
4. **Docker**: spec doesn't mention Docker but the prior context did. No Dockerfile in repo.

These do not block the audit — they are infrastructure-ownership questions for the owner to resolve before Phase 2.
