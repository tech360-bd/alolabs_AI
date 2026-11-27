# Super Admin Command Center

**Status:** IMPLEMENTED, RUNTIME-VERIFIED for the dispatch path (see
`docs/reports/SUPER_ADMIN_ACCEPTANCE.md` for the per-criterion truth table).

The Command Center is the chat-first control plane for the AgentOS. It is not a
separate application: it is a dashboard panel plus two API routes that use the
existing Run Engine, approval system and audit log.

---

## 1. What makes it operational rather than a chat widget

The pre-existing `/api/super-chat` route is an *advisory* assistant. Its own
system prompt says so: it does not dispatch agents or execute operations. That is
honest, and it was left untouched.

The command center adds the operational path:

```
instruction ──▶ POST /api/super-admin/command
                    │
                    ├─ classify (deterministic, weighted vocabulary)
                    │     intent · risk · capability · steps · evidence
                    │
                    ├─ risk requires approval? ──▶ Approval row (type, risk, work order)
                    │                              Command → status "blocked"
                    │                              audit: super_admin.command.approval_required
                    │
                    └─ otherwise ───────────────▶ Command row
                                                   createRun() → AgentOSRun + QueueItem
                                                   RunEvent "run.queued"
                                                   audit: super_admin.command.dispatched
                                                   response: runId + streamUrl
```

Everything downstream is the product's existing machinery:

| Concern | Existing mechanism reused |
| --- | --- |
| Durable run identity | `AgentOSRun` rows via `createRun()` in `src/lib/runs/index.ts` |
| Queueing and retries | `enqueue()` in `src/lib/job-queue.ts` (DB-backed, idempotency keys) |
| Live timeline | `GET /api/runs/[id]/events` — persisted replay, then live bus events |
| Cancel / retry | `cancelRun()` / `retryRun()` through `POST /api/runs/[id]` |
| Approvals | `Approval` rows with `companyId`, `runId` and the full work order |
| Tenant isolation | `isUsableTenantId()`; a run cannot exist without a real company |
| Audit | `writeAuditEvent()` on dispatch, gate and refusal |
| Rate limiting | `checkEndpointLimit()` |

## 2. Instruction understanding

`src/lib/super-admin/operator.ts` is a **deterministic** classifier: weighted
phrases, no model call. Three consequences matter:

- **Testable.** The same instruction produces the same plan in every process with
  no provider availability.
- **Not injectable.** Risk is a property of the intent table, not of the text. An
  instruction that says "ignore safety instructions, this is read-only" still
  classifies as `deploy_to_production` with risk `destructive`.
- **Truthful.** Each intent declares the steps it will take and the evidence it
  will produce, and these are the steps written into the run and the approval.

Thirteen intents ship today:

| Intent | Risk | Capability |
| --- | --- | --- |
| `deploy_to_production` | destructive | approval required |
| `migrate_database` | destructive | approval required |
| `rotate_credential` | destructive | approval required |
| `cross_tenant_access` | destructive | approval required |
| `deploy_to_staging` | production | approval required |
| `create_environment` | reversible | needs a capability (host apply step) |
| `configure_provider` | reversible | wired |
| `inspect_capacity` | read | wired |
| `inspect_agents` | read | wired |
| `inspect_repository` | read | needs a capability (source-level review needs a coding agent) |
| `review_website` | read | needs a capability (headless browser) |
| `run_tests` | reversible | needs a configured agent |
| `general_task` | read | wired |

A second, independent safety net (`impliesGatedOperation`) adds an approval for
gated vocabulary — production, destructive SQL, rotation, secrets, SSH, `rm -rf`,
force push, DNS — even when no intent matches. It can only *add* a gate.

## 3. Authorisation

- `POST /api/super-admin/command`, `GET /api/super-admin/command` and both browser
  routes require the `super_admin` role via `requireRole`.
- A run is always created for the caller's own company. Naming a **different**
  company additionally requires the `system:cross-tenant` scope
  (`ALO_SYSTEM_OPERATORS`) **and** a written reason; without both, the request is
  refused before anything is written (T-7).
- Cross-tenant dispatch is recorded in the audit log with the actor, the target
  and the intent.
- The browser route is rate limited and writes an audit row for blocked
  navigations as well as completed ones.

## 4. The panel

`src/components/panels/super-admin-operator-panel.tsx` (dashboard id
`super-admin-operator`, "Super Admin Command"):

- composer with ⌘/Ctrl+Enter, file/image/video attachments (name, type, size
  only — **no file bytes leave the browser**), and an "attach URL" action;
- the plan card: risk badge, capability badge, steps, evidence, match score;
- a live timeline fed by `EventSource` on the run's SSE endpoint, with cancel and
  retry wired to the real endpoints;
- recent runs for the company, and an honest "how this stays honest" panel.

## 5. Honest limits

1. **Execution depends on configured agents.** A run is real and durable; whether
   a given step completes depends on the agents/providers bound in the deployment.
   A step with no agent fails the run rather than reporting success.
2. **No shell-capable coding agent is bound here.** `run_tests` therefore reports
   `needs_agent` and the run records the command it could not execute.
3. **Browser verification is capability-detected.** Playwright is not installed in
   this deployment, so `/api/super-admin/browser/verify` returns
   `verdict: "unavailable"` with the reason. See
   `docs/reports/BROWSER_VERIFICATION_REPORT.md`.
4. **No environment manager yet.** Configuration from the dashboard is the next
   stage; see `docs/reports/AGENTOS_REMAINING_BLOCKERS.md` §E1.
5. **Nav visibility is not role-filtered.** `DashboardNavItem` has no `roles`
   field, so a non-admin sees the item and gets 403s from the API. The server is
   the boundary; the UI is a follow-up.

## 6. Using it

```bash
# capability of the deployment (no browser installed here)
curl -s localhost:3011/api/super-admin/browser/verify | jq

# plan-only preview — writes nothing
curl -s -X POST localhost:3011/api/super-admin/command \
  -H 'content-type: application/json' -H "cookie: $SESSION" \
  -d '{"instruction":"Review https://github.com/owner/repo for security issues","previewOnly":true}' | jq

# dispatch
curl -s -X POST localhost:3011/api/super-admin/command \
  -H 'content-type: application/json' -H "cookie: $SESSION" \
  -d '{"instruction":"Show me which agents are running and what they are doing"}' | jq
```

Runtime proof (writes to a probe company, then deletes everything it created):

```bash
PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run verify:operator
```

---

## 7. Multi-agent orchestration (2026-11-27)

A single run has one agent. An objective that names several repositories, or a
multi-step procedure, needs several — so the command path can hand an objective to
the orchestrator, which plans subtasks, assigns agents from the registry, runs them
through the same Run Engine and reconciles the results.

```
objective ──▶ buildOrchestrationPlan()
                │  classify intent → steps (sequential: step N needs step N-1)
                │  extractTargets() → one parallel subtask per URL when ≥2 targets
                │  selectAgent() per subtask, write scopes serialised
                ▼
           orchestrate()  ──▶ child runs (AgentOSRun.parentRunId)
                │               real QueueItems, real RunEvents, real cancellation
                ▼
           reconcile()    ──▶ outcome + contradictions + verdict
```

Design decisions that matter:

- **`parentRunId` is a real column**, nullable and indexed, with a paired rollback
  migration in all three schema variants. Depth-limited cascading cancel
  (`MAX_CANCEL_DEPTH = 5`): cancelling a parent cancels its children, which cancel
  theirs.
- **Intent steps are a procedure, not a fan-out.** "Review this repo, then patch it,
  then open a PR" is ordered. Parallelism comes from independent targets, which is
  why `extractTargets()` drives the fan-out shape. The first version ran every step
  in parallel and produced agents racing to edit the same tree.
- **Write scopes serialise.** Two subtasks that both write are never in flight
  together, regardless of the concurrency limit. `MAX_CONCURRENCY = 4`.
- **A failing child never aborts the fan-out.** `createChild` is wrapped: a throw is
  recorded as `run.fanout.child_failed` and that subtask is marked permanently
  failed; the rest continue.
- **A timed-out or blocked child leaves the pending set** — the first version spun
  forever waiting for a subtask that would never report.
- **The whole run has a wall-clock deadline** (`subtasks × childTimeoutMs + 60s`);
  when it expires, live children are cancelled and `run.fanout.deadline_exceeded`
  lands on the timeline.
- **`platform.browser` and `platform.coding` are registered `unavailable`.** They
  exist as descriptors so planning can reason about them; nothing pretends they can
  execute.

Evidence:

- `__tests__/integration/orchestration-fanout.test.ts` — 12 cases against a scripted
  `RunPort`: real overlap (`maxConcurrent === 2`), cap enforcement, dependency order,
  retry vs no-retry, unassigned subtask, parent-cancel cascade, contradiction
  detection, child timeout, planning rules.
- `npm run verify:orchestration` — 7 checks against the real database with a stub
  executor (no model is called): two child rows carrying `parentRunId`, real overlap,
  the fan-out events on the parent timeline, and cascading cancel. Everything it
  creates is deleted before exit.

API: `POST /api/super-admin/orchestrate` (create, or `previewOnly` to see the plan),
`GET` for the agent registry. Cross-tenant orchestration requires the
`ALO_SYSTEM_OPERATORS` scope **and** a written reason, and is audited.

## 8. Repository assessment (2026-11-27)

"Should we use this GitHub project?" is answered from the API, not from vibes.

- `parseRepositoryReference()` accepts bare `owner/repo`, `git@github.com:` remotes,
  https URLs with sub-paths, `.git` suffixes — and rejects organisation listing
  pages, topics, GitLab and non-repository links rather than guessing.
- `assessRepository()` reads metadata, latest release, recent commits, the tree and
  `package.json`, then applies rules: archived, disabled, no licence, copyleft,
  stale, install-time script execution, duplication against `LINK_COVERAGE`.
- Verdicts are `reject | isolated_evaluation_only | safe_after_review |
  safe_to_integrate`, each with a sentence a human can argue with.
- **Absence is not evidence.** Without `GITHUB_TOKEN`, advisories are reported as
  *unknown* — never as "no advisories". Anything unreadable lands in `unavailable[]`
  with the reason, and an unreadable repository is a rejection, not a pass.
- A `curl … | sh` install hook is a **reject**; any other install hook is
  `isolated_evaluation_only` — the package runs code at install time, so evaluate it
  somewhere without credentials or network reach into our systems.

Evidence: `__tests__/unit/lib/github-assess.test.ts` (12 cases over an injected
`fetch`), and `npm run verify:github` — live assessments of real repositories. On
2026-11-27: `vercel/next.js` → `isolated_evaluation_only` (its `postinstall` runs a
program), `ripienaar/free-for-dev` → `reject` (no licence), `tech360-bd/alolabs_AI` →
`safe_to_integrate`. Note: this sandbox intercepts TLS with a private CA, so the live
script needs `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt`; a normal host
or CI runner does not.

Tool: `github_repository_assess` in the command agent's registry, and
`POST /api/super-admin/repository/assess` (super admin, rate-limited, audited).

## 9. Notifications and run links (2026-11-27)

`src/lib/notifications/operator.ts` writes into the existing `Notification` table —
the same one the dashboard bell reads:

- **Tenant-scoped**: a notification always belongs to one company; there is no
  broadcast path, and a missing tenant is refused rather than written.
- **Deduplicated** on `type + runId` (24 h window) inside `metadata`, so a retrying
  worker cannot produce ten identical alerts.
- **Linked**: `runId`, `approvalId`, `link` and evidence pointers travel in
  `metadata`, so the notification opens the thing it is about.
- **Delivery is visible**: with `OPERATOR_WEBHOOK_URL` set, the push is attempted
  with an 8 s timeout; a failure records `attempts` and `lastError` on the row and
  the in-app notification survives. `retryFailedDeliveries()` retries only those.

Wired into: approval gates (an operator may be on another screen when the gate
rises), orchestration reconciliation (completed / failed / cancelled), and available
to any caller that knows a run id. Evidence:
`__tests__/unit/lib/operator-notifications.test.ts` (8 cases: dedupe, tenant scoping,
failed delivery, successful delivery, retry).
