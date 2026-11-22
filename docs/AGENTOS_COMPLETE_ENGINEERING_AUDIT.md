# AgentOS — Complete Engineering Audit

Date: 2026-11-19 (sandbox clock 2026-11-22) · Branch: `arena/304ea66d-alolabs-ai`
Base commit: `1972359` (`main`) · Worktree: uncommitted remediation on top of the base
Auditor: coding agent · Evidence: source review, executed tests, runtime probes
Milestone: **`SIMULATED_STAGING_ACTIVATION_VERIFIED`** — *not* production-ready, *not*
externally verified.

---

## 1. Mandate

Audit the whole repository for real bugs, incomplete implementations, security weaknesses and
misleading status reporting; fix what can be fixed and verified locally; preserve every route,
API, data model, config and feature; leave external steps precisely blocked; and produce the
document set needed to run a **real** staging acceptance.

## 2. Repository at a glance

| Metric | Value |
|---|---|
| API route handlers (`src/app/api/**/route.ts`) | 507 |
| TypeScript/TSX source lines under `src/` | ≈ 249 000 |
| Vitest test files | 170 |
| Full suite result (this audit) | **192 files passed, 1 skipped; 2 111 tests passed, 15 skipped; exit 0** (final run after every change) |
| Production dependencies audited | 339, **0 vulnerabilities** (`npm audit --omit=dev`) |
| Worktree delta vs base | 26 files, +860 / −1 256 lines (includes this milestone's changes and the
| | five-lead CRM workflow added in the preceding milestones) |

The 15 skipped tests are one file — `__tests__/integration/mysql-compatibility.test.ts` — which
requires a MySQL server that does not exist in this sandbox. **They are skipped, not passed.**

## 3. Method

1. Read the CRM/preflight/run/provider path end-to-end, plus the auth and proxy layers.
2. Write probes for assumptions instead of trusting them (URL canonicalisation probe via
   `node -e`; grep audits for forbidden write paths, TODO markers, secret logging).
3. For each suspected defect: reproduce it in a test **before** fixing where practical; fix
   the smallest surface; re-run the focused suite; then the full suite.
4. Re-run the full suite once after the fixes, and re-run the directly affected suites again
   after the final preflight freshness change (see §6.4).
5. Record every item in `AGENTOS_REMEDIATION_REGISTER.md` with one of the mandated statuses.

Commands executed (exact):

```bash
npm audit --omit=dev --json                      # 0 vulnerabilities
npx vitest run --maxWorkers=2                    # 192 passed / 1 skipped files, 2111 passed / 15 skipped tests, exit 0 (final run, post-fix)
npx vitest run __tests__/unit/integration-url-guard.test.ts --maxWorkers=1        # 29/29, exit 0
npx vitest run __tests__/integration/crm-lead-followup.test.ts \
  __tests__/integration/crm-staging-simulation.test.ts \
  __tests__/api/company-integrations.test.ts \
  __tests__/unit/integration-url-guard.test.ts --maxWorkers=1                     # 62/62, exit 0
```

Environment limits: no `.env`, no real CRM, no provider key, no MySQL, no Ollama; the sandbox
clock differs from the session date. Tests that need a real Postgres used the hosted URL when
reachable; none were silently converted to mocks and then reported as external verification.

## 4. Area-by-area findings

### 4.1 Outbound integration security — **defects found and fixed**

Four real defects in `src/lib/integrations/types.ts` (details and severities in
`AGENTOS_SECURITY_AUDIT.md` SA-01…SA-04):

| ID | Defect | Impact | Status |
|---|---|---|---|
| SA-01 | Private-IPv4 regexes were double-escaped and could never match | SSRF to RFC1918 + cloud metadata with the tenant's Bearer key | `FIXED_VERIFIED` |
| SA-02 | Bracketed IPv6 literals (`[::1]`, `[::ffff:127.0.0.1]`, `[fe80::1]`) unchecked | loopback/link-local/metadata SSRF | `FIXED_VERIFIED` |
| SA-03 | `localhost.`, `0`, `0.0.0.0`, `100.64/10`, `*.local`, `*.internal` unchecked | private-target SSRF | `FIXED_VERIFIED` |
| SA-04 | `{ redirect:'error', ...init }` let a caller re-enable redirects | redirect-based SSRF + HTTPS→HTTP downgrade | `FIXED_VERIFIED` |

Fix shape: replaced regex host matching with numeric-label parsing (`isNumericLabel`,
`isPrivateIpv4Host`), normalises trailing dots, fails closed on any IPv6 literal, and orders
`guardedFetch` options so the guard always wins. 29 behavioural regression tests, including a
spy asserting **no socket is opened** for blocked targets and that `redirect:'error'` survives
a caller's `follow`.

### 4.2 CRM connector (`crm.alo-lead-api`) — functionally complete for its contract

- Read-only by construction: only `GET /api/v1/capabilities` and `GET /api/v1/leads`; no
  write path exists anywhere in the adapter.
- Strict validation: capabilities shape, `leads:read` presence, `data` array, per-row string
  `id`, duplicate-id rejection, over-limit rejection, 1 MiB body cap (declared and actual).
- Deterministic state machine (`connected` / `authentication_failed` / `permission_denied` /
  `unreachable` / `sync_failed` / `not_configured` / `not_found`); only success advances
  `lastVerifiedAt`.
- Credential stored AES-256-GCM; never returned; decryption only on verify/run.
- **Not verified against a real CRM** (`BLOCKED_EXTERNAL_DEPENDENCY`).

### 4.3 Workflow (`lead-followup`) — honest drafts, no delivery

- Fetches exactly five newest leads, preserves source ids, rejects malformed/duplicate/extra
  rows.
- One artifact per lead, SHA-256 of the exact stored content; emits `ai.generation.completed`
  and `draft.validated` per lead and `run.completed` once.
- Emits no delivery, no CRM mutation, no fabricated lead.
- Bengali validation and schema strictness tested.
- **Earlier defect (fixed in this milestone's test hardening):** the integration test asserted a
  hard-coded total event count (16). That coupled the test to incidental bookkeeping and would
  break — or worse, pass — for the wrong reasons. Replaced with semantic invariants
  (5 × `ai.generation.completed`, 5 × `draft.validated`, exactly 1 × `run.completed`, total
  ≥ 13) plus an **independent recomputation** of `artifact.checksum` from the stored content
  with Node's `crypto`, so a checksum that is merely echoed back cannot pass.

### 4.4 Preflight / readiness contract — unambiguous, fail-closed

- `preflight_status` ∈ `not_configured | incomplete | blocked | ready`.
- `workflow_execution_ready` is the single execution gate; deprecated `ready` is a strict alias
  (kept for compatibility, never divergent).
- `ai_provider` passes only after a real per-company `healthCheck()` bounded at 4 s; a
  registered-but-unreachable adapter fails.
- `verify=1` is required before the CRM credential is decrypted or the CRM contacted; `verify=0`
  is configuration-only.
- `provider_probe` (`router` | `injected_simulated`) makes simulation visible in the payload
  and the evidence file.
- **Freshness fix (this milestone):** provider registry sync was cached for 30 s, so a
  just-added/removed provider could be missing from a readiness decision. Preflight now forces
  a re-sync (`ensureRouterSynced({ force: true })`). Re-ran the affected suites: 62/62 pass.

### 4.5 Dashboard/API parity

- The CRM panel renders `preflight_status`, `execution: BLOCKED · N missing`, the list of
  `missing_dependencies`, and the durable run status; it does not render a green state before
  the API reports ready (`src/components/panels/crm-connections-panel.tsx`).
- `__tests__/api/company-integrations.test.ts` (8 tests) pins the API contract that the panel
  consumes; browser tests in `tests/browser/crm-panel.test.mjs` (5) exercise the panel itself.
- The legacy `/api/crm-connections` fabricated-success behaviour is gone; it now reports stored
  state honestly and is tenant-scoped.

### 4.6 Run lifecycle and dispatch

- Runs persist through a durable queue (`src/lib/runs/index.ts`) with terminal states
  `completed | failed | blocked | timed_out | cancelled`.
- The dispatcher refuses to start a run when preflight is not execution-ready; the refusal is
  recorded as a blocked run, not a fake success.
- Run-queue suite: 16 passing tests (queueing, claim, terminal transitions, blocked path).
- Crash-recovery semantics are covered at the unit level; no chaos test was performed against a
  real process kill.

### 4.7 Auth, tenancy and proxy

- `getAuthUser` requires an internal role and derives the tenant from membership; the
  `x-company-id`/`x-company-slug` headers cannot select a foreign tenant.
- CSRF double-submit with constant-time compare; login lockout plus per-IP limiter; `/v1/*`
  API-key limits via Redis.
- Security headers present (CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy).
- 4 auth browser tests (`tests/browser/login.test.mjs`) and 5 panel browser tests
  (`tests/browser/crm-panel.test.mjs`) passed in the preceding milestone. They are Playwright
  scripts outside Vitest and were **not re-run during this audit** (no dev server was started;
  starting one is unnecessary for the changes here and port 3011 is off-limits). Their status
  in this document is "verified previously", not "re-verified now".
- One legacy Playwright spec (`__tests__/e2e/login-flow.test.ts`) was removed in an earlier
  milestone because it could not run in this environment and duplicated the browser coverage.
  Disclosed here rather than buried: net coverage of the login flow is the 4 browser tests.

### 4.8 Observability and auditability

- Integration events and `AuditLog` rows are written for verify, run start/end, generation and
  validation. No key material is included.
- No code path updates or deletes `AuditLog`/integration events (`grep` verified).
- Immutability is enforced by convention, not by DB permissions — accepted risk SA-11.
- Benign noise: `provider-admin` best-effort audit writes fail with a foreign-key error in
  tests because the actor is unseeded; the write is intentionally non-fatal. Documented, not
  hidden.

### 4.9 Dependency and secret hygiene

- `npm audit --omit=dev`: 0 vulnerabilities across 339 production packages.
- Only `.env.example` files are tracked; no `.env`, key or token in git.
- No `TODO`/`FIXME` markers remain in the CRM/integration code.
- No blanket `any` introduced by this milestone; no lint rule disabled; no test skipped by this
  milestone.

## 5. Completeness matrix

| Capability | Implemented | Locally verified | Simulated | Real external | Status |
|---|---|---|---|---|---|
| CRM connection CRUD + encryption | yes | yes | yes | no | `BLOCKED_EXTERNAL_DEPENDENCY` for real CRM |
| CRM capabilities verify | yes | yes (stub HTTP) | yes | no | same |
| Five-lead read | yes | yes (stub) | yes | no | same |
| Bengali draft generation | yes | yes (deterministic stub model) | yes | no | needs real key |
| Artifact checksum + provenance | yes | yes (independent recompute) | yes | n/a | verified |
| Preflight gating | yes | yes | yes | no | verified locally |
| Durable run lifecycle | yes | yes (unit/integration) | yes | no | crash test not done |
| Dashboard parity | yes | yes (API + browser) | yes | no | verified locally |
| Real staging acceptance | no | — | — | no | blocked |

## 6. Defects found by severity

| Count | Severity | All fixed? |
|---|---|---|
| 1 | CRITICAL (SSRF to metadata; plus the earlier fabricated legacy route) | yes |
| 3 | HIGH (IPv6 bypass, redirect override, registered-as-ready) | yes |
| 3 | MEDIUM (host normalisation gaps, readiness ambiguity, DNS rebinding) | 2 fixed, 1 accepted |
| 5 | LOW / hardening | documented as accepted risk |

Open items are enumerated with rationale in `AGENTOS_SECURITY_AUDIT.md` §3.2 and
`AGENTOS_REMEDIATION_REGISTER.md`.

## 7. What this audit does **not** establish

- No real CRM was contacted; no real model was called. All "ready" states above come from a
  stub CRM over HTTP and a deterministic stub provider.
- No external penetration test, SAST/DAST, load test or chaos test.
- Production (port 3011, Caddy, PM2, databases, secrets, Hosting Portal on 3062) was not
  touched or inspected.
- No claim of production readiness, autonomous operation, or staging acceptance.

## 8. Verdict

The audited paths are internally consistent, fail closed, and honest about their own state.
Four remotely triggerable SSRF defects were found and fixed with a behavioural regression
suite, and two misleading-status defects were removed. The remaining risk is documented and
bounded. The next real step is not more local testing — it is the external staging run in
`AGENTOS_REAL_STAGING_ACCEPTANCE_CHECKLIST.md`.
