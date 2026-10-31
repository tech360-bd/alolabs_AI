# QA and testing audit and acceptance plan

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## What actually ran

Only existing dependency-free static checks ran: workflow definitions (17, no errors), route-auth references (410 files/636 non-public handlers), workflow action security (8 workflows/30 pinned actions), and diff whitespace. Raw current outputs: [validation evidence](phase0/validation-evidence.json). These are not unit/integration/E2E tests. Full suite, lint, typecheck and build were not run because no dependency installation was authorized or performed in this audit.

The repository has Vitest and testing-library configurations and substantial unit/integration tests, including queue durability, orchestrator persistence, database/migration policy and tool permissions. Preserve all existing suites. Prior reports of passes/failures are historical, not current evidence. TestSprite/CodeRabbit website details are inaccessible here; no claim is made they are self-hosted or currently free.

## Reproducible validation matrix for approved next stages

| Area | Required test/evidence |
|---|---|
| Durable core | Real process termination/restart, lease expiry, concurrent claims, dead-letter/retry, idempotency and cancellation in disposable target-version DB. |
| Permissions/approval | Missing grant, spoofed/replayed/expired/revoked approval, changed action, tenant mismatch, audit outage, direct internal call. |
| API | Authn/authz/tenant/CSRF/rate-limit/webhook signature and replay; allowed and denied requests for every privileged endpoint. |
| Models | Actual local endpoint/model digest, output quality, token/context budgets, latency/RAM/VRAM, timeout/failover, no accidental external fallback. |
| Browser/UI | Deterministic browser/viewport/fixtures, navigation and form workflows, keyboard/screen-reader checks, accessibility violations and screenshot diff reviewed by a human. |
| Factory | Synthetic task from repository audit through tested code/diff review/approval-gated PR preparation. |
| Memory | Cross-project read/write/query denial, provenance verification, injection fixtures, retention/deletion approval and recovery behavior. |
| Isolation | Network/filesystem/metadata/secret/socket escapes, malicious archives, quota termination and destruction checks. |
| Recovery | Encrypted backup, fresh isolated restore, row/constraint/artifact/ACL comparison, documented RPO/RTO and rollback rehearsal. |
| Load | Staging-only fixed workload, concurrency/queue/backpressure saturation, resource ceilings and percentile latency. No production stress tests. |

## Reporting contract

Each report records commit/image/dependency versions, test inputs and seed, command, timestamps, environment, exit status, expected/actual behavior, failure reproduction, artifact digest, limitations, coverage scope and reviewer. Distinguish passed/failed/skipped/blocked/not-run; skipped is not passed. Do not advertise a coverage percentage without a generated coverage report.

Self-hosted candidates for later review: existing Vitest plus Playwright browser/API tests, axe-core accessibility, approved static analyzers and a load runner. These were not installed; exact versions/licenses and compatibility remain approval gates.
