<div align="center">

# ALO Labs AgentOS

**Enterprise AI Agent Operating System**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

> **AgentOS transformation status (2026-10-08): experimental / NOT production-ready.**
> The existing README below describes the larger legacy codebase and contains
> historical counts/claims that have not been fully re-audited. Current schema:
> **175 Prisma models**. Current checks: typecheck, lint (1 warning),
> **724 tests across 51 files**, local production build/start and SQLite smoke. A successful
> *live AI* run requires a configured provider and remains **NOT VERIFIED**
> in this environment. Without one, runs fail honestly with
> **Configuration required**. See [final audit](ALO_LABS_AGENTOS_FINAL_AUDIT.md)
> and [AgentOS guide](docs/AGENTOS_GUIDE.md) before any deployment.
>
> New entry points: `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/events`
> (SSE), `POST /api/workflows/:id/run`, and the versioned `/api/v1/*` surface.
> Start a local SQLite sandbox with `npm run db:push:sqlite`,
> `SEED_ADMIN_PASSWORD=<strong-unique-password> npm run seed:agentos`,
> and `npm run dev` (port 3011). Never use the checked-in examples as secrets.

## Features

- **251 REST API Routes** — Comprehensive backend covering agents, CRM, workflows, RAG, billing, social media, and more
- **122 Prisma Data Models** — Full relational schema with users, roles, agents, workflows, tickets, deals, documents
- **82 Admin Panels** — Feature-rich dashboard panels for every aspect of the system
- **Multi-Provider AI Router** — Route LLM requests across Ollama, OpenRouter, DeepSeek, Mistral, Qwen, and Z-AI
- **RAG Engine** — Ingest, chunk, embed, and query documents with vector similarity search via Qdrant
- **Agent Runtime** — Build, schedule, execute, and monitor autonomous AI agents with lifecycle management
- **CRM Pipeline** — Full sales CRM with contacts, deals, pipelines, activities, and lead scoring
- **Workflow Engine** — Visual workflow builder with triggers, steps, conditions, and execution logging
- **Job Queue** — Persistent background job queue with dead-letter handling, retries, and monitoring
- **Real-Time Events** — WebSocket-powered real-time notifications, agent updates, and live dashboard feeds
- **Multi-Platform Social Integration** — Twitter/X, LinkedIn, Facebook, Instagram, YouTube, Telegram, TikTok, Pinterest, WhatsApp
- **Enterprise Auth** — RBAC, MFA/OTP, session management, CSRF protection, OAuth providers
- **Object Storage** — MinIO/S3-compatible file storage with CDN support and media library management
- **Billing & Subscriptions** — Plans, invoices, payments, usage tracking, and cost estimation
- **Audit Logging** — Comprehensive audit trail for all user actions, API calls, and system events
- **Observability Stack** — Prometheus metrics, Grafana dashboards, health checks, and system monitoring
- **PWA Support** — Service worker, manifest, and offline-capable progressive web app
- **Email & SMS** — SMTP integration with templates, tracking, and campaign management
- **Security Hardening** — Rate limiting, file validation, secret management, CSP headers, HSTS, X-Frame-Options

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16.x | Full-stack React framework (App Router, standalone output) |
| React | 19.x | UI component library |
| TypeScript | 5.x | Type-safe language |
| Bun | 1.2+ | JavaScript runtime, package manager, and build tool |
| Tailwind CSS | 4.x | Utility-first CSS framework |
| shadcn/ui | latest | Accessible component library (Radix UI primitives) |
| Prisma | 6.x | ORM and database schema management |
| SQLite | 3.x | Primary database (file-based, zero config) |
| Redis | 7.x | Caching, rate limiting, session storage (optional) |
| Qdrant | latest | Vector database for RAG embeddings (optional) |
| MinIO | latest | S3-compatible object storage (optional) |
| Socket.IO | 4.x | Real-time WebSocket communication |
| Zustand | 5.x | Client-side state management |
| TanStack Query | 5.x | Server state management and data fetching |
| Zod | 4.x | Runtime schema validation |
| Recharts | 2.x | Charting and data visualization |
| Caddy | 2.8+ | Reverse proxy with automatic HTTPS/TLS |
| Docker | 27+ | Containerization and orchestration |

---

## Folder Structure

```
alolabs-agentos/
├── prisma/
│   └── schema.prisma              # 122 models, SQLite datasource
├── src/
│   ├── app/
│   │   ├── layout.tsx / page.tsx / globals.css
│   │   └── api/                    # 251 API routes
│   │       ├── health/             # Health check endpoints
│   │       ├── auth/               # Login, logout, MFA, SSO, OAuth, sessions
│   │       ├── agents/             # Agent CRUD, registry, runtime, memory
│   │       ├── workflows/          # Workflow engine, steps, factory
│   │       ├── crm/                # Contacts, deals, pipelines, activities
│   │       ├── rag/                # RAG ingest, query, collections, search
│   │       ├── llm/                # Model routing, streaming
│   │       ├── social/             # Social OAuth, publish, analytics
│   │       ├── billing/            # Plans, invoices, payments
│   │       ├── email/              # SMTP, inbox, send, templates
│   │       ├── whatsapp/           # WhatsApp Business messaging
│   │       ├── queues/ / jobs/     # Job queue, background execution
│   │       ├── db/                 # Backup, restore, migrate
│   │       └── ...                 # 30+ additional API modules
│   ├── components/
│   │   ├── panels/                 # 82 admin dashboard panels
│   │   ├── ui/                     # shadcn/ui primitives
│   │   ├── agent-hub-shell.tsx     # Main application shell
│   │   └── pages/                  # Page-level components
│   ├── lib/
│   │   ├── ai-router/              # Multi-provider LLM routing
│   │   ├── agent-runtime/          # Agent lifecycle and execution
│   │   ├── security/               # Rate limiter, CSRF, session, file validator
│   │   ├── social/                 # Twitter, LinkedIn, Facebook, etc.
│   │   ├── email/ / whatsapp/      # Email and WhatsApp clients
│   │   ├── event-bus/ / approval-engine/ / memory/
│   │   ├── db-adapters/            # SQLite, PostgreSQL, MySQL
│   │   ├── auth.ts / db.ts / redis.ts / qdrant.ts / minio.ts
│   │   ├── rag-engine.ts / job-queue.ts / cron-jobs.ts
│   │   └── utils.ts / api.ts / api-gateway.ts
│   ├── hooks/                      # React hooks
│   └── store/                      # Zustand global state
├── mini-services/
│   ├── queue-service/              # Standalone Socket.IO job queue
│   └── realtime-service/           # Standalone WebSocket real-time server
├── scripts/                        # seed.ts, seed-v2/v3, seed-crm, check-db, etc.
├── deploy/
│   ├── scripts/                    # install, deploy, backup, restore, upgrade, rollback, health-check
│   ├── systemd/                    # alolabs-agent-hub.service
│   ├── cron/ / docker/ / nginx/
├── monitoring/                     # Prometheus + Grafana stack
├── public/                         # PWA manifest, service worker, icons, logo
├── docs/ / __tests__/
├── Dockerfile                      # Multi-stage production Dockerfile (Bun)
├── docker-compose.yml / docker-compose.prod.yml
├── Caddyfile
├── next.config.ts / package.json / .env.example
└── vitest.config.ts / eslint.config.mjs / tailwind.config.ts / tsconfig.json
```

---

## System Requirements

| Requirement | Minimum Version | Notes |
|---|---|---|
| Operating System | Ubuntu 22.04 LTS+ | Production target; Debian 12 also supported |
| Bun | 1.2+ | Primary runtime and package manager |
| Node.js | 22+ | Required for PM2 and `npx` (Prisma CLI) |
| Docker | 27+ | For containerized deployment |
| Docker Compose | v2 | Included with Docker CE 27+ |
| SQLite3 | 3.x | System package (`libsqlite3-dev` for native bindings) |
| Caddy | 2.8+ | Reverse proxy with automatic HTTPS |
| Git | 2.x | For cloning and updates |
| curl | 7.x+ | For health checks and installation scripts |
| Disk Space | 10 GB+ | Application, database, and Docker images |
| RAM | 2 GB+ (4 GB recommended) | Bun + Next.js standalone + optional services |

---

## Quick Start (5 minutes)

Deploy AgentOS on a fresh Ubuntu 22.04 server:

```bash
# 1. Update system and install base packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git sqlite3 libsqlite3-dev

# 2. Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 3. Install Node.js (required for PM2 and npx)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Clone and enter the project
git clone https://github.com/alolabs/agentos.git alolabs-agentos
cd alolabs-agentos

# 5. Configure environment
cp .env.example .env
nano .env  # Set APP_SECRET, ENCRYPTION_KEY, CSRF_SECRET at minimum

# 6. Install dependencies
bun install

# 7. Generate Prisma client and initialize database
npx prisma generate
npx prisma db push

# 8. Seed database with initial data
bun run scripts/seed.ts

# 9. Build for production
bun run build

# 10. Start the application
bun run start
```

The application will be available at **http://your-server-ip:3000**.

---

## Environment Variables

Copy `.env.example` to `.env` and configure. Generate secrets: `openssl rand -base64 32`

### Application

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `NODE_ENV` | Runtime environment | `development` | Yes |
| `APP_SECRET` | NextAuth session encryption secret | — | **Yes** |
| `ENCRYPTION_KEY` | Data encryption key | — | **Yes** |
| `CSRF_SECRET` | CSRF token signing secret | — | **Yes** |
| `NEXT_PUBLIC_APP_URL` | Public-facing application URL | `http://localhost:3000` | Yes |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000` | Yes |
| `SITE_NAME` / `SITE_URL` / `APP_PORT` | UI name, internal URL, port | `ALO Labs Agent Hub` / `http://localhost:3000` / `3000` | No |

### Database

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `DATABASE_URL` | SQLite database path | `file:./db/agenthub.db` | Yes |
| `STORAGE_PATH` | Local file storage path | `./storage` | No |
| `POSTGRES_HOST` / `PORT` / `USER` / `PASSWORD` / `DB` | PostgreSQL (optional) | `localhost` / `5432` / `alohub` / — / `alohub` | No |
| `POSTGRES_URL` | Full PostgreSQL connection string | — | No |
| `POSTGRES_SSL` / `POSTGRES_POOL_SIZE` | SSL toggle / pool size | `false` / `10` | No |

### Redis (Optional — Caching & Rate Limiting)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `REDIS_URL` | Full Redis connection URL | `redis://localhost:6379` | No |
| `REDIS_HOST` / `REDIS_PORT` | Host / port | `localhost` / `6379` | No |
| `REDIS_PASSWORD` | Redis password | — | No |
| `REDIS_DB` / `REDIS_PREFIX` | Database index / key prefix | `0` / `alolabs:` | No |

### Qdrant (Optional — Vector Database)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `QDRANT_URL` | Qdrant HTTP URL | `http://localhost:6333` | No |
| `QDRANT_HOST` / `QDRANT_PORT` | Host / port | `localhost` / `6333` | No |
| `QDRANT_API_KEY` / `QDRANT_TIMEOUT` | API key / timeout (ms) | — / `10000` | No |

### MinIO / S3 Object Storage (Optional)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `STORAGE_PROVIDER` | Storage backend (`local`, `s3`, `minio`) | `local` | No |
| `MINIO_URL` / `MINIO_HOST` / `MINIO_PORT` | MinIO connection | `http://localhost:9000` / `localhost` / `9000` | No |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO credentials | `minioadmin` / `minioadmin` | No |
| `MINIO_BUCKET` / `MINIO_REGION` / `MINIO_SSL` | Bucket / region / SSL | `agent-hub` / `us-east-1` / `false` | No |
| `MINIO_CDN_URL` | CDN URL for public assets | — | No |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_REGION` | AWS S3 settings | — | No |

### RAG / Embeddings (Optional)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `EMBEDDING_MODEL` / `EMBEDDING_API_URL` / `EMBEDDING_API_KEY` | Embedding config | — | No |

### AI Model Routing

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `AI_ROUTE_ENDPOINT` / `AI_REPLY_MODEL` | Central AI routing | — | No |
| `OLLAMA_ENDPOINT` | Ollama server URL | `http://localhost:11434` | No |
| `OPENROUTER_API_KEY` / `DEEPSEEK_API_KEY` / `MISTRAL_API_KEY` | LLM provider API keys | — | No |
| `QWEN_API_KEY` / `QWEN_API_URL` | Qwen provider config | — | No |

### SMTP / Email (Optional)

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP configuration | — / `587` / — / — / — | No |

### Social / Messaging (Optional)

| Variable | Purpose | Required |
|---|---|---|
| `SMS_DEFAULT_FROM` | Default SMS sender number | No |
| `WHATSAPP_API_URL`, `WHATSAPP_API_VERSION`, `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_REDIRECT_URI`, `WHATSAPP_AI_ENABLED`, `WHATSAPP_AI_ENDPOINT` | WhatsApp Business | No |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_REDIRECT_URI` | Twitter/X OAuth | No |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | LinkedIn OAuth | No |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` | Facebook OAuth | No |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` | Instagram OAuth | No |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth | No |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI` | YouTube OAuth | No |
| `TELEGRAM_BOT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_REDIRECT_URI` | Telegram Bot | No |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | TikTok OAuth | No |
| `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI` | Pinterest OAuth | No |
| `SOCIAL_WEBHOOK_VERIFY_TOKEN` | Webhook verification | No |

### Security & Mini-Services

| Variable | Purpose | Default | Required |
|---|---|---|---|
| `AV_SCANNER_ENABLED` | Enable antivirus scanning | `false` | No |
| `REALTIME_PORT` | Realtime service port | `3005` | No |
| `CORS_ORIGIN` / `JWT_SECRET` / `SESSION_SECRET` | Mini-service config | — | No |
| `DOMAIN` | Domain for Caddy | `alolabs.localhost` | No |

---

## Development Mode

```bash
bun install
npx prisma generate
npx prisma db push
bun run dev
```

Development server runs on **http://localhost:3000** with hot reload. Logs output to terminal and `dev.log`.

Health check: `curl http://localhost:3000/api/health`

---

## Production Build

```bash
bun run build
bun run start
```

The `build` script: `next build` in standalone mode, copies `.next/static` and `public/` into standalone output.
The `start` script: `NODE_ENV=production bun .next/standalone/server.js` with logs piped to `server.log`.

### PM2 Process Management

```bash
npm install -g pm2
pm2 start bun --name agentos -- start
pm2 save
pm2 startup
# Follow the output — it prints a sudo command to enable the startup service
```

Useful PM2 commands: `pm2 logs agentos`, `pm2 monit`, `pm2 restart agentos`, `pm2 stop agentos`, `pm2 status`

---

## Docker Deployment

```bash
docker compose up --build -d                    # Start all services
docker compose --profile tools up --build -d    # Include Adminer DB GUI
docker compose logs -f                         # View logs
docker compose down                            # Stop all services
docker compose down -v                         # Stop and remove volumes (destroys data)
```

Production overrides: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

### Container Overview
| Container | Image | Port | Purpose |
|---|---|---|---|
| **app** | `oven/bun:1.2.5-alpine` | `3000` | Main AgentOS application (Next.js standalone, multi-stage build) |
| **redis** | `redis:7-alpine` | `6379` (localhost) | Caching, rate limiting, session storage. 128 MB max, LRU, AOF persistence |
| **qdrant** | `qdrant/qdrant:latest` | `6333`, `6334` (localhost) | Vector DB for RAG embeddings. gRPC on 6334 |
| **minio** | `minio/minio:latest` | `9000`, `9001` (localhost) | S3-compatible object storage. Console on 9001 |
| **adminer** | `adminer:latest` | `8080` (localhost, tools) | Database GUI (only with `--profile tools`) |
| **mariadb** | `mariadb:10.11` | `3306` (localhost) | Optional MariaDB for dev exploration (not used by default SQLite) |

All optional services bind to `127.0.0.1` only. The Dockerfile uses a three-stage build (deps → builder → runner) as non-root `appuser` with health check on `/api/health`.

---

## Caddy Reverse Proxy

Caddy provides automatic HTTPS/TLS via Let's Encrypt — no manual certificate management.

### Setup

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Deploy configuration
sudo cp Caddyfile /etc/caddy/Caddyfile
export DOMAIN=agentos.yourdomain.com
sudo DOMAIN=$DOMAIN caddy run --config /etc/caddy/Caddyfile
```

Caddy listens on **80** (HTTP → HTTPS redirect) and **443** (HTTPS), proxying to `localhost:3000`. DNS A-record must point to the server's public IP.

### Caddyfile

```caddyfile
{$DOMAIN:alolabs.localhost} {
    encode zstd gzip
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        -Server
        Cache-Control "public, max-age=31536000, immutable"
    }
    handle /api/* {
        header Cache-Control "no-store, no-cache, must-revalidate"
        reverse_proxy localhost:3000 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }
    handle /socket.io/* {
        reverse_proxy localhost:3000 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
            header_up Upgrade {>Upgrade}
            header_up Connection {>Connection}
        }
    }
    handle /_next/static/* {
        reverse_proxy localhost:3000 { header_up Host {host} }
    }
    handle {
        reverse_proxy localhost:3000 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }
}
```

---

## Firewall Configuration

```bash
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status verbose
```

> **Do NOT** expose ports 3000, 6379, 6333, or 9000. Use Caddy on 80/443.

---

## Database Management

AgentOS uses **SQLite** via Prisma ORM. Database file set by `DATABASE_URL` (default: `file:./db/agenthub.db`).

```bash
npx prisma generate       # Generate Prisma client (after schema changes)
bun run db:push           # Push schema to database (no migration files)
bun run db:migrate        # Run migrations in development
bun run db:reset          # Reset database (destructive — drops all data)
npx prisma studio         # Visual DB browser at http://localhost:5555
npx prisma validate        # Validate schema without changes
npx prisma format          # Format schema file
```

---

## Backup & Restore

### What to Backup: `db/custom.db` (database), `storage/` (uploads), `.env` (secrets)

### Manual Backup

```bash
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp db/custom.db "$BACKUP_DIR/"
[ -d storage ] && tar czf "$BACKUP_DIR/storage.tar.gz" storage/
cp .env "$BACKUP_DIR/"
echo "Backup created at: $BACKUP_DIR"
```

### Automated Backup & Restore
```bash
# Backup (requires root)
sudo bash deploy/scripts/backup.sh
sudo bash deploy/scripts/backup.sh --id weekly-backup --db-only

# Restore
sudo bash deploy/scripts/restore.sh --backup-id 20250101_120000
```

### Manual Restore
```bash
cp "backups/20250101_120000/custom.db" db/custom.db
[ -f "backups/20250101_120000/storage.tar.gz" ] && tar xzf "backups/20250101_120000/storage.tar.gz"
cp "backups/20250101_120000/.env" .env
npx prisma generate && npx prisma db push
pm2 restart agentos
```

---

## Updating the Deployment

```bash
git pull origin main
bun install
npx prisma generate
npx prisma db push
bun run build
pm2 restart agentos
curl http://localhost:3000/api/health   # Verify
```

Automated: `sudo bash deploy/scripts/upgrade.sh` (zero-downtime) or `sudo bash deploy/scripts/rollback.sh` (rollback).

---

## Mini Services

Two standalone micro-services:

**Queue Service** — Socket.IO job queue:
```bash
cd mini-services/queue-service && bun install && bun run dev
```

**Realtime Service** — WebSocket real-time events via Socket.IO and Redis pub/sub:
```bash
cd mini-services/realtime-service && bun install && bun run dev   # Dev
cd mini-services/realtime-service && bun install && bun run start  # Prod
```

The realtime service runs on port **3005** (configurable via `REALTIME_PORT`). Requires Redis for cross-instance broadcasting.

---

## Architecture

ALO Labs AgentOS is a full-stack enterprise AI Agent Operating System built on the **Next.js 16 App Router**:
- **251 API Routes** — RESTful API layer: auth, agents, CRM, workflows, RAG, billing, social media, email, SMS, WhatsApp, observability
- **122 Prisma Models** — Comprehensive SQLite-backed data model with multi-tenancy, RBAC, audit logging
- **82 Dashboard Panels** — Admin interface built with shadcn/ui, Tailwind CSS 4, and React 19
- **SQLite** — Zero-configuration primary database; PostgreSQL and MySQL adapters available for scaling
- **Redis** — Optional in-memory store for rate limiting, session caching, pub/sub event broadcasting
- **Qdrant** — Optional vector database for RAG: document ingestion, embedding, similarity search
- **MinIO/S3** — Optional object storage for file uploads, media library, document management
- **AI Router** — Pluggable LLM providers: Ollama (local), OpenRouter, DeepSeek, Mistral, Qwen, Z-AI
- **Agent Runtime** — Autonomous agent lifecycle: build, schedule, execute, health monitoring
- **Workflow Engine** — Trigger-based automation with step execution, branching, error handling
- **Security** — CSRF protection, rate limiting, RBAC, MFA, session management, CSP, HSTS

---

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| Port 3000 already in use | Another process | `sudo lsof -i :3000` then `sudo kill <PID>`, or change `APP_PORT` |
| Build: module not found | Stale deps | `rm -rf node_modules && bun install && npx prisma generate` |
| Build: prisma client missing | Not generated | `npx prisma generate` before `bun run build` |
| Prisma db push fails | Schema mismatch / locked DB | Close Prisma Studio, check `DATABASE_URL`, `mkdir -p db` |
| Permission denied: db/custom.db | Wrong ownership | `sudo chown $USER:$USER db/custom.db && chmod 644 db/custom.db` |
| Permission denied: storage/ | Not writable | `sudo chown -R $USER:$USER storage/` |
| Out of Memory (OOM) | Exceeds RAM | Add 4G swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| Health check fails | App not responding | `pm2 logs agentos`. Verify `APP_SECRET`, `ENCRYPTION_KEY`, `CSRF_SECRET` in `.env` |
| Caddy won't start | Port 80/443 in use | `sudo lsof -i :80`. Stop other servers: `sudo systemctl stop nginx` |
| Caddy TLS fails | DNS misconfigured | Verify A-record: `dig yourdomain.com`. Propagation up to 48h |
| Redis connection refused | Redis not running | `docker compose up -d redis` or unset `REDIS_URL` |
| Qdrant connection refused | Qdrant not running | `docker compose up -d qdrant` or unset `QDRANT_URL` |
| WebSocket not connecting | Missing upgrade headers | Ensure Caddyfile has `/socket.io/*` with `Upgrade`/`Connection` headers |
| AI models returning errors | Missing API keys | Set `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, etc. in `.env` |
| Mini-service won't start | Missing deps | `cd mini-services/<service> && bun install` |
| PM2 keeps restarting | Crash loop | `pm2 logs agentos --lines 100`. Usually missing `.env` or invalid secrets |
| File uploads failing | Storage not writable | `mkdir -p storage && chmod 755 storage/`. Check `STORAGE_PATH` |

---

## NPM Scripts Reference

| Script | Command | Description |
|---|---|---|
| `bun run dev` | `next dev -p 3000 2>&1 \| tee dev.log` | Development server with hot reload |
| `bun run build` | `next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/` | Production standalone build |
| `bun run start` | `NODE_ENV=production bun .next/standalone/server.js 2>&1 \| tee server.log` | Start production server |
| `bun run lint` | `eslint .` | Lint all files |
| `bun run test` | `vitest run` | Run tests once |
| `bun run test:watch` | `vitest` | Tests in watch mode |
| `bun run test:coverage` | `vitest run --coverage` | Tests with coverage |
| `bun run test:ui` | `vitest --ui` | Vitest UI |
| `bun run db:push` | `prisma db push` | Push schema to database |
| `bun run db:generate` | `prisma generate` | Generate Prisma client |
| `bun run db:migrate` | `prisma migrate dev` | Run migrations in dev |
| `bun run db:reset` | `prisma migrate reset` | Reset database (destructive) |

---

## License

This project is licensed under the **MIT License**.

---

<div align="center">

**ALO Labs AgentOS** — Enterprise AI Agent Operating System

Built with Next.js 16, React 19, Bun, Prisma, and Tailwind CSS 4

</div>
