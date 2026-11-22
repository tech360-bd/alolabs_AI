# AgentOS — Real Staging Acceptance Checklist

Date: 2026-11-19 · Branch `arena/304ea66d-alolabs-ai`
Purpose: convert the **simulated** milestone into **real external verification** — with a real
staging CRM and a real AI provider — without touching production.

> Current state: **every item in §3 and §4 is UNMET**, because there is no staging CRM URL/key,
> no provider key and no authorization to deploy. That is `BLOCKED_EXTERNAL_DEPENDENCY`, and
> this checklist must not be marked complete until each item has a captured, redacted result.

Rules that apply to every step: never paste a key into chat, a document or git; never edit the
production `.env`; never restart or reconfigure production (port 3011, Caddy, PM2, Hosting
Portal 3062); record the exact command and its exit code; capture only redacted output.

---

## 0. Preconditions (all must be YES before starting)

| # | Precondition | Evidence |
|---|---|---|
| 0.1 | A staging deployment of this branch exists, reachable over HTTPS, that is **not** production | URL + `/api/health` output |
| 0.2 | A staging CRM implements `docs/ALO_LEAD_API_V1_CONTRACT.md` with ≥ 5 test leads | `GET /api/v1/capabilities` 200 with `leads:read` |
| 0.3 | A **read-only** CRM key exists for that staging CRM | key stored in the staging secret store only |
| 0.4 | A real AI provider key with quota exists (not a local stub) | provider configured in staging env/DB |
| 0.5 | A staging operator account (admin/owner) with MFA enrolled exists | login succeeds |
| 0.6 | A staging database is separate from production | connection host differs |
| 0.7 | Written authorization for the staging window exists | ticket/approval reference |

If any precondition is NO → stop; the correct status is `BLOCKED_EXTERNAL_DEPENDENCY`.

## 1. Environment proof (no secrets in output)

```bash
BASE=https://<staging-host>
curl -sS "$BASE/api/health" | jq '{status,version,time}'
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/crm/preflight"
```

- [ ] health returns a healthy status (200) — **health ≠ inference**
- [ ] unauthenticated preflight returns 401/403, not data

## 2. Configuration and credential steps

Authenticate as the staging operator through the normal login flow (MFA completed). Browser
routes (`/api/company/integrations`, `/api/crm-connections`) use the session cookie **plus** the
double-submit CSRF pair: send the `csrf-token` cookie value back as `x-csrf-token`. The `/v1/*`
routes accept a session bearer token or a company API key.

```bash
# browser/session routes: cookie jar + CSRF header
COOKIE='<session cookie jar>'                 # from the login flow, never pasted into docs
CSRF=$(grep csrf-token "$COOKIE" | awk '{print $7}')
H=(-H "x-csrf-token: $CSRF" -H 'Content-Type: application/json')

# /v1/* routes: the login response carries a session bearer token as well
TOKEN='<token from POST /api/auth/login after MFA>'
AUTH=(-H "Authorization: Bearer $TOKEN")
```

2.1 Save the CRM connection (`POST /api/company/integrations`; key read from stdin, never
echoed). `integrationType` must be exactly `crm.alo-lead-api`:

```bash
read -rs CRM_KEY
curl -sS -X POST "$BASE/api/company/integrations" -b "$COOKIE" "${H[@]}" \
  -d "$(jq -n --arg u "https://<crm-host>" --arg k "$CRM_KEY" \
        '{integrationType:"crm.alo-lead-api",name:"staging-crm",baseUrl:$u,secret:$k}')" \
  | jq '{id,integrationType,hasSecret,baseUrl,status}'
unset CRM_KEY
```

- [ ] response contains an id and `hasSecret: true`
- [ ] response contains **no** key material (grep the raw body for the first 4 chars of the key)

2.2 Reject private targets (negative test — proves the SSRF guard in the deployed build).
Storing a URL is only configuration; the proof is that **verification refuses to connect**:

```bash
for HOST in 10.0.0.1 169.254.169.254 "[::1]" "localhost."; do
  ID=$(curl -sS -X POST "$BASE/api/company/integrations" -b "$COOKIE" "${H[@]}" \
    -d "$(jq -n --arg u "https://$HOST/" '{integrationType:"crm.alo-lead-api",name:"probe",baseUrl:$u}')" \
    | jq -r '.data.id')
  curl -sS -X POST "$BASE/api/v1/crm/connections/verify" "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"credentialId\":\"$ID\"}" | jq -c '{state,message}'
  curl -sS -X DELETE "$BASE/api/company/integrations" -b "$COOKIE" "${H[@]}" -d "{\"id\":\"$ID\"}" >/dev/null
done
```

- [ ] every attempt is refused with a policy reason, and no request leaves the server
- [ ] `lastVerifiedAt` did not advance

## 3. Real readiness

```bash
curl -sS "$BASE/api/v1/crm/preflight?verify=1" "${AUTH[@]}" | tee /tmp/preflight.json \
  | jq '{preflight_status,workflow_execution_ready,ready,provider_probe,missing_dependencies,blockers}'
```

- [ ] HTTP 200
- [ ] `provider_probe == "router"` (a value of `injected_simulated` invalidates the run)
- [ ] `workflow_execution_ready == true`
- [ ] `ready == workflow_execution_ready` (alias, never divergent)
- [ ] `missing_dependencies == []`
- [ ] the CRM connection state is `connected` and `lastVerifiedAt` is now
- [ ] preflight was **not** run with `verify=0` and reported as verification

If `workflow_execution_ready` is false, record `missing_dependencies` verbatim and stop — a
false readiness must never be worked around by editing the gate.

## 4. Real five-lead run

```bash
CRED_ID=<id from 2.1>
curl -sS -X POST "$BASE/api/v1/crm/followup-drafts" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"credentialId\":\"$CRED_ID\"}" | tee /tmp/enqueue.json | jq '{runId,status}'
```

- [ ] a run id is returned (queued ≠ completed)

Poll until terminal (bounded, e.g. 3 minutes):

```bash
for i in $(seq 1 36); do
  curl -sS "$BASE/api/v1/crm/followup-drafts" "${AUTH[@]}" > /tmp/runs.json
  S=$(jq -r --arg id "$RUN_ID" '.runs[] | select(.id==$id) | .status' /tmp/runs.json)
  echo "$i $S"; case "$S" in completed|failed|blocked|cancelled|timed_out) break;; esac; sleep 5
done
```

- [ ] terminal status is `completed` (**`failed`/`blocked`/`timed_out` must be reported as such,
      never described as a success**)
- [ ] exactly 1 `run.completed` event
- [ ] exactly 5 `ai.generation.completed` and 5 `draft.validated` events
- [ ] 5 artifacts exist, one per source lead, with distinct source ids
- [ ] each artifact's `checksum` equals `sha256` of its stored content (recompute locally)
- [ ] every draft is non-empty Bengali prose with subject+body, no placeholders (`<...>`,
      "TODO", `{{`) and no invented facts (no fabricated phone/email/price)
- [ ] **no message was sent**: the CRM/email provider shows zero outbound deliveries; the run's
      summary says `deliveries: none`
- [ ] the five source ids in the artifacts match the CRM's real newest-five ids exactly

## 5. Negative and failure-path checks (real)

| Test | Action | Expected |
|---|---|---|
| Bad key | store a wrong key on a second connection, `verify=1` | `authentication_failed`, `lastVerifiedAt` unchanged |
| Missing scope | key without `leads:read` | `permission_denied` even with HTTP 200 |
| Wrong contract | base URL of a CRM without these endpoints | 404 → `sync_failed` with the "is the contract exposed?" message |
| Provider down | deactivate the provider, `verify=1` | `workflow_execution_ready: false`, run POST refused/blocked, **no** placeholder drafts |
| Over-limit CRM | CRM returns 6 leads for limit=5 | run fails visibly (`sync_failed` "returned more than the requested 5"), no silent truncation |
| Tenant isolation | second company's token, first company's `credentialId` | `not_found`, no data leak |
| Secret exposure | inspect every response/log captured above | no key, no full lead PII beyond what the operator is entitled to |

## 6. Evidence capture (redacted)

Create `docs/evidence/agentos-real-staging-acceptance-<ISO>.json` containing:

- deployment URL and commit hash, `/api/health` body;
- preflight JSON (redacted), `provider_probe`;
- run id, terminal status, event counts, artifact ids + checksums + sha256 recomputation result;
- per-check pass/fail, the negative-test outcomes;
- names of the files/commands used, **never** keys or tokens;
- who ran it, when, and the authorization reference.

Then update `AGENTOS_FINAL_ACCEPTANCE_REPORT.md` gates C/D/E with real evidence, and only then
may the milestone move past `SIMULATED_STAGING_ACTIVATION_VERIFIED`.

## 7. Abort and rollback

Abort immediately if: a key appears in output/logs, the target resolves to a private address,
production is reachable from the staging config, a run sends a message, or the CRM returns real
customer PII beyond the agreed test leads. On abort: revoke the staging key at the CRM, delete
the connection row, keep the evidence (redacted), and record `BLOCKED` with the reason.

## 8. Sign-off

| Gate | Owner | Result | Evidence path |
|---|---|---|---|
| A — local engineering | agent | PASS (see report) | `docs/evidence/agentos-staging-activation-2026-11-22T1*.json` |
| B — SSRF/security fixes | agent | PASS locally | `__tests__/unit/integration-url-guard.test.ts` |
| C — real CRM | operator | **UNMET** | — |
| D — real provider | operator | **UNMET** | — |
| E — real staging deployment | operator | **UNMET** | — |
| F — production readiness | — | **NOT CLAIMED** | — |
