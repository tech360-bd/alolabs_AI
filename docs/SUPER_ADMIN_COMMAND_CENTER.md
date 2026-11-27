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
