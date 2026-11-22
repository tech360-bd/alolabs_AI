# AgentOS Security Audit

Date: 2026-11-19 (sandbox clock 2026-11-22, see §7) · Branch: `arena/304ea66d-alolabs-ai`
Base: `1972359` (main) · Auditor: coding agent, source + test + probe evidence
Status: **LOCAL/SIMULATED EVIDENCE ONLY — no external penetration test, no staging TLS
validation, no production verification.**

This audit covers the AgentOS surfaces touched by the CRM connector, the AI provider
registry, the preflight/readiness API and the run dispatcher. It does **not** claim to be a
complete application security review: the wider product (billing, tenancy, chat UI) was
reviewed for the specific control classes below only.

---

## 1. Scope and assets

| Asset | Why it matters |
|---|---|
| CRM API key (per company) | Read access to real lead PII |
| AI provider key | Billable inference + data egress |
| `x-company-id` / `x-company-slug` headers | Tenant boundary |
| Lead PII in drafts/artifacts | Privacy, prompt-injection target |
| `AuditLog` / integration events | Non-repudiation |
| `ENCRYPTION_KEY` / `ALO_*` env | Master secret for stored credentials |
| Outbound fetcher (`guardedFetch`) | SSRF pivot into the private network |

## 2. Methodology

1. Manual source review of every file on the connector → preflight → run → report path
   (`src/lib/integrations/**`, `src/app/api/v1/crm/**`, `src/app/api/crm-connections/**`,
   `src/lib/ai-router/**`, `src/lib/runs/index.ts`, `src/lib/api-auth.ts`, `src/proxy.ts`,
   `next.config.*`).
2. Targeted runtime probes against Node's URL normaliser (`node -e`) to check host
   canonicalisation assumptions instead of trusting the regexes.
3. New regression suite `__tests__/unit/integration-url-guard.test.ts` (29 tests) written
   against the *behaviour* required, then the implementation fixed until it passed.
4. Dependency audit: `npm audit --omit=dev`.
5. Secret hygiene: `git ls-files` scan for `.env*`, grep for credential logging.
6. Existing suites re-run to confirm no regression (see `AGENTOS_REMEDIATION_REGISTER.md`).

## 3. Findings

Severity: CRITICAL = direct tenant/secret compromise; HIGH = bypass of a security control with
realistic preconditions; MEDIUM = weakness needing another condition; LOW = hardening.

### 3.1 Remediated in this milestone

#### SA-01 — Private-IP guard never matched (CRITICAL, FIXED_VERIFIED)

`src/lib/integrations/types.ts` matched private IPv4 ranges with regexes written as
`/^10\\./`, `/^192\\.168\\./`, `/^169\\.254\\./`. Inside a regex literal `\\.` means
*backslash followed by any character*, so these patterns never matched a real dotted-quad.
Consequence: a company administrator could save `https://10.0.0.5/...`,
`https://192.168.1.10/...` or `https://169.254.169.254/latest/meta-data/` as a CRM base URL and
`guardedFetch` would make the request from the server, with the company's Bearer key attached
— SSRF into the private network and, on cloud hosts, the instance metadata service.

Fix: host checks no longer use regexes. A pure-string helper splits the host on `.`, requires
four numeric labels (`isNumericLabel` rejects empty/`+`/`-`/hex/whitespace and enforces
0–255), and then range-matches numerically — `10/8`, `172.16/12`, `192.168/16`, `127/8`,
`169.254/16`, `100.64/10` (CGNAT), `0/8`, `>=224` (multicast/reserved). Decimal
(`https://2130706433`), hex (`0x7f000001`) and shortened (`127.1`) forms are canonicalised to
dotted-quad by `new URL()` before this runs, and are covered by tests.

#### SA-02 — IPv6 literals bypassed every check (HIGH, FIXED_VERIFIED)

`new URL('https://[::1]/').hostname` is `[::1]` (brackets retained), and
`[::ffff:127.0.0.1]` is normalised to `[::ffff:7f00:1]`. None of `localhost`, `10.` or
`.internal` matches those strings, and the old code had no IPv6 branch, so loopback,
unspecified (`[::]`), link-local (`[fe80::1]`) and IPv4-mapped addresses were all accepted.

Fix: any hostname that starts with `[` or contains `:` after trailing-dot normalisation is
rejected outright with `IPv6 literal target ... blocked (SSRF guard)`. Fail-closed is
deliberate: an allow-list of "safe" IPv6 forms is a guessing game against future
canonicalisation changes, and a CRM endpoint reached by IPv6 literal is not a real deployment
requirement. Regression tests cover `[::1]`, `[::]`, `[::ffff:127.0.0.1]`, `[fe80::1]`,
`[fd00::1]`, `[2001:db8::1]`.

#### SA-03 — Trailing dot, `0.0.0.0`, `0`, CGNAT, `.local`/`.internal` accepted (MEDIUM, FIXED_VERIFIED)

`localhost.` and `api.localhost.` are DNS-equivalent to loopback; `0` and `0.0.0.0` mean
"this host"; `100.64.0.0/10` is carrier-grade NAT (private on many clouds); `.local`/`.internal`
resolve inside corporate networks. Only `localhost`, `10.`, `172.16-31.`, `192.168.` and
`169.254.` were checked.

Fix: trailing dots are stripped in a loop before matching; `localhost`, `*.localhost`,
`0`, `0.0.0.0`, `*.local`, `*.internal` and `isPrivateIpv4Host()` are all rejected. Tests
assert each form.

#### SA-04 — Caller could re-enable redirect following (HIGH, FIXED_VERIFIED)

`guardedFetch` built its request options as `{ redirect: 'error', ...init }`. Any adapter (or
future adapter) passing `redirect: 'follow'` silently overrode the guard, re-opening the
classic "public URL 302s to `http://169.254.169.254/`" SSRF bypass, and also allowing an HTTPS
→ HTTP downgrade mid-flight.

Fix: the option object is now `{ ...init, redirect: 'error' }` — the guard always wins. A
regression test passes `redirect: 'follow'` and asserts the request that reaches `fetch` still
has `redirect === 'error'`.

#### SA-05 — Legacy `/api/crm-connections` invented successes (CRITICAL, FIXED_VERIFIED, earlier milestone)

The pre-existing route returned hard-coded "connected/healthy" payloads, did not scope queries
by company, and returned a fabricated connection for any tenant. It now returns real rows
scoped to the authenticated user's company, reports `not_connected`/`unverified` honestly, and
never fabricates a sync result. Covered by `__tests__/api/company-integrations.test.ts` (8
tests).

#### SA-06 — Provider "registered" was reported as AI-ready (HIGH, FIXED_VERIFIED, earlier milestone)

Preflight previously passed `ai_provider` whenever an adapter was registered — including an
env-configured adapter with no reachable endpoint. A registered adapter is configuration, not
inference. Preflight now performs a real, per-company, 4-second-bounded health check against
each candidate provider (and only counts providers whose `companyId` matches or is unscoped),
and the evidence JSON records `provider_probe` with `probe_basis` so a reader can tell a real
check from a registration.

#### SA-07 — Ambiguous readiness flags (MEDIUM, FIXED_VERIFIED, earlier milestone)

`ready` meant different things in different call sites, and the CRM was decrypted and called
even when the caller only asked "are we configured?". Now `preflight_status`
(`not_configured` / `incomplete` / `blocked` / `ready`), `workflow_execution_ready` and the
deprecated `ready` (kept equal to `workflow_execution_ready` for compatibility) are explicit;
the CRM is only decrypted and contacted when `verify=1`.

### 3.2 Open / accepted

| ID | Severity | Finding | Status | Decision |
|---|---|---|---|---|
| SA-08 | MEDIUM | DNS rebinding: the guard validates the hostname string, then `fetch` resolves it again; a hostile DNS server can answer public on validation and private on connection (or vice versa). Not exploited in this milestone. | `ACCEPTED_RISK` | Mitigated by `redirect:'error'`, HTTPS-only and the fact that the CRM base URL is admin-entered, but not eliminated. Proper fix requires a custom dispatcher/agent that pins the resolved IP and re-validates it before connect (Node `undici` `Agent` + `lookup` hook). Tracked as future work, not claimed as fixed. |
| SA-09 | MEDIUM | No egress allow-list: any *public* HTTPS host is permitted, so an admin can point the connector at an attacker-controlled server. That is inherent to a bring-your-own-CRM integration (the key would then be sent to that server). | `ACCEPTED_RISK` | Documented in the runbook: whoever can edit a company's CRM connection can already read that company's data. Credential writes are role-gated and audited. |
| SA-10 | MEDIUM | `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true` disables all host checks globally (used for local tests/trusted LAN). If set in production it re-opens SA-01/02/03. | `ACCEPTED_RISK` | Off by default; the guard's rejection message names the variable so misuse is visible in logs. Runbook states it must never be set on a public deployment. |
| SA-11 | LOW | Audit rows (`AuditLog`, integration events) are append-only by application convention, not by a DB trigger/permission. A compromised app role could update or delete them. | `ACCEPTED_RISK` | Verified no update/delete code paths exist for these models (`grep -rn "auditLog\.\(update\|delete\)"` → no matches). Hardening (revoke UPDATE/DELETE on the tables for the app role) is a DB-operator action, `BLOCKED_AUTHORIZATION` to perform from here. |
| SA-12 | LOW | CSP still needs `'unsafe-inline'` for Next.js inline bootstrap scripts; the policy is otherwise restrictive and HSTS/X-Frame-Options/nosniff/Referrer-Policy are present. | `ACCEPTED_RISK` | Nonce-based CSP would be the fix; broader than this audit's remit. |
| SA-13 | LOW | Legacy IPv6-literal targets are now *all* blocked (including public IPv6-only CRMs). | `ACCEPTED_RISK` | Documented; a DNS name is the supported configuration. Not a security regression. |
| SA-14 | LOW | In-memory rate limiter in `src/proxy.ts` is per-instance; horizontal scale multiplies the effective limit. Redis is used for `/v1/*` API-key limits. | `ACCEPTED_RISK` | Login also has DB-backed lockout via `src/lib/security/rate-limiter`. |

## 4. Controls verified as present (not findings)

| Control | Evidence |
|---|---|
| Tenant scoping | `getAuthUser` enforces `isInternalRole` and resolves the company from membership; `x-company-id`/`x-company-slug` cannot select a foreign tenant (`src/lib/api-auth.ts`). |
| CSRF | Double-submit cookie + `x-csrf-token` header, constant-time compare (`src/proxy.ts`). |
| Security headers | CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` in `next.config.*` `headers()`. |
| Credential encryption | AES-256-GCM, random 96-bit IV per value, auth tag checked, versioned `v1:` envelope (`src/lib/security/field-encryption.ts`); ciphertext only is stored, and decryption is gated behind `verify=1`/run execution. |
| Credential redaction | API responses expose presence/metadata, never the key; integration events never contain the key (`__tests__/unit/integration-url-guard.test.ts` asserts the credential is not in the audited URL). |
| Auth throttling | Login: per-IP limiter + DB lockout after repeated failures; password reset limited (`src/lib/security/rate-limiter.ts`). |
| Secrets in git | `git ls-files` shows only `.env.example` files; no `.env`, key or token is tracked. |
| SQL injection | Data access goes through Prisma parameterised queries; no string-interpolated SQL on the reviewed paths. |
| Prompt injection | Lead text is treated as data; the workflow validates the model's JSON against a schema and discards unknown keys, so a malicious lead cannot inject tool calls (there are none in this path). |
| Dependency risk | `npm audit --omit=dev` → **0 vulnerabilities** (339 production dependencies). |

## 5. Regression tests added

`__tests__/unit/integration-url-guard.test.ts` — 29 tests, all passing
(`npx vitest run __tests__/unit/integration-url-guard.test.ts --maxWorkers=1`, exit 0):

- accepts public HTTPS; rejects HTTP unless insecure mode is explicitly on;
- blocks `10/8`, `172.16/12` boundaries, `192.168/16`, `127/8`, `169.254/16` (metadata),
  `100.64/10`, `0.0.0.0`, `0`, and the whole `>=224` multicast/reserved half-space (`224.0.0.1`, `239.255.255.250`, `240.0.0.1`, `255.255.255.255`);
- blocks decimal/hex/shortened IPv4 that `URL` canonicalises to private addresses;
- blocks `[::1]`, `[::]`, `[::ffff:127.0.0.1]`, `[fe80::1]`, `[fd00::1]`, `[2001:db8::1]`;
- blocks `localhost`, `localhost.`, `api.localhost.`, `*.local`, `*.internal`;
- fails closed on malformed URLs and returns a usable fallback `URL`;
- `guardedFetch` never opens a socket for a blocked target (spy asserted not called);
- `guardedFetch` forces `redirect:'error'` even when the caller asks for `follow`;
- the API key never appears in the URL or the guard's reason string.

## 6. What is *not* verified

- No real staging CRM was contacted, so TLS pinning/certificate behaviour, real rate limits and
  the provider's audit trail are untested (`BLOCKED_EXTERNAL_DEPENDENCY`).
- No real AI provider key: the provider health probe was exercised against a local stub only;
  health-check success is not proof of successful inference.
- No external penetration test, no SAST/DAST tool, no fuzzing of the parsers.
- DNS-rebinding (SA-08) was reasoned about, not demonstrated.
- Production configuration (real env, reverse proxy, WAF) was not inspected — the production
  processes, Caddy, PM2, databases and secrets were deliberately left untouched.

## 7. Environment limitations

- Sandbox clock reads 2026-11-22 while the session date is 2026-11-19; evidence filenames use
  the sandbox clock and this document discloses the difference rather than altering files.
- Some integration suites need a real Postgres; where the hosted DB was unreachable the suite
  is reported as blocked, never as passed.

## 8. Verdict

The four SSRF defects (SA-01…SA-04) were real, remotely triggerable by a company administrator,
and are fixed with a behavioural regression suite. No CRITICAL or HIGH finding remains open on
the reviewed paths. The remaining items are documented, bounded risks (two MEDIUM) whose
residual exposure is stated rather than hidden. **This is not a statement of production
security readiness.**
