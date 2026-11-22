# AgentOS — Remediation Register

Date: 2026-11-19 (sandbox clock 2026-11-22) · Branch `arena/304ea66d-alolabs-ai`, uncommitted
worktree over base `1972359`.

Allowed statuses only: `FIXED_VERIFIED`, `FIXED_NOT_YET_VERIFIED`, `BLOCKED_EXTERNAL_DEPENDENCY`,
`BLOCKED_AUTHORIZATION`, `ACCEPTED_RISK`, `NOT_REPRODUCIBLE`.

`FIXED_VERIFIED` means: the fix is in the tree **and** a named command with a captured exit code
proves the behaviour. It does **not** mean externally verified.

---

## 1. Register

| ID | Area | Sev. | Status | One-line description |
|---|---|---|---|---|
| REM-01 | Egress/SSRF | CRITICAL | `FIXED_VERIFIED` | Private-IPv4 regexes never matched; RFC1918/metadata hosts accepted |
| REM-02 | Egress/SSRF | HIGH | `FIXED_VERIFIED` | Bracketed IPv6 literals bypassed every host check |
| REM-03 | Egress/SSRF | MEDIUM | `FIXED_VERIFIED` | `localhost.`, `0`, `0.0.0.0`, `100.64/10`, `*.local`, `*.internal` accepted |
| REM-04 | Egress/SSRF | HIGH | `FIXED_VERIFIED` | Caller `redirect` overrode `redirect:'error'` (redirect SSRF/downgrade) |
| REM-05 | Provider readiness | HIGH | `FIXED_VERIFIED` | Registered adapter counted as AI-ready without a health check |
| REM-06 | Status honesty | MEDIUM | `FIXED_VERIFIED` | Ambiguous `ready` flag; CRM contacted even for configuration-only checks |
| REM-07 | Legacy API | CRITICAL | `FIXED_VERIFIED` | `/api/crm-connections` fabricated successes and ignored tenancy |
| REM-08 | Tests | MEDIUM | `FIXED_VERIFIED` | Hard-coded event-count assertion replaced by semantic invariants |
| REM-09 | Tests/evidence | MEDIUM | `FIXED_VERIFIED` | Artifact checksum was trusted from the writer; now independently recomputed |
| REM-10 | Readiness freshness | LOW | `FIXED_VERIFIED` | Preflight read a 30 s-stale provider registry |
| REM-11 | Egress | MEDIUM | `ACCEPTED_RISK` | DNS rebinding between guard validation and connect |
| REM-12 | Egress | MEDIUM | `ACCEPTED_RISK` | No outbound allow-list; admin can point the connector at any public host |
| REM-13 | Egress | MEDIUM | `ACCEPTED_RISK` | `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS` disables all host checks |
| REM-14 | Auditability | LOW | `ACCEPTED_RISK` | Audit tables append-only by convention, not by DB grant |
| REM-15 | Observability | LOW | `ACCEPTED_RISK` | Benign FK error on best-effort provider-admin audit insert in tests |
| REM-16 | Headers | LOW | `ACCEPTED_RISK` | CSP still needs `'unsafe-inline'` for Next bootstrap |
| REM-17 | Rate limiting | LOW | `ACCEPTED_RISK` | Proxy limiter is per-instance (horizontal scale multiplies it) |
| REM-18 | Real CRM acceptance | — | `BLOCKED_EXTERNAL_DEPENDENCY` | No staging CRM URL + read-only API key |
| REM-19 | Real inference acceptance | — | `BLOCKED_EXTERNAL_DEPENDENCY` | No real provider key / no reachable provider from sandbox |
| REM-20 | Staging deployment evidence | — | `BLOCKED_AUTHORIZATION` | Deploy/restart, Caddy, PM2, port 3011, prod DB/secrets out of scope |
| REM-21 | Audit-table hardening | LOW | `BLOCKED_AUTHORIZATION` | Requires DB-owner `REVOKE UPDATE, DELETE` on audit tables |
| REM-22 | MySQL compatibility suite | — | `BLOCKED_EXTERNAL_DEPENDENCY` | 15 tests skipped: no MySQL server in sandbox |

## 2. Detail for fixed items

### REM-01 — Private-IPv4 guard never matched (CRITICAL)

- **Where:** `src/lib/integrations/types.ts`, `isAllowedIntegrationUrl`.
- **Root cause:** regex literals `/^10\\./`, `/^192\\.168\\./`, `/^169\\.254\\./` — `\\.` in a
  regex literal matches a literal backslash plus any char, so the patterns could never match.
- **Impact:** a tenant admin could store `https://169.254.169.254/...` or
  `https://10.0.0.5/...` as the CRM base URL; the server would then `fetch` it with the
  tenant's Bearer key, enabling private-network and cloud-metadata SSRF.
- **Fix:** regex host matching removed. `isNumericLabel()` validates 4 numeric labels
  (0–255, no hex/sign/whitespace); `isPrivateIpv4Host()` range-checks `10/8`, `172.16/12`,
  `192.168/16`, `127/8`, `169.254/16`, `100.64/10`, `0/8`, `>=224`.
- **Verification:** `npx vitest run __tests__/unit/integration-url-guard.test.ts --maxWorkers=1`
  → 29/29 pass, exit 0; blocked cases include `10.0.0.1`, `172.16.0.1`, `172.31.255.255`,
  `192.168.1.1`, `127.0.0.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `224.0.0.1`, plus
  decimal/hex/short forms.
- **Residual:** DNS rebinding (REM-11).

### REM-02 — IPv6 literal bypass (HIGH)

- **Root cause:** `URL.hostname` keeps brackets (`[::1]`), and `[::ffff:127.0.0.1]` normalises
  to `[::ffff:7f00:1]`; no IPv6 branch existed.
- **Fix:** any host starting `[` or containing `:` is rejected (fail-closed), after trailing-dot
  normalisation.
- **Verification:** same suite; `[::1]`, `[::]`, `[::ffff:127.0.0.1]`, `[fe80::1]`, `[fd00::1]`,
  `[2001:db8::1]` all refused with `IPv6 literal target ... blocked`.
- **Trade-off:** a public IPv6-only CRM must use a DNS name. Documented (REM-13 family).

### REM-03 — Host normalisation gaps (MEDIUM)

- **Fix:** strip trailing dots (`localhost.`, `api.localhost.`); reject `0`, `0.0.0.0`,
  `*.local`, `*.internal`; CGNAT range added to REM-01 helper.
- **Verification:** same suite.

### REM-04 — Redirect override (HIGH)

- **Root cause:** `guardedFetch` spread `...init` after `redirect: 'error'`.
- **Fix:** spread order inverted so `redirect: 'error'` is final; HTTPS→HTTP downgrade via
  redirect is therefore also impossible.
- **Verification:** test spies on `fetch` and asserts `init.redirect === 'error'` while the
  caller passed `'follow'`; a second test asserts `fetch` is never called for a blocked target.

### REM-05 — Registered ≠ ready (HIGH, earlier milestone, re-verified here)

- **Fix:** preflight resolves the router, filters to initialized / non-circuit-open /
  non-errored providers scoped to the company, then runs `provider.healthCheck()` with a 4 s
  cap; only survivors satisfy `ai_provider`.
- **Verification:** `crm-staging-simulation.test.ts` (3 tests) proves execution is not ready
  with an unregistered provider, is **still not ready** with a registered-but-unhealthy one,
  and becomes ready only after a healthy provider exists. Plus the preflight payload exposes
  `provider_probe: 'router' | 'injected_simulated'`.

### REM-06 — Readiness ambiguity (MEDIUM, earlier milestone)

- **Fix:** `preflight_status` enum, `workflow_execution_ready` as the sole gate,
  `ready === workflow_execution_ready` (deprecated alias), CRM egress only with `verify=1`.
- **Verification:** `crm-staging-simulation.test.ts`, `__tests__/api/company-integrations.test.ts`
  (8), and the panel contract tests.

### REM-07 — Legacy `/api/crm-connections` (CRITICAL, earlier milestone)

- **Fix:** real tenant-scoped rows, honest `not_connected`/`unverified`, no fabricated sync
  results.
- **Verification:** `__tests__/api/company-integrations.test.ts` — 8/8 pass; panel consumes the
  same contract (`crm-connections-panel.tsx`).

### REM-08 — Event-count assertion (MEDIUM)

- **Root cause:** `expect(events).toHaveLength(16)` coupled the test to incidental bookkeeping.
- **Fix:** asserts exactly 5 `ai.generation.completed`, 5 `draft.validated`, 1 `run.completed`
  and ≥ 13 total, so an extra bookkeeping event is tolerated but a missing draft is not.
- **Verification:** `crm-lead-followup.test.ts` + `crm-staging-simulation.test.ts` → 25/25,
  exit 0; full suite 2 111 passed.

### REM-09 — Checksum independence (MEDIUM)

- **Fix:** test recomputes `sha256(artifact.content)` with Node `crypto` and compares it to the
  stored `artifact.checksum` (and the event payload), for all five drafts.
- **Verification:** same 25/25 run (22 workflow + 3 simulation); the assertion fails if the writer stores a wrong checksum.

### REM-10 — Stale provider registry (LOW, this milestone)

- **Fix:** `src/lib/integrations/preflight.ts` now calls `ensureRouterSynced({ force: true })`.
- **Verification:** after the change,
  `npx vitest run crm-lead-followup crm-staging-simulation company-integrations integration-url-guard --maxWorkers=1`
  → **62/62 pass, exit 0**.
- **Freshness note:** the full suite was re-run on the final tree (2 111 passed / 15 skipped,
  exit 0); the four directly affected suites also pass 62/62 in isolation.

## 3. Accepted risks (rationale)

See `AGENTOS_SECURITY_AUDIT.md` §3.2 for REM-11…REM-17. Summary: DNS rebinding and the absence
of an egress allow-list are inherent to an admin-configurable outbound connector and are
mitigated (no redirects, HTTPS-only, role-gated + audited credential writes) rather than
eliminated; the insecure-target flag is off by default and must never be set publicly; audit
immutability and CSP hardening need infrastructure/UI changes outside this milestone.

## 4. Blocked items (precise)

| ID | What is blocked | Exact unblock requirement |
|---|---|---|
| REM-18 | Real CRM verification, five-lead read, state-machine behaviour against the vendor's real errors | A staging base URL implementing `ALO_LEAD_API_V1_CONTRACT.md` + a read-only `leads:read` key, delivered as env/secret (never in chat or git) |
| REM-19 | Real model inference, Bengali quality, latency, cost | A provider key with quota, reachable from the deployment host |
| REM-20 | Staging deploy proof (ports, Caddy, PM2, headers on the wire) | Explicit authorization and a maintenance window |
| REM-21 | Audit-table immutability grants | DBA/owner action on the production database |
| REM-22 | MySQL-compatibility suite (15 skipped tests) | A MySQL instance reachable from the test runner |

**No item in this register is marked `FIXED_VERIFIED` on the strength of a skipped test, a stub
alone, or a health check.**

## 5. Evidence index

| Artifact | Path |
|---|---|
| SSRF regression suite | `__tests__/unit/integration-url-guard.test.ts` |
| Workflow + simulation suites | `__tests__/integration/crm-lead-followup.test.ts`, `.../crm-staging-simulation.test.ts` |
| API contract | `__tests__/api/company-integrations.test.ts` |
| Timestamped machine evidence | `docs/evidence/agentos-staging-activation-2026-11-22T11-*.json` (this milestone) |
| Security narrative | `docs/AGENTOS_SECURITY_AUDIT.md` |
| Acceptance state | `docs/AGENTOS_FINAL_ACCEPTANCE_REPORT.md` |
