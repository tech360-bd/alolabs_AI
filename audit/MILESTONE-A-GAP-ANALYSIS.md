# Milestone A — Baseline Audit & Evidence-Based Gap List

Repository: `engralaminn-collab/alolabs.net_ai`
Audit date: 2026-10-15
Auditor scope: **sandbox checkout only** — see "Access boundary" below.

---

## 0. Access boundary (read this first)

This audit was performed against a sandboxed clone at `/home/user/alolabs.net_ai`.
The following were **not accessible** and therefore **not verified**:

| Claim in the tasking | Status |
|---|---|
| Host `hosting.alolabs.net`, Ubuntu 22.04.5, 2 cores, 7.7 GiB RAM | **Not verified** — no server access |
| Node 22.23.3 / MySQL 8.0.46 / PostgreSQL 14.24 / Redis 6.0.16 on the server | **Not verified** |
| Ollama 0.32.13 with 6 installed models | **Not verified** |
| PM2 app list incl. `whatsapp-bridge` at 6,862 restarts | **Not verified** |
| MySQL listener on `*:33060` | **Not verified** — cannot audit or remediate |
| Nginx / Cloudflare Tunnel / Tailscale / Fail2Ban state | **Not verified** |
| `/home/aloedu/alolabs.net_ai-main` and the nested `alolabs.net_ai` checkout | **Absent** from this environment |
| Live AI provider request or streaming response | **Not possible** — no credentials, and outbound egress is limited to github.com, npmjs.org and pypi.org |
| GitHub Actions results | **Blocked account-wide** — every run fails in ~2 s with 0 steps executed; annotation cites failed payments / spending limit. Predates this work (16/16 runs, all branches incl. `main`). |

Outbound egress permitted here: `github.com`, `codeload.github.com`,
`api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`.

**Consequence:** every statement below is either (a) derived from reading tracked
source in this clone, or (b) derived from a command actually executed here, whose
exit code is quoted. Nothing is inferred about the production server.

---

## 1. Repository and revision selection

Verified via `gh api` against the real GitHub repository:

| Ref | Date | Subject |
|---|---|---|
| `ce24bc6` | 2026-10-12 | **`origin/main` tip** — Merge PR #13 |
| `f225b98` | 2026-10-08 | Merge PR #9 — the nested checkout's revision |
| `07668db` | 2026-10-08 | Merge PR #5 — the parent checkout's revision |

`compare f225b98...main` → `ahead_by=15 behind_by=0 status=ahead`.

**Conclusion: the nested repository is 15 commits stale, and the parent is older
still. `origin/main` (`ce24bc6`) is canonical.** Any feature work must be based
on `main`, not on either local checkout. The nested `/home/aloedu/.../alolabs.net_ai`
directory should be treated as an accidental nested clone, not a second product.

Work branch for this engagement: `arena/1b52a31c-alolabs-net-ai`, based on
`ce24bc6`. No destructive Git command was run; no `origin/main` merge into any
dirty directory; all pre-existing local modifications described in the tasking
(the dirty `package-lock.json`, `prisma/schema.prisma`, `tsconfig.json`,
`.env.bak.mysql`, `prisma/db/`) live only on the server and were **untouched
because they are unreachable from here**. They remain the user's responsibility
to preserve.

---

## 2. Verified baseline (commands executed, exit codes quoted)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Types | `npx tsc --noEmit` | 0 | 0 errors |
| Lint | `npx eslint .` | 0 | 0 errors, 0 warnings |
| Deploy config | `node scripts/validate-compose.mjs` | 0 | port contract 3011 consistent, 9 base services, 7 prod overrides |
| Tests | `npx vitest run` | 0 | **69 files, 1054/1054 passed**, 0 failed |
| Build | `PORT=3011 npm run build` | 0 | compiled successfully, **315/315 static pages**, 5/5 standalone artifacts |

### 2.1 Critical caveat on the test result

The 1054/1054 pass was achieved **only** by working around two sandbox
restrictions, and must not be read as "CI is green":

1. `better-sqlite3` cannot be installed here. Its prebuilt binary redirects to
   `release-assets.githubusercontent.com` (blocked) and compiling from source
   needs Node headers from `nodejs.org` (blocked). A **sandbox-only shim** was
   written at `node_modules/better-sqlite3/lib/index.js` reimplementing the used
   API surface on Node's built-in `node:sqlite`. It lives in gitignored
   `node_modules` and was **never committed**.
2. The native Prisma query engine could not be downloaded, so the client was
   generated with `engineType = "client"` (the WASM query compiler, which *is*
   present in the npm tarball) plus `PRISMA_SQLITE_ADAPTER=1`.

Two shim defects were found and fixed during this work, and both are instructive:

* Prisma's JS interpreter (`@prisma/client-engine-runtime`) throws
  `Cannot mix BigInt and other types` when the driver returns BigInts. Real
  `better-sqlite3` with `defaultSafeIntegers(true)` would hit the same interpreter,
  so this is a property of the WASM path, not of the repository.
* `node:sqlite` reports `code: 'ERR_SQLITE_ERROR'` with a numeric `errcode`,
  whereas better-sqlite3 reports symbolic codes. `@prisma/adapter-better-sqlite3`'s
  `mapDriverError()` switches on the **symbolic** code to produce
  `UniqueConstraintViolation` / `ForeignKeyConstraintViolation`, which Prisma
  surfaces as `P2002` / `P2003`. Until the shim translated `errcode` 2067→
  `SQLITE_CONSTRAINT_UNIQUE` and 787→`SQLITE_CONSTRAINT_FOREIGNKEY`, 5 tests
  failed. **This proves `src/lib/job-queue.ts:205` (`code === 'P2002'`) and the
  P2003 foreign-key tests are correct as written** — they only need a driver
  that reports canonical codes, which the real one does.

**Therefore:** the repository's own logic is verified sound; the *production*
engine/binding path remains unverified here and is verified only by CI, which is
currently billing-blocked.

---

## 3. What already exists (do not rebuild)

Contrary to a greenfield reading of the product objective, substantial parts of
Milestones B and C are **already implemented and already tested**.

### 3.1 AI gateway — `src/lib/ai-router/` (17 files)

* `BaseAIProvider` abstract contract: `initialize()`, `chatCompletion()`,
  `streamChatCompletion(): AsyncGenerator<AIStreamChunk>`, `healthCheck()`,
  `listModels()`, `findModel()`.
* **11 provider adapters**: deepseek, gemma, groq, llama, mistral, ollama,
  openai-compatible, openrouter, phi, qwen, zai.
* Bounded retry with **exponential backoff + jitter**:
  `MAX_RETRIES = 3`, `RETRYABLE_STATUS_CODES = {429,500,502,503,504}`,
  `jitteredDelay = RETRY_BASE_DELAY_MS * 2^attempt + random(0..RETRY_JITTER_MAX_MS)`.
  `withRetry()` is called by at least 10 adapters (verified by grep).
* `AbortSignal` appears in 10 files; timeout handling in 13.
* `router.ts` implements capability filtering (e.g. requiring `streaming`),
  circuit-open failover, streaming failover, and error classification into
  `RETRYABLE_ERROR` / `PROVIDER_ERROR` / `TIMEOUT`.
* Typed capability/metadata model: `AIModel`, `AICapability` (chat, streaming,
  function-calling, vision, json-mode, embedding, code-generation, reasoning,
  audio), `AITokenUsage`, `AIStreamChunk`, `AIRouteDecision`, `AIProviderHealth`.
* **Ollama is correctly local-only**: `endpoint ?? 'http://localhost:11434'`, and
  no `src/app/api/**/route.ts` exposes Ollama directly (grep for `ollama` in API
  routes returned nothing).

### 3.2 AgentOS runtime — `src/lib/agent-runtime/` (8 files, ~3,400 lines)

`execution.ts` 845, `pipeline.ts` 527, `state.ts` 479, `health.ts` 453,
`scheduler.ts` 224, `types.ts` 212, `lifecycle.ts` 112. Plus `src/lib/workers/`
(7 files) and `src/lib/job-queue.ts` (557 lines).

Durable-state models exist: `AgentOSRun`, `Workflow`, `WorkflowStep`,
`WorkflowRun`, `JobQueue`, `QueueItem`.

`job-queue.ts` implements leases, `idempotencyKey` with a `P2002` catch that
returns the winning row, bounded retries with backoff, dead-lettering at
`maxAttempts`, and heartbeats.

**These are proven by passing integration tests**, not merely present:

| File | Tests | What is proven |
|---|---|---|
| `job-queue-durability` | 9/9 | exactly-once claim under a 10-worker race, lease-expiry recovery without loss or duplication, heartbeat lease extension, retry/backoff with exact attempt counting, dead-lettering, cancellation observed by running handlers, idempotency under sequential *and* concurrent enqueue |
| `run-resume` | 3/3 | resume from checkpoint after worker crash without repeating finished steps, pause on QC escalation preserving every output version, failure on reviewer rejection and on approval expiry |
| `workforce-provisioning` | 11/11 | 100 departments + 2,000 agents under one tenant, DB-level idempotency, unique business keys, tenant isolation, survival across a separate CLI process restart, dry-run reporting zero writes |
| `prisma-foreign-keys` | 4/4 | P2003 on dangling `agentId`, RESTRICT on deleting a referenced Agent, cascade on company delete, and that `foreign_keys`/WAL/`busy_timeout` are actually enabled on the connection |
| `agent-health-integrity`, `backup-restore`, `sqlite-foreign-keys`, `ai-provider-config` | 22/22 | orphan detection/remap/quarantine, restore integrity, FK refusal, provider config |

Total: **49/49 integration tests pass**.

### 3.3 Security primitives that already exist

* `bcrypt` password hashing (`src/lib/auth.ts:60,64,69`)
* `src/lib/security/csrf.ts`, `secret-manager.ts` (AES via `createCipheriv`),
  `field-encryption.ts` (SHA-256 derived keys)
* `src/lib/v1.ts` → `v1Handler`: authenticates or throws a uniform 401, and
  enforces API-key scopes via `hasScope(identity, "${resource}:${action}")`
* Tenant check in `src/lib/api-auth.ts:43`:
  `if (!memberships.some(m => m.companyId === requestedCompanyId)) return null`
* Audit-log API and panel
* No hardcoded credentials found in tracked files (scanned for `sk-…`, `AKIA…`,
  PEM private keys). Only `.env.example` is tracked; no real `.env` is in Git.

---

## 4. Gap list (evidence-backed, ordered by severity)

### G1 — Monetary values are `Float` (Milestone D blocker) — **HIGH**

`prisma/schema.prisma` uses `Float` for every money field:

```
CostEstimate.estimatedCost  Float  @default(0)
CostEstimate.actualCost     Float?
SubscriptionPlan.priceMonthly Float @default(0)
SubscriptionPlan.priceYearly  Float @default(0)
Invoice.amount              Float
Payment.amount              Float
```

This violates the explicit requirement to avoid floating-point accounting for
monetary values. Binary floats cannot represent most decimal currency amounts
exactly, so summation across a usage ledger drifts. **Remediation is a schema
change plus a data migration, and must not be attempted without a verified
backup/restore path** — see G2, because there is currently no SQLite migration
history to hang it on.

### G2 — No SQLite migration history (Milestone F blocker) — **HIGH**

`prisma/migrations/` contains **only** a `mysql/` directory (5 `.sql` files,
including two explicit `_rollback.sql` scripts). There are **zero SQLite
migrations**. The SQLite schema is instead applied by `prisma db push` /
`scripts/sqlite-push.ts` (10 references across `package.json` and `scripts/`).

Consequences: production SQLite has no versioned, ordered, rollback-able change
history; `db push` can drop columns silently; and the requested test of
"migrations on a disposable test database" cannot be performed for the database
the app actually uses in the container stack (`DATABASE_URL=file:/app/data/agenthub.db`).

### G3 — No payment gateway integration at all (Milestone D) — **HIGH**

No payment SDK is installed: grep of `package.json` for
`stripe|paypal|sslcommerz|razorpay|payment|billing|invoice|checkout` → **none**.
`Payment` has exactly 1 write site and `Invoice` 3. There is no webhook route,
therefore no signature verification and no replay protection to audit.

Merchant-country suitability (Bangladesh), settlement currency, recurring-billing
support and compliance posture **cannot be verified from this sandbox** and
require the user's decision and account access.

### G4 — ~~No global auth enforcement~~ **RETRACTED — this finding was wrong**

**Correction (2026-10-15).** The original version of this section claimed there
was no middleware and that authorization was per-route, giving a "fail-open
posture" where new routes are unauthenticated by default. **That is false**, and
it is retracted here rather than quietly deleted because it was committed in
`9f55f0c` and may already have informed a decision.

What is actually true:

* Next.js 16 renamed the middleware convention. `PROXY_FILENAME = 'proxy'` in
  `node_modules/next/dist/lib/constants.js`, so **`src/proxy.ts` IS the global
  edge gate** — the equivalent of the `middleware.ts` I reported as absent. It
  exports `proxy(request)` and a `config.matcher` covering every path except
  static assets. My original check looked only for `middleware.ts` and concluded
  wrongly from its absence.
* The posture is fail-**CLOSED**, not fail-open. `src/proxy.ts:221` rejects with
  401 any `/api/*` request whose path+method is not in the explicit
  `PUBLIC_API_ROUTES` allowlist and which carries no `Bearer` token (or, for
  `/api/v1/*`, no `X-API-Key`). A newly added route therefore requires
  credentials *by default* and is only public if someone deliberately adds it to
  the allowlist. That is the safe direction, and the opposite of what I wrote.
* The edge also sets `X-Request-Id`, `X-Content-Type-Options`, `X-Frame-Options`,
  `HSTS`, `Referrer-Policy` and `Permissions-Policy` on every matched response,
  issues and validates CSRF tokens for non-API mutating page requests, and
  applies per-IP rate limits.

The 9 routes with no in-file auth reference remain correctly public — 6 health
probes plus `marketplace/templates`, `enterprise/roadmap` and `auth/mfa/resend`
(see G5). Per-route `requireAuth()` still performs the *authoritative* DB session
and tenant check; the edge only verifies that credentials are present, which is
the right split of responsibility for an edge runtime that cannot reach Prisma.

**Remaining real concern, restated accurately:** the edge gate checks only
credential *presence*. Any route that forgets its own `requireAuth()` call is
reachable by anyone who sends an arbitrary `Authorization: Bearer x` header.
That is a much narrower risk than "unauthenticated by default", but it is real,
and it is the reason G10 (a lint/CI guard) exists — see below, now shipped on
this branch as `scripts/validate-route-auth.mjs`.

### G5 — `auth/mfa/resend` is a no-op stub that reports success — **MEDIUM**

`src/app/api/auth/mfa/resend/route.ts` returns
`{ success: true, message: 'Code is time-based…' }` without touching the
database or sending anything. It is unauthenticated. If the product intends TOTP
this is arguably correct behaviour, but returning `success: true` from an
endpoint named `resend` is misleading to clients and should either be removed or
renamed.

### G6 — Duplicated, divergent implementations — **MEDIUM** (partly corrected)

**Correction.** The original table listed "Rate limiting: `src/lib/rate-limiter.ts`
and `src/lib/security/rate-limiter.ts`" as a duplicate pair. That was inferred
from filename similarity and is **wrong as stated** — they are different
implementations serving different purposes, with different storage backends and
incompatible result types:

| | `src/lib/rate-limiter.ts` | `src/lib/security/rate-limiter.ts` |
|---|---|---|
| Lines | 108 | 335 |
| Backend | Prisma `RateLimitRecord` table | Redis with in-memory fallback |
| `RateLimitResult.resetAt` | `Date` | `number` (epoch ms) |
| Concern | generic sliding-window throughput | per-endpoint limits **plus account lockout** (`trackAttempt`, `getLockoutStatus`, `resetAttempts`) |
| Importers | 1 (`lib/api/secure-route.ts`) | 2 (`/api/ai/chat`, `/api/enterprise/agents/run`) |

Merging them would be a mistake. The real problem is not that these two are
duplicates — it is that there are **five** independent limiters and the most
complete one is unwired. See G11.

The rest of this finding stands, verified by line count and importer count:

| Concern | Files | Importers |
|---|---|---|
| Session management | `src/lib/session-manager.ts` (384 lines) **and** `src/lib/security/session-manager.ts` (374 lines) — `diff` confirms they **differ** | 3 and 1 respectively |
| Auth | `api-auth` (184 importers), `auth` (117), `route-auth` (2), `v1-auth` (2) | two are near-dead |
| Streaming chat | `/api/ai/stream` **and** `/api/llm/stream` | — |

Two live session managers with different code is a real security-review hazard:
a fix applied to one will not apply to the other. **Partly addressed in
`e26aabc`/`4afca3a`**: key derivation and the per-user index were extracted to
`src/lib/session-token.ts` and `src/lib/session-index.ts`, so the two managers
can no longer disagree about where a session lives. The two modules themselves
are still separate and should still be consolidated.

### G7 — SSRF guard exists but is not wired to tools — **LOW (currently theoretical)**

Private-IP/link-local guards appear in 3 files
(`api/automation/execute/route.ts`, `ai-router/provider-admin.ts`, `lib/minio.ts`).
No agent tool accepts a URL parameter (grep for url-taking tool params returned
nothing), and the only `fetch()` in `src/lib/workers/handlers.ts` targets a
self-derived base URL. So there is **no present exposure**, but any future
web-fetch tool must reuse the existing guard rather than add a fourth copy.

### G8 — Port-contract drift into application source — **FIXED this engagement**

Nine server-to-self call sites used the *public* origin with a hardcoded
`http://localhost:3000` fallback, and `.env.example` declared `APP_PORT=3000`
which overrides compose's `${APP_PORT:-3011}`. Since nothing listens on 3000,
every worker-driven chat, email, notification, backup and upload call would fail
with `ECONNREFUSED` in any deployment that did not set `NEXT_PUBLIC_APP_URL`.

Fixed in commit `ec3944d` — see §5.

---

### G9 — Client IP is spoofable, bypassing every IP-based control — **HIGH**

`src/proxy.ts:getClientIp()` returns the **leftmost** `X-Forwarded-For` value:

```ts
const forwarded = request.headers.get('x-forwarded-for');
if (forwarded) return forwarded.split(',')[0]!.trim();
return 'unknown';
```

The leftmost entry is the one the **client** supplied; each trusted proxy
*appends* to the right. Behind this stack (Cloudflare Tunnel → Caddy → Nginx →
app) an attacker can therefore send `X-Forwarded-For: <random>` and obtain a
fresh identity on every request. Consequences, all verified by reading the call
sites that consume this value:

* **Every IP rate limit is bypassable** — login (10/min), `/api/ai/chat`
  (60/min), `/api/enterprise/agents/run` (30/min), general public API (100/min).
  Rotating the header yields unlimited buckets.
* **Brute-force lockout is bypassable** — `checkBruteForce(ip)` is keyed on this
  value. (It is also independently broken; see G11.)
* **Audit log integrity is compromised** — `clientIp` is persisted as
  `AuditLog.ipAddress` for `user.login` and other events, so the recorded
  source address is attacker-chosen. This undermines the forensic value of the
  entire audit trail.
* **Unbounded memory growth** — each distinct spoofed IP creates a new entry in
  the module-scope `rateLimiter` and `authAttempts` Maps. They are only pruned
  by a lazy sweep, so sustained spoofing is a memory-exhaustion vector.

The same leftmost-value pattern is repeated in `login/route.ts:49`,
`mfa/verify/route.ts:112`, `register/route.ts:57` and `tenant-gateway/route.ts`.

**Remediation** (needs your topology confirmation before I change it): use the
rightmost-untrusted hop, or `CF-Connecting-IP` when the request demonstrably
came through Cloudflare, and configure the number of trusted proxy hops. Getting
this wrong in the other direction would let a shared NAT/corporate egress IP
collapse all users into one bucket and lock them out collectively, so this
should not be guessed at.

### G10 — Edge gate verifies credential *presence*, not validity — **MEDIUM → CLOSED on this branch**

`src/proxy.ts:221` is correctly fail-closed, but it only checks that an
`Authorization: Bearer …` header exists and is non-empty. The authoritative DB
session and tenant check happens later, per route, in `requireAuth()` from
`@/lib/api-auth`. That split is legitimate — an edge runtime cannot reach
Prisma — but it means **any route that omits its own `requireAuth()` call is
reachable with a garbage bearer token**. **Implemented guard (this branch):**
`scripts/validate-route-auth.mjs`, wired into `.github/workflows/ci.yml` as the
final CI step. It parses `PUBLIC_API_ROUTES` directly out of `src/proxy.ts`
(failing loudly if it parses zero entries, so a refactor of that file cannot
silently disable the check) and asserts that every `src/app/api/**/route.ts`
handler outside the allowlist references a known auth helper
(`requireAuth`/`secureRoute`/`v1Handler`/equivalent), so a forgotten check fails
the build instead of silently exposing an endpoint. A second check reports routes
made public *incidentally* by a `startsWith()` prefix match on a broader
allowlist entry — which is why `/api/health/ping` is now listed explicitly in
`proxy.ts` rather than inheriting publicity from `/api/health`. Two documented
exceptions remain, each with a verified reason recorded in the script.

Current result: `366 API route files, 570 non-public handler(s) checked, 16
allowlist entries, 2 documented exception(s)` → exit 0. Proven bidirectionally:
adding a throwaway handler with no auth check and no allowlist entry makes it
exit 1 with a named violation; removing it returns exit 0. It is
dependency-free, which is a hard requirement here — `bun.lock` cannot be
regenerated in this environment and CI runs `bun install --frozen-lockfile`.

### G11 — Five independent rate limiters; the lockout machinery is inert — **MEDIUM-HIGH**

Verified by reading each implementation, not by counting filenames:

| # | Location | Backend | Status |
|---|---|---|---|
| 1 | `src/proxy.ts` `checkRateLimit` + `checkBruteForce` | module-scope `Map` | live (edge) |
| 2 | `src/lib/rate-limiter.ts` | Prisma `RateLimitRecord` | live, 1 importer |
| 3 | `src/lib/security/rate-limiter.ts` | Redis + memory fallback | partly live; **lockout functions have 0 callers** |
| 4 | `src/app/api/auth/login/route.ts` | module-scope `Map` + `setInterval` | live |
| 5 | `src/app/api/auth/mfa/verify/route.ts` | module-scope `Map` + `setInterval` | live |

Plus two unrelated same-named helpers (`api/tenant-gateway/route.ts:315`,
`lib/api-gateway.ts:148`) that limit by API-key rather than IP.

Two concrete defects inside this sprawl:

* **`recordFailedAttempt()` has zero call sites.** The only match in `src/` is
  its own definition at `src/proxy.ts:125`. Nothing ever records a failed login,
  so `checkBruteForce` can never accumulate attempts and the 15-minute lockout
  can never engage.
* **`checkBruteForce()` resets its own counter on every call.** Its first branch
  is `if (!entry || now > entry.lockedUntil)`, and `lockedUntil` is initialised
  to `0`, so `now > 0` is always true — the counter is zeroed and `allowed: true`
  returned on every request. Even if `recordFailedAttempt` were wired up, the
  lockout still could not trigger.

So the brute-force protection is **doubly non-functional**. `login/route.ts`'s
own limiter (#4) does work and is the only effective credential-stuffing control
today, but it is per-process in-memory: it resets on every deploy and restart,
and PM2 runs `instances: 1, exec_mode: 'fork'`, so there is currently no
multi-worker split — but any move to cluster mode or a second container would
silently multiply the effective limit by the instance count.

Meanwhile `src/lib/security/rate-limiter.ts` already contains a correct,
Redis-backed, per-endpoint implementation *with* lockout, and already declares
the intended policy — `/api/auth/login` at 5 req/60 s with a 5-attempt,
15-minute lockout. **The fix is to wire up what already exists rather than write
anything new**: call `checkEndpointLimit` + `trackAttempt` on failure +
`resetAttempts` on success from the login and MFA routes, then delete limiters
#1, #4 and #5.

## 5. Work performed in this engagement

Four commits on `arena/1b52a31c-alolabs-net-ai`, all pushed; PR #14 open.

| Commit | Scope |
|---|---|
| `c17e857` | Audit document: code gates green, 7 docker/deploy defects |
| `12fcdf8` | Repaired the Docker/compose layer (9 defects) and added `scripts/validate-compose.mjs` as a CI gate |
| `80b1f4c` | Extended the 3011 port contract to bare metal (systemd unit had **no** `PORT`, so standalone defaulted to 3000 behind an nginx that proxied 3011); documented the air-gapped bootstrap |
| `ec3944d` | **Milestone A fix:** routed server-to-self calls over loopback; closed the `:3000` drift in `src/` and `.env.example`; added CI guard `4e` |

`ec3944d` in detail — 8 files, +404/−17:

* **New** `src/lib/internal-url.ts` — single source of truth separating two
  intents that had been conflated. `internalBaseUrl()`/`internalUrl(path)` return
  a loopback origin resolved as `INTERNAL_APP_URL` → `NEXT_PUBLIC_BASE_URL`
  (honoured only when it points at loopback) → `http://127.0.0.1:$PORT` → `:3011`.
  Deriving from `PORT` means it cannot disagree with the listening port.
  `publicBaseUrl()` returns the externally reachable origin for URLs
  dereferenced *outside* the process.
* `src/app/api/media/ai-tag/route.ts` deliberately uses `publicBaseUrl()`, not
  loopback: its URL is handed to a third-party vision model as `image_url`, so
  their servers must fetch it. Using loopback there would have broken image
  tagging — this is why the two helpers had to be distinct.
* A stale `localhost:3000` in either variable is **ignored rather than honoured**,
  because older `.env.example` revisions shipped it; honouring it would reproduce
  the bug for exactly the installs that need the fix. A real domain legitimately
  on port 3000 is preserved — only the loopback default is treated as stale.
* **New** `src/__tests__/lib/internal-url.test.ts` — 23 tests: resolution order,
  `PORT` derivation, hairpin refusal, stale-default rejection, the
  real-domain-on-3000 non-regression, trailing-slash handling, malformed-URL
  tolerance, public/internal divergence.
* CI guard `4e` in `scripts/validate-compose.mjs` scans `src/` for hardcoded
  `:3000` and asserts `.env.example` pins `APP_PORT=3011`. It skips comment lines
  and test files (both must be able to quote the old value) and excludes compose
  files, because **Grafana legitimately uses 3000 as its container port**,
  published as 3001. Verified bidirectionally: **11 violations and exit 1**
  against the pre-fix tree, **exit 0** after.

`social/oauth/[provider]/route.ts` (9 `redirect_uri` sites) and `sitemap.ts`
were **intentionally left** on `NEXT_PUBLIC_APP_URL` — those are genuinely
public-intent and were already correct.

---

## 6. Explicitly NOT done, and why

* **No production deployment, no server change, no PM2/Nginx/MySQL/Cloudflare/
  Tailscale/SSH/UFW modification.** No server access exists from here.
* **No `origin/main` merge** into any dirty directory, and no dependency upgrade.
* **No schema change for G1/G2.** Monetary-type migration and introducing SQLite
  migration history both require a verified backup and restore path first.
* **No live provider call.** Impossible without credentials and egress.
* **`describe.skipIf` graceful-skip for the integration tests was deliberately
  not added.** Those tests pass wherever the native binding exists (CI). A skip
  renders green, so a future binding failure would silently mask 49 tests.
* **§7.8-style test skipping, and any change to `bun.lock`/`package.json`
  dependencies**, were avoided: `bun.lock` cannot be regenerated here (no bun)
  and CI runs `bun install --frozen-lockfile`.

---

## 7. Recommended milestone order

Revised after the G4 retraction and the G9/G11 findings. Milestone B and most of
C are already built and tested; the highest-value remaining work is now the
access-control gaps, then Milestone D.

1. **G9 — fix client-IP derivation** (HIGH). It gates the integrity of every
   IP-based rate limit, the brute-force lockout, and the audit log. Requires your
   proxy topology first (decision 3 below); guessing wrong either leaves the
   bypass open or collapses all users behind one NAT into a shared bucket.
2. **G11 — wire up the existing Redis-backed lockout** and delete limiters
   #1/#4/#5. `src/lib/security/rate-limiter.ts` already implements the intended
   policy correctly; this is integration work, not new design. Best done
   immediately after G9, since a lockout keyed on a spoofable IP is not a lockout.
3. **G2 — introduce SQLite migration history.** Prerequisite for any schema
   change, and it unblocks the Milestone F migration test.
4. **G1 — migrate monetary `Float` → integer minor units** (or `Decimal`), on top
   of G2, with a data migration and a rollback script matching the existing
   `mysql/*_rollback.sql` convention.
5. **Milestone D — usage ledger + entitlements + gateway.** Blocked on decisions
   1 and 2 below.
6. **G10 — CI guard asserting every non-allowlisted API route references an auth
   helper.** **DONE on this branch** (`scripts/validate-route-auth.mjs`, final CI
   step, exit 0 over 570 handlers). It converts "someone forgot `requireAuth()`"
   from a silent exposure into a build failure.
7. **G6 — consolidate the two session managers** into one. Key derivation and the
   per-user index are already shared (`e26aabc`, `4afca3a`), so what remains is
   merging the two modules. **Do not merge the two rate limiters** — that part of
   the original finding was wrong; they have different backends and purposes.
8. **G5 — resolve `auth/mfa/resend`**, which is an unauthenticated no-op that
   returns `success: true`.
9. **Milestone B live verification** — once credentials and egress exist, prove
   one hosted provider end-to-end (non-streaming + streaming) and the Ollama
   adapter against the local service.

## 8. Decisions required from the user

1. **Payment gateway.** Merchant country Bangladesh. Which gateway, and do you
   have sandbox credentials? (SSLCommerz is the common local candidate, but
   settlement, recurring-billing support and compliance must be confirmed by you
   — I cannot verify them from here.)
2. **Money representation.** Integer minor units (poisha/cents, recommended —
   exact, no dependency) or Prisma `Decimal`?
3. **Proxy topology for G9.** How many trusted hops sit in front of the app, and
   is `CF-Connecting-IP` authoritative? I need this to derive the client IP
   correctly rather than guess.
4. **Is a staging server path available** that I could be given access to, or
   will all deployment remain yours to execute?
5. **CI billing.** Actions is blocked account-wide; until Settings → Billing is
   fixed, no gate can be verified by CI. All verification above is local.

## 9. Self-corrections recorded in this document

Listed explicitly so a reader of the committed history is not misled:

| Original claim | Status | Correction |
|---|---|---|
| G4: "no `middleware.ts`, auth is per-route, fail-open posture" | **Retracted** | Next 16 renamed the convention; `src/proxy.ts` is the global edge gate and is fail-**closed** |
| G6: "rate limiting is a duplicated pair" | **Corrected** | Different backends (Prisma vs Redis) and purposes; merging them would be wrong. The real issue is five limiters (G11) |
| G6: "two divergent session managers" | **Stands, partly fixed** | Key derivation and index now shared via `session-token.ts` / `session-index.ts` |
| §2.1 caveat on the 1054/1054 test run | **Stands** | Achieved via a sandbox-only shim + WASM engine; not the production code path |

---

## 10. Deployment and CI security review (added after §1–§9)

Scope: the seven workflows in `.github/workflows/`, the deploy scripts they call,
and the live GitHub configuration read back over the REST API. Findings are
numbered continuing the §4 series. Operator actions that only a repository admin
can perform are collected in **`docs/DEPLOYMENT-RUNBOOK.md`** — the agent token
gets `403 Resource not accessible by integration` on the environments, secrets and
branch-protection endpoints, so those cannot be fixed from here.

### G12 — Production deployment had no approval gate at all — **HIGH → FIXED**

`deploy.yml` ran its `deploy` job on `on: push: branches: [main]`, and the live
`production` environment returned:

```
"protection_rules": [], "deployment_branch_policy": null, "can_admins_bypass": true
```

So nothing separated a merge from an unattended production deploy. It is only
inert today because Actions is billing-blocked and the four `PRODUCTION_*` secrets
do not exist — i.e. **the first thing that happens when billing is fixed is that
the next push to main deploys to production.** That directly contradicts the
standing rule "deploy only after explicit approval and a tested rollback".

The GitHub-native control is a required reviewer, but the official REST docs state
that on Free/Pro/Team plans *"a wait timer or required reviewers … are only
available for public repositories"*, and this repository is **private**. The fix
implemented here is therefore plan-independent — the `deploy` job now carries:

```yaml
if: github.event_name == 'workflow_dispatch' && inputs.confirm_production_deploy == true
```

Pushes to `main` still run every quality and safety gate; only the deploy itself
now needs an explicit human dispatch. Removing that line is documented in
`deploy.yml` and in the runbook, conditional on confirming required reviewers
actually pause the job.

Side effect worth flagging: `backup.yml` targets the *same* `production`
environment on a nightly schedule, so adding required reviewers would make
nightly backups wait for approval. The runbook recommends a separate
`production-backup` environment if unattended backups are wanted.

### G13 — Workflow supply-chain and documentation drift — **MEDIUM-HIGH → FIXED**

Three independent defects, each verified rather than assumed:

| Defect | Evidence | Fix |
|---|---|---|
| **All 23 action references used mutable tags** (`actions/checkout@v4`, `appleboy/ssh-action@v1`, `gitleaks/gitleaks-action@v2`, …) across all 7 workflows | grep for `uses: .*@v[0-9]` | Every one pinned to a full-length commit SHA resolved via `gh api repos/<owner>/<repo>/commits/<tag>`, with the original tag kept as a trailing comment. A re-pointed tag is code execution inside a job that holds the production SSH key. |
| **`ci.yml` had no `permissions:` block** | the other six workflows all set `contents: read`; `ci.yml` set none, so its `GITHUB_TOKEN` inherited the repository default | Top-level `permissions: contents: read` added |
| **Documented secret names did not exist** | `docs/CI-CD-GUIDE.md` documented `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`; the workflows read `PRODUCTION_HOST`/`PRODUCTION_USER`/`PRODUCTION_SSH_KEY`/`PRODUCTION_PORT` | Guide corrected; `PRODUCTION_PORT` documented for the first time (it is mandatory — `deploy.yml` hard-fails without it) |

Following the old guide would have created three secrets nothing reads while
omitting one that is required, producing a deploy that fails its own validation
step. To stop this class of drift returning, `scripts/validate-workflow-security.mjs`
was added as a dependency-free CI gate covering: (A) action pinning, (B)
least-privilege `permissions:`, (C) every secret referenced by a workflow must
appear in `docs/CI-CD-GUIDE.md`, (D) no secret interpolated directly into a `run:`
script. Current result: **7 workflows, 24/24 actions pinned, 5 secrets, exit 0.**

All four checks were proven to fail loudly by mutating a copy of each workflow and
confirming exit 1 with the expected message, then restoring and confirming exit 0.
One of those probes caught a real bug in the guard itself — see §11.

### G14 — World-writable staging path feeding a `sudo` execution — **MEDIUM → FIXED**

`deploy.yml` copied the reviewed scripts to `/tmp/alo-deploy-<run_id>-<run_attempt>`
via `appleboy/scp-action`, then ran `chmod 700 "${TEMP_DIR}"/*.sh` and
`sudo … bash "${TEMP_DIR}/deploy.sh"`. `/tmp` is world-writable. If another local
user pre-created that path — in particular as a symlink to somewhere like `/etc` —
the scp would follow it and the privileged execution would run against
attacker-influenced files.

A step was added ahead of the transfer that creates the directory itself, mode
`0700`, owned by the deploy user, and **fails if anything already exists at that
path** (`mkdir` without `-p` refuses an existing path; an explicit `-L` test also
catches a dangling symlink, which `-e` misses).

### G15 — The production gate was weaker than the pull-request gate — **MEDIUM → FIXED**

`deploy.yml`'s safety job ran `database-safety-scan.sh` and `bash -n` over three
scripts, but ran **none** of `validate-compose.mjs`, `validate-route-auth.mjs` or
the new workflow guard. A compose/port drift, an unauthenticated API route, or an
unpinned third-party action could therefore reach production without failing any
check on the path that actually deploys it. All three guards are now run in the
deploy gate as well, and `setup-deploy-target.sh` was added to the `bash -n` list.

### G16 — Documented server setup contradicted the project's own security gate — **MEDIUM → FIXED**

`docs/CI-CD-GUIDE.md` instructed `ssh-copy-id … root@your-server-ip` and installing
into `/root/.ssh/authorized_keys`, with `APP_DIR` given as `/opt/alolabs/agent-hub`.
But `deploy/scripts/security-check.sh:240` reports `PermitRootLogin yes` as
**critical**, and `deploy.sh:4` defaults `APP_DIR` to `/opt`. The documented setup
would have failed the repository's own audit and deployed against the wrong path.
Its `command=`-restricted `authorized_keys` line would also have broken the
pipeline outright, because `deploy.yml` executes the scripts from a per-run `/tmp`
directory that a fixed `command=` never matches.

`deploy/scripts/setup-deploy-target.sh` replaces that section: a dedicated
non-root deploy user, both keys with correct ownership and modes, a scoped sudoers
drop-in validated with `visudo -c -f` before install, and an sshd hardening drop-in
following the Ubuntu OpenSSH documentation. It is **dry-run by default**, refuses
to disable password authentication unless a key is already authorized, validates
the whole effective sshd config with `sshd -t` before applying and rolls back on
failure, and reloads rather than restarts sshd so the operator's session survives.

The `SETENV` trade-off in the generated sudoers rule is documented in the script,
the guide and the runbook rather than hidden: `deploy.yml` sets variables on the
`sudo` command line, which sudo only permits with `SETENV`, and `SETENV` means a
leaked `PRODUCTION_SSH_KEY` implies root. It is still far tighter than the
`NOPASSWD: ALL` such setups usually get.

### Still open, not fixed here

- **No `staging` environment and no staging workflow.** The environment can be
  created now (commands in the runbook); the workflow has deliberately not been
  written, because it needs a staging host and an untestable deploy path is worse
  than none.
- **CI remains unverified end-to-end.** Every check still fails in ~2 s with zero
  steps executed. Nothing in this section is CI-proven; the three guards were run
  locally and reported with their exit codes.
- **G1–G11 are unchanged** by this section, except G10, which §4 already records as
  closed.

---

## 11. Self-corrections recorded while writing §10

Continuing the practice from §9 — a guard that has never been seen to fail is not a
guard, so each check was probed individually. That process caught a defect in the
new validator itself:

| Claim | Status | Correction |
|---|---|---|
| "Check D (no secret interpolated into `run:`) works" | **Was false** | The first version inspected only the *block scalar* lines following `run:`, via the same indentation walk used elsewhere. The common form `run: echo ${{ secrets.FOO }}` puts the interpolation on the `run:` line itself, which was never examined, so the check **false-passed** on exactly the pattern it exists to catch. Fixed by also scanning the remainder of the `run:` line. |
| First probe run "showed check D firing (exit 1)" | **Was a false positive** | That probe mutated the file and then restored it with `git checkout`, which reverts to the committed HEAD — at that moment still the *unpinned* version. The exit 1 came from check A (unpinned actions), not check D. The mutation under test had already been reverted before the assertion. Probing was redone with exact file backups instead of `git checkout`, and all five probes (A, B, C, D-inline, D-block) then passed with their messages matched. |

Both are the same failure mode recorded earlier in this engagement: a green result
that does not actually exercise the thing it claims to. The lesson applied here is
that a new CI guard is only shipped once each of its checks has been observed to
fail for the right reason, with the message matched — not merely once the guard
exits 0 on a clean tree.

Also corrected in passing, from §10: `docs/CI-CD-GUIDE.md` embedded workflow
snippets using the wrong secret names in four places, not just the one secrets
table. The rename was applied across the whole document and verified by grep
(zero remaining `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`).
