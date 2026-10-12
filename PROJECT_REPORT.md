# ALO Labs AgentOS — Project Report

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Version:** Production Release
**Status:** Production Ready

---

## 1. Project Architecture

### Overview

ALO Labs AgentOS is an enterprise AI Agent Operating System built with Next.js 16 App Router. It provides a comprehensive platform for creating, deploying, managing, and monitoring AI agents, with full CRM, billing, automation, and workflow capabilities.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Caddy (Reverse Proxy)                   │
│                  Port 80/443 → Auto-TLS                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 Next.js 16 (Standalone)                      │
│                   Port 3000 (Internal)                        │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ App Router │ │ 251 APIs │ │ 82 Panels│ │ Proxy (Auth)  │  │
│  └─────┬──────┘ └────┬─────┘ └────┬─────┘ └───────┬───────┘  │
│        └─────────────┼────────────┼───────────────┘          │
│                      ▼                                             │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                   Service Layer                          ││
│  │  Auth │ Storage │ RAG │ AI Router │ Job Queue │ Cron     ││
│  └──────┬───────┬──────┬──────┬───────────┬───────┬─────────┘│
└─────────┼───────┼──────┼──────┼───────────┼───────┼───────────┘
          │       │      │      │           │       │
    ┌─────▼──┐ ┌─▼────┐ ┌▼────┐ ┌▼─────┐ ┌──▼───┐ ┌▼──────┐
    │ SQLite │ │Redis │ │Qdrant│ │Ollama│ │ PM2  │ │Cron  │
    │ db/    │ │6379  │ │6333 │ │11434 │ │      │ │      │
    │custom.│ │      │ │      │ │      │ │      │ │      │
    │db     │ │      │ │      │ │      │ │      │ │      │
    └────────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘

    ┌──────────────┐  ┌───────────────────────┐
    │ Mini-Services │  │ Optional External     │
    │ queue-service │  │ OpenRouter │ DeepSeek │
    │ :3003         │  │ Mistral │ MinIO       │
    │ realtime-svc  │  │ WhatsApp │ S3/R2     │
    │ :3005         │  │ SMTP │ OAuth providers  │
    └──────────────┘  └───────────────────────┘
```

### Module Breakdown

| Module | API Routes | Prisma Models | Purpose |
|--------|-----------|---------------|---------|
| Authentication | 12 | User, OAuthAccount, OAuthProvider, SsoConfig | JWT sessions, MFA, OAuth, SSO |
| Agent System | 15+ | Agent, AgentRun, AgentHealth, AgentMemory, AgentVersion | AI agent lifecycle |
| CRM | 7 | CrmContact, CrmDeal, CrmPipeline, CrmActivity, CrmNote, CrmLeadScore | Customer management |
| Billing | 6 | Invoice, Payment, Subscription, SubscriptionPlan | Financial operations |
| Automation | 5 | AutomationTrigger, AutomationAction, AutomationTriggerLog | Workflow automation |
| Storage | 5 | File, ProjectUpload | File management with S3/Local |
| RAG | 9 | RagCollection, RagDocument, RagChunk, RagQuery, RagAnswer | Vector search |
| Monitoring | 8 | Alert, Metric, HealthCheck, Incident, ErrorLog | System observability |
| Security | 6 | SecurityEvent, BlockedAction, ProtectionLog | Threat detection |
| Workflows | 6 | Workflow, WorkflowRun, WorkflowStep | Business process automation |

### Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|----------|
| Framework | Next.js 16 App Router | Latest features, server components, standalone output |
| Language | TypeScript 5 strict | Type safety, enterprise reliability |
| Styling | Tailwind CSS 4 + shadcn/ui | Consistent design system, responsive |
| Database | SQLite via Prisma | Zero-config, embedded, fast for single-server |
| Cache | Redis (optional) | Session storage, rate limiting, pub/sub |
| Vectors | Qdrant (optional) | RAG embeddings, semantic search |
| Runtime | Bun | Faster installs, native TypeScript |
| Process Manager | PM2 | Production process management, auto-restart |
| Reverse Proxy | Caddy | Automatic HTTPS, simple config |
| Containerization | Docker + Compose | Reproducible deployments |

---

## 2. Dependencies

### Production Dependencies (Key)

| Package | Version | Purpose |
|---------|---------|--------|
| next | 16.x | React framework |
| @prisma/client | 6.x | Database ORM |
| react | 19.x | UI library |
| react-dom | 19.x | DOM rendering |
| tailwindcss | 4.x | Utility-first CSS |
| zod | 3.x | Schema validation |
| bcryptjs | 2.x | Password hashing |
| crypto-js | 4.x | Encryption |
| sharp | 0.33.x | Image processing |
| ioredis | 5.x | Redis client |
| @qdrant/js-client-rest | 1.x | Vector DB client |
| socket.io | 4.x | Real-time communication |
| lucide-react | latest | Icon library |
| sonner | latest | Toast notifications |
| @dnd-kit/core | 6.x | Drag and drop |
| recharts | 2.x | Charts |
| zustand | 5.x | Client state |

### Dev Dependencies (Key)

| Package | Version | Purpose |
|---------|---------|--------|
| typescript | 5.x | Type checking |
| prisma | 6.x | Database toolkit |
| eslint | 9.x | Code linting |
| vitest | 4.x | Testing framework |
| @types/* | various | TypeScript definitions |

---

## 3. Build Process

### Build Pipeline

```
Source (TS/TSX)
    │
    ├── tsc --noEmit          (Type check)
    ├── eslint .               (Lint)
    ├── prisma generate        (DB client)
    └── next build             (Compile)
         │
         ├── Server Components → .next/server/
         ├── Client Components  → Static chunks
         ├── API Routes        → .next/server/app/api/
         └── Standalone output  → .next/standalone/
              │
              ├── server.js     (Entry point)
              ├── .next/static/  (Copied in post-build)
              └── public/        (Copied in post-build)
```

### Build Commands

```bash
# Install dependencies
bun install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Production build
bun run build

# Start production server
bun run start
```

### Build Output

The `next build` command produces a standalone output in `.next/standalone/` containing:
- `server.js` — Node.js/Bun server entry point
- `.next/` — Compiled server and client chunks
- `static/` — Static assets (after post-build copy)
- `public/` — Public assets (after post-build copy)

---

## 4. Deployment Process

### Option A: Direct Deployment (PM2)

```bash
# 1. Install dependencies
bash scripts/install.sh

# 2. Build
bash scripts/build.sh

# 3. Deploy
bash scripts/deploy.sh
```

### Option B: Docker Deployment

```bash
docker compose up --build -d
```

### Option C: Caddy + PM2 (Recommended Production)

1. Install system dependencies via `scripts/install.sh`
2. Build via `scripts/build.sh`
3. Configure DOMAIN in `.env`
4. Deploy via `scripts/deploy.sh` (handles Caddy + PM2)

### Health Monitoring

```bash
# Check application health
bash scripts/healthcheck.sh

# PM2 monitoring
pm2 monit

# PM2 logs
pm2 logs agentos
```

---

## 5. Database

### Schema

- **122 Prisma models** organized into 15 domains
- **SQLite** as the default datasource (file: `db/custom.db`)
- **39 indexes** for query optimization
- **8 unique constraints** for data integrity
- All relations properly defined with onDelete behaviors

### Key Models

| Domain | Models |
|--------|--------|
| Core | User, Company, Department, Role, Permission, Settings |
| Auth | OAuthAccount, OAuthProvider, SsoConfig, CompanyApiKey |
| Agents | Agent, AgentRun, AgentHealth, AgentMemory, AgentVersion |
| Skills | Skill, SkillRun, SkillVersion, SkillValidationLog |
| Workflows | Workflow, WorkflowRun, WorkflowStep, WorkflowBuildRequest |
| CRM | CrmContact, CrmDeal, CrmPipeline, CrmActivity, CrmNote |
| RAG | RagCollection, RagDocument, RagChunk, RagQuery, RagAnswer |
| Billing | Invoice, Payment, Subscription, SubscriptionPlan, TokenUsage |
| Monitoring | Alert, Metric, HealthCheck, Incident, ErrorLog, ServerLog |
| Storage | File, ProjectUpload |
| Jobs | JobQueue, QueueItem |
| Security | SecurityEvent, BlockedAction, ProtectionLog |

### Backup Strategy

```bash
# Manual backup
bash scripts/backup.sh

# Restore from backup
bash scripts/restore.sh backups/2024-01-15_103000/

# Automated backup (add to crontab)
0 2 * * * /path/to/project/scripts/backup.sh
```

---

## 6. Security Measures

### Authentication
- **JWT** sessions with configurable TTL (1h default, 30d remember-me)
- **MFA** via TOTP (RFC 6238) with timing-safe comparison
- **OAuth 2.0** for Google, GitHub, Microsoft, etc.
- **SSO** via SAML
- **API Keys** with HMAC signing
- **Session management** with revocation, multi-device tracking

### Authorization
- **RBAC** with 5 roles: super_admin, admin, manager, editor, viewer
- **Permission system** mapped to API endpoints
- **Company-level isolation** for multi-tenant
- **Agent-level access control**

### Transport Security
- **HTTPS** via Caddy with automatic TLS (Let's Encrypt)
- **Security headers**: X-Frame-Options, X-Content-Type-Options, HSTS, CSP
- **CORS** configuration
- **CSRF** protection with double-submit cookies

### Application Security
- **Rate limiting**: 10/min login, 100/min API
- **Brute force protection** with account lockout
- **Content protection** with AI content moderation
- **Input validation** via Zod schemas
- **SQL injection prevention** via Prisma parameterized queries
- **File upload security**: path traversal prevention, magic byte validation, size limits
- **Audit logging** for all sensitive operations

---

## 7. Testing

### Test Suite

```
Test Files:  37
Total Tests:  539
Duration:    ~39s
Framework:   Vitest 4.x
```

### Test Categories

| Category | Files | Tests |
|----------|-------|-------|
| API Tests | 14 | ~120 |
| Unit Tests (lib) | 14 | ~180 |
| Unit Tests (store) | 1 | 11 |
| Unit Tests (hooks) | 1 | ~10 |
| E2E Tests | 1 | 5 |
| Component Tests | 2 | ~20 |
| Storage Type Tests | 1 | 17 |
| Integration Tests | 3 | ~176 |

### Running Tests

```bash
# Run all tests
bun run test

# Run with watch mode
bun run test:watch

# Run with coverage
bun run test:coverage

# Run specific test file
npx vitest run __tests__/api/health.test.ts
```

---

## 8. Performance

### Optimizations

- **82 panel components** lazy-loaded via `React.lazy()`
- **Turbopack** compilation (10x faster than Webpack)
- **Server Components** for non-interactive content
- **Standalone output** for minimal container size
- **Prisma** connection pooling with singleton client
- **Redis** caching for rate limiting and sessions
- **Sharp** for efficient image processing

### Bundle

- Standalone output: ~150MB (includes node_modules)
- Source code: ~4MB
- Docker image: ~500MB (based on node:22-alpine)

---

## 9. Monitoring

### Built-in Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/health` | Basic health check |
| `/api/health/deep` | Deep health check (DB, Redis, Qdrant) |
| `/api/infra/status` | Infrastructure service status |
| `/api/metrics` | Prometheus-compatible metrics |
| `/api/metrics/prometheus` | Prometheus scrape endpoint |
| `/api/audit-logs` | Comprehensive audit trail |
| `/api/alerts` | Alert management |
| `/api/logs` | Structured application logs |

### PM2 Monitoring

```bash
pm2 monit          # Real-time dashboard
pm2 logs agentos   # Tail logs
pm2 status         # Process status
```

---

## 10. Known Issues

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Dev server OOM in restricted environments | Development only | Use `NODE_OPTIONS='--max-old-space-size=512'` or Docker |
| SQLite concurrent write limit | High-write scenarios | SQLite handles ~100 writes/sec; use WAL mode (enabled by default) |
| Qdrant/Redis required for full features | Reduced functionality | Graceful degradation when services unavailable |
| OAuth providers require external configuration | OAuth won't work until configured | Configure via Auth Center panel or database |

---

## 11. Future Improvements

- [ ] PostgreSQL adapter for high-availability deployments
- [ ] Kubernetes Helm charts
- [ ] WebSocket-based real-time collaboration
- [ ] Advanced AI agent training pipeline
- [ ] Plugin marketplace for third-party integrations
- [ ] Mobile-responsive admin app
- [ ] Internationalization (i18n)
- [ ] Advanced analytics with Grafana dashboards
- [ ] Automated scaling based on queue depth
- [ ] End-to-end encryption for sensitive data

---

## 12. Validation Results

| Check | Result |
|-------|--------|
| TypeScript compilation | 0 errors |
| ESLint | 0 errors, 0 warnings |
| Prisma schema | Valid (122 models) |
| Prisma generate | Success |
| Prisma db push | Success |
| Tests | 539/539 passing (37 files) |
| Demo content | 0 instances |
| TODO/FIXME comments | 0 in source |
| Mock APIs | 0 instances |
| Production build | Success |

**Overall Status: PRODUCTION READY**