# AgentOS — CRM Connector Implementation

Date: 2026-11-19 · Status: IMPLEMENTED + TESTED against a local contract server; real staging CRM BLOCKED.

## 1. What "connect a URL and an API key" now means

A URL and a key are **not** enough. The target must expose a compatible read-only API and the
credential must carry the required permission. AgentOS does not scrape arbitrary websites, and it
does not claim universal compatibility. For a site with no API, browser automation would be a
separate, explicitly authorised capability (not implemented here).

Supported contract — **ALO Lead API v1**:

```
GET {baseUrl}/api/v1/capabilities
Authorization: Bearer <key>
→ 200 {"service":"alo-education-staging","apiVersion":"1","permissions":["leads:read"]}

GET {baseUrl}/api/v1/leads?limit=5&sort=-createdAt
Authorization: Bearer <key>
→ 200 {"data":[{"id":"lead-123","name":"…","email":"…","phone":"…","stage":"new",
                "notes":"…","createdAt":"2026-11-01T09:00:00Z"}]}
```

Rules enforced by the adapter (`src/lib/integrations/connectors/crm/alo-lead-api.ts`):

- `leads:read` must be present in `permissions` — otherwise `permission_denied` even on HTTP 200.
- Every record needs a non-empty `id`; duplicate ids or more rows than requested fail the read.
- Response bodies are capped at 1 MiB; the request carries a 10–15 s timeout.
- `guardedFetch` requires HTTPS, refuses loopback/private/link-local/metadata/CGNAT hosts and any
  IPv6 literal (unless `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true` is set for a trusted private
  network), and **forces** `redirect: 'error'` after caller options so an adapter cannot re-enable
  redirects. Guard behaviour is pinned by `__tests__/unit/integration-url-guard.test.ts` (29 tests).
- Only `GET` is issued. The adapter has no write operation at all; there is no send path for
  WhatsApp, email, SMS or webhooks in the workflow.

## 2. Connection verification

`src/lib/integrations/connections.ts` → `verifyCrmConnection({ companyId, credentialId })`.

| Upstream result | Persisted `IntegrationCredential.status` | `lastVerifiedAt` |
|---|---|---|
| 200 + valid capabilities + `leads:read` | `connected` | **advanced to now** |
| 401 | `authentication_failed` | unchanged |
| 403, or 200 without `leads:read` | `permission_denied` | unchanged |
| DNS/refused/timeout/egress refusal | `unreachable` | unchanged |
| 5xx, 429, invalid JSON, missing fields, missing/duplicate ids, key cannot be decrypted | `sync_failed` | unchanged |
| no base URL or stored secret | `not_configured` | unchanged |
| id belongs to another tenant / does not exist | `not_found` (no upstream call) | unchanged |

Each attempt writes an `AuditEvent` (`company.integration.verify`) with the state, HTTP status,
latency and a sanitised reason. The returning DTO contains `endpointHost` only — never the URL
path, never the token.

The legacy `Company.webCrmConnected` flag is retained for compatibility but is no longer treated as
evidence: it is set only after a successful verification and the panel reads
`IntegrationCredential.status`, not the flag.

## 3. HTTP surface

| Route | Method | Behaviour |
|---|---|---|
| `/api/company/integrations` | `GET/POST/DELETE` | Existing, unchanged: admin-only, tenant-scoped storage of `crm.alo-lead-api` connections; secrets encrypted, fingerprint returned |
| `/api/v1/crm/connections/verify` | `POST {credentialId}` | Real verification; returns the five-state verdict |
| `/api/v1/crm/followup-drafts` | `POST {credentialId}` | Queues the fixed five-lead Bengali draft workflow, returns `runId` + `status:"queued"` (HTTP 202) |
| `/api/v1/crm/followup-drafts` | `GET` | Recent follow-up runs with drafts, checksums, provider/model |
| `/api/v1/crm/preflight` | `GET [?credentialId=&verify=1]` | Server-side readiness: CRM connection/URL/credential, AI provider/model, workflow limits; blockers listed explicitly |
| `/api/v1/runs/:id` | `GET` | Full run detail: status, events, artifacts (unchanged) |
| `/api/crm-connections` | `GET/POST` | Rebuilt: tenant-scoped list; `test`/`connect` verify for real; `sync` reads real leads; `dispatch` queues a real run; `disconnect` clears the flag |

Scope model: API keys require the generic `crm:write` / `crm:read` scope derived by `v1Handler`.
Session users must be `super_admin` or company `owner`/`admin` to manage a connection or start a
workflow. A key from a client company cannot reach these routes (`audience: 'client'` is confined to
`/api/v1/ai/**`).

## 4. Reading leads (`readCrmLeads`)

Used by the workflow and by the legacy `sync` action. It performs the same tenant lookup, decrypts
the secret in memory, re-runs the egress guard and calls the adapter. Its return type is a
discriminated union: on failure the caller receives `state`, a sanitised message and the HTTP
status — there is no path that returns synthetic records.

## 5. Rate limits, retries and pagination

- **Pagination**: the lead contract returns at most `limit` rows; the workflow asks for exactly 5.
  Cursor pagination is not part of this narrow workflow (the Twenty adapter still has cursor support
  for contacts).
- **Rate limits**: HTTP 429 is classified `sync_failed` with `retryable: true`. The workflow retries
  the *read* twice with 500 ms/1000 ms backoff. `Retry-After` is **not** parsed yet — recorded as a
  gap.
- **Timeouts**: connector 15 s, verification 10 s, workflow overall budget 300 s
  (`CRM_FOLLOWUP_TIMEOUT_MS`, 10 s–900 s), each AI call receives the remaining budget as an
  `AbortSignal`.

## 6. Structured errors and audit

Every verification writes an audit row. Workflow phases write `RunEvent`s
(`crm.connection.verified`, `crm.leads.retrieved`, `ai.generation.completed`, `draft.validated`,
`run.completed` / `run.failed`) whose `data` contains record ids, provider/model, token counts and
latency — never a credential, never an `Authorization` header.

## 6a. Preflight

`runCrmPreflight({companyId, credentialId?, verify?})` never decrypts or calls the CRM unless
`verify=true`. Response fields:

| Field | Meaning |
|---|---|
| `preflight_status` | Did the check run? `ok`/`error`. Says nothing about execution. |
| `workflow_execution_ready` | `true` only when CRM connection, URL, credential, verification, AI provider and model are all present |
| `ready` | Deprecated alias, always equal to `workflow_execution_ready` |
| `missing_dependencies` | One explicit `{id,label,status,detail}` per missing/failed dependency |
| `blockers` | Human-readable strings for the same failures |
| `checks` | Every check with `pass`/`fail`/`missing` |
| `liveVerified` | Whether `verify=1` triggered a real read-only CRM call |
| `provider_probe` | `router` (real readiness check) or `injected_simulated` (test seam — never valid for staging acceptance) |

Provider readiness is decided by a **real health check** (bounded to 4 s) on each company-eligible
provider; a provider that is merely registered or initialized — for example an env-configured endpoint
with no reachable service — is reported as missing, not healthy.

The dashboard shows *Staging readiness* with `preflight: ok` and `execution: BLOCKED · N missing`
badges plus a "Run live preflight" button. A missing URL, key, provider or model therefore appears as
a named missing dependency instead of a failed run — and a healthy endpoint is never presented as
execution readiness.

## 7. Not implemented (explicit)

- CRM **write** operations (create/update lead) — none exist, so no approval path is needed yet.
- OAuth flows for third-party CRMs; only bearer-key connections.
- Website scraping / headless-browser automation as a connector.
- A generic adapter for arbitrary vendor APIs. Each new CRM needs a small adapter + contract.
- Outbound destination allow-list (see credential security doc, residual risks).
