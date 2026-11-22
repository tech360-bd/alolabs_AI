# AgentOS — Controlled Staging Activation Runbook

Status: **ready to execute — pending real staging CRM and real AI provider.**
External E2E remains **BLOCKED** until §6 succeeds with real services.

This runbook is the operational companion to:
`ALO_LEAD_API_V1_CONTRACT.md`, `AGENTOS_STAGING_READINESS_CHECKLIST.md`,
`AGENTOS_CREDENTIAL_SECURITY.md`, `AGENTOS_RUN_EXECUTION_ARCHITECTURE.md`.

Rules that never change: no production deployment, no PM2 restart, no port change, no database
reset/migration, no Caddy or Hosting Portal change, no secret in chat/logs/commits.

## 0. What is real vs simulated

| Piece | In tests today | Required for acceptance |
|---|---|---|
| CRM | local `node:http` stub implementing ALO Lead API v1 | **real staging CRM** |
| AI provider | local OpenAI-compatible stub (`provider_probe: "router"`, model still simulated) | **real provider + real model** |
| Credential | real AES-256-GCM encrypted row in SQLite | real read-only key in staging DB |
| Preflight | real code path; simulated provider probe is marked `provider_probe: "injected_simulated"` | `provider_probe: "router"` with healthy real provider |

A green local suite proves the wiring, never external execution.

## 1. Staging CRM preparation (CRM side)

1. Deploy the staging CRM on a hostname such as `crm-staging.<domain>` with a valid public TLS
   certificate. No self-signed certificate unless the app host explicitly trusts that CA.
2. Implement exactly the two endpoints in `ALO_LEAD_API_V1_CONTRACT.md`:
   `GET /api/v1/capabilities` and `GET /api/v1/leads?limit=5&sort=-createdAt`.
3. Seed **five dedicated test leads** whose ids you record in the change ticket
   (e.g. `stg-lead-0001…0005`). Do not use real customer data.
4. Create a **read-only** API credential scoped to `leads:read` only. It must not be able to create,
   update or delete records, and must not be an admin token.
5. Confirm the CRM logs requests with method, path, status and credential id (not the secret). These
   logs will be the independent proof that only GETs were made.

Verification from the app host (no secret in shell history — use a file with mode 600 or a
secret manager):

```bash
curl -sS -H "Authorization: Bearer $CRM_TEST_KEY" https://crm-staging.<domain>/api/v1/capabilities
curl -sS -H "Authorization: Bearer $CRM_TEST_KEY" \
  'https://crm-staging.<domain>/api/v1/leads?limit=5&sort=-createdAt' | jq '.data | length'
```

Expected: `permissions` contains `leads:read`; the second command prints `5`.

## 2. Register the credential in AgentOS (secure, server-side)

Requires an `owner`/`admin` session (or `super_admin`) and the CSRF double-submit header
(`x-csrf-token` matching the `csrf-token` cookie). The key is sent once, encrypted at rest, and
never returned.

**Before saving a real key, prove the egress guard on the deployed build**: store a throwaway
connection pointing at `https://10.0.0.1/`, `https://169.254.169.254/` and `https://[::1]/`, run
`POST /api/v1/crm/connections/verify` for each, and confirm every response is refused with an
egress-policy reason and no request leaves the host (check the CRM/proxy logs). Details:
`AGENTOS_REAL_STAGING_ACCEPTANCE_CHECKLIST.md` §2.2. A guard that accepts these in staging is a
no-go.

```bash
curl -sS -X POST https://<agentos-staging-host>/api/company/integrations \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d @- <<'JSON'
{"integrationType":"crm.alo-lead-api","name":"ALO Education staging",
 "baseUrl":"https://crm-staging.example","secret":"<read-only key>",
 "settings":{"model":"<model id>"}}
JSON
```

Checks immediately after:

| Check | Expected |
|---|---|
| Response body | `hasSecret: true`, no `secret`, no `encryptedSecret` |
| DB row | `encryptedSecret` starts `v1:`; `secretFingerprint` present; no plaintext |
| `AuditEvent` | `company.integration.create` with `hasSecret: true` and no secret |
| Non-admin attempt | HTTP 403, no row written |
| Body containing `companyId` | HTTP 400 (tenant cannot be injected) |

## 3. Verify real CRM authentication and read permission

```bash
curl -sS -X POST https://<agentos-staging-host>/api/v1/crm/connections/verify \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d '{"credentialId":"<id>"}'
```

Required result: `state: "connected"`, `httpStatus: 200`, `endpointHost` (host only),
`lastVerifiedAt` set now. Interpret anything else:

| State | Meaning | Action |
|---|---|---|
| `authentication_failed` | 401 — key wrong/revoked | fix key, re-register |
| `permission_denied` | 403 or missing `leads:read` | fix CRM permission, do not widen to write |
| `unreachable` | DNS/TLS/timeout/egress policy | fix network or allow-list; do not disable the SSRF guard in production |
| `sync_failed` | 5xx/429/bad JSON/contract mismatch | fix CRM contract |
| `not_configured` | missing URL or key | complete §2 |

## 4. Configure a real server-side AI provider and model

Two supported paths (choose one, never expose the key in chat or source):

**A. Environment (restart of the staging app process is an operator action, not part of this
runbook):** set the provider key and optional base URL, plus `CRM_FOLLOWUP_MODEL=<model id>`.
`ENCRYPTION_KEY` must already be present.

**B. Provider admin API (no restart, key encrypted at rest):**

```bash
curl -sS -X POST https://<agentos-staging-host>/api/v1/providers \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d '{"provider":"openai-compatible","name":"Staging LLM","baseUrl":"https://llm-staging.example/v1",
       "apiKey":"<provider key>","models":[{"id":"<model id>","contextLength":8192}]}'
```

Then run the provider health check that writes the verdict on the row:

```bash
curl -sS -X POST https://<agentos-staging-host>/api/v1/providers/<providerConfigId>/test \
  -b "session-token=$SESSION"
```

Expected: `status: "healthy"`, `models` includes the pinned model id, latency recorded. A provider that
is merely registered is **not** healthy; preflight now performs a real health check (4 s bound) and
ignores providers that fail it.

Model selection rules:

- `settings.model` on the CRM connection wins, then `CRM_FOLLOWUP_MODEL`, then the router default.
- A pinned model that no healthy provider offers makes preflight fail with `ai_model` — by design.

## 5. Preflight gate (must pass before any run)

The `/v1/*` routes authenticate with a session bearer token (returned by `POST /api/auth/login`
after MFA) or a company API key. `preflight` forces a provider-registry re-sync, so the result
reflects providers added/removed seconds earlier rather than a cached registry.

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://<agentos-staging-host>/api/v1/crm/preflight?credentialId=<id>&verify=1" \
  | jq '{preflight_status,workflow_execution_ready,ready,provider_probe,liveVerified,missing_dependencies,checks}'
```

Acceptance values:

```json
{
  "preflight_status": "ok",
  "workflow_execution_ready": true,
  "ready": true,
  "provider_probe": "router",
  "liveVerified": true,
  "missing_dependencies": [],
  "checks": [{"id": "ai_provider", "status": "pass", "...": "..."}]
}
```

`provider_probe` must be `router`; `injected_simulated` means a test seam was used and the report is
**not** acceptable for staging activation. The dashboard must show `preflight: ok` and
`execution: ready` from the same fields.

## 6. Execute the five-real-lead workflow

```bash
# 1) accept (202 + runId) — this is NOT completion
curl -sS -X POST https://<agentos-staging-host>/api/v1/crm/followup-drafts \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d '{"credentialId":"<id>"}'

# 2) poll the run
curl -sS -b "session-token=$SESSION" https://<agentos-staging-host>/api/v1/runs/<runId> | jq '.data.run.status, .data.run.summary'
```

Required evidence, captured verbatim:

| Evidence | Where | Pass condition |
|---|---|---|
| Run status | `AgentOSRun.status` | `completed` |
| Lead ids | `summary.leadIds` | exactly the five ids recorded in §1 |
| Drafts | 5 artifacts `crm-followup-draft-<leadId>.md` | one per lead, distinct text |
| Checksums | `Artifact.checksum` | `sha256:` + 64 hex chars, manifest lists same mapping |
| Provider/model | `summary.provider`, `summary.model`, token counts > 0 | matches §4 |
| Events | 16 `RunEvent` rows | includes `crm.connection.verified`, 5×`ai.generation.completed` |
| CRM access log | CRM side | only `GET /api/v1/capabilities` and `GET /api/v1/leads` |
| Provider access log | provider side | exactly 5 chat completion requests |

## 7. Prove no outbound message was sent

- CRM access log: GETs only; no POST/PUT/PATCH/DELETE.
- No WhatsApp/SMS/email/webhook provider request visible in staging egress logs.
- Code evidence: `lead-followup.ts`, `alo-lead-api.ts`, `connections.ts` import no messaging module
  and contain no write verb (enforced by an automated source-scan test).
- Evidence field `summary.deliveries` must be `"none"`.

## 8. Failure handling

| Failure | Run result | Operator action |
|---|---|---|
| Preflight not ready | not started | fix the named `missing_dependencies` |
| CRM returns ≠5 leads | `blocked` | correct the staging dataset; never pad inside AgentOS |
| Provider unhealthy/absent | `failed` | fix provider; do not substitute a stub |
| Draft fails Bengali/delivery validation | `failed` | inspect reason; adjust model, not the validator |
| Run exceeds budget | `timed_out` | raise `CRM_FOLLOWUP_TIMEOUT_MS` deliberately or reduce latency |

## 9. Cleanup / rollback (staging only)

1. Delete the CRM connection: `DELETE /api/company/integrations { "id": "<credentialId>" }` — audit row
   written, secret removed with the row.
2. Disable/delete the provider config: `DELETE /api/v1/providers/<id>`.
3. Revoke both credentials on their systems.
4. Do **not** delete the run/artifacts; they are the evidence. If cleanup is mandated, export the
   evidence JSON first.

## 10. Sign-off

| Item | Required value |
|---|---|
| `provider_probe` | `router` |
| `workflow_execution_ready` | `true` (before run) |
| Run status | `completed` |
| Drafts / checksums | 5 / 5 valid |
| CRM GET-only proof | attached log excerpt |
| No-send proof | attached egress log + code scan |
| Independent id comparison | attached ticket ids vs `summary.leadIds` |

Only then may the acceptance report move from **BLOCKED** to **ACCEPTED**.

## 11. Related documents

| Document | Purpose |
|---|---|
| `AGENTOS_REAL_STAGING_ACCEPTANCE_CHECKLIST.md` | executable real-acceptance procedure with exact commands and pass criteria |
| `AGENTOS_SECURITY_AUDIT.md` | SSRF findings SA-01…SA-04, accepted risks, controls verified |
| `AGENTOS_CRM_CONNECTOR_OPERATIONS.md` | connector semantics, state machine, error taxonomy |
| `AGENTOS_AI_PROVIDER_OPERATIONS.md` | provider registration, readiness, failure modes |
| `AGENTOS_REMEDIATION_REGISTER.md` | every fix and accepted risk with verification evidence |
| `AGENTOS_FINAL_ACCEPTANCE_REPORT.md` | current gates A–F and verdict |
