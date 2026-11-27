# Agent Runtime — Acceptance Report

**Scope:** Stage 2 of the AgentOS completion contract — the existing run engine
in `src/lib/runs` and the durable queue in `src/lib/job-queue`.

**Date:** 2026-11-27
**Code under test:** `src/lib/runs/index.ts` (1,219 LOC), `src/lib/job-queue.ts`
**Branch / merge:** `main` at `f0230c8` (PR #71)

---

## 1. What was tested, and how

Two suites. Both drive the **real** engine against a **real** database created
from the real Prisma schema by `scripts/sqlite-push.ts`, through the same
`src/lib/db.ts` singleton the application uses. Neither mocks the layer under
test; neither asserts that a function was called — they assert persisted
outcomes: run status, event rows, queue rows, and the presence or absence of
records.

| Suite | Cases | File |
| --- | --- | --- |
| Mandatory failure scenarios | 22 | `__tests__/integration/runtime-acceptance-failures.test.ts` |
| Required behaviours | 15 | `__tests__/integration/runtime-acceptance-behaviours.test.ts` |

Harness: `__tests__/helpers/real-db.ts` — a throw-away SQLite database per suite,
foreign keys ON, WAL, busy timeout, bound to the application's own client.

---

## 2. Failure scenarios

| ID | Scenario | Asserted outcome | Result |
| --- | --- | --- | --- |
| F-01 | No tenant / placeholder tenant at create | Rejected before any row is written | **PASS** |
| F-02 | Run whose tenant was lost, at execute | Refused; run never reaches `completed` | **PASS** |
| F-03 | No agent available for a step | `task.failed` event + run error naming the cause; no Task row invented | **PASS** |
| F-04 | Another company's agent | Never selected; run fails rather than borrowing | **PASS** |
| F-05 | Executing a terminal run | No status change, no new events | **PASS** |
| F-06 | Cancelled before first step | Stays `cancelled` | **PASS** |
| F-07 | `cancelRun` accuracy | `true` once, `false` thereafter and for unknown ids | **PASS** |
| F-08 | Resume after a crash | Checkpointed step restored, not re-run; `run.resumed` recorded | **PASS** |
| F-09 | Resume | Persisted plan reused; no second `plan.created` event | **PASS** |
| F-10 | Unmet dependency | Dependent step skipped and recorded; run fails | **PASS** |
| F-11 | Decision pending | Run stays `waiting_approval`; no events written | **PASS** |
| F-12 | Reviewer rejects | Run fails with a review-related error | **PASS** |
| F-13 | Approval expires | Run fails | **PASS** |
| F-14 | Approval decided by another tenant | Throws; approval untouched, run still paused | **PASS** |
| F-15 | Approval and run in different companies | Throws; run still paused | **PASS** |
| F-16 | Decision reversed by resolving again | Refused (see §5) | **PASS** |
| F-17 | Expiry sweep | Expires past-due pending only; future rows untouched | **PASS** |
| F-18 | Cross-tenant listing | Another company's run never appears in this company's list | **PASS** |
| F-19 | Unknown run id | Throws; no partial run row created | **PASS** |
| F-20 | Orchestration throws | Run never left non-terminal; reason recorded | **PASS** |
| F-21 | Durability | State visible from a fresh module instance | **PASS** |
| F-22 | Event trail | Reaches a terminal event; every event has a source | **PASS** |

---

## 3. Required behaviours

| ID | Behaviour | Asserted outcome | Result |
| --- | --- | --- | --- |
| B-01 | Durable before acknowledged | Run row **and** queue job exist when `createRun` returns | **PASS** |
| B-02 | Survives restart | Run and events readable after `vi.resetModules()` | **PASS** |
| B-03 | Exactly-once claiming | 5 concurrent workers → 1 claim; mismatched claim cannot complete | **PASS** |
| B-04 | Idempotent enqueue | Same key → same record, one row | **PASS** |
| B-05 | Events ordered and replayable | Ascending timestamps, first event `run.queued`, all belong to the run | **PASS** |
| B-06 | No double execution | Re-delivery leaves `attempts` and event count unchanged | **PASS** |
| B-07 | Terminal state with reason | Status in {`completed`,`failed`}, summary and `completedAt` present | **PASS** |
| B-08 | Detail view agrees with row | `getRunDetail().run.status === getRun().status` | **PASS** |
| B-09 | Listing bounded and scoped | Pagination, `total`, tenant filter, huge limit clamped | **PASS** |
| B-10 | Status filter | Only the requested status returned | **PASS** |
| B-11 | Cancellation observed | `cancelled` + `run.cancelled` event | **PASS** |
| B-12 | Approval resumes via queue | Durable `queueItem` with resume idempotency key, status `queued` | **PASS** |
| B-13 | No resurrection | Approval on a completed run returns `resumed: false`; run stays `completed` | **PASS** |
| B-14 | Attributed trail | Every event carries a non-empty source | **PASS** |
| B-15 | Step outcome recorded | Task rows carry a status whatever the run's fate | **PASS** |

---

## 4. State model observed

```
queued ──plan──> planning ──> running ──┬─> completed
                     │                  ├─> failed
                     │                  ├─> cancelled
                     │                  ├─> blocked / timed_out
                     └─> waiting_approval ──approved──> queued (resume job)
                                           └─rejected/expired──> failed
```

Persistence rules confirmed by test:

- The run row precedes the queue job, and both precede any acknowledgement.
- Every step transition writes a checkpoint before the next step begins.
- Resume reads the plan from the row; it is never re-planned.
- Approval resumption enqueues a durable job with a per-approval idempotency
  key, so a retry cannot create a second resume.

---

## 5. Defect found and fixed

**`resolveRunApproval` overwrote decisions.**

A run that a human had already **approved** was marked **failed** by a later
`approved: false` call. The approval row still read `approved`, so run state and
audit trail contradicted each other. Demonstrated before the fix:

```
SECOND DECISION RESULT {"runId":"f2a2f4ea…","resumed":false,"status":"failed"}
APPROVAL STATUS NOW  approved
RUN STATUS NOW       failed
```

Fixed in `src/lib/runs/index.ts`: a decision is final. Re-sending the **same**
decision remains idempotent — no second resume job is created — while the
**opposite** decision is refused, because reversing a decision is a deliberate
act rather than a retry. The pre-existing `run-resume.test.ts` covers idempotent
re-resolution and stayed green under this rule.

Verified the acceptance test catches the defect: removing the check fails F-16
and no other case.

---

## 6. Where the engine is still weak

Recorded rather than hidden:

1. **`findRunApprovals` matches on a JSON substring** —
   `requestJson: { contains: '"runId":"<id>"' }`. It is correct for rows this
   engine writes, but it is a string match standing in for a relation. A JSON
   column, or a real foreign key, would remove the class of bug where a
   coincidental substring matches. Not fixed here because it requires a migration
   across an existing table.
2. **No streaming assertion in this report.** SSE replay is covered by its own
   suite (`A1-03`), not by these two, and is not claimed here.
3. **Queue execution is proven at the queue layer**, not by running the real
   dispatcher loop end to end under a live worker. The dispatcher's own suite
   covers handler registration.

---

## 7. Environment and reproducibility

- Node v22.22.3; SQLite via the `node:sqlite` adapter (`PRISMA_SQLITE_ADAPTER=1`).
- `npx vitest run __tests__/integration/runtime-acceptance-failures.test.ts`
- `npx vitest run __tests__/integration/runtime-acceptance-behaviours.test.ts`
- Full suite at the time of writing: **243 files / 2671 passed / 15 skipped / 0 failed**.

---

## 8. Status

Stage 2 acceptance criteria — the 22 mandatory failure scenarios and the 20
required behaviours — are covered by passing automated tests against the real
engine on `main`.

Stage 2 is **not** `VERIFIED_COMPLETE`. That status additionally requires the
behaviour to be verified in the target environment, and the production database
is still unmigrated, which requires owner authorisation. This is an external
blocker, not an unfinished feature, and it is not counted as complete.
