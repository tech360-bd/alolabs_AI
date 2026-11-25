# ALO API Gateway — `/api/v1` Integration Guide

> The single standard integration point for ALO projects (Hosting Portal, TECH360/BDTECH360, ALO Education, NRC, MarketingOS, authorised clients). Companion: `docs/architecture/CENTRAL_PLATFORM_AUDIT.md`.

## 1. Authentication

Two credential forms (verified in `src/lib/v1-auth.ts`):

| Form | Header | Notes |
|---|---|---|
| Session token | `Authorization: Bearer <session-token>` | Internal dashboard sessions |
| Company API key | `X-API-Key: alo_…` or `Authorization: Bearer alo_…` | Project credentials. sha256-hashed at rest, scoped, expirable, per-key rate limit, `lastUsedAt` tracking |

API keys are created per project/company (see `/api/api-keys`). Only companies classified `accountType: internal` may drive the AgentOS control plane; client keys are restricted to the `/api/v1/ai/**` service plane.

## 2. Scopes (RBAC)

Every API key is least-privilege. Scopes follow `resource:action` with actions `read`, `write`, `execute`, derived automatically from path + method:

- `GET /api/v1/knowledge` → requires `knowledge:read`
- `POST /api/v1/knowledge` → requires `knowledge:write`
- `POST /api/v1/models/inference` → requires `models:execute` (inference paths are execute-class)
- `/api/v1/ai/**` uses documented `ai:<service>` scopes instead.

Scope parsing fails closed: malformed scope JSON grants nothing.

## 3. Rate limiting & idempotency

- Mutating/expensive routes call the shared limiter (Redis sliding window, in-memory fallback). Exceeding it returns `429 { error: { code: "RATE_LIMITED" } }`.
- AI inference accepts a caller `idempotencyKey`; duplicate submissions of the same key (per company, exact request hash) return `409 DUPLICATE_AI_REQUEST` instead of re-executing.

## 4. Core endpoint reference (new in this PR)

### 4.1 `GET /api/v1/knowledge`
List/search the caller company's knowledge-graph nodes.
Query: `q` (substring over title+content), `type` (concept|entity|process|rule|skill|tool|document|person|department), `domain`, `limit` (≤200), `offset`.
Response: `{ success, data: { nodes: [{nodeId,title,type,domain,content,confidence,source,version,updatedAt}], limit, offset, hasMore } }`. Cross-tenant rows are never returned.

### 4.2 `POST /api/v1/knowledge`
Create a node in the caller's graph. Body: `{ title, type, content?, domain?, departmentId?, metadata?, confidence? (0–1), source? }`. The node is stamped with the authenticated `companyId`; response returns the generated `nodeId` (`kn_…`).

### 4.3 `POST /api/v1/models/inference`
Single-shot inference through the company AI gateway (routing profiles, budget guards, failover, metering — no direct provider access). Body:

```json
{
  "messages": [{ "role": "user", "content": "…" }],
  "profile": "free_general",
  "model": "optional-hint",
  "maxTokens": 1024,
  "idempotencyKey": "my-op-12345678",
  "agentId": "optional", "taskId": "optional"
}
```

Profiles (policy-bound, `src/lib/multi-tenant-ai/policy.ts`): `local_fast`, `local_general`, `free_general`, `free_coding`, `free_reasoning`, `free_vision`, `free_embeddings`, `free_translation`, `approved_paid` (paid execution requires explicit authorization at the policy layer — never silently charged).

Response: `{ requestId, provider, profile, content, model, finishReason, usage: {promptTokens, completionTokens, totalTokens}, usageSource, latencyMs, estimatedCostUsd, attempts, fallbackUsed }`.

Errors: `400 VALIDATION_ERROR` · `401` unauthenticated · `403` scope/tier · `402/409/503` mapped from `CompanyAIError` (budget, duplicate, unavailable). **The platform continues safely when local models are unavailable — failures are returned honestly, never fabricated.**

### 4.4 `GET /api/v1/analytics`
Usage analytics for the caller company: query `days` (1–90, default 30), `model` (optional filter). Response: `{ windowDays, totals: {requests, promptTokens, completionTokens, totalTokens, costEstimate}, byModel: […sorted by tokens], byDay: [{date, requests, totalTokens, costEstimate}] }`. Only the authenticated tenant's rows are aggregated.

## 5. Pre-existing endpoint groups (unchanged)

`/api/v1/agents` (+`/execute`, `/{id}`, `/{id}/run`) · `/api/v1/tasks` (+`/{id}`) · `/api/v1/runs` (+`/{id}`) · `/api/v1/events` · `/api/v1/memory` · `/api/v1/skills` · `/api/v1/tools` · `/api/v1/workflows` (+`/{id}/run`) · `/api/v1/models` · `/api/v1/providers` (+`/{id}`, `/{id}/test`, `/decisions`) · `/api/v1/approvals` (+`/{id}`) · `/api/v1/artifacts` (+`/{id}`) · `/api/v1/projects` (+`/{id}`, `/{id}/discover`) · `/api/v1/command` · `/api/v1/health` · `/api/v1/ai/{capabilities,health,tasks,usage}` · `/api/v1/crm/{connections/verify,followup-drafts,preflight}` · `/api/v1/voice/{agents,agents/{id}/versions,calls,calls/{id},calls/{id}/end,calls/{id}/transfer,calls/inbound,campaigns,campaigns/{id}/actions,analytics,billing,health}`.

## 6. Isolation rules for connected projects

1. Never expose internal model servers or database connections — projects call only `/api/v1/*`.
2. Every project gets its own API key with only the scopes its use-case needs (e.g. NRC: `knowledge:read`, `ai:chat`, voice agent scopes; TECH360: agent execution + coding scopes).
3. All reads/writes predicate on the authenticated `companyId` server-side; a guessed id cannot cross tenants.
4. Usage is metered per company (`TokenUsage`), visible to the project via `/api/v1/analytics` and internally via `/api/v1/ai/usage`.

## 7. Known gaps (tracked in the audit, §7)

Signed webhooks (G2), generic idempotency middleware for all mutating routes (G3), literal `/api/v1/voice/outbound` (G8). Do not assume they exist yet.
