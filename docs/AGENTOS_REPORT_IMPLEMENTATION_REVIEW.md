# AgentOS — Report vs Implementation Review

Date: 2026-11-19 · Scope: the four engineering reports written in the previous turn, checked against the
code as it stands now. Read-only review; findings were corrected in the documents where they were
factual errors, and implementation gaps were closed in code.

Reports reviewed:

1. `docs/AGENTOS_REAL_AI_EXECUTION_AUDIT.md`
2. `docs/AGENTOS_CRM_CONNECTOR_IMPLEMENTATION.md`
3. `docs/AGENTOS_RUN_EXECUTION_ARCHITECTURE.md`
4. `docs/AGENTOS_REAL_WORLD_E2E_TEST_REPORT.md`

## 1. Claims verified as accurate

| Claim | Verification |
|---|---|
| Legacy `/api/crm-connections` fabricated sync/test/dispatch evidence and was not tenant-scoped | Confirmed in the diff of the replaced route; new route no longer contains `Math.random`, `syncedAgents`, `webhookSecret` |
| `guardedFetch` blocks non-HTTPS, loopback/private/metadata hosts and now refuses redirects | Confirmed in `src/lib/integrations/types.ts`; exercised by the loopback-refusal test |
| Secrets are AES-256-GCM encrypted and only a fingerprint is returned | Confirmed by the API test: ciphertext has `v1:` prefix, response has `hasSecret` and no `encryptedSecret` |
| Adapter has no write operation | Confirmed: only `GET /api/v1/capabilities` and `GET /api/v1/leads`; test records methods and paths |
| Run statuses `validating`, `blocked`, `timed_out` exist | Confirmed in `RunStatus` + `TERMINAL_STATUSES` in `src/lib/runs/index.ts` |
| A queued run is not completion | Confirmed: `POST /api/v1/runs` and `/api/v1/crm/followup-drafts` return 202/queued; completion asserted separately in tests |
| No provider → run fails, not "completed" | Confirmed by test: injected generator throwing yields `failed`; existing provider-unavailable tests unchanged |

## 2. Findings where the reports were wrong or stale (corrected)

| # | Report | Claim | Reality | Action |
|---|---|---|---|---|
| 1 | E2E report §3 row 10 | "8 events" for a five-lead run | 16 events are currently produced (queued, started, connection, leads, 5×generation, 5×draft validation, validating, completed) | Fixed; the test now asserts semantic invariants (1 × `run.completed`, 5 × `ai.generation.completed`, 5 × `draft.validated`, ≥ 13 total) rather than a hard-coded 16 |
| 2 | E2E report | "13/13" workflow tests | Now **20** (preflight + read-only enforcement added) | Counts updated |
| 3 | E2E report | No mention of credential-API verification | `/api/company/integrations` was untested | Added `__tests__/api/company-integrations.test.ts` (8 tests) and documented it |
| 4 | Run architecture | `summary` example omitted `connector` | Implementation writes `connector: "crm.alo-lead-api"` | Example corrected |
| 5 | Connector doc | No preflight endpoint | Implemented `GET /api/v1/crm/preflight` + dashboard section | Documented |
| 6 | Audit doc | Missing-config gap could only be found by running | Preflight now reports it | Gap row and summary updated |

## 2a. Status-semantics correction (post-review)

The preflight originally exposed only a boolean `ready`. Although it was already `false` when
dependencies were missing, the name conflated "the check worked" with "execution is possible". The
report of `ready` therefore needed an explicit, unambiguous contract:

| Field | Before | After |
|---|---|---|
| Check health | not exposed | `preflight_status: ok / error` |
| Execution readiness | `ready` (ambiguous name) | `workflow_execution_ready` (explicit) |
| Legacy field | `ready` | kept, always equal to `workflow_execution_ready` |
| Missing dependency list | only free-text `blockers` | `missing_dependencies[]` with ids + labels |

This is now covered by 7 preflight tests (missing CRM, missing AI, both, fully configured, live-only,
unsupported model, cross-tenant) and asserted in the browser test (`preflight: ok` +
`execution: BLOCKED`).

## 3. Claims that remain unverified by design

- "Real staging CRM E2E" and "live AI model E2E" — still **BLOCKED**; the reports already said so and no
  document claims otherwise.
- DNS-rebinding and outbound allow-list risks are documented as **not solved**.
- Worker execution through the live PM2 process is untested (production safety).

## 4. Consistency check performed

- Documented status vocabulary (`VERIFIED/IMPLEMENTED/TESTED/BLOCKED/REQUIRES APPROVAL/FAILED`) is used
  consistently; no report calls the system autonomous or production-ready.
- Every command quoted in the reports was executed in this workspace; counts match the generated
  evidence file (`docs/evidence/agentos-staging-readiness-2026-11-22T10-31-42Z.json`).
- The four reports now link to the same three supporting documents: the contract
  (`ALO_LEAD_API_V1_CONTRACT.md`), the readiness checklist (`AGENTOS_STAGING_READINESS_CHECKLIST.md`)
  and this review.

## 5. Residual documentation debt

- No end-user documentation for creating a CRM connection via the UI (only API + panel).
- No runbook for rotating `ENCRYPTION_KEY` without losing access to stored credentials.
- The contract doc must be versioned together with the adapter if the API changes.
