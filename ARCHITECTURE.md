# ALO Labs AIOS — System Architecture

## Overview

ALO Labs AIOS (AI Operating System) is an enterprise-grade platform for building, deploying, and managing AI agents, skills, and workflows. Built on Next.js 16 with the App Router, it provides a single unified interface for multi-tenant AI operations including agent orchestration, RAG document processing, multi-provider LLM routing, CRM, billing, and real-time monitoring.

**Codebase stats**: 75,000+ lines of TypeScript/TSX, 251 API routes, 122 Prisma models, 82 panel components.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                 │
│  React 19 + Tailwind CSS 4 + shadcn/ui + Zustand + TanStack Query   │
│  82 lazy-loaded panel components (React.lazy)                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  Bearer Token (JWT-like sessions)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API Layer (Next.js 16 App Router)              │
│  251 REST endpoints  ·  route-auth.ts (withAuth wrapper)            │
│  Rate limiting (Redis-backed, in-memory fallback)                   │
│  Security headers via next.config.ts (CSP, HSTS, X-Frame-Options)   │
└──────────┬──────────┬──────────┬──────────┬─────────────────────────┘
           │          │          │          │
     ┌─────┘    ┌─────┘    ┌─────┘    ┌─────┘
     ▼          ▼          ▼          ▼
┌─────────┐ ┌───────┐ ┌────────┐ ┌────────────┐
│ Agent   │ │  AI   │ │  RAG   │ │ Enterprise │
│ Runtime │ │Router │ │ Engine │ │ Modules    │
└────┬────┘ └───┬───┘ └───┬────┘ └─────┬──────┘
     │          │         │            │
     ▼          ▼         ▼            ▼
┌─────────────────────────────────────────────────┐
│              Data Layer (Prisma ORM)              │
│  SQLite (primary) · Postgres adapter · MySQL adapter │
│  122 models · 40+ indexes                       │
└───────────┬─────────────────────────────────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
┌─────────┐  ┌──────────┐
│ SQLite  │  │  Redis   │
│  (DB)   │  │ (cache, │
│         │  │  rate    │
│         │  │  limits) │
└─────────┘  └──────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1+ |
| Language | TypeScript | 5.x |
| UI Library | React | 19.0 |
| Styling | Tailwind CSS | 4.x |
| Component Library | shadcn/ui (Radix UI) | latest |
| ORM | Prisma | 6.11+ |
| Primary Database | SQLite | — |
| Cache / Rate Limiting | Redis (ioredis) | 5.x |
| State Management | Zustand | 5.x |
| Data Fetching | TanStack Query | 5.x |
| Table Components | TanStack Table | 8.x |
| Validation | Zod | 4.x |
| Forms | React Hook Form | 7.x |
| Charts | Recharts | 2.x |
| Password Hashing | bcrypt | 6.x |
| Runtime | Bun | — |
| Testing | Vitest | 4.x |
| Linting | ESLint | 9.x |

---

## Module Architecture

### 1. Agent Runtime (`src/lib/agent-runtime/`)

Manages the full lifecycle of AI agents: creation, execution, scheduling, health monitoring, and state management.

| File | Purpose |
|------|---------|
| `types.ts` | Agent status enum, task types, resource limits, priority weights |
| `execution.ts` | `AgentExecutionEngine` — executes agent tasks with tool calls and delegation |
| `state.ts` | `AgentStateManager` — tracks agent state transitions with validation |
| `health.ts` | `AgentHealthMonitor` — health scoring, degradation detection, circuit breaker |
| `scheduler.ts` | `AgentScheduler` — cron-based and interval-based task scheduling |
| `lifecycle.ts` | `AgentLifecycleManager` — creation → initialization → ready → run → archive |

**Agent tiers**: `ceo`, `director`, `manager`, `worker`

**Agent roles**: `manager`, `planner`, `execution`, `qa`, `report`, `automation`, `safety`, `memory`, `productivity`, `owner_approval`, `specialist`

**State machine transitions**:

```
created → initializing → ready → running → completed
                                 → failed → ready (retry)
                                 → timed_out → ready (retry)
                                 → waiting_approval → running
                                 → paused → running
                     → archived (terminal)
```

### 2. AI Router (`src/lib/ai-router/`)

Multi-provider LLM routing with load balancing, circuit breakers, and automatic failover.

| File | Purpose |
|------|---------|
| `router.ts` | `AIRouter` — main routing engine with provider registration and health checks |
| `provider-base.ts` | `BaseAIProvider` — abstract base class for all providers |
| `ollama-provider.ts` | Ollama local model provider |
| `openrouter-provider.ts` | OpenRouter cloud provider |
| `zai-provider.ts` | Z-AI SDK provider |
| `qwen-provider.ts` | Qwen model family |
| `deepseek-provider.ts` | DeepSeek model family |
| `llama-provider.ts` | LLaMA model family |
| `gemma-provider.ts` | Gemma model family |
| `phi-provider.ts` | Phi model family |
| `mistral-provider.ts` | Mistral model family |
| `types.ts` | All type definitions for routing, models, errors |

**Providers**: `ollama`, `openrouter`, `zai-sdk`, `openai-compatible`

**Model families**: `glm`, `qwen`, `deepseek`, `llama`, `gemma`, `phi`, `mistral`, `custom`

**Load balancing strategies**: `round-robin`, `least-connections`, `random`, `weighted`

**Circuit breaker**: Opens after 5 consecutive failures, 60-second cooldown period, 30-second health check interval.

### 3. RAG Engine (`src/lib/rag-engine.ts`, `src/lib/qdrant.ts`)

Document ingestion, chunking, embedding generation, and hybrid vector search.

- **Chunking**: Default 512 chars with 50-char overlap, max 100 chunks per document
- **Vector storage**: Qdrant integration for embeddings
- **Embeddings**: z-ai-web-dev-sdk for vector generation
- **Classification levels**: `public`, `internal`, `confidential`, `restricted`, `highly_restricted`

### 4. Storage Layer (`src/lib/storage/`)

Unified storage abstraction across multiple backends.

| Backend | Config Env Vars |
|---------|----------------|
| Local filesystem | `STORAGE_PATH` (default: `./storage`) |
| S3 / Cloudflare R2 | `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_CDN_URL` |
| MinIO | `MINIO_URL`, `MINIO_HOST`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` |

Local storage generates **HMAC-signed URLs** for secure file access. The `StorageFactory` pattern provides cached, singleton instances per configuration.

### 5. Authentication & Security (`src/lib/auth.ts`, `src/lib/route-auth.ts`, `src/lib/security/`)

| Module | File | Purpose |
|--------|------|---------|
| Core Auth | `auth.ts` | Password hashing (bcrypt, 12 rounds), session token CRUD via Settings table |
| Route Guard | `route-auth.ts` | `withAuth()` HOC — extracts Bearer token, verifies session, loads user |
| Session Manager | `security/session-manager.ts` | Full session lifecycle with expiry (24h default, 7d max), rotation, multi-device |
| Rate Limiter | `security/rate-limiter.ts` | Sliding window, Redis-backed + in-memory fallback, endpoint-specific configs |
| CSRF | `security/csrf.ts` | CSRF token generation and validation |
| File Validator | `security/file-validator.ts` | Upload type/size validation |
| Secret Manager | `security/secret-manager.ts` | Encrypted secret storage |
| Token Guard | `token-guard.ts` | Token budget enforcement and usage tracking |

### 6. Enterprise Modules

| Module | Key API Routes | Prisma Models |
|--------|---------------|---------------|
| **CRM** | `/api/crm/contacts`, `/api/crm/deals`, `/api/crm/pipelines`, `/api/crm/activities`, `/api/crm/notes`, `/api/crm/lead-score` | `CrmContact`, `CrmDeal`, `CrmPipeline`, `CrmPipelineStage`, `CrmActivity`, `CrmNote`, `CrmLeadScore` |
| **Billing** | `/api/billing/plans`, `/api/billing/subscriptions`, `/api/billing/invoices`, `/api/billing/payments` | `SubscriptionPlan`, `Subscription`, `Invoice`, `Payment` |
| **Workflows** | `/api/workflows`, `/api/workflow-steps`, `/api/workflow-factory/build`, `/api/automation/triggers` | `Workflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowPermission`, `AutomationTrigger`, `AutomationAction` |
| **Job Queue** | `/api/queues`, `/api/jobs` | `JobQueue`, `QueueItem` |
| **Webhooks** | `/api/webhooks`, `/api/webhooks/deliveries` | `WebhookConfig`, `WebhookDelivery` |
| **Multi-tenant** | `/api/tenant-gateway`, `/api/tenant-admin/config`, `/api/tenant-admin/quotas` | `Company`, `TenantConfig`, `CompanyUser`, `CompanyPermission`, `CompanyApiKey`, `CompanyDomain`, `CompanyIpAllowlist` |
| **Monitoring** | `/api/metrics`, `/api/metrics/prometheus`, `/api/system-health`, `/api/infra/status` | `Metric`, `HealthCheck`, `InfraService`, `WorkerNode` |
| **Approvals** | `/api/approvals`, `/api/approval-engine`, `/api/tool-approvals` | `Approval`, `AgentBuildRequest`, `SkillBuildRequest`, `WorkflowBuildRequest`, `ToolApprovalRequest` |

### 7. Social Media Integration (`src/lib/social/`)

Provider-based architecture for 10 social platforms:

| Provider | File |
|----------|------|
| Instagram | `instagram.ts` |
| Facebook | `facebook.ts` |
| Twitter/X | `twitter.ts` |
| LinkedIn | `linkedin.ts` |
| TikTok | `tiktok.ts` |
| YouTube | `youtube.ts` |
| Pinterest | `pinterest.ts` |
| Telegram | `telegram.ts` |
| Discord | `discord.ts` |
| Google Business | `google-business.ts` |
| Threads | `threads.ts` |

### 8. Real-time Services (`mini-services/`)

| Service | Purpose |
|---------|---------|
| `queue-service` | Standalone Bun-based job queue processor |
| `realtime-service` | WebSocket/SSE real-time notification delivery |

---

## Data Flow: Agent Execution

```
1. User issues command via Command Center panel
   → POST /api/commands { rawCommand }

2. Command is parsed → intent detected → department resolved
   → Command record created (status: pending)

3. Appropriate Agent is selected based on department + intent
   → AgentExecutionEngine.execute(task)

4. Agent may:
   a) Route to AI Router for LLM completion
      → AIRouter.route(request) → provider.chat(request)
   b) Query RAG Engine for context
      → ragEngine.query(collection, query) → Qdrant search
   c) Delegate to sub-agents (max depth: 3)
      → AgentExecutionEngine.delegate(task, targetAgentId)
   d) Invoke tools (with approval check if risk=high)
      → ToolApproval check → ToolRun record

5. Results flow back:
   → Task updated → Output records created
   → UsageLog recorded (tokens, cost, duration)
   → AgentPerformanceScore updated

6. If approval required:
   → Agent enters waiting_approval state
   → Approval record created
   → Notification sent to approver
   → On approve/reject → Agent resumes or fails
```

---

## Data Flow: Authentication

```
1. POST /api/auth/login { email, password }
   → bcrypt.compare(password, passwordHash)
   → If user.otpEnabled → return tempToken
   → Else → createSessionToken(userId) → return { token, user }

2. POST /api/auth/mfa/verify { tempToken, code }
   → Verify TOTP code against user.otpSecret
   → If valid → createSessionToken(userId) → return { token, user }

3. All subsequent requests:
   → Authorization: Bearer <token>
   → withAuth() wrapper extracts token
   → verifySessionToken(token) → Settings table lookup
   → Load user from DB → pass to handler
```

---

## Deployment Architecture

```
┌──────────────┐     ┌──────────────────────┐
│   Caddy      │────▶│  Next.js Standalone  │
│  (reverse    │     │  (Bun runtime)       │
│   proxy +    │     │  Port 3000           │
│   TLS)       │     └──────┬───────────────┘
└──────────────┘            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  SQLite  │ │  Redis   │ │  MinIO   │
        │          │ │          │ │  / S3    │
        └──────────┘ └──────────┘ └──────────┘

Optional: Prometheus + Grafana (monitoring/)
```

- **Output mode**: `standalone` (Next.js optimized Docker builds)
- **Reverse proxy**: Caddy (auto-TLS) or Nginx (manual TLS)
- **Process manager**: systemd (`alolabs-agent-hub.service`)
- **Cron**: System cron for scheduled jobs (`deploy/cron/alolabs-cron`)

---

## Frontend Architecture

```
src/app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Single-page app shell
├── globals.css             # Tailwind v4 CSS imports
├── api/                    # 251 API routes
└── (no other pages — SPA architecture)

src/components/
├── ui/                     # 24 shadcn/ui primitives
├── panels/                 # 82 lazy-loaded panel components
├── agent-hub-shell.tsx     # Main shell with sidebar navigation
├── alo-logo.tsx            # Brand logo component
├── public-site.tsx         # Public landing page
└── service-worker-registration.tsx  # PWA support

src/store/
└── app.ts                  # Zustand global store

src/hooks/
├── use-mobile.ts           # Responsive breakpoint hook
├── use-toast.ts            # Toast notification hook
├── use-api-actions.ts      # API action helpers
└── use-data-table.ts       # Table configuration hook

src/lib/
├── auth.ts                 # Core auth functions
├── route-auth.ts           # withAuth() route guard
├── db.ts                   # Prisma client singleton
├── api.ts                  # Frontend API utility
├── job-queue.ts            # In-process job queue
├── rag-engine.ts           # RAG chunking + search
├── qdrant.ts               # Qdrant vector DB client
├── agent-runtime/          # Agent execution system
├── ai-router/              # Multi-provider LLM routing
├── storage/                # Multi-backend file storage
├── security/               # Security utilities
├── social/                 # Social media providers
├── email/                  # Email (SMTP/IMAP)
├── whatsapp/               # WhatsApp integration
├── memory/                 # Memory tier management
├── approval-engine/        # Approval workflow engine
├── event-bus/              # Internal event system
├── db-adapters/            # Multi-database adapters
├── metrics-collector.ts    # Prometheus-compatible metrics
├── cron-jobs.ts            # Scheduled job definitions
└── validators.ts           # Input validation utilities
```

---

## Configuration

All configuration is managed through environment variables and the `Settings` Prisma model (key-value store). The `next.config.ts` file handles security headers and build settings.

**Critical env vars**:

| Variable | Purpose | Default |
|----------|---------|--------|
| `DATABASE_URL` | SQLite/Postgres/MySQL connection string | `file:./dev.db` |
| `REDIS_URL` | Redis connection for rate limiting/caching | — |
| `JWT_SECRET` | Session token signing (if using JWT layer) | — |
| `STORAGE_PATH` | Local filesystem storage path | `./storage` |
| `S3_ENDPOINT` / `MINIO_URL` | Object storage endpoint | — |
| `QDRANT_URL` | Qdrant vector database URL | `http://localhost:6333` |
| `OLLAMA_BASE_URL` | Ollama API endpoint | `http://localhost:11434` |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
