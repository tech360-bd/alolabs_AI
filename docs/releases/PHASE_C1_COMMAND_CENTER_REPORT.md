# Phase C1 — Super Admin Command Center: durable, observable, honest

**Date:** 2026-11-25
**Branch:** `arena/56041def-alolabs-ai`
**Scope:** turn the existing ChatGPT-style Commanding Center into a surface an operator can trust: history that survives restarts, a status that never overstates, an approval pause that is visible and actionable, and routing evidence for the free-provider switchgear.
**Not in scope:** website/repo editing from chat, browser-based auto-repair, sandbox execution (Phases D–F).

---

## 1. Before state

- The panel existed (`src/components/enterprise/panels/command-agent-center.tsx`) and called a real tool-calling agent.
- The agent kept its transcript in a module-level `Map`: a restart wiped history, two instances disagreed, and a reload showed an empty chat.
- A blocked tool appeared in the trace as a plain failure. A run paused for approval was indistinguishable from a failed tool, and the response carried no approval id or status.
- Provider failover happened inside the gateway but the agent discarded `attempts`/`fallbackUsed`, so an operator could not see whether the answer came from Groq, OpenRouter or a local model after a failure.
- `/api/super-chat` (the other Super Admin chat) is *advice-only* by design; the acting agent had no history API at all.

## 2. What already worked and was preserved

- One execution path: command agent → `executeCompanyAIChat` → AI router (free-only, quota, verification, failover).
- Governance enforcement on internal tools, and emergency controls.
- Free catalogue: **13 providers, 67 models, 33 services, 5 no-key tools** (measured from `free-catalog.ts`).
- Tenant scoping on company resolution and API-key identity.

## 3. Gaps addressed

| Gap | Outcome |
| --- | --- |
| In-memory transcript | ✅ durable `Conversation` / `ConversationMessage` store, tenant-scoped, best-effort with explicit reporting |
| No history API | ✅ `GET /api/command-agent/chat?sessionId=…`; `DELETE` clears durably |
| Blocked step looked like a failure | ✅ `waiting_for_approval` + `approvals[]` with the real approval id and approvers |
| No run status | ✅ closed vocabulary (`completed`, `partially_completed`, `waiting_for_approval`, `failed`) with plain-language detail |
| Silent persistence failure | ✅ `persisted: false` + UI warning |
| Failover invisible | ✅ `routing {attempts, fallbackUsed, switches, providers}` returned, persisted and rendered |
| Random session per mount | ✅ stable per-browser session id so reloads resume the same transcript |

## 4. Changes made

| File | Change |
| --- | --- |
| `src/lib/chat/command-session-store.ts` *(new)* | Find/create conversation by user + tenant + deterministic title; load last 20 turns with the tenant filter inside the query; append with explicit role mapping; clear messages without deleting the row; failures logged and reported |
| `src/lib/command-agent/status.ts` *(new)* | Pure `deriveCommandStatus` + `describeCommandStatus` + closed `COMMAND_STATUSES` |
| `src/lib/command-agent/agent.ts` | Uses the durable store; collects approvals; tracks routing attempts/failover/providers; derives status; persists both turns with evidence metadata; `clearCommandSessions` now async and tenant-aware; empty answer is never returned as blank |
| `src/app/api/command-agent/chat/route.ts` | `GET` transcript (auth + company resolution + `durable` flag); `DELETE` resolves the company and audits it; `POST` returns `status`, `statusDetail`, `approvals`, `persisted`, `routing` |
| `src/components/enterprise/panels/command-agent-center.tsx` | Restores history on mount, stable session id, status badges, approval card, routing line ("N attempts · failover used (A → B)"), storage-unavailable notice; palette-correct colours for the new elements (`#172033`, `#667085`, `#FC5400`) |
| `__tests__/unit/command-session-store.test.ts` *(new)* | 12 cases: identity, tenant isolation, column-level query filter, role mapping, metadata resilience, failure reporting, scoped clear |
| `__tests__/unit/command-status.test.ts` *(new)* | 7 cases: every status path, partial-vs-complete, closed vocabulary |
| `__tests__/unit/command-agent.test.ts` | Replaced the empty DB mock with an in-memory conversation double; asserts durable turns, `completed`, routing; new `waiting_for_approval` test that yields a real approval id and failover evidence |
| `src/components/panels/super-commanding-chat.tsx` | The advice-only Super Admin chat now says so explicitly and links to the acting Commanding Center; "agents online" corrected to "agents registered" (the count is registration, not liveness) |
| `src/store/app.ts` | Added the `command-agent` view to `ViewType` so the boundary banner can navigate to it in a typed way |
| `docs/architecture/SUPER_ADMIN_AI_COMMAND_CENTER.md` | Rewritten with verified status, component/sequence/failover diagrams (Mermaid), status table, omni-routing facts, self-healing stage table, API architecture, updated gap list |
| `docs/roadmap/AGENTOS_IMPLEMENTATION_ROADMAP.md` | Phase C1 items marked with evidence; remaining gaps kept open |

## 5. Agents and departments used

None. No workforce agent, temporary agent, orchestrator team or department runtime was created or executed. Model calls in the tests are mocked; no provider was contacted.

## 6. Tools and providers used

- No live AI provider call, no paid API, no image generation.
- The free catalogue was read as data to state real counts (13/67/33); it is configuration, not a claim that any of those providers is currently reachable.

## 7. Integrations required

None new. Persistence uses the existing database; routing uses the existing gateway/router; the panel uses the existing session auth.

## 8. Files and APIs changed

- New: `GET /api/command-agent/chat` (durable history), store module, status module.
- Changed contract (additive): `POST /api/command-agent/chat` now returns `status`, `statusDetail`, `approvals`, `persisted`, `routing`.
- `DELETE /api/command-agent/chat` now requires a resolvable company and writes an audit event with `companyId`.
- UI: `command-agent` panel restores history and renders status/approvals/routing.
- UI: the default `super-admin` chat now carries an explicit advice-only boundary and a link to the acting panel.

## 9. Database and migration impact

**No schema change, no migration.** Reuses:

- `Conversation` (id, userId, companyId, title, status)
- `ConversationMessage` (conversationId, role, content, model, metadata)
- `AuditLog` via `writeAuditEvent` for clears.

Legacy rows are unaffected. Conversations are distinguished by a `Command Agent — <session>` title, so end-user and Super Admin transcripts never mix.

## 10. Tests actually run

```bash
npx vitest run __tests__/unit/command-session-store.test.ts \
  __tests__/unit/command-status.test.ts \
  __tests__/unit/command-agent.test.ts \
  __tests__/api/command-agent.test.ts
```

Result: **37 passed / 4 files** (0 failed) at the time of writing; exact totals are re-run before CI and recorded in §15.

`npx eslint` on every changed file: clean.
`npx tsc --noEmit`: the pre-existing Prisma-client cascade from the offline sandbox; no new error in the new modules (filtered grep on changed paths). CI is authoritative.

## 11. Browser evidence

**None.** The panel changes were not opened in a browser in this phase. The history-restore effect and status rendering are source-verified only, so they are claimed as code changes, not as verified screens. CI's isolated Chromium job covers login/MFA, not this panel.

## 12. Security findings

1. **History could not be audited** (fixed): an in-memory transcript left no record after a restart. It is now a tenant-scoped table row with `userId` + `companyId` in the query.
2. **Cross-tenant read risk avoided**: `loadCommandTurns` filters on `conversation.companyId` inside the query, not after fetching. A guessed conversation id returns nothing.
3. **No credential exposure**: routing evidence contains provider *names* and attempt counts only — no keys, endpoints or headers. Provider keys remain sealed server-side.
4. **Status could have overstated success** (fixed): a blocked tool initially still produced `completed`. The derivation now prioritises `waiting_for_approval`, then failed steps, then content.
5. **Silent persistence failure** (fixed): append failures previously vanished; they now surface as `persisted: false` to the caller and the UI.
6. **Panel remains privileged**: `/api/command-agent/*` requires super_admin or a company owner/admin; the public site has no path to it.

## 13. Cost

**$0.** No model or API call was made. All provider interactions in this phase were mocks.

## 14. Commit and PR

Pending at first draft; final hashes are recorded here after push, in the same PR [#60](https://github.com/tech360-bd/alolabs_AI/pull/60).

## 15. CI status

Pending on push. CI generates the Prisma client and is the authoritative type/lint/test/build result. No green status is claimed in advance.

## 16. Deployment status

**Not deployed.** No production action, migration or infrastructure change was performed.

## 17. Limitations

- **The agent still cannot change the website or the system.** Its tools are read-only and free-tier only. Natural-language requests to modify code/content are answered with a plan and a pointer to the governed workflow — not executed. This is the Phase E gap, and the panel says "Read-only tools" explicitly.
- **No browser-based auto-repair.** There is no headless browser dependency and no sandbox executor, so "detect an error on the internet, fix it, verify it" is a design (§6 of the architecture doc), not a capability.
- **No streaming.** The turn returns when the loop finishes; long runs show a spinner, not tokens.
- **Approval continuation is manual.** The operator approves in the Approvals panel and re-sends the command; there is no "approve and continue" button yet.
- **History is capped** at the last 20 turns for replay and display.
- **No OpenAPI/SDK** for external integrators yet.

## 18. Next phase

**Phase C2** (one reviewable PR): stream run events into the panel (SSE or polling on a run id), add the execution timeline bound to real `AgentRun`/audit rows, and wire agent-team assignment to the existing multi-agent orchestrator.

**Phase D** then adds the browser research + verification loop, which is the prerequisite for any honest claim of autonomous error detection.
