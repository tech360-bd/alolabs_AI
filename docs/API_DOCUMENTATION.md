# AgentOS API v1 (experimental)

Base: `/api/v1`. JSON responses: `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": "...", "message": "..." } }`. All routes except `/api/v1/health` require `Authorization: Bearer <session-or-alo_-key>` or `X-API-Key: <alo_-key>`. API keys are SHA-256-hashed in `CompanyApiKey`, tenant-bound, scoped, revocable and expirable. Scope names: `<resource>:read`, `<resource>:write`, `<resource>:execute` (`command` uses `runs:execute`); wildcard `*` is supported. A malformed scope list grants nothing. Session users require active company membership.

## Main routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Public DB/router/queue check; 503 when degraded |
| POST | `/command` | Submit objective, returns `202` `{runId, eventsUrl, detailUrl}` |
| GET/POST | `/runs` | List tenant runs / enqueue a new run (`202`) |
| GET/DELETE | `/runs/:id` | Detail / cancel |
| GET/POST | `/projects` | List / create |
| GET | `/projects/:id` | Project detail |
| GET/POST | `/agents` | Tenant agents / register agent (builder/versioning partial) |
| GET | `/agents/:id` | Agent detail |
| POST | `/agents/:id/run` | Synchronous single-agent execution (not an AgentOS job) |
| GET/POST | `/skills` | Tenant skills / register skill (approval policy partial) |
| GET | `/tools` | Observed tenant-agent ToolRun summary |
| GET | `/models` | Catalog + provider health (catalog ≠ connected) |
| GET/POST | `/workflows` | Tenant workflows / create |
| POST | `/workflows/:id/run` | Enqueue persisted workflow (`202`) |
| GET | `/tasks`, `/tasks/:id` | Session-user task history (API keys denied on unscoped legacy tasks) |
| GET/POST | `/memory` | Tenant agent memory (write permissions scoped) |
| GET/POST | `/artifacts` | Tenant artifacts / create |
| GET/DELETE | `/artifacts/:id` | Artifact detail / delete |
| GET | `/approvals`, `/approvals/:id` | Tenant approvals |
| POST | `/approvals/:id` | Session-admin approve/reject; approval **does not resume** a paused run |
| GET | `/events` | Tenant run events; `runId` filter checked against company |

Unversioned AgentOS routes remain available for the web UI: `POST /api/runs`, `GET /api/runs/:id`, `DELETE /api/runs/:id`, `GET /api/runs/:id/events` (authenticated SSE), `/api/projects`, `/api/artifacts` and authenticated `/api/artifacts/:id/download` (SHA-256 checksum header). `POST /api/workflows/:id/run` enqueues a workflow. Pagination uses `page`/`limit` for unversioned list routes, `offset`/`limit` for v1 routes.

## Example

```bash
curl -X POST "$BASE/api/v1/command" \
  -H "Authorization: Bearer $SESSION" \
  -H 'Content-Type: application/json' \
  -d '{"objective":"Research UK universities and produce a cited summary"}'
```

The provider-dependent execution fails with `Configuration required` when no model provider is configured; a queued `202` only means the job was accepted, not that it succeeded.
