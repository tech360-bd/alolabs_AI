# AgentOS — Staging Integration Readiness Checklist

Date: 2026-11-19 · Use with `AGENTOS_STAGING_ACTIVATION_RUNBOOK.md` and
`AGENTOS_REAL_STAGING_ACCEPTANCE_CHECKLIST.md` before executing the real five-lead E2E. Every
item is verifiable; nothing here requires trusting a screenshot, a badge or a chat message.
The deployed build must also pass the SSRF negative tests in the real acceptance checklist §2.2
(private/metadata/IPv6 targets refused, no socket).

## 0. Current state

| Item | State |
|---|---|
| CRM staging base URL | **missing** |
| CRM read-only credential (`leads:read`) | **missing** |
| AI provider | **missing** (no provider env var, no `.env`, no Ollama) |
| Pinned model | not set (router default would be used) |
| External E2E | **BLOCKED** |
| Production touched | **no** |

Run the preflight to confirm the current state at any time:

```bash
TOKEN='<session bearer token from POST /api/auth/login>'
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://<host>/api/v1/crm/preflight" | jq '{preflight_status, workflow_execution_ready, ready, missing_dependencies}'
```

Expected today:

```json
{"preflight_status":"ok","workflow_execution_ready":false,"ready":false,
 "missing_dependencies":[{"id":"crm_connection",...},{"id":"ai_provider",...}]}
```

`preflight_status: "ok"` only means the check ran. `workflow_execution_ready` is the field that
authorises execution; `ready` is a deprecated alias of it and must never be read as "the endpoint works,
therefore we can run".

## 1. Operator prerequisites (never paste secrets into chat)

- [ ] A **staging** CRM (not production) exposing `GET /api/v1/capabilities` and
      `GET /api/v1/leads` per `docs/ALO_LEAD_API_V1_CONTRACT.md`.
- [ ] A valid TLS certificate on that host (public CA; no self-signed unless the deployment trusts it).
- [ ] A **read-only** API key restricted to `leads:read`.
- [ ] A staging dataset containing **at least five test leads** with stable ids; known expected ids
      recorded outside AgentOS (ticket or runbook), so the result can be compared independently.
- [ ] One AI provider configured server-side: provider key in env/provider admin, **or** a local
      Ollama endpoint reachable from the app host.
- [ ] A chosen model id (either set `CRM_FOLLOWUP_MODEL` server-side or pin `settings.model` on the
      connection). If unset, the router default is used and recorded.
- [ ] `ENCRYPTION_KEY` (≥ 32 chars in production) present on the app host.
- [ ] An operator account that is `super_admin` or company `owner`/`admin`.
- [ ] `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS` **unset** for the staging run.

## 2. Configuration steps (staging only)

1. Store the connection as an administrator:
   `POST /api/company/integrations`
   `{ "integrationType": "crm.alo-lead-api", "name": "ALO Education staging", "baseUrl": "https://…", "secret": "<read-only key>" }`
   Expected: `201`, response contains `hasSecret: true`, no secret, no `encryptedSecret`.
2. Prove at-rest encryption and audit:
   - `SELECT secretFingerprint, status, lastVerifiedAt FROM IntegrationCredential WHERE id = '<id>';`
   - the row must **not** contain the plaintext key; `AuditEvent` must include
     `company.integration.create` with no secret in `details`.
3. Verify the connection:
   `POST /api/v1/crm/connections/verify { "credentialId": "<id>" }`
   Expected: `state: "connected"`, `httpStatus: 200`, `endpointHost` (host only), and
   `lastVerifiedAt` advanced. Any other state is a blocker — do not proceed.
4. Run the preflight with a live check:
   `GET /api/v1/crm/preflight?credentialId=<id>&verify=1`
   Expected: `workflow_execution_ready: true`, `missing_dependencies: []`, every check `pass`,
   `liveVerified: true`, `preflight_status: "ok"`, `provider_probe: "router"`.
   `provider_probe: "injected_simulated"` is a test-only value and must fail acceptance.
5. Confirm AI provider health independently:
   `GET /api/v1/health` → `checks.modelRouter.status = "ok"`, and
   `GET /api/v1/providers` (admin) → the intended provider/model is enabled, no key material returned.

## 3. Execution and evidence capture

1. Start the workflow: `POST /api/v1/crm/followup-drafts { "credentialId": "<id>" }` → `202` + `runId`.
   This is acceptance only.
2. Poll `GET /api/v1/runs/<runId>` until terminal.
3. Capture, without editing:
   - `run.status`, `run.summary` (leadIds, draftCount, provider, model, token counts, durationMs),
   - the run's events, asserted semantically: exactly 1 `run.completed`, exactly 5
     `ai.generation.completed`, exactly 5 `draft.validated` (do not rely on a hard-coded total),
   - the artifacts (5 drafts + manifest) with checksums, each checksum independently recomputed
     from the stored content with `sha256sum`/`crypto`,
   - the CRM-side access log showing only GETs to the two documented paths,
   - `IntegrationCredential.lastVerifiedAt` and the `company.integration.verify` audit row.
4. Independent comparison: the five `summary.leadIds` must equal the ids recorded in step 1 of §1
   and the ids in the CRM staging UI/database. Compare out-of-band, not by re-reading AgentOS.
5. Store the evidence file next to this checklist and reference its filename in the acceptance report.

## 4. Pass conditions (all required)

- [ ] Exactly five distinct lead ids, equal to the independently recorded ids.
- [ ] Five separate draft artifacts, each mapped to one id, each with a checksum.
- [ ] Bengali script present in every draft (validation passed); drafts are distinct.
- [ ] Provider/model recorded and tokens > 0 (model really called).
- [ ] No outbound message: CRM log shows no write, no WhatsApp/SMS/email provider traffic.
- [ ] Run reached `completed`; no `blocked`/`failed`/`timed_out`.
- [ ] Credential absent from every response, log, artifact and summary.
- [ ] Existing browser auth suite still passes.

## 5. Automatic no-go conditions

- Any check in the preflight is `fail`/`missing` when you intend to start → stop.
- `state` other than `connected` → stop; do not retry with a different key in the same run.
- Fewer than five leads → run is `blocked`; do not pad the dataset inside AgentOS.
- Provider unavailable → run `failed`; do not substitute a mocked generator for the acceptance run.
- Any message-delivery attempt observed → stop and treat it as a security incident.

## 6. Sign-off (to be completed only after the real run)

| Role | Name | Date | Verdict |
|---|---|---|---|
| Operator (executed) | | | |
| Reviewer (independent evidence check) | | | |
| Security reviewer (credential/no-send) | | | |

Verdict is `ACCEPTED` only if §4 is fully checked; otherwise `BLOCKED`/`FAILED` with the failing item.
