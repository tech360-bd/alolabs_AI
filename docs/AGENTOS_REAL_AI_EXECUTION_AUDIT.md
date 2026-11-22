# AgentOS — Real AI Execution Audit

Date: 2026-11-19 · Branch: `arena/304ea66d-alolabs-ai` · Scope: existing application, read-only audit first
Target: `tech360-bd/alolabs_AI` on `https://alolabs.net`, port `3011`. No production system was contacted.

Status vocabulary: **VERIFIED** (executed and observed), **IMPLEMENTED** (code merged into the
workspace), **TESTED** (automated test executed), **BLOCKED** (cannot be executed in this
environment), **REQUIRES APPROVAL**, **FAILED**.

## 1. What the previous state actually did

### 1.1 `POST /api/v1/runs` — real pipeline, but `runId` is not evidence

`src/app/api/v1/runs/route.ts` validates `objective`, resolves project access and calls
`createRun()` in `src/lib/runs/index.ts`. `createRun`:

1. inserts an `AgentOSRun` row with `status = "queued"`;
2. records a `run.queued` `RunEvent`;
3. enqueues a durable `agentos.run` job (`src/lib/job-queue.ts`, DB-backed lease queue);
4. returns `{ runId, status: "queued", eventsUrl }` with HTTP **202**.

The worker (`src/instrumentation.node.ts` → `dispatchAgentOSJob` in
`src/lib/workers/agentos-dispatcher.ts`) then executes `executeRun()`:

| Stage | Code | Evidence produced |
|---|---|---|
| Plan | `src/lib/runs/planner.ts` (LLM planner, heuristic fallback) | `run.started`, `plan.created` |
| Decompose | Task + TaskStep rows | `task.queued` |
| Route | `src/lib/orchestrator.ts` | `agent.selected` |
| Execute | `src/lib/agent-runtime` → `src/lib/ai-router/router.ts` | `agentRun` row, `model.selected`, token usage |
| QC | `src/lib/qc` (repair, retry, escalation) | `qc.passed` / `qc.failed`, `OutputVersion` |
| Assemble | `src/lib/artifacts` | versioned, checksummed `Artifact` |
| Memory | `src/lib/memory` | episodic entries |

So an AI call path **exists and is real**. It is also true that a `202`/`runId` proves only
acceptance: the run can fail later (`failed`), pause (`waiting_approval`), or be cancelled. No
"completed" badge existed for external data because the pipeline had no external read step.

Status set before this work: `queued | planning | running | waiting_approval | completed | failed |
cancelled`. There was no `validating`, `blocked` or `timed_out`, so the requested lifecycle could not
be expressed.

### 1.2 `src/app/api/crm-connections/route.ts` — fabricated evidence (FAILED)

This route was a demonstration, not an integration. Verified by reading every branch:

| Endpoint/action | What it claimed | What it did |
|---|---|---|
| `GET` | "CRM connections" | Listed **every company** in the database for any valid session token; `syncStatus` came from `Company.webCrmConnected` |
| `POST {action:"connect"}` | "CRM connected", synced agents/workflows | Set `webCrmConnected = true`, invented `webhookSecret: whsec_<slug>_<time>`, returned `syncedAgents: 2000`, `syncedWorkflows: 63` |
| `POST {action:"sync"}` | contacts/deals/tasks synced | `contactsProcessed: Math.floor(Math.random()*500)+100`, etc. — **no network request** |
| `POST {action:"test"}` | `auth: valid`, latency, SSL | Read the same boolean; `latency: 10–60 ms` was `Math.random()` |
| `POST {action:"dispatch"}` | "N agents dispatched/deployed" | Created a `Command`/`Task` row and an `estimatedCompletion` timestamp |

Security defect: `companyId` came from the request body and was never compared to the caller's
tenant, so any authenticated user could flip another tenant's flag or create tasks in it.

### 1.3 Existing connector layer — real, but incomplete

`src/lib/integrations/` already had a sound design: `ExternalSystemAdapter` contract
(`types.ts`), a fail-closed registry (`registry.ts`, `AVOID` strategy refuses registration),
`guardedFetch` (HTTPS-only, private/loopback/metadata block, timeout) and five adapters
(Twenty, Frappe, httpSMS, RSSHub, video generation). Two gaps mattered:

- adapters exposed **no lead-read operation**, so no CRM task could be executed;
- `IntegrationCredential` already had `encryptedSecret`, `secretFingerprint`, `status`,
  `lastVerifiedAt`, but **no code path ever wrote a real verification verdict** — nothing consumed
  the field. A stored URL + key therefore did look "configured" forever.

### 1.4 Credential handling before

`src/app/api/company/integrations/route.ts` already stored secrets with AES-256-GCM
(`src/lib/security/field-encryption.ts`), exposed only a fingerprint, and refused to store a secret
when `ENCRYPTION_KEY`/`APP_SECRET` is absent. No endpoint returned `encryptedSecret`. This part was
sound and is reused, not replaced.

### 1.5 Observations on the run lifecycle

- **Cancellation**: `cancelRun` sets a terminal status and `executeRun` re-checks
  `status === 'cancelled'` inside its step loop (line ~659), so cancellation is honoured between
  steps, not mid-HTTP-call.
- **Retries**: durable queue retries per job; the run pipeline records `attempts`.
- **Timeouts**: provider calls are timeboxed inside the router; there was no overall run deadline.
- **Failures**: a provider that is unavailable throws `AIProviderUnavailableError` ("No providers are
  available") — covered by existing tests (`__tests__/integration/ai-provider-config.test.ts:152`),
  so a failed model call cannot silently become a "completed" run.
- **Validation**: QC exists for planner-driven tasks, but nothing validated an *external-data*
  mapping (five records → five drafts).

### 1.6 E2E testing before

`tests/browser/login.test.mjs` held four browser tests (login, session/authorization/logout, invalid
password, MFA + expired session). There was **no** browser or integration test for external CRM
work, AI generation, evidence persistence or tenant isolation of connections.

## 2. Gap list and what this change does

| Gap | Resolution | Status |
|---|---|---|
| CRM "connected" was a DB flag | Real authenticated `GET /api/v1/capabilities` per verification; five-state classification; `lastVerifiedAt` advances only on success | IMPLEMENTED, TESTED |
| No lead-read connector | `crm.alo-lead-api` adapter with a documented read-only contract, size/route/timeout limits, duplicate/missing-id rejection | IMPLEMENTED, TESTED |
| Cross-tenant CRM actions | Every lookup is `{ id, companyId }`; legacy route rebuilt around the caller's company | IMPLEMENTED, TESTED |
| No external task execution | `lead-followup` workflow: verify → read 5 → generate → validate → persist mapping | IMPLEMENTED, TESTED (stub CRM, injected generator) |
| Lifecycle missing states | Added `validating`, `blocked`, `timed_out` to `RunStatus`/terminal set | IMPLEMENTED, TESTED |
| Queue had no CRM job type | `agentos.crm.lead-followup` in dispatcher + worker wiring | IMPLEMENTED, TESTED (dispatch path via queue) |
| Results not visible | Rebuilt `CRM Connections` dashboard panel reading run + artifacts | IMPLEMENTED, TESTED (browser) |
| Redirect-based SSRF bypass | `guardedFetch` now uses `redirect: 'error'` | IMPLEMENTED |
| Missing configuration was only discoverable by running | `src/lib/integrations/preflight.ts` + `GET /api/v1/crm/preflight` reports `workflow_execution_ready` plus explicit `missing_dependencies` for CRM URL, credential, AI provider, model and workflow limits (`ready` is a deprecated alias of the same boolean) | IMPLEMENTED, TESTED |
| Real staging CRM + real AI provider | **No staging URL, credential or provider exists in this environment** | BLOCKED |

## 3. Honest summary

The external execution path is now real code with real tests against a local CRM contract (22 workflow
+ 8 credential-API + 16 regression + 5 browser tests; see the E2E report), but the
**production claim is not made**: no staging CRM was read, no live model was called, no Bengali draft
was produced by a model. Section 12 of the request can only be signed off after the staging run
described in `AGENTOS_REAL_WORLD_E2E_TEST_REPORT.md` is executed with real credentials, supplied
through the operator UI/API — never through chat.
