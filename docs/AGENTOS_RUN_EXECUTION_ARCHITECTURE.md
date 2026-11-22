# AgentOS — Run Execution Architecture (external tasks)

Date: 2026-11-19 · Applies to the new `agentos.crm.lead-followup` job and to the existing
`agentos.run` pipeline.

## 1. Two executors, one queue

```
API request
  ├─ POST /api/v1/runs              → createRun()   → AgentOSRun(queued) + job "agentos.run"
  └─ POST /api/v1/crm/followup-drafts → enqueueLeadFollowup() → AgentOSRun(queued) + job
                                                                 "agentos.crm.lead-followup"
                     │
        durable queue: JobQueue/QueueItem (lease, heartbeat, retry, dead-letter)
                     │
   src/instrumentation.node.ts  → processQueue(RUN_QUEUE, job => dispatchAgentOSJob(job, deps))
                     │
        dispatchAgentOSJob (src/lib/workers/agentos-dispatcher.ts)
          ├─ "agentos.run" / "agentos.command" → executeRun()
          ├─ "agentos.workflow"               → executeWorkflowRun()
          └─ "agentos.crm.lead-followup"      → executeLeadFollowupRun()
```

Unknown job types are rejected, never acknowledged. `anotherExecutorHoldsRun` prevents two workers
executing the same `runId` concurrently.

## 2. Fixed objective (not free-form)

```
Read the five most recent test leads from the authorized ALO Education staging CRM
and create a Bengali follow-up draft for each lead. Do not send any message.
```

The objective is a constant (`CRM_FOLLOWUP_OBJECTIVE`); the only caller input is the connection id.
That keeps the first real task reproducible and prevents it from mutating into an unbounded agent.

## 3. Lifecycle

```
queued ──▶ running ──▶ validating ──▶ completed
   │           │            │
   │           ├──────────▶ failed        (CRM error, AI error, invalid draft, bad mapping)
   │           ├──────────▶ blocked       (fewer/more than exactly five leads)
   │           ├──────────▶ timed_out     (overall budget exhausted)
   │           └──────────▶ cancelled     (user cancelled during execution)
   └──────────▶ failed                    (queue unavailable at enqueue time)
```

`RunStatus` in `src/lib/runs/index.ts` now includes `validating`, `blocked`, `timed_out`;
`TERMINAL_STATUSES` includes `blocked` and `timed_out` so a cancelled or blocked run is never resumed.

## 4. Phases and evidence

| Phase | Result / persisted state | Event |
|---|---|---|
| Accepted | `AgentOSRun` row, job queued, HTTP 202 | `run.queued` |
| Started | `status=running`, `startedAt`, `attempts+1` | `run.started` |
| Connection verified | real GET; `IntegrationCredential.status`/`lastVerifiedAt`; `AuditEvent` | `crm.connection.verified` |
| Data retrieved | exactly five leads, ids preserved in `summary.leadIds` | `crm.leads.retrieved` |
| AI generated | per lead: provider, model, prompt/completion tokens, latency in event data | `ai.generation.completed` ×5 |
| Output validated | Bengali/length/executable-markup/delivery-claim checks passed | `draft.validated` ×5 |
| Mapping validated | `status=validating`, all five source ids present exactly once | `run.validating` |
| Completed | `status=completed`, `summary` JSON, `completedAt`, 5 draft artifacts + 1 manifest | `run.completed` |

A successful five-lead run currently writes **16** `RunEvent` rows (queued, started, connection,
leads, 5×generation, 5×draft validation, validating, completed) and **6** artifacts. The number
16 is an operator expectation, **not** a contract: tests assert the semantic invariants instead
(exactly 1 `run.completed`, 5 `ai.generation.completed`, 5 `draft.validated`, ≥ 13 total), so
incidental bookkeeping events cannot fail — or falsely satisfy — the assertion.

Each draft is a separate `Artifact` (`type=markdown`, `runId`, `companyId`, `sha256:` checksum) whose
`metadata` holds `leadId`, provider, model, token counts and `delivery: "none"`. The manifest artifact
lists `leadId → artifactId → checksum`. Any reviewer can therefore re-read the database and check the
mapping without trusting the UI.

Example `summary` on success:

```json
{"kind":"crm.lead-followup","connector":"crm.alo-lead-api","credentialId":"…","leadCount":5,"draftCount":5,
 "leadIds":["lead-1","lead-2","lead-3","lead-4","lead-5"],
 "provider":"ollama","model":"qwen3:8b","promptTokens":1234,"completionTokens":800,
 "durationMs":41200,"deliveries":"none","connectionState":"connected"}
```

On failure the same object carries `blockReason` and a partial `draftCount`; the run's `error` column
holds the sanitised reason (max 500 chars).

## 5. Idempotency and retries

- `enqueueLeadFollowup` uses `idempotencyKey: crm-followup:<runId>` and `jobId`, `maxRetries: 0`:
  the workflow itself is deterministic about failure, so a blind queue retry is not used. Re-delivery
  of the job for a terminal run is a no-op.
- Inside a run, only the **CRM read** is retried (twice, on `sync_failed`/`unreachable`). AI calls are
  not retried here; the router's own provider failover applies. A failed provider fails the run.
- Re-executing a completed run returns its existing status and does not duplicate artifacts
  (asserted by test: artifact count stays 6).

## 6. Cancellation and timeouts

- `POST /api/v1/runs/:id` DELETE (`cancelRun`) sets `cancelled`; the workflow checks between every
  lead and before the first AI call (`assertNotCancelled`). A cancel during an in-flight provider
  call takes effect at the next checkpoint.
- Deadline: `now() + CRM_FOLLOWUP_TIMEOUT_MS` (default 300 s). Each AI call gets the remaining budget
  as `AbortSignal`; exceeding the budget raises `RunTimedOut` → `timed_out`.
- The queue's lease/heartbeat reclaims work from a dead worker; the run row (and its checkpoint-free
  external state) is the source of truth.

## 7. Failure semantics

| Failure | Run result |
|---|---|
| No AI provider configured / provider unreachable | `failed`, reason from router ("No providers are available …") |
| Model returns non-Bengali or too-short text | `failed`, validation issues listed |
| CRM returns 4 leads | `blocked`, no AI call, no artifacts |
| CRM returns a duplicate or id-less record | `failed` before any AI call |
| Token leaks into a message (defence in depth) | sanitised to `[redacted]`; no credential is ever placed in run/event/artifact data |

A `200`, a `runId`, a `queued`/`running` status or a dashboard badge is **acceptance/process state
only**. Completion requires `status=completed` **and** five persisted drafts whose `leadId`s match the
ids read from the CRM.
