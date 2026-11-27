# Super Admin — operations runbook

**Audience:** the person who owns a deployment of the Command Center.
**Measured on:** 2026-11-27 · branch `arena/5010a0d6-alolabs-ai`.

Everything here assumes you are a `super_admin` with a session cookie, or are
running on the host with the application's environment loaded. Nothing in this
runbook requires the owner's production credentials; commands marked
**⚠ needs authorization** must not be run against production without it.

---

## 1. Health, in one screen

```bash
curl -s localhost:3011/api/health | jq                      # process + DB reachability
curl -s localhost:3011/api/super-admin/browser/verify | jq   # browser capability + SSRF policy
curl -s localhost:3011/api/super-admin/orchestrate | jq      # agent registry and health
```

Read the browser response before trusting any browser claim: `status:
"unavailable"` with `reason: "chromium binary not installed"` means the capability
is honest about being absent, and every browser verification will report
`unavailable` rather than a pass.

## 2. The three probe scripts

All three write to a probe company, assert against real rows, and delete what they
created. They are safe to run on a staging database; do not point them at
production.

```bash
export PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db
npm run verify:operator        # command → run → dispatch → audit (15 checks)
npm run verify:orchestration   # fan-out rows, overlap, events, cascading cancel (7 checks)
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
  npm run verify:github        # live repository assessment (3 repositories)
```

`verify:github` reaches the public API. On a host whose TLS is intercepted by a
private CA you need the `NODE_EXTRA_CA_CERTS` override shown above; on a normal
host or CI runner you do not. `GITHUB_TOKEN` raises the rate limit and enables
advisory counts — without it, advisories are reported as **unknown**, never as
"none".

## 3. Running a command

1. **Preview first.** `POST /api/super-admin/command` with `{"instruction": "…",
   "previewOnly": true}` returns the classification, the steps, the risk and the
   agents it would use — and writes nothing. Do this for anything unfamiliar.
2. **Dispatch.** Same call without `previewOnly` returns `runId` and `streamUrl`.
3. **Watch.** `GET /api/runs/{runId}/events` replays persisted events and then
   streams live ones. A refresh re-reads the same rows; the run identity is the
   database row, not the socket.
4. **If it asks for approval**, the approval row contains the full work order.
   Approving resumes the intent; rejecting leaves the run `blocked` with the reason
   on the timeline.

### Orchestrated objectives

```bash
curl -s -X POST localhost:3011/api/super-admin/orchestrate \
  -H 'content-type: application/json' -H "cookie: $SESSION" \
  -d '{"objective":"Review https://github.com/a/b and https://github.com/c/d and report","previewOnly":true}' | jq
```

Two independent URLs produce two parallel subtasks; a procedure ("review, then
patch, then open a PR") produces a chain, because step two needs step one's output.
Write-scoped subtasks never run concurrently. Cross-tenant orchestration requires
the `ALO_SYSTEM_OPERATORS` scope **and** a written reason, and is audited.

## 4. Repository assessment before integrating anything

```bash
curl -s -X POST localhost:3011/api/super-admin/repository/assess \
  -H 'content-type: application/json' -H "cookie: $SESSION" \
  -d '{"repository":"https://github.com/owner/repo"}' | jq '.verdict, .findings'
```

Read the verdict, not the star count:

| Verdict | What to do |
| --- | --- |
| `safe_to_integrate` | Rules found no licence, activity, install-script or advisory problem. Still review the diff you intend to copy. |
| `safe_after_review` | Something specific needs a human — stale, unusual licence, structural signal. The finding says which. |
| `isolated_evaluation_only` | It runs code at install time or is copyleft. Build it somewhere without credentials or network reach into our systems. |
| `reject` | Archived, unlicensed, or an install hook that pipes a download into a shell. Do not bring it in. |

`unavailable[]` lists what could not be read. An empty `unavailable[]` with a clean
verdict is the only combination that means "no known problem".

## 5. When something goes wrong

| Symptom | First thing to check |
| --- | --- |
| A run sits in `queued` | Is the worker alive? `ps` for the agentos dispatcher; `QueueItem` rows for the run; `run.queued` without a matching `run.started` means the worker never picked it up. |
| Fan-out stuck | Parent timeline: `run.fanout.deadline_exceeded` means the orchestrator cancelled live children and stopped. `run.fanout.child_failed` names the subtask that threw. |
| Cancellation did nothing | Cancellation is depth-limited to 5 generations; check `AgentOSRun.parentRunId` for grandchildren below that. |
| No notification arrived | `metadata.delivery.lastError` on the `Notification` row records the webhook failure; `retryFailedDeliveries(companyId)` retries only those. In-app rows are never deleted. |
| Browser verification says `unavailable` | Install Chromium on the host (`npx playwright install chromium --with-deps`). Do **not** treat `unavailable` as a pass, and do not edit the route to return success. |
| GitHub assessment says unreadable | `metadata.unavailable[]` has the API's answer: 404 (wrong reference), 403 (rate limit — set `GITHUB_TOKEN`), or a TLS error (certificate override). |

## 6. Deploying the worker and the web process

- Web and worker share the database but not credentials: the worker needs the
  queue's database access only.
- `OPERATOR_WEBHOOK_URL` is optional; without it, notifications stay in-app and
  `delivery: "skipped"`.
- `GITHUB_TOKEN` should be a read-only fine-grained token. It is used for
  rate limits and advisories only, never for writes.
- Rotating any of these is a **⚠ needs authorization** operation: change the value,
  restart the affected process, verify `/api/health` and one probe script, and keep
  the old value out of logs.

## 7. What this deployment still cannot do

- No agent has executed end-to-end here (no provider credentials, no bound coding
  agent), so no multi-agent objective has produced real work yet.
- No browser page has been opened (Chromium absent).
- Nothing has been deployed, migrated or rotated against production.

Those are reported as `IMPLEMENTED, NOT RUNTIME-VERIFIED` /
`BLOCKED BY EXTERNAL DEPENDENCY` in `SUPER_ADMIN_ACCEPTANCE.md`, not as complete.
