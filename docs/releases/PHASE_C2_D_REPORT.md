# Phase C2 + D — Run timelines that survive reload, and research that shows its evidence

**Status:** implemented, CI green on PR [#63](https://github.com/tech360-bd/alolabs_AI/pull/63), not merged, not deployed.
**Date:** 2026-11-25.
**Scope:** Command Agent run identity + streaming + timeline (Phase C2); public-page research and HTTP-level verification (Phase D tier 1).

---

## 1. Before state

- Phase C1 had a durable transcript and an honest status vocabulary, but **a turn was not a run**: there was no run id, no stored event timeline, and no way to re-read what happened after a reload.
- The panel rendered `steps/trace` only if the final JSON response arrived. A long or failed run showed nothing until it ended, and a failed run left no trace at all.
- The agent could search (`web_search`, Wikipedia, Hacker News) but **could not open a page**. The link-coverage registry said so explicitly: “nothing here fetches a page”.
- There was a reusable SSRF guard (`src/lib/webhooks/ssrf-guard.ts`) and a governance engine, but no robots.txt handling, no per-hop redirect checks for research, no citation/evidence structure, and no tenant-scoped place to store a finding.
- Repository state note: PR #60 had already merged and GitHub deleted the remote session branch. The working copy was recovered by fetching `main` and rebuilding the branch on the merged commit (`5dcc45c`) — **no force-push, no history rewrite**. Earlier-phase work was preserved by the merge.
- Later, `main` (PR #62) was merged into this branch remotely; that merge **dropped** the Phase C1 durable transcript and the new Phase C2 event wiring in `agent.ts`, and `main` itself carried five type-gate regressions. Both were repaired in `f638594`/`f961669` (§4, §15) rather than papered over.

## 2. What already worked and was preserved

- `runCommandAgent` loop, free-only routing, failover evidence (`attempts`, `fallbackUsed`, `providers`), status derivation, approval pauses with real approval ids (`CompanyAIError` failure path unchanged).
- Tenant isolation in the chat route (super_admin / company admin only) — now shared by every Commanding Center route through `src/lib/command-agent/access.ts`.
- Existing tests (13 agent, 7 API, status/session-store suites) — all still passing.

## 3. Gaps addressed

| Gap | Resolution |
| --- | --- |
| No run identity / no timeline | `run-store.ts`: `startCommandRun`, `finishCommandRun`, `getCommandRun`, bounded event collector |
| No live progress | `POST /api/command-agent/stream` (NDJSON: `event`, `run`, `final`, `error`) |
| No post-reload retrieval | `GET /api/command-agent/runs/[id]`, tenant-scoped, artifact-kind-checked |
| Read-only web tools, no page analysis | `src/lib/research/public-page.ts` + `analyze_public_page` tool |
| No citation/evidence record | Evidence block (final URL, status, `fetchedAt`, bytes, SHA-256, citations) + `access.signals` |
| No stored research memory | `Artifact` (`metadata.kind='research_report'`), opt-in, company-scoped |
| Duplicated tenant/auth logic across routes | `access.ts` used by chat, stream, runs |

## 4. Changes made

**New libraries**

- `src/lib/command-agent/run-store.ts` — run lifecycle over `Artifact` (`type='json'`, `metadata.kind='command_run'`), 200-event bound, 4 000-char payload cap, SHA-256 of stored body, `createEventCollector` that never lets a broken consumer break a run.
- `src/lib/command-agent/access.ts` — `canUseCommandAgent`, `resolveCommandCompany` (super_admin may target a company; company admins only their own).
- `src/lib/research/public-page.ts` — URL validation, robots.txt parser (longest-match, `*`/`$` wildcards), HTML extraction, capped fetch loop with per-hop `checkSsrf`, evidence assembly.
- `src/lib/research/research-store.ts` — save/list/get research reports as tenant-scoped artifacts.

**Changed**

- `src/lib/command-agent/agent.ts` — emits `run_started`/`model`/`tool`/`approval`/`final`/`error`; finalises as `failed` on exceptions and rethrows; returns `runId`/`eventCount`; accepts `onEvent`.
- `src/lib/command-agent/tools.ts` — registers `analyze_public_page`.
- `src/app/api/command-agent/chat/route.ts` — uses shared access rules; returns `runId`/`eventCount`.
- `src/components/enterprise/panels/command-agent-center.tsx` — streaming send with NDJSON parser, single plain-JSON fallback when the stream route is absent, live timeline, reloadable timeline, run id display.
- `src/lib/link-coverage/registry.ts` — molx claim corrected: a single-page analyser exists; there is still no crawler.
- `src/app/api/v1/models/inference/route.ts` — **unrelated main-branch regression** fixed (TS4104 on a readonly tuple cast) because the gate blocked every PR.
- `src/lib/self-healing/index.ts`, `src/lib/site-content.ts`, `src/lib/self-healing/site-doctor.ts`, `__tests__/unit/{supervisor-tools,site-doctor}.test.ts` — **main-branch gate regressions** fixed (out-of-scope `params`, nullable compound-unique lookup, lost status union, untyped audit mocks).
- `src/lib/command-agent/agent.ts` + `src/app/api/command-agent/{chat,stream}/route.ts` — after the remote `main` merge dropped the supervisor wiring, the verified C1+C2 versions were restored and supervisor mode (`mode: 'read' | 'supervisor'`, super_admin only) was re-applied to both routes.
- Docs: `docs/architecture/SUPER_ADMIN_AI_COMMAND_CENTER.md` §10–§11, roadmap Phase C/D.

**New routes**

- `POST /api/command-agent/stream`
- `GET /api/command-agent/runs/[id]`
- `GET|POST /api/research/analyze`
- `GET /api/research/reports/[id]`

**New UI**

- `src/components/enterprise/panels/research-verification.tsx`, mounted as the **Research & Verify** tab.

## 5. Agents and departments used

- Command Agent (the product surface under test) — no live model call was required for tests; the router was mocked in unit/API tests.
- No department agents, no workforce runs, and no background jobs were started for this phase.

## 6. Tools and providers used

- **Zero paid providers, zero live provider calls.** Tests stub the gateway and `fetch`.
- `npm install --ignore-scripts`, `vitest`, `eslint`, `tsc`, `npm run verify:links`, `gh` CLI.
- Prisma client generation is unavailable in this sandbox (`binaries.prisma.sh` unreachable), so CI is the type/build authority.

## 7. Integrations required

- None new. No new secrets, no OAuth, no external accounts.
- Research uses plain HTTP with an identifying user agent (`ALOLabsResearchBot/1.0`), no API keys.

## 8. Files and APIs changed

`git diff --stat 5dcc45c..01e308f` (feature commits): 22 files, +2 913 / −60.

New API contracts:

```
POST /api/command-agent/stream            (NDJSON)
  request:  {message, sessionId, profile, model?, targetCompany?, skillSlugs?}
  response: {"type":"event","event":{seq,at,type,data}}
            {"type":"run","runId":"…"}
            {"type":"final","result":{…chat fields, runId, eventCount}}
            {"type":"error","error":"…","code":"…","hint":"…"}

GET  /api/command-agent/runs/{id}         {success, run:{status,events,…}, company}
POST /api/research/analyze                {url, save?, note?} → {analysis, saved, verification}
GET  /api/research/analyze                {reports:[…]}
GET  /api/research/reports/{id}           {report:{analysis,…}}
```

## 9. Database and migration impact

**No migration.** Both phases reuse `Artifact`:

- command run → `type='json'`, `metadata.kind='command_run'`;
- research finding → `type='json'`, `metadata.kind='research_report'`.

`AgentRun` needs an `Agent` FK and `AgentExecution` needs an `AgentInstance`; inventing parent rows was rejected. `RagDocument` needs a collection, so it was rejected for findings too. A dedicated `CommandRun` / `ResearchSource` migration remains a follow-up, not a hidden requirement.

## 10. Tests actually run

| Command | Result |
| --- | --- |
| `vitest run __tests__/unit/command-run-store.test.ts` | 7 passed |
| `vitest run __tests__/unit/public-page.test.ts` | 11 passed |
| `vitest run __tests__/api/command-agent-stream.test.ts` | 4 passed |
| `vitest run __tests__/api/research-analyze.test.ts` | 6 passed |
| focused command suite (8 files incl. agent, API, status, session store, governance) | 65 passed |
| `npx eslint` on every changed file | clean |
| `npm run verify:links` | 233/233 evidence paths found, 0 missing |
| `npx tsc --noEmit` (local) | 0 errors in changed files; repo-wide run blocked by the ungenerated Prisma client |
| CI: TypeScript hard gate, tests, lint, Next build | **pass** (run [45668689127](https://github.com/tech360-bd/alolabs_AI/actions/runs/45668689127)) |

The new tests cover, specifically:

- run creation failure returns `null` (command still runs), cross-tenant finalisation refused, checksum equals SHA-256 of stored body, 220 events trimmed to 200, non-run artifacts rejected, thrown event sink ignored.
- robots disallow performs **no page fetch**; SSRF block rejects; redirect recorded as final URL with SSRF re-check; 403 becomes restricted evidence with no citation; 512 KB cap enforced; wildcard/tie robots rules; HTML extraction (title/description/lang/canonical/alt/links/stack/issues).
- stream frames: `run` follows `run_started`, failed run has `error` and no `final`, 401/403 before the agent is called, invalid profile rejected.
- research: body company cannot override tenant, governance deny prevents the fetch, private/file URLs rejected without fetching, SSRF block → 403, report listing scoped to caller's company.

## 11. Browser evidence

**None.** The Research & Verify tab and the streaming timeline were **not exercised in a browser** in this environment; there is no headless Chromium in the app runtime and the CI Chromium job covers login/MFA only. Claims in this report are limited to unit/API tests, ESLint, link verification and the CI type/build gate.

## 12. Security findings

- `checkSsrf` runs for `robots.txt` and again on **every** redirect hop; redirects are `manual`, capped at 3.
- URLs with credentials, non-HTTP(S) schemes, or ports other than 80/443 are rejected before any network call.
- Robots-disallowed paths are not fetched at all; 5xx/unreachable `robots.txt` fails closed, 404/410 allows.
- 401/403/429, CAPTCHA, login-wall, paywall and JS-required markers are surfaced as `signals`; nothing attempts to bypass them.
- Governance (`read.public`) runs **before** the fetch, so page content can never influence a governance decision.
- Tenant safety: research saves use the session's `companyId` only; run reads require both `id` **and** `companyId`, and reject artifacts whose `kind` is not `command_run`.
- Residual risks: research has only the endpoint rate limiter (no per-host budget/backoff table); artifact rows accumulate without retention policy (a pre-existing artifact concern); `analyze_public_page` can be prompted to hit arbitrary public hosts within budget.

## 13. Cost

$0. No provider API keys were used, no paid route was enabled, no external billing surface was touched.

## 14. Commit and PR

- PR [#63](https://github.com/tech360-bd/alolabs_AI/pull/63) — base `main`, head `arena/56041def-alolabs-ai`, not merged.
- `a09c248` — feature: run-store, streaming, access module, research module, routes, UI, tests, docs.
- `28087cf` — fix: type the `/api/v1/models/inference` profile enum from the readonly routing tuple (main-branch TS4104 regression).
- `01e308f` — fix: align gateway/stream test mocks with the real `CompanyAIError` and limiter signatures.
- `2d33004` — docs: this report (first version), committed after CI evidence existed.
- `965dd1c` — docs: record the verified run for `2d33004` (after rebasing onto the remote merge; no force-push).
- `f638594` — fix: restore C1+C2 agent + supervisor wiring after the `main` merge, and repair three main gate regressions.
- `f961669` — fix: type two main-branch audit mocks (rest args).
- A final docs-only commit updates §14–§15 with the run below; its own checks are visible on PR #63.

## 15. CI status

| Run / check | Result |
| --- | --- |
| [45667954129](https://github.com/tech360-bd/alolabs_AI/actions/runs/45667954129) — first push | ❌ TypeScript gate: TS4104 in `src/app/api/v1/models/inference/route.ts` (pre-existing on `main`) |
| [45668415056](https://github.com/tech360-bd/alolabs_AI/actions/runs/45668415056) — after the v1 fix | ❌ TypeScript gate: two test-signature errors (`CompanyAIError` arity, spread of `unknown[]`) |
| [45668689127](https://github.com/tech360-bd/alolabs_AI/actions/runs/45668689127) — commit `01e308f` | ✅ **4/4 pass** — TypeScript/tests/lint/build 4m53s, Login+MFA 1m12s, Secret Scan 11s, Dependency Audit 1m13s |
| [45669680450](https://github.com/tech360-bd/alolabs_AI/actions/runs/45669680450) — commit `2d33004` (code + report) | ✅ **4/4 pass** — TypeScript/tests/lint/build 4m55s, Login+MFA 1m12s, Secret Scan 11s, Dependency Audit 1m22s |
| [45670571429](https://github.com/tech360-bd/alolabs_AI/actions/runs/45670571429) — remote `main` merge `c4c5d89` | ❌ TypeScript gate: the merge dropped supervisor wiring (`supervisor` undefined, `mode` not in the input) **and** three main-branch regressions (`params`, nullable compound unique, site-doctor union) |
| [45671221032](https://github.com/tech360-bd/alolabs_AI/actions/runs/45671221032) — commit `f638594` (repair) | ❌ TypeScript gate: two main-branch test mocks typed as zero-arg (`supervisor-tools`, `site-doctor`) |
| [45671559351](https://github.com/tech360-bd/alolabs_AI/actions/runs/45671559351) — commit `f961669` | ✅ **4/4 pass** — TypeScript/tests/lint/build 3m57s, Login+MFA 1m07s, Secret Scan 11s, Dependency Audit 1m13s |

All five failures were real type/merge errors; none was retried as a “flake” and no gate was weakened.

Both failures were real type errors, not flakes; they were fixed rather than bypassed. (The C1-era Chromium flake did not recur.)

## 16. Deployment status

**Not deployed.** No production action was taken; merging PR #63 is a separate decision. The new routes are additive, use no migration, and require no environment variables.

## 17. Limitations

- **No token streaming.** The panel streams execution events; the first `model` event arrives when a provider has answered. The code and UI do not pretend otherwise.
- **Not a browser.** No JavaScript execution, no rendered DOM, no screenshots. JS-only pages can look empty and are reported as such (`javascriptRendered: false`).
- **No crawler.** One URL per analysis; no link following or batch processing.
- **Interim storage.** Run and research records are `Artifact` rows; dedicated models (`CommandRun`, `ResearchSource`/`ResearchFinding` with confidence/expiry) are still missing.
- **UI not browser-verified** (see §11).
- **Approval continuation** still requires resending the command with the approval id; the stream cannot be resumed after a pause.
- **Retention:** no pruning policy for run/research artifacts.

## 18. Next phase

1. Phase D tier 2: isolated browser worker (rendered DOM, console, screenshots), sanitised artifacts, per-host budgets, `ResearchSource`/`ResearchFinding` with confidence and expiry.
2. Phase C2 remainder: agent-team assignment from chat, project-aware memory, typed handoff contracts.
3. Phase E: authorized repository connection, read-only source analysis, diff preview (deploy remains a 501 until separately authorized).
4. Housekeeping: `CommandRun` migration once approved; artifact retention policy; approve-and-continue for paused runs.

## 19. Post-merge verification (addendum, 2026-11-25)

PR #63 was merged into `main` as `9fcbf39`. This addendum records what was then
verified on the merged code, what was broken, and what is still unproven. It
supersedes §11 and the "not browser-verified" limitation in §17.

### 19.1 `main` was red, and is fixed

`main` at `9fcbf39` failed its own gate: `__tests__/api/metrics-client.test.ts`
declared `vi.mock('next/server')` twice, so `NextResponse` was `undefined`
(`TypeError: NextResponse is not a constructor`). The duplicate mock is removed
in PR #65 and the gate is green again.

### 19.2 A real product bug, found by the browser test

The Commanding Center sent its stream request with a bare `fetch()`:

```ts
await fetch('/api/command-agent/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
```

The edge proxy (`src/proxy.ts`) rejects **every** private `/api/*` request that
does not carry an `Authorization: Bearer …` header, and it only mirrors the
session cookie for the social-OAuth callback. The stream was therefore answered
with `401` before the handler ran, and no command run was ever persisted — the
panel showed an error bubble. The request now sends the same bearer token as
`fetchApi` (`getAuthToken()`), so the streaming timeline, run persistence and run
retrieval work end to end. This was invisible to unit tests, which call the route
handler directly and never traverse the proxy.

### 19.3 Gaps closed after the merge

| Gap from this report | Close |
| --- | --- |
| Run id/event count not carried into the restored turn | Assistant turn metadata now stores `runId` and `eventCount`; history restore re-attaches them, so an accordion can fetch the stored timeline after reload. |
| Research analysis could reach the network without an audit record | `research.analyze.request` is written **before** the fetch; `research.report.save` on save. If the audit write fails the fetch does not happen; `require_approval` → `409`. |
| Stream could not be aborted | `request.signal` listener stops forwarding. (The upstream provider call is not cancelled; that is stated, not simulated.) |
| No browser evidence | §11 is replaced by the suite below. |

### 19.4 Browser evidence (real Chromium, real `next dev`, disposable SQLite)

`tests/browser/command-center.test.mjs` runs in the existing "Login and MFA
(isolated Chromium)" CI job: it creates a fresh SQLite database, seeds a
throwaway admin, starts `next dev` on a free port and drives Chromium.

1. **Research evidence is measured, saved and recovered.** `http://example.com`
   → the evidence panel shows `HTTP 200 · public`, a 64-hex SHA-256, the final
   URL, `Verification level: http_fetch` and `Saved to this company only`; after
   a full reload the report is still listed by `GET /api/research/analyze`.
2. **A prohibited destination is refused with an explanation.**
   `http://127.0.0.1:9/admin` → "Analysis failed" plus "only ports 80 and 443".
3. **A failed run is streamed honestly.** With no provider authorised the run
   fails: exactly one `error` frame, **no** `final` frame, and the `run` frame
   announces a run id whose stored timeline (`GET /api/command-agent/runs/{id}`)
   reads back `status: failed` with `run_started` + `error`.

Screenshots are uploaded as the `command-center-browser-evidence` artifact
(487 KB, retained 14 days) on every run. The CI step also emits a check
annotation with the head/tail of its log when it fails, so a red run is
diagnosable from the annotations API alone.

### 19.5 CI status for the post-merge work (PR #65)

| Run | Result |
| --- | --- |
| [45681412402](https://github.com/tech360-bd/alolabs_AI/actions/runs/45681412402) | ❌ Login+MFA: the pre-existing browser suite ran first and failed; the new step was skipped, so its own result was invisible |
| [45682252976](https://github.com/tech360-bd/alolabs_AI/actions/runs/45682252976) | ✅ TypeScript/tests/lint/build 3m36s — `main`'s red is cleared; ❌ Login+MFA (older suite) |
| [45683285702](https://github.com/tech360-bd/alolabs_AI/actions/runs/45683285702) | ❌ new step ran and reported: `401 !== 200` (proxy/auth and test-assertion issues, four iterations) |
| [45688299871](https://github.com/tech360-bd/alolabs_AI/actions/runs/45688299871) | ✅ **all checks pass** — TypeScript/tests/lint/build 4m07s, Login+MFA **incl. the Commanding Center suite** 1m45s, Secret Scan 9s, Dependency Audit 1m12s |

The earlier failure of the *pre-existing* browser suite on this branch did not
reproduce from the "authenticated stream" commit onward; the runs that failed at
it were failing at the new step instead (it was misdiagnosed because the failing
step's annotation only reported an exit code until the reporting step was split
out).

### 19.6 Still NOT VERIFIED

- **Production deployment.** No deploy job ran and no deployment evidence
  exists. Nothing in this addendum says the feature is deployed.
- **Token streaming.** Only execution-event streaming exists; no model tokens
  are streamed and nothing claims they are.
- **Rendered-DOM worker / crawler.** Research is still one URL, `http_fetch`
  only; JS-only pages are reported as such.
- **Dedicated `CommandRun` / `ResearchSource` models.** Runs and reports are
  still `Artifact` rows; no migration was added.
- **Retention policy** for run/research artifacts, and **approve-and-continue**
  (a paused run still cannot be resumed from the stream).

### 19.7 Local verification

- ESLint clean on every touched file.
- Focused Vitest: 10 files / 78 tests pass (`command-agent`, `command-agent-runs`,
  `research-analyze`, `metrics-client`, and their neighbours).
- Whole-repo `npx vitest run` is **not** usable in this sandbox: `better-sqlite3`
  was installed without native scripts and `.prisma/client` is absent, so 28
  files fail for environmental reasons. CI is the gate of record.
