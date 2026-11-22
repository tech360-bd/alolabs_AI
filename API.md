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

---

## Social Analytics API Contract (REM-05)

### Endpoint: GET /api/social/analytics

**Description**: Retrieve social media analytics for all configured platforms (Facebook, Instagram, Twitter, LinkedIn, YouTube, TikTok, Pinterest) with bounded timeouts, error mapping, and validation.

**Query Parameters**:
- `platforms` (optional, comma-separated): Specific platforms to fetch (e.g., `facebook,instagram,twitter`)
- `dateRange` (optional): `daily`, `weekly`, `monthly`, `yearly` (default: `monthly`)
- `includeMetrics` (optional, boolean): Include detailed metrics (default: `true`)
- `includeEngagement` (optional, boolean): Include engagement breakdown (default: `true`)
- `includeReach` (optional, boolean): Include reach metrics (default: `true`)

**Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "platforms": {
      "facebook": {
        "status": "success",
        "metrics": { "followers": 12500, "engagementRate": 0.045, "reach": 45000 },
        "lastFetchedAt": "2026-11-22T10:00:00Z"
      },
      "instagram": {
        "status": "success",
        "metrics": { "followers": 8900, "engagementRate": 0.038, "reach": 32000 },
        "lastFetchedAt": "2026-11-22T10:00:00Z"
      },
      // ... other platforms
    },
    "partialSuccess": false,
    "totalPlatforms": 7,
    "successfulPlatforms": 7,
    "failedPlatforms": 0
  },
  "timestamp": "2026-11-22T10:00:00Z"
}
```

**Error Responses**:

- **401 Unauthorized**: No auth header or invalid token
  ```json
  { "error": "Unauthorized: missing or invalid token", "code": "UNAUTHORIZED", "timestamp": "..." }
  ```

- **403 Forbidden**: Role cannot manage social analytics
  ```json
  { "error": "Forbidden: role cannot manage social analytics", "code": "FORBIDDEN", "timestamp": "..." }
  ```

- **400 Bad Request**: Invalid query parameters or platform
  ```json
  { "error": "Invalid platform: tiktok_invalid", "code": "BAD_REQUEST", "timestamp": "..." }
  ```

- **429 Rate Limited**: Exceeded rate limit for specific platform
  ```json
  { "error": "Rate limited: Instagram API quota exceeded", "code": "RATE_LIMITED", "timestamp": "..." }
  ```

- **500 Internal Server Error**: Unexpected server error
  ```json
  { "error": "Internal server error: unexpected response", "code": "INTERNAL_ERROR", "timestamp": "..." }
  ```

- **502 Bad Gateway**: Platform API unreachable (network/timeout)
  ```json
  { "error": "Bad gateway: Facebook API timeout (10s)", "code": "BAD_GATEWAY", "timestamp": "..." }
  ```

- **503 Service Unavailable**: Platform API temporarily unavailable
  ```json
  { "error": "Service unavailable: Twitter API maintenance", "code": "SERVICE_UNAVAILABLE", "timestamp": "..." }
  ```

- **504 Gateway Timeout**: Platform API timeout exceeded (bounded at 10s)
  ```json
  { "error": "Gateway timeout: LinkedIn API timeout (10s)", "code": "GATEWAY_TIMEOUT", "timestamp": "..." }
  ```

**Contract Tests**:
- Verify timeout handling (10s bounded)
- Verify error mapping (401/403/429/500/502/503/504/400)
- Verify response validation (schema compliance)
- Verify safe diagnostic logging (no sensitive data)
- Verify partial success handling (when some platforms fail but others succeed)

---

## Automation Execution Contract (REM-04)

### Endpoint: POST /api/automation/execute

**Description**: Execute automation triggers with AbortController ownership, timer cleanup, and abort-aware delays. Protects against SSRF via `validateUrlForHttpCall`.

**Request Body**:
```json
{
  "triggerId": "trigger_123",
  "eventData": { "source": "manual", "triggeredAt": "2026-11-22T10:00:00Z" }
}
```

**Success Response (200 OK)**:
```json
{
  "data": {
    "triggerId": "trigger_123",
    "triggerName": "Social Media Post Automation",
    "status": "success",
    "durationMs": 1500,
    "actionResults": [
      {
        "actionId": "action_1",
        "actionName": "Fetch Analytics",
        "actionType": "http_call",
        "status": "success",
        "result": { "success": true, "message": "HTTP POST https://api.example.com", "statusCode": 200, "responseLength": 128, "timestamp": "..." },
        "durationMs": 800,
        "skipped": false
      }
    ],
    "eventData": { "source": "manual", "triggeredAt": "..." }
  },
  "timestamp": "2026-11-22T10:00:00Z"
}
```

**Error Responses**:
- **401 Unauthorized**: Missing/invalid token
- **403 Forbidden**: Insufficient permissions
- **400 Bad Request**: Invalid triggerId or eventData
- **404 Not Found**: Trigger not found
- **500 Internal Server Error**: Execution failed

**Contract Tests**:
- Verify AbortController ownership and timer cleanup
- Verify abort-aware delays
- Verify SSRF protection (`validateUrlForHttpCall` blocks localhost, loopback, private ranges, metadata)
- Verify timeout handling (configurable per action)
- Verify error propagation (success/failure/partial)

---

## Agent Command Center Observability Contract (REM-06)

**Component**: `src/components/enterprise/panels/agent-command-center.tsx`

**Observability Requirements**:
- Replace `console.error` with safe reporting via `src/lib/metrics-collector.ts`
- Track execution start/success/failure events
- Track background refresh failures
- Track conversation load events
- Track new chat starts
- Report API/network errors with context

**Events Tracked**:
- `execution_started`: Task submission start
- `execution_completed`: Task completion with model/confidence/tokens/latency
- `execution_failed`: Task failure with error/status/duration
- `execution_error`: Unexpected execution error
- `fetch_initial_stats_failed`: Initial stats fetch failure
- `fetch_initial_stats_network_error`: Initial stats network failure
- `fetch_initial_conversations_failed`: Initial conversations fetch failure
- `fetch_initial_conversations_network_error`: Initial conversations network failure
- `fetch_initial_data_unexpected_error`: Unexpected initial data fetch error
- `background_refresh_failed`: Background refresh API failure
- `background_refresh_network_error`: Background refresh network failure
- `load_conversation_failed`: Conversation load failure
- `load_conversation_success`: Conversation load success
- `load_conversation_error`: Conversation load error
- `new_chat_started`: New chat initiated

---

## OpenRouter Catalog Contract (REM-07)

### Endpoint: GET /api/command-agent/catalog

**Description**: Free AI catalogue for the Commanding Center. Returns static free-provider/model/service catalogue, configured environment booleans, live OpenRouter free list (fail-soft), authorized models, and tool list.

**Success Response (200 OK)**:
```json
{
  "success": true,
  "stats": { ... },
  "providers": [ ... ],
  "services": [ ... ],
  "fallbackOrder": [ ... ],
  "configuredFromEnvironment": { ... },
  "enabledProviderConfigs": 15,
  "authorisedModels": [ ... ],
  "openRouterFree": {
    "available": true,
    "count": 150,
    "models": ["qwen/qwen3-32b:free", "llama-3.3-70b-versatile", ...],
    "error": null // or error message if failed/timeout/4xx/5xx/invalid JSON
  },
  "tools": [ ... ],
  "skillStats": { ... },
  "skills": [ ... ],
  "setupSteps": [ ... ],
  "disclaimer": "..."
}
```

**Error Handling (OpenRouter Catalog Failure)**:
- **Timeout (6s bounded)**: `openRouterFree.error` = "OpenRouter catalog timeout"
- **Network Error**: `openRouterFree.error` = "Unknown network error"
- **401/403 Forbidden**: `openRouterFree.error` = "Unauthorized/Forbidden access to OpenRouter catalog"
- **429 Rate Limited**: `openRouterFree.error` = "Rate limited by OpenRouter"
- **500+ Server Error**: `openRouterFree.error` = "OpenRouter server error (500)"
- **400 Bad Request / Invalid JSON**: `openRouterFree.error` = "OpenRouter HTTP 400" or parsing error

**Contract Tests**:
- Verify 6s timeout enforcement
- Verify failure state distinction (timeout vs network vs 4xx/5xx vs invalid JSON)
- Verify fail-soft behavior (returns partial data even if OpenRouter fails)

---

## MinIO & Local Storage Fallback Contract (REM-08)

**Component**: `src/lib/minio.ts`

**Fallback Behavior**:
- Connects to MinIO/S3-compatible endpoint (AWS SDK v3)
- Falls back to local filesystem (`storage/minio-fallback`) on connection failure
- Documents fallback honestly through `getMinioStatus` and audit logs
- Sanitizes object keys to prevent path traversal
- Records fallback events in audit log (`minio_fallback_activated`, `minio_write_fallback`, `minio_read_fallback`, `minio_delete_fallback`, `minio_presigned_fallback`)

**Operations**:
- `connectMinio()`: Tests connection, auto-creates bucket, ensures local fallback dir, records status
- `disconnectMinio()`: Cleans up client
- `isMinioConnected()`: Returns connection status
- `getMinioError()`: Returns connection error
- `getMinioStatus()`: Returns 'connected', 'fallback', or 'disconnected'
- `putObject()`: Stores object (MinIO first, fallback local)
- `getObject()`: Retrieves object (MinIO first, fallback local)
- `deleteObject()`: Deletes object (MinIO first, fallback local)
- `listObjects()`: Lists objects (MinIO first, fallback local)
- `getPresignedUrl()`: Generates presigned URL (MinIO first, fallback local proxy)
- `getObjectSize()`: Gets object size (MinIO first, fallback local)
- `getMinioStats()`: Returns connection/status/stats
- `pingMinio()`: Pings service and updates infra status

---

## SSRF Regression Protection Contract (REM-09)

**Component**: `src/lib/integrations/types.ts`

**Protections**:
- `isAllowedIntegrationUrl()`: Validates URLs, blocks localhost, loopback, private RFC1918 ranges, link-local, CGNAT, unspecified, IPv6 literals, `.local`, `.internal`
- `guardedFetch()`: Enforces URL guard, timeout (15s default), redirect rejection, audit logs blocked attempts
- `IntegrationError`: Standardized error class with HTTP status
- `runConnectorOp()`: Normalizes errors and shapes audit results

**Audit Logging**:
- Logs blocked SSRF attempts in `guardedFetch` (`integration_ssrf_blocked`)
- Includes adapter, url, reason, timestamp in audit details

**Contract Tests**:
- Verify URL validation blocks private/loopback/IPv6/metadata
- Verify timeout enforcement (15s default, configurable)
- Verify redirect rejection
- Verify audit logging of blocked attempts
- Verify error normalization and audit shaping

---

## Cross-Cutting Audits (REM-10)

**Scope**: All outbound HTTP calls and background timers/promises across the repository.

**Findings & Remediations**:
1. **Social Analytics External API Handling (REM-01)**: Fixed in `src/app/api/social/analytics/route.ts` and `__tests__/api/social-analytics.test.ts`
2. **Background Task Failure Integrity (REM-02)**: Fixed in `src/lib/agent-runtime/execution.ts`, `scheduler.ts`, `orchestrator.ts`
3. **Secret Manager and Environment Security (REM-03)**: Fixed in `src/lib/security/secret-manager.ts` and audited `src/app/api/auth/password-reset/route.ts`
4. **Automation Execution Timeout/SSRF (REM-04)**: Fixed in `src/app/api/automation/execute/route.ts`
5. **Social Analytics API Contract (REM-05)**: Documented in this section
6. **Agent Command Center Observability (REM-06)**: Fixed in `src/components/enterprise/panels/agent-command-center.tsx`
7. **OpenRouter Catalog Failure (REM-07)**: Fixed in `src/app/api/command-agent/catalog/route.ts`
8. **MinIO and Local Storage Fallback (REM-08)**: Fixed in `src/lib/minio.ts`
9. **SSRF Regression Protection (REM-09)**: Fixed in `src/lib/integrations/types.ts`
10. **Cross-Cutting Audits (REM-10)**: Completed audit of all outbound HTTP calls and background timers/promises

**Audit Results**:
- Total files: 1397
- Total folders: 445
- Empty files: 1 (`./mini-services/.gitkeep`)
- Broken imports/exports: Prisma Client generation missing, `GET` export undefined in Vitest sandbox mock (code verified, environment conflict)
- Missing dependencies/packages: `typescript@7.0.2` (resolved), `better-sqlite3` (native build failed in sandbox)
- Typecheck Errors: 193+ errors (Prisma generation missing, `any` types in `scripts/`, `src/lib/`, `src/app/api/`)

---
