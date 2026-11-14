# ALO Labs API — `/v1/ai` Developer Guide

The `/api/v1/ai/**` surface is the public AI platform API for external clients.
Every request is authenticated with an organization-scoped API key, every task is
executed asynchronously on the durable run pipeline, and all usage is metered per
organization with quotas and idempotency support.

> **Tenant isolation.** Every query on this surface is scoped to the
> `companyId` that owns the API key. Organizations see only their own tasks,
> usage, entitlements, and results. ALO Education, TECH360, and any other
> organization have fully independent credentials, data, and usage records.

---

## Base URL

```
https://alolabs.net/api/v1/ai
```

## Authentication

Send your organization API key in the `Authorization` header:

```
Authorization: Bearer <your-api-key>
```

`ApiKey <your-api-key>` is also accepted. Keys are issued per organization by
administrators (portal → API keys), carry an explicit scope list, and a per-key
rate limit. Keys are stored server-side as SHA-256 hashes — treat them like
passwords and rotate them from the portal if one is ever exposed.

Requests without a valid key receive:

```json
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

---

## Services

The platform currently exposes these services (verify the live catalog via
`GET /api/v1/ai/capabilities`):

| Service slug | Purpose | Scope |
|---|---|---|
| `ai-chat` | Conversational AI chat | `ai:chat` |
| `ai-knowledge-search` | Hybrid RAG over your authorized knowledge base | `ai:knowledge:search` |
| `ai-tasks` | General asynchronous AI task execution | `ai:tasks` |
| `ai-content` | Content generation from specifications | `ai:content` |
| `ai-analysis` | Data analysis and insights | `ai:analysis` |
| `ai-research` | Background web research & retrieval with source citations | `ai:research` |

A task on a service your organization is not entitled to returns
`403 FORBIDDEN`. Entitlements (status, quota limit/used, expiry) are granted
per organization and are visible in `GET /api/v1/ai/usage` and in each
capability entry of `GET /api/v1/ai/capabilities`.

---

## 1. Submit a task — `POST /api/v1/ai/tasks`

Tasks run **asynchronously**: submission durably enqueues a run and returns
immediately with status `pending`.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `service` | string | no | One of the service slugs. Default: `ai-tasks` |
| `input` | object | no | Free-form service input. Default `{}` |
| `priority` | string | no | `low` \| `normal` \| `high`. Default: `normal` |
| `idempotency_key` | string | no | 1–128 chars. Makes retries safe |

### Example — background web research with citations

```bash
curl -sX POST https://alolabs.net/api/v1/ai/tasks \
  -H "Authorization: Bearer $ALO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "ai-research",
    "input": {
      "query": "Competitive landscape for private AI gateways in South Asia",
      "max_sources": 8
    },
    "idempotency_key": "research-2026-11-14-landscape"
  }'
```

### Response — `202`-style accepted contract

```json
{
  "success": true,
  "task_id": "b7e2...",          // opaque identifier — never an internal run id
  "service": "ai-research",
  "status": "pending",           // never "completed" for an unexecuted task
  "request_id": "req-...",       // include when contacting support
  "usage": { "units": 1 }
}
```

### Idempotency behavior

- First submission with a given `(organization, idempotency_key)` creates the task.
- Retrying with the **same key and same body** returns the original task.
- Same key with a **different body** → `409` conflict.
- Keys are unique per organization — different organizations may reuse a key value.

---

## 2. Poll task status / fetch result — `GET /api/v1/ai/tasks/{task_id}`

```bash
curl -s https://alolabs.net/api/v1/ai/tasks/b7e2... \
  -H "Authorization: Bearer $ALO_API_KEY"
```

```json
{
  "success": true,
  "task_id": "b7e2...",
  "service": "ai-research",
  "status": "completed",           // pending | running | completed | failed | cancelled
  "result": {
    "summary": "Task completed.",
    "answer": "Synthesized answer text...",
    "citations": [
      { "title": "Example Source", "url": "https://example.com/src", "snippet": "Relevant excerpt." }
    ]
  },
  "usage": { "units": 3 },
  "created_at": "2026-11-14T00:00:00Z",
  "completed_at": "2026-11-14T00:02:00Z"
}
```

The public result is **redacted**: internal agent, model, and run identifiers are
stripped by the platform before delivery. Research artifacts that are part of
your output — such as `answer` and `citations` — are preserved. Tasks of other
organizations return `404 NOT_FOUND` even if you know their task id.

## 3. Task history — `GET /api/v1/ai/tasks`

```bash
curl -s "https://alolabs.net/api/v1/ai/tasks?limit=20&offset=0" \
  -H "Authorization: Bearer $ALO_API_KEY"
```

```json
{
  "success": true,
  "tasks": [
    { "task_id": "b7e2...", "service": "ai-research", "status": "completed",
      "created_at": "2026-11-14T00:00:00Z", "completed_at": "2026-11-14T00:02:00Z" }
  ],
  "limit": 20,
  "offset": 0,
  "has_more": false
}
```

Pagination: `limit` (1–100, default 20), `offset` (default 0), newest first.

## 4. Usage & quotas — `GET /api/v1/ai/usage`

```bash
curl -s https://alolabs.net/api/v1/ai/usage -H "Authorization: Bearer $ALO_API_KEY"
```

Returns your organization's entitlements: per-service `status`, `quota_limit`,
`quota_used`, `quota_period`, and `expires_at`. Units are metered usage units,
never raw model token counts (those are internal).

## 5. Service catalog — `GET /api/v1/ai/capabilities`

Returns every active service with `slug`, `name`, `description`, `category`,
`endpoint`, `scope_required`, and your organization's entitlement for it
(`null` when not entitled). Use this instead of hard-coding service slugs.

## 6. Health — `GET /api/v1/ai/health`

Unauthenticated liveness probe for the AI surface (publicly allowlisted for
load balancers / uptime monitors).

---

## Error contract

All errors share one shape:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

| HTTP | `code` | Typical cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed body, unknown `service`, bad `priority` |
| 401 | `UNAUTHORIZED` | Missing/invalid API key |
| 403 | `FORBIDDEN` | Key lacks the required scope, or no active entitlement/quota exhausted |
| 404 | `NOT_FOUND` | Unknown task id (or another organization's task) |
| 409 | `IDEMPOTENCY_CONFLICT` | Same `idempotency_key`, different request body |
| 429 | — | Per-key rate limit exceeded (see your key's limit) |
| 500 | `INTERNAL_ERROR` | Unexpected server error (correlate via `request_id`) |

Timeouts/retries: submission is durable — retry with the same
`idempotency_key` after network failures; you will receive the original task
rather than a duplicate.

---

## Quickstart (Node.js)

```js
const BASE = 'https://alolabs.net/api/v1/ai';
const KEY = process.env.ALO_API_KEY;

async function research(query) {
  // 1. Submit
  const submit = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'ai-research', input: { query } }),
  }).then((r) => r.json());
  if (!submit.success) throw new Error(`${submit.error?.code}: ${submit.error?.message}`);

  // 2. Poll until terminal status
  let task;
  do {
    await new Promise((r) => setTimeout(r, 3000));
    task = await fetch(`${BASE}/tasks/${submit.task_id}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    }).then((r) => r.json());
  } while (['pending', 'running'].includes(task.status));

  // 3. Result (citations included for ai-research)
  return task.result;
}
```
