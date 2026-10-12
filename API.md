# ALO Labs AIOS — REST API Reference

## Base URL

```
https://your-domain.com/api
```

All endpoints are relative to `/api`. The platform exposes 251 REST endpoints organized into functional groups.

---

## Authentication

All protected endpoints require a **Bearer token** in the `Authorization` header:

```http
Authorization: Bearer <96-character-hex-token>
```

Tokens are obtained via `/api/auth/login` or `/api/auth/sso`. Sessions expire after 24 hours of inactivity (configurable, max 7 days absolute).

### Authentication Flow

```
POST /api/auth/login
  → { email, password }
  ← { token, user, requiresMfa: false }

  If MFA enabled:
  ← { tempToken, requiresMfa: true }

POST /api/auth/mfa/verify
  → { tempToken, code }
  ← { token, user }
```

### Response Format

All endpoints return JSON. Successful responses follow this structure:

```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

Error responses:

```json
{
  "error": "Unauthorized: missing token"
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Internal server error |

---

## Rate Limiting

Sliding window rate limiting is applied per-endpoint. Redis-backed with in-memory fallback.

| Endpoint | Limit | Window | Lockout |
|----------|-------|--------|---------|
| `POST /api/auth/login` | 5 req | 1 min | 5 failures → 15 min lockout |
| `POST /api/auth/mfa/verify` | 5 req | 1 min | 5 failures → 15 min lockout |
| `POST /api/auth/mfa/resend` | 3 req | 1 min | — |
| `POST /api/auth/sso` | 10 req | 1 min | — |
| `POST /api/backups/create` | 5 req | 5 min | — |
| `POST /api/db/migrate` | 2 req | 5 min | — |
| `POST /api/db/restore` | 2 req | 5 min | — |
| `GET/POST /api/security/secrets` | 20 req | 1 min | — |
| `POST /api/super-admin` | 30 req | 1 min | — |
| All other endpoints | 100 req | 1 min | — |

Rate limit headers are included in responses:

```http
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700000000
```

---

## Pagination

List endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number (min: 1) |
| `limit` | int | 50 | Items per page (1–100) |
| `search` | string | — | Full-text search filter |

---

## Endpoint Reference

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | Email/password login | No |
| POST | `/api/auth/logout` | Invalidate session | Yes |
| GET | `/api/auth/me` | Get current user info | Yes |
| POST | `/api/auth/mfa/setup` | Enable TOTP MFA | Yes |
| POST | `/api/auth/mfa/verify` | Verify TOTP code | Temp token |
| POST | `/api/auth/mfa/resend` | Resend MFA challenge | Temp token |
| POST | `/api/auth/mfa/disable` | Disable MFA | Yes |
| POST | `/api/auth/sso` | SSO login | No |
| GET | `/api/auth/oauth/providers` | List OAuth providers | No |
| GET/POST | `/api/auth/oauth/[provider]` | OAuth callback | No |
| GET | `/api/auth/sessions` | List active sessions | Yes |
| POST | `/api/auth/sessions/cleanup` | Clean expired sessions | Yes |

**POST /api/auth/login**

```json
// Request
{ "email": "admin@alolabs.com", "password": "***" }

// Response (no MFA)
{ "token": "a1b2c3...", "user": { "id": "...", "name": "Admin", "email": "admin@alolabs.com", "role": "super_admin" }, "requiresMfa": false }

// Response (MFA required)
{ "tempToken": "t1m2p3...", "requiresMfa": true }
```

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents (search, filter by department/role/status) |
| GET | `/api/agents/[id]` | Get agent details |
| GET | `/api/agents/registry` | Full agent registry with capabilities |
| POST | `/api/agent-runtime/execute` | Execute an agent task |
| GET | `/api/agent-runtime/status` | Agent runtime system status |
| GET | `/api/agent-runtime/health` | Agent health overview |
| GET | `/api/agent-versions` | List agent version history |
| GET | `/api/agent-performance` | Performance metrics per agent |
| GET | `/api/agent-status-history` | Agent status change log |
| GET | `/api/agent-usage-summaries` | Usage aggregation per agent |
| GET/POST | `/api/agent-permissions` | Manage agent permissions |
| GET/POST | `/api/agent-company-access` | Agent ↔ company access mappings |
| GET | `/api/agent-memory` | Agent memory entries |
| POST | `/api/agent-factory/build` | Build/create a new agent |
| GET | `/api/agent-runs/[taskId]` | Agent run details |
| GET | `/api/agent-stability/health` | Agent stability metrics |

**GET /api/agents**

Query parameters: `search`, `department` (slug), `role`, `status`, `page`, `limit`

```json
{
  "data": [
    {
      "id": "clx...",
      "agentId": "AGENT-0001",
      "name": "Research Analyst",
      "slug": "research-analyst",
      "departmentName": "Research & Development",
      "role": "specialist",
      "status": "active",
      "version": 3,
      "purpose": "Conducts deep research and analysis"
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills` | List skills (filter by category, status, risk) |
| GET | `/api/skills/[id]` | Get skill details |
| GET | `/api/skills/registry` | Full skill registry |
| POST | `/api/skill-factory/build` | Build/create a new skill |
| GET | `/api/skill-versions` | Skill version history |
| GET | `/api/skill-permissions` | Skill permissions |
| GET | `/api/skill-validation-logs` | Skill validation audit trail |
| GET | `/api/skill-runs/[taskId]` | Skill run details |

### Workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List workflows |
| GET | `/api/workflows/[id]` | Get workflow details |
| POST | `/api/workflow-factory/build` | Build a new workflow |
| GET | `/api/workflow-steps` | List workflow steps |
| GET | `/api/workflow-usage-summaries` | Workflow usage stats |
| GET | `/api/workflow-improvements` | Improvement suggestions |
| GET | `/api/automation/triggers` | List automation triggers |
| POST | `/api/automation/triggers` | Create trigger |
| GET/PUT | `/api/automation/triggers/[id]` | Get/update trigger |
| POST | `/api/automation/triggers/[id]/toggle` | Enable/disable trigger |
| POST | `/api/automation/execute` | Execute automation manually |
| GET | `/api/automation/logs` | Automation execution logs |

### Tasks & Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks |
| GET/PUT/DELETE | `/api/tasks/[id]` | Task CRUD |
| GET | `/api/task-steps/[taskId]` | Task execution steps |
| GET | `/api/task-errors` | Task error log |
| GET | `/api/outputs` | List all outputs |
| GET | `/api/outputs/[taskId]` | Outputs for a specific task |
| GET | `/api/commands` | Command history |
| POST | `/api/company/command` | Issue company-scoped command |

### CRM

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/crm/contacts` | List contacts |
| GET/PUT/DELETE | `/api/crm/contacts/[id]` | Contact CRUD |
| GET | `/api/crm/deals` | List deals |
| GET/PUT/DELETE | `/api/crm/deals/[id]` | Deal CRUD |
| GET | `/api/crm/pipelines` | List pipelines |
| GET | `/api/crm/activities` | Activity log |
| GET | `/api/crm/notes` | CRM notes |
| GET | `/api/crm/lead-score` | Lead scoring data |
| GET | `/api/crm-connections` | CRM integration connections |
| GET | `/api/funnels` | Sales funnel data |

### Billing & Subscriptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/plans` | List subscription plans |
| GET | `/api/billing/subscriptions` | List subscriptions |
| GET/PUT | `/api/billing/subscriptions/[id]` | Subscription details |
| GET | `/api/billing/invoices` | Invoice history |
| GET | `/api/billing/payments` | Payment history |
| GET | `/api/cost-estimate` | Estimate costs for operations |
| GET | `/api/cost-estimates/[id]` | Cost estimate details |
| GET | `/api/token-budget` | Token budget overview |
| GET | `/api/token-usage` | Token usage log |
| GET | `/api/payment-guard` | Payment guard status |
| GET | `/api/payment-guard/report` | Payment guard report |

### RAG (Retrieval-Augmented Generation)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rag/collections` | List RAG collections |
| GET | `/api/rag/documents` | List documents |
| GET/PUT/DELETE | `/api/rag/documents/[id]` | Document management |
| POST | `/api/rag/ingest` | Ingest a document into RAG |
| POST | `/api/rag/query` | Query the RAG engine |
| GET | `/api/rag/search` | Vector similarity search |
| GET | `/api/rag/chunks/[id]` | Get specific chunk |
| GET | `/api/rag/engine-stats` | RAG engine statistics |
| GET | `/api/rag/logs` | RAG query log |
| POST | `/api/rag/feedback` | Submit RAG feedback |

### LLM & AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/llm/models` | List available LLM models |
| POST | `/api/llm/route` | Route a request to best LLM |
| POST | `/api/llm/stream` | Streaming LLM completion |
| GET | `/api/models` | Model registry |
| GET | `/api/model-hub` | Model hub / marketplace |
| GET | `/api/model-health` | Model health status |
| GET | `/api/model-assignments` | Model-to-agent assignments |
| POST | `/api/super-chat` | Super admin chat interface |

### Multi-Tenant / Company

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List companies |
| GET/PUT/DELETE | `/api/companies/[id]` | Company CRUD |
| GET | `/api/company-access` | Company access control list |
| GET | `/api/company/usage` | Company usage stats |
| GET | `/api/company/agents/allowed` | Allowed agents per company |
| GET | `/api/company/workflows/allowed` | Allowed workflows per company |
| GET | `/api/company/tasks` | Company-scoped tasks |
| GET | `/api/company-memory` | Company memory store |
| GET | `/api/company-usage-summaries` | Aggregated usage |
| GET | `/api/tenant-gateway` | Tenant gateway status |
| GET | `/api/tenant-gateway/logs` | Tenant gateway logs |
| GET | `/api/tenant-gateway/distribution` | Request distribution |
| GET | `/api/tenant-admin/config` | Tenant configuration |
| GET | `/api/tenant-admin/quotas` | Tenant quota management |
| GET | `/api/tenant-admin/users` | Tenant user management |

### Users, Roles & Permissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| GET/PUT/DELETE | `/api/users/[id]` | User CRUD |
| POST | `/api/users/invite` | Invite a new user |
| GET | `/api/roles` | List roles |
| GET | `/api/departments` | List departments |
| GET/PUT/DELETE | `/api/departments/[id]` | Department CRUD |

### Approvals & Protection

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/approvals` | List approval requests |
| POST | `/api/approval-engine` | Submit approval decision |
| GET | `/api/tool-approvals` | Tool approval requests |
| GET | `/api/capability/requests` | New capability requests |
| POST | `/api/capability/request` | Request new capability |
| GET | `/api/protection` | Protection rules status |
| POST | `/api/protection/evaluate` | Evaluate action against rules |
| GET | `/api/protection/logs` | Protection action log |
| GET | `/api/protection/report` | Protection summary report |

### Job Queues

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queues` | List job queues |
| GET | `/api/queues/[id]/items` | List queue items |
| GET/PUT/DELETE | `/api/queues/[id]/items/[itemId]` | Queue item management |
| POST | `/api/queues/[id]/process` | Process queue items |
| GET | `/api/queues/dead-letter` | Dead letter queue |
| GET | `/api/jobs` | List jobs |
| GET | `/api/jobs/[id]` | Job details |
| GET | `/api/jobs/stats` | Job statistics |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/webhooks` | List/create webhooks |
| GET/PUT/DELETE | `/api/webhooks/[id]` | Webhook CRUD |
| GET | `/api/webhooks/deliveries` | Webhook delivery log |

### Storage & Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/storage/files` | List stored files |
| GET | `/api/storage/cdn` | CDN URL generation |
| POST | `/api/uploads` | File upload |
| GET | `/api/media` | Media library |
| GET | `/api/media/folders` | Media folders |
| POST | `/api/media/ai-tag` | AI-powered media tagging |

### Notifications & Communication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/read` | Mark as read |
| GET | `/api/alerts` | Active alerts |
| GET | `/api/meetings` | Meeting list |
| GET | `/api/sms` | SMS status |
| POST | `/api/sms/campaigns` | SMS campaigns |
| GET | `/api/whatsapp/numbers` | WhatsApp numbers |
| POST | `/api/whatsapp/send` | Send WhatsApp message |
| GET | `/api/whatsapp/campaigns` | WhatsApp campaigns |
| POST | `/api/whatsapp/webhook` | WhatsApp webhook handler |
| GET | `/api/email/inbox` | Email inbox |
| POST | `/api/email/send` | Send email |
| POST | `/api/email/reply` | Reply to email |
| GET | `/api/email/accounts` | Email accounts |
| GET | `/api/email/templates` | Email templates |
| POST | `/api/email/sync` | Sync email |

### Monitoring & Observability

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Basic health check |
| GET | `/api/health/deep` | Deep health check (DB, Redis, etc.) |
| GET | `/api/system-health` | System health overview |
| GET | `/api/infra/status` | Infrastructure service status |
| POST | `/api/infra/ping` | Ping a specific service |
| POST | `/api/infra/connect` | Test service connectivity |
| GET | `/api/infra/redis/keys` | Redis key inspection |
| GET | `/api/infra/postgres/query` | Postgres query (admin) |
| GET | `/api/infra/minio/objects` | MinIO object listing |
| GET | `/api/metrics` | Metrics overview |
| POST | `/api/metrics/collect` | Collect metrics |
| GET | `/api/metrics/prometheus` | Prometheus-formatted metrics |
| GET | `/api/observability/dashboard` | Observability dashboard data |
| GET | `/api/logs` | System logs |
| GET | `/api/audit-logs` | Audit trail |
| GET | `/api/security-events` | Security event log |

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Overview statistics |
| GET | `/api/dashboard/usage` | Usage dashboard data |
| GET | `/api/dashboard/cost` | Cost dashboard data |
| GET | `/api/dashboard/security` | Security dashboard data |
| GET | `/api/dashboard/super-admin` | Super admin dashboard |

### Administration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/super-admin` | Super admin commands |
| GET | `/api/settings` | System settings |
| GET | `/api/feature-flags` | Feature flag management |
| GET | `/api/security/secrets` | Secret management |
| GET | `/api/security/session` | Session security info |
| POST | `/api/emergency` | Emergency controls |
| POST | `/api/emergency/action` | Execute emergency action |
| GET | `/api/disaster-recovery` | Disaster recovery status |
| POST | `/api/backups/create` | Create database backup |
| POST | `/api/backups/restore` | Restore from backup |
| GET | `/api/backups` | List backups |
| POST | `/api/db/migrate` | Run database migration |
| POST | `/api/db/restore` | Restore database |
| GET | `/api/db/backup` | Database backup status |
| GET | `/api/cron` | Cron job status |

### Social Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/social/accounts` | Connected social accounts |
| POST | `/api/social/publish` | Publish to social platforms |
| GET | `/api/social/analytics` | Social media analytics |
| GET/POST | `/api/social/oauth/[provider]` | Social OAuth callback |
| POST | `/api/social/webhooks/[platform]` | Social platform webhooks |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory` | Memory store |
| GET/PUT/DELETE | `/api/memory/[id]` | Memory entry management |
| GET | `/api/prompts` | Prompt library |
| GET/PUT/DELETE | `/api/prompts/[id]` | Prompt management |
| GET | `/api/tools` | Tool registry |
| GET | `/api/tool-runs` | Tool execution log |
| GET | `/api/integrations` | Integration registry |
| GET | `/api/mcp-servers` | MCP server management |
| GET | `/api/gpu-monitor` | GPU monitoring data |
| GET | `/api/workers` | Worker node list |
| POST | `/api/workers/action` | Worker control actions |
| GET | `/api/brands` | Brand management |
| GET | `/api/sister-companies` | Sister company registry |
| GET | `/api/deploy` | Deployment management |
| GET | `/api/documents` | Document system |
| GET | `/api/research-hub` | Research hub data |
| GET | `/api/education-hub` | Education hub data |
| GET | `/api/interview-hub` | Interview hub data |
| GET | `/api/video-hub` | Video hub data |
| GET | `/api/voice-system` | Voice system status |
| GET | `/api/seo` | SEO data |
| GET | `/api/seo/challenges` | SEO challenges |
| GET | `/api/analytics` | Platform analytics |
| GET | `/api/usage` | Usage statistics |
| GET | `/api/usage/agents` | Per-agent usage |
| GET | `/api/usage/workflows` | Per-workflow usage |
| GET | `/api/usage/check` | Usage limit check |
| GET | `/api/feedback` | User feedback log |
| GET | `/api/evaluations` | Quality evaluations |
| GET | `/api/quality` | Quality metrics |
| GET | `/api/productivity` | Productivity metrics |
| GET | `/api/productivity/report` | Productivity report |
| GET | `/api/self-improvement` | Self-improvement status |
| GET | `/api/self-improvement/report` | Self-improvement report |
| GET | `/api/training` | Agent training data |
| GET | `/api/automation-suggestions` | Automation suggestions |
| GET | `/api/incidents` | Incident list |
| GET/PUT | `/api/incidents/[id]` | Incident management |
| GET | `/api/tickets` | Support tickets |
| GET/PUT | `/api/tickets/[id]` | Ticket management |
| GET | `/api/marketplace` | Skill/agent marketplace |
| GET/PUT/DELETE | `/api/marketplace/[id]` | Marketplace listing |
| POST | `/api/marketplace/[id]/install` | Install from marketplace |
| GET | `/api/marketplace/[id]/reviews` | Marketplace reviews |
| GET | `/api/api-keys` | API key management |
| GET/PUT/DELETE | `/api/api-keys/[id]` | API key CRUD |
| GET | `/api/api-management` | API management dashboard |
| GET | `/api/gateway/sign` | Generate signed URL |
| GET | `/api/gateway/verify` | Verify signed URL |
| POST | `/api/workflow-factory/build` | Build workflow via factory |
| GET | `/api/sop-updates` | SOP update log |
| GET | `/api/notifications` | Notification list |
| POST | `/api/notifications/read` | Mark notification read |
| GET | `/api/departments` | Department list |
| GET/PUT | `/api/departments/[id]` | Department CRUD |
| GET | `/api/department-memory` | Department memory |
| GET | `/api/role-management` | Role management |
| GET | `/api/learning-reports` | Learning reports |
| POST | `/api/llm/stream` | LLM streaming endpoint |

---

## API Key Authentication (External)

For programmatic access, companies can create API keys with scoped permissions.

```http
Authorization: Bearer <company-api-key>
```

API key types:

| Type | Use Case |
|------|----------|
| `live` | Production API access |
| `test` | Sandbox/testing |
| `restricted` | Limited scope access |
| `service` | Service-to-service |
| `webhook` | Incoming webhook verification |

API keys support:
- Per-key rate limits (`rateLimit` field, requests per minute)
- IP allowlists (`ipAllowlist` JSON array)
- Scope restrictions (`scopes` JSON array)
- Expiration (`expiresAt`)
- Key rotation (previous key hash retained for grace period)

---

## Signed URLs (Gateway)

Local storage files are served via HMAC-signed URLs to prevent unauthorized access.

**Generate**: `GET /api/gateway/sign?file=<path>&expiresIn=<seconds>`

**Verify**: `GET /api/gateway/verify?token=<signed-token>`
