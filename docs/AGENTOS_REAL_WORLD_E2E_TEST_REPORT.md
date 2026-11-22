# AgentOS — Real-World E2E Test Report (CRM → Bengali drafts)

Date: 2026-11-19 · Branch: `arena/304ea66d-alolabs-ai` · Environment: isolated sandbox
(Debian 12, 2 vCPU, 3.8 GiB RAM, Node 22.22.3), temporary SQLite database, local CRM stub.
No production host, database, PM2 process, proxy or DNS record was touched.

## 1. Verdict

| Question | Answer |
|---|---|
| Did the code path for a real external read + AI task get implemented? | Yes — **IMPLEMENTED** |
| Was it executed end-to-end against a real external staging CRM? | **No — BLOCKED** (no staging URL/credential provided) |
| Was a real AI provider/model invoked? | **No — BLOCKED** (no provider key, no `.env`, no Ollama in this sandbox) |
| Was a real Bengali draft produced by a model and checked? | **No — BLOCKED** |
| Are the underlying mechanics tested against a real HTTP server, real DB, real encryption? | **Yes — 22/22 workflow + 8/8 credential API tests pass** (local contract server, injected generator) |
| Did the existing authentication/MFA browser suite still pass? | **Yes — 4/4**, plus 1 new dashboard test |

A queued `runId`, a `200`, a "connected" badge or a green dashboard row is **not** used as evidence
anywhere in this report.

## 2. What was verified with real execution

Environment check (no secrets printed):

```
$ node -e 'console.log(["OPENAI_API_KEY","ANTHROPIC_API_KEY","GEMINI_API_KEY","GROQ_API_KEY",
  "OPENROUTER_API_KEY","ZAI_API_KEY","OLLAMA_BASE_URL","OLLAMA_HOST"].filter(v=>process.env[v]))'
[]                       # no provider configured
$ command -v ollama      # → absent
$ ls .env                # → none
```

CRM: no staging base URL, API key or connection row exists in this environment, therefore the
production workflow was not run. Per the instruction, fake CRM data was **not** substituted for a
real integration.

### 2.1 Integration test — real HTTP, real DB, real encryption

```
$ npx vitest run __tests__/integration/crm-lead-followup.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       22 passed (22)
```

Covered (all against a real loopback HTTP server and a throw-away SQLite database):

1. Verification succeeds only on 200 + `leads:read`; `lastVerifiedAt` is written; the key never
   appears in the returned DTO.
2. Wrong key → `authentication_failed`; `lastVerifiedAt` stays `null`.
3. 403 and 200-without-permission → `permission_denied`; 500 → `sync_failed`; closed port →
   `unreachable`.
4. Loopback target with the private-network allowance removed → `unreachable` **and zero sockets
   opened** (egress policy refusal).
5. Tenant B verifying tenant A's credential → `not_found`, zero upstream requests.
6. Happy path: 5 leads → 5 drafts → `completed`; source ids preserved in order; 5 draft artifacts +
   1 manifest; provider/model/tokens recorded; only `GET` requests observed by the CRM.
7. Re-delivering the job does not duplicate artifacts (stays 6).
8. 4 leads → `blocked`, no AI call, no artifacts.
9. Bad credential / duplicate id / missing id → `failed`, no AI call.
10. Generator throws → `failed` with the provider reason; English-only draft claiming delivery →
    `failed` with a validation reason.
11. Cancelled run is not executed; no artifacts.
12. Cross-tenant run creation rejected (`NOT_FOUND`).
13. Dashboard read model: drafts + checksums listed for the owner tenant, empty for the other tenant,
    no key material.
14. Preflight (7 cases): bare tenant reports both `crm_connection` and `ai_provider` missing;
    AI-only missing and CRM-only missing are each isolated; a fully configured staging *configuration*
    (real verification + simulated provider probe) yields `workflow_execution_ready: true` with no
    missing dependencies; live verification is only performed with `verify=1`; an unsupported pinned
    model fails; another tenant's credential cannot be preflighted. `ready` always equals
    `workflow_execution_ready`, and `preflight_status` reports only whether the check ran.
15. Unsupported endpoint (HTML 404) is classified `sync_failed` / "endpoint not found"; the CRM saw
    only the two documented paths; a source scan proves no messaging import and no write verb.

These are **integration tests of our code**, not proof of a production B2B integration: the CRM is a
local contract stub and the generator is an injected test double.

### 2.1b Controlled staging simulation (SIMULATED model — not external proof)

```
$ npx vitest run __tests__/integration/crm-staging-simulation.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       3 passed (3)
```

Exercises the real wiring end to end: encrypted CRM credential → real verification → preflight
`workflow_execution_ready: false`; provider admin API (encrypted key, real HTTP health check) → router
registration → preflight `true` with `provider_probe: "router"`; then the workflow through the real
router generates five drafts, persists five checksummed artifacts, records the expected events
(1 × `run.completed`, 5 × `ai.generation.completed`, 5 × `draft.validated`; no fixed total is
asserted, and every artifact checksum is independently recomputed), and the CRM sees only GETs. The model endpoint is a local stub — this suite can never be cited as a real model call.

### 2.2 Regression — queue, dispatch, run lifecycle

```
$ npx vitest run __tests__/integration/run-resume.test.ts \
    __tests__/integration/registered-queue-handlers.test.ts \
    __tests__/integration/job-queue-durability.test.ts --maxWorkers=1
Test Files  3 passed (3)
Tests       16 passed (16)
```

### 2.3 Browser regression (real Chromium + running Next.js + seeded SQLite)

```
$ LD_LIBRARY_PATH=/tmp/alo-chrome2/libs/lib TEST_CHROMIUM_PATH=/tmp/chromium \
    npm test --prefix tests/browser
# tests 5 · pass 5 · fail 0
```

- 4 existing authentication tests (admin login, session persistence + authorization + logout, invalid
  password, MFA + expired session) — unchanged and passing.
- 1 new test: the `CRM Connections` dashboard view renders the real empty state from the database
  (no connection, no run) and the DOM contains no credential material.

### 2.4 Static gates

```
$ npm run typecheck          # passed (next typegen + tsc, single-threaded)
$ npm run typecheck:tests    # passed
$ npx eslint <changed files> # passed (no findings)
```

### 2.5 Credential API test — real encryption, mocked auth/Prisma

```
$ npx vitest run __tests__/api/company-integrations.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       8 passed (8)
```

Covers admin-only POST/DELETE (403 for a member), tenant-scoped SELECT/DELETE, refusal to store a
secret without `ENCRYPTION_KEY` (503), ciphertext ≠ plaintext (`v1:` prefix), fingerprint-only
responses, audit rows without the secret, and rejection of `companyId` in the request body.

### 2.6 Browser panel

The dashboard `CRM Connections` view now renders the server-side readiness report. The browser test
asserts the empty state, the `Staging readiness` section with `AI provider` blocker text, and that no
credential material appears in the DOM.

### 2.7 Machine-readable evidence

`docs/evidence/agentos-staging-activation-2026-11-22T10-50-43Z.json` records each command (earlier readiness snapshot `docs/evidence/agentos-staging-readiness-2026-11-22T10-42-17Z.json` is preserved), start time,
exit code, test counts and a log tail. Timestamps come from the sandbox clock (2026-11-22); the
session date is 2026-11-19 — no clock adjustment was made.

## 3. Acceptance checklist (request §12)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | AgentOS authenticates successfully | **VERIFIED** | 4 browser tests, admin + MFA |
| 2 | Actual external staging CRM connection verified | **BLOCKED** | no staging URL/credential available |
| 3 | Authorized CRM credential used securely | **IMPLEMENTED / TESTED** | encrypted at rest, server-side decrypt, tenant-scoped, key absent from responses; test 1–5 |
| 4 | Exactly five real staging leads retrieved | **BLOCKED** | only the 5-lead contract run against the local stub (test 6) |
| 5 | Original CRM ids preserved | **TESTED (stub)**, real **BLOCKED** | `leadIds` + artifact metadata; test 6 |
| 6 | Configured AI provider actually invoked | **BLOCKED** | no provider key/Ollama; router path exists and fails closed |
| 7 | Five distinct Bengali drafts generated | **BLOCKED (model)**; mapping/lifecycle **TESTED** with injected generator | test 6 |
| 8 | Each draft matches the correct source lead | **TESTED (stub)** | artifact `metadata.leadId` ↔ manifest |
| 9 | No external message sent | **IMPLEMENTED / TESTED** | adapter has no write op; CRM saw only GET; validation rejects "sent/emailed" claims |
| 10 | Execution evidence persisted | **TESTED** | run summary, semantic event counts (1 completion, 5 generations, 5 validations), 6 artifacts with independently recomputed `sha256` checksums |
| 11 | Final results independently verifiable | **TESTED (stub)**; staging **BLOCKED** | re-read `AgentOSRun` + `RunEvent` + `Artifact` by run id |
| 12 | Existing authentication/authorization tests pass | **VERIFIED** | 4/4 browser auth + 1/1 panel + 16/16 run/queue regressions |
| 13 | No production system modified | **VERIFIED** | no deploy/PM2/proxy/DB/prod commands were run |

## 4. Exact procedure to unblock the real E2E

Prerequisites (provided by the operator, never in chat):

1. A **staging** CRM base URL exposing `GET /api/v1/capabilities` and `GET /api/v1/leads`
   (HTTPS, ALO Lead API v1 contract).
2. A **read-only** (`leads:read`) staging API key.
3. An AI provider configured server-side (env var or `/api/v1/providers`), e.g. a local Ollama model
   with `CRM_FOLLOWUP_MODEL` set, or a provider key. Confirm with `GET /api/v1/health`.

Steps:

```bash
# 1. store the connection (admin session cookie; the key never appears in chat)
curl -X POST https://<host>/api/company/integrations \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d '{"integrationType":"crm.alo-lead-api","name":"ALO Education staging",
       "baseUrl":"https://crm-staging.example","secret":"<read-only key>"}'

# 2. verify for real
curl -X POST https://<host>/api/v1/crm/connections/verify \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d '{"credentialId":"<id>"}'          # expect state":"connected"

# 3. run the fixed workflow
curl -X POST https://<host>/api/v1/crm/followup-drafts \
  -H 'content-type: application/json' -b "session-token=$SESSION" \
  -d '{"credentialId":"<id>"}'          # 202 + runId (acceptance only)

# 4. poll the run, not the queue
curl https://<host>/api/v1/runs/<runId> -b "session-token=$SESSION"
```

Accept the run only when **all** hold:

- `run.status === "completed"` and `run.summary.draftCount === 5`;
- `run.summary.leadIds` equals the five ids returned by the CRM (compare independently);
- five artifacts named `crm-followup-draft-<leadId>.md` exist, each with a `sha256:` checksum, and the
  manifest lists the same mapping;
- `run.summary.provider`/`model` identify the configured provider and tokens > 0;
- the CRM side shows only GET requests and no outbound message from AgentOS;
- `IntegrationCredential.lastVerifiedAt` is recent and the audit row exists.

If any of these is missing → mark the E2E **FAILED/BLOCKED**, not "completed".

## 5. Limitations and remaining risks

1. The local stub implements our documented contract; a real CRM must actually expose it. If the
   staging CRM has a different API, a dedicated adapter is required — this is not a universal
   connector.
2. No real model was called. The prompt was designed for Bengali, but output quality/validation
   against a real model is unproven until step 3 above runs.
3. `Retry-After` is not honoured (fixed 0.5 s/1 s backoff on read); sustained 429s will surface as
   `sync_failed`.
4. Worker execution was exercised through the service and dispatcher wiring; the live PM2 worker was
   **not** restarted or reconfigured (production safety).
5. SSRF guard covers the first URL and redirects, but not DNS rebinding; no outbound allow-list yet.
6. The dashboard panel renders and lists real runs; a browser test that starts a run through the UI
   against a staging CRM was not executed (blocked by the same missing credentials).
