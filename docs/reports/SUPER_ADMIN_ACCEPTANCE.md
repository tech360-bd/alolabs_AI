# Super Admin Command Center — acceptance

**Measured:** 2026-11-27 · branch `arena/5010a0d6-alolabs-ai` · commit at time of
writing: see `git log -1` (recorded in `FINAL_COMPLETION_BASELINE.md`).

Status labels used: **VERIFIED COMPLETE** · **IMPLEMENTED, NOT RUNTIME-VERIFIED**
· **BLOCKED BY OWNER AUTHORIZATION** · **BLOCKED BY EXTERNAL DEPENDENCY** ·
**NOT COMPLETE**.

---

## A. The twenty Stage-8 acceptance workflows

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Natural-language task creates a persisted run id | **VERIFIED COMPLETE** | `npm run verify:operator` — 15/15 checks; `AgentOSRun` + `QueueItem` + `run.queued` event asserted; `__tests__/api/super-admin-command.test.ts` (14 tests) |
| 2 | Attach an image and have an agent inspect it | **NOT COMPLETE** | The panel attaches images (name/type/size) and the run records them, but no vision tool consumes an attachment yet. |
| 3 | Submit a video and verify ingestion/analysis | **NOT COMPLETE** | Attachment classification exists (`.mp4/.webm/.mov`); no video pipeline is wired. |
| 4 | Submit a URL and have the browser inspect it | **IMPLEMENTED, NOT RUNTIME-VERIFIED** | `POST /api/super-admin/browser/verify` + `browser_verify` tool + SSRF guard (30 policy tests). Browser binary absent here → returns `unavailable`. |
| 5 | GitHub repo URL → evidence-based security/compatibility assessment | **NOT COMPLETE** | Intent `inspect_repository` classifies and plans (tests green); the assessment itself needs a coding agent. |
| 6 | Delegate a task to multiple agents | **NOT COMPLETE** | Runs dispatch to the engine; no coordinator/specialist fan-out is implemented. |
| 7 | Real-time persisted execution events | **VERIFIED COMPLETE** (transport) | Panel consumes `GET /api/runs/[id]/events` (persisted replay + live bus); `run.queued` asserted in the runtime probe. Event *content* beyond queueing depends on an executing agent. |
| 8 | Refresh the browser and recover the same run | **VERIFIED COMPLETE** | Timeline is replayed from `RunEvent` rows; the SSE route supports `Last-Event-ID`. Run identity is the DB row, not the socket. |
| 9 | Cancel an active run and verify actual cancellation | **VERIFIED COMPLETE** (engine) | `cancelRun()` cancels pending `QueueItem` rows and propagates; covered by the run-engine suites. Panel button calls it. |
| 10 | Retry a failed run without duplicate side effects | **VERIFIED COMPLETE** (engine) | `retryRun()` preserves completed checkpoints; idempotency key `run:<id>`. Panel button calls it. |
| 11 | Open the result in the browser | **BLOCKED BY EXTERNAL DEPENDENCY** | Playwright + Chromium are not installed in this deployment; the route reports `unavailable` rather than a pass. |
| 12 | Detect a deliberately introduced safe defect | **NOT COMPLETE** | Needs #11. The guard and evidence format are ready. |
| 13 | Correct the defect | **NOT COMPLETE** | Needs a bound coding agent. |
| 14 | Rerun tests and browser verification | **NOT COMPLETE** | `run_tests` intent reports `needs_agent`. |
| 15 | Final notification with evidence | **NOT COMPLETE** | Runs expose events and a final status; no notification delivery is wired to the panel. |
| 16 | Unauthorised users cannot access the interface | **VERIFIED COMPLETE** | `requireRole('super_admin')` on all four handlers; 401/403 cases asserted in `super-admin-command.test.ts`. |
| 17 | Company A cannot inspect Company B tasks | **VERIFIED COMPLETE** | Dispatch refuses a foreign `companyId` without the `system:cross-tenant` scope (403) and requires a reason; `GET` lists only the caller's company. Both asserted. |
| 18 | Sensitive production actions require approval | **VERIFIED COMPLETE** | `deploy_to_production`, `deploy_to_staging`, `migrate_database`, `rotate_credential`, `cross_tenant_access` create an `Approval` and start **no** run — asserted in the route tests and the runtime probe. |
| 19 | Every action is auditable | **VERIFIED COMPLETE** | `writeAuditEvent` on dispatch, on gate, on queue failure and on blocked browser navigation. |
| 20 | Worker restart does not destroy run history | **VERIFIED COMPLETE** (engine) | `RunEvent`/`TaskStep`/checkpoint rows are durable; covered by `run-engine-behaviours`, `run-resume`, `job-queue-durability`. |

**Score: 9 verified complete · 1 implemented but not runtime-verified · 1 blocked
by external dependency · 9 not complete.** No percentage is offered: nine
acceptance workflows are genuinely missing.

## B. What was built in this session

| Piece | Path | Tests |
| --- | --- | --- |
| Intent table, classifier, attachment classification | `src/lib/super-admin/operator.ts` | `__tests__/unit/lib/operator-intents.test.ts` (17) |
| Dispatcher (command → run, or approval) | `src/lib/super-admin/dispatch.ts` | covered by the route tests + runtime probe |
| Operational API | `src/app/api/super-admin/command/route.ts` | `__tests__/api/super-admin-command.test.ts` (14) |
| SSRF policy for agent browsing | `src/lib/browser/navigation-guard.ts` | `__tests__/unit/lib/browser-navigation-guard.test.ts` (30) |
| Browser verification + capability detection | `src/lib/browser/verify.ts` | route + `npm run verify:browser` |
| Browser API | `src/app/api/super-admin/browser/verify/route.ts` | guard tests + capability probe |
| Operator panel | `src/components/panels/super-admin-operator-panel.tsx` | typecheck/lint; manual render in dev |
| Runtime proof | `scripts/verify-operator-dispatch.ts` | 15/15 checks against SQLite |

## C. Security properties asserted

1. A run cannot be created without a usable tenant (`createRun` throws; the probe
   asserts `'default-company'` is rejected).
2. A foreign company target requires scope **and** reason; without either, no
   `Command`, `Approval` or `AgentOSRun` row is written.
3. Risk cannot be lowered by instruction text (asserted with an injection-styled
   instruction).
4. The browser refuses loopback, RFC1918, link-local, CGNAT, cloud metadata,
   IPv4-in-decimal/hex/**octal**, IPv4-mapped IPv6, `file:`, `javascript:`,
   `data:` and credential-bearing URLs — 30 assertions.
5. Blocked navigations are audited.
6. The approval body contains the work order (steps, evidence, attachments), not a
   summary.

## D. Not claimed

- No agent was executed end-to-end in this environment (no provider credentials,
  no bound coding agent).
- No browser page was opened (no Chromium).
- Nothing was deployed, migrated or rotated.
