# ALO Open AI Platform

A multi-tenant AI product built into AgentOS: workspaces, projects, scoped API
keys, model routing with automatic fallback, a usage ledger, and an operator
panel. Local-first: it runs with **no paid API and no external account**.

This document describes what exists, how it was verified, and — importantly —
what does not exist yet and what it would take to finish it.

---

## 1. What is actually implemented

| Area | State | Where |
|---|---|---|
| Workspace / project / membership tenancy | **Working** | `src/lib/platform/workspaces.ts` |
| Project API keys: create, rotate, revoke, scopes, expiry, per-key rate limit | **Working** | `src/lib/platform/workspaces.ts`, `/api/v1/platform/keys` |
| Principal resolution (session cookie, bearer, `alo_pk_` key) | **Working** | `src/lib/platform/principal.ts` |
| Provider adapters (Ollama native, OpenAI-compatible) | **Working** | `src/lib/platform/providers.ts` |
| Model registry with live availability probes | **Working** | `src/lib/platform/model-registry.ts` |
| Fallback engine with error classification and cooldowns | **Working** | `src/lib/platform/fallback-engine.ts`, `error-classifier.ts` |
| Shared routing state (Redis → DB fallback) | **Working** | `src/lib/platform/routing-state.ts` |
| Chat API with real routing and usage recording | **Working** | `/api/v1/platform/chat` |
| Embeddings API | **Working** | `/api/v1/platform/embeddings` |
| Usage dashboard | **Working** | `/api/v1/platform/usage`, `/platform/usage` |
| Workspace UI (7 pages) | **Working** | `src/app/platform/**` |
| Super Admin panel (6 tabs) | **Working** | `/platform/admin` |
| Licence inventory from the installed tree | **Working** | `scripts/licence-inventory.mjs` |
| Host capability detection | **Working** | `src/lib/platform/hardware.ts` |
| Coding agents in isolated containers | **Not built** | needs Docker + a worker host |
| Image/video/audio generation | **Not built** | needs ComfyUI + a GPU |
| Workflow automation | **Not built** | needs Activepieces or Temporal |
| Website/app builders | **Not built** | needs GrapesJS / NocoBase / Directus |
| Hosting adapters (CapRover/Dokku) | **Not built** | needs target servers |

The UI shows the unbuilt sections as explicitly unavailable rather than as links
that 404, so the product never claims a capability it lacks.

---

## 2. The isolation model

One rule: **every query is scoped by the principal's workspace, and the
workspace comes from the credential, never from the request.**

```
credential  →  principal { userId, workspaceId, scopes }
              ↓
           every query:  where: { workspaceId: principal.workspaceId, ... }
```

Consequences that are enforced in code, not by convention:

- A `projectId` in a request body is verified against the principal's workspace.
  A foreign id returns **404**, not 403 — 403 would confirm the id exists.
- Listing endpoints filter by `workspaceId` *and* `userId` for personal data
  (conversations), so a colleague in the same workspace cannot read your chat.
- An `x-workspace-id` header is honoured only for a workspace the user actually
  belongs to; if the requested workspace is not theirs the request is refused
  rather than silently answered from a different workspace.
- Usage aggregates read `AiUsageRecord` rows filtered by workspace, so one
  tenant cannot infer another's traffic from a shared total.

Verified live with two accounts: A creates a conversation; B gets byte-identical
404s for A's real id and for a random id.

---

## 3. Routing and fallback

### Order

```
local  →  free-cloud  →  remote
```

Remote is **opt-in**: it is only considered when `ALO_ALLOW_REMOTE_MODELS=true`.
That check lives in one place so it is auditable.

Within a tier, deployments are ordered by `priority`, filtered by required
capability and by context length. Capability matching is a hard filter, not a
preference — a `vision` task with no vision model returns an error rather than
silently answering from a text model.

### What may be retried

The classifier decides. This is the part that is easy to get wrong:

| Failure | Class | Effect |
|---|---|---|
| 429 | `rate_limit` | next candidate, set cooldown |
| 429 + "quota exceeded" | `quota_exhausted` | next candidate, longer cooldown |
| 503 / 502 / 504 | `overloaded` / `server_error` | retry same, then next candidate |
| Timeout (`TimeoutError`) | `timeout` | retry same once, then next candidate |
| DNS / connection refused | `network` | next candidate |
| 401 / 403 | `auth` | next candidate, **not** a retry on the same one |
| 404 | `not_found` | next candidate, long cooldown |
| 400 | `invalid_request` | **stop the chain** |
| content policy wording | `content_policy` | **stop the chain** |
| `AbortError` | `cancelled` | **stop the chain**, do not blame the model |

Three deliberate decisions:

1. **`retryable` ≠ `fallbackEligible`.** A closed rate-limit window is not
   retryable on the same model (retrying immediately is dishonest), but it is
   fallback-eligible. Conflating these is how a router burns its whole candidate
   list on one provider's quota.
2. **A timeout is not a cancellation.** `AbortSignal.timeout()` surfaces as
   `TimeoutError`. Treating it as a user cancel would mark a healthy provider
   sick and return 499 to a user who is still waiting.
3. **Cooldowns are capped.** A provider can send `Retry-After: 86400`. Honouring
   it literally would remove a model for a day on one bad header, so the
   classifier caps at 5 minutes and the engine's own backoff at 15.

### Health

Each deployment carries an exponentially weighted success rate (α = 0.3), a
consecutive-failure count, and a derived status:

```
3+ consecutive failures  → unreachable
1–2 failures, or success rate < 50% → degraded
otherwise → healthy
```

A success resets the counter, so a recovered provider returns to service within
a few requests instead of being punished for a bad hour.

---

## 4. Evidence

Everything below was executed on this host. It is reproducible.

### 4.1 Real 429 → real fallback → real recovery

Two local runtimes, one instructed to answer `429` with `Retry-After: 2`. The
faulting one is forced first by priority.

```
SELECTION ORDER: ollama/qwen2.5-coder:1.5b -> ... -> platform-local/alo-local-tiny

RESULT ok=true usedFallback=true totalMs=62
  attempt ollama/qwen2.5-coder:1.5b: FAIL(rate_limit) 429 cooldown=2000ms retryAfter=2000ms
  attempt ollama/qwen2.5:3b:         FAIL(rate_limit) 429 cooldown=2000ms retryAfter=2000ms
  attempt ollama/llama3.2:3b:        FAIL(rate_limit) 429 cooldown=2000ms retryAfter=2000ms
  attempt ollama/llama3.2-vision:11b: FAIL(rate_limit) 429 cooldown=2000ms retryAfter=2000ms
  attempt ollama/deepseek-r1:1.5b:   FAIL(rate_limit) 429 cooldown=2000ms retryAfter=2000ms
  attempt platform-local/alo-local-tiny: OK
  SERVED BY: platform-local / alo-local-tiny

ACTIVE COOLDOWNS: 5 entries
SECOND REQUEST (A should be skipped, no 429 attempt):
  attempts: platform-local[OK]
```

The second request made **one** attempt at the healthy model, proving both that
the cooldowns persisted and that they are honoured before any work is done.

### 4.2 Capability gating

```
VISION (must not fall back to a chat model): ok= false
  error: No model is available for this task
  attempts: (none)
  remediation: No deployment is currently selectable with vision capability...
```

### 4.3 Live HTTP API

```
POST /api/auth/register  → 201
  workspace: cmwxi5ydf…, project: cmwxi5ydi…, apiKey: alo_pk_hnbR…
GET  /api/v1/platform/me      → 200  principal: api-key | scopes: 6
GET  /api/v1/platform/models  → 200  total 10, selectable 1
POST /api/v1/platform/chat    → 200  model alo-local-tiny | provider platform-local
                                     | tokens 101 | latency 7ms
```

### 4.4 Key lifecycle

```
create  -> 200, plaintext shown once
use     -> 200
rotate  -> old key 401, new key 200
revoke  -> 200, revoked key 401
scope   -> key without ai:chat gets 403, not a silent downgrade
```

### 4.5 Per-key rate limit

A key minted with `rateLimit: 3`, against a route that declares 120:

```
req 1 -> 200
req 2 -> 200
req 3 -> 200
req 4 -> 429  rate_limited — "Rate limit exceeded (3/min)" | "Retry after 60s."
req 5 -> 429
```

### 4.6 Cross-tenant isolation

```
A GET own conversation        -> 200
B GET A's conversation        -> 404
B DELETE A's conversation     -> 404
B GET random id               -> 404  {"message":"Conversation not found"}
B GET A's real id             -> 404  {"message":"Conversation not found"}   ← identical
A's conversation after B      -> intact
```

### 4.7 Tests

```
__tests__/platform/error-classifier.test.ts   21 passed
__tests__/platform/fallback-engine.test.ts    12 passed
__tests__/platform/providers.integration.ts    5 passed   (real sockets)
__tests__/platform/http-guards.test.ts        17 passed
                                              ─────────
                                              55 passed
```

The provider tests start a real HTTP server, drive the production adapter over a
socket, and assert on the real response body, the real 429 status and the real
`Retry-After` header. They are not mocks.

The whole repository suite, run with `DATABASE_URL` deliberately unset:

```
Test Files  230 passed | 1 skipped (231)
Tests      2557 passed | 15 skipped (2572)
```

Nothing in that run was waived or skipped by us; the fifteen skips are
environment-gated suites that declare their reason. Getting there surfaced
three defects, all fixed:

- The `providers.integration.test.ts` suite reached
`db.ts:180`, where an unset `DATABASE_URL` produced a bare
`new PrismaClient()` and Prisma 6 threw `Missing configured driver adapter`.
`parseDatasource()` returns `null` for an unset URL, and the SQLite fallback
only matched `provider === 'sqlite'`, so the default database that every other
SQLite path in the file already points at was unreachable. Fixed by treating
`null` as sqlite and sharing one `DEFAULT_SQLITE_URL`. Production is unchanged:
`assertProductionDatasource()` fails closed before that branch.

- `scripts/generate-mysql-schema.ts` classified `String` fields as
  `@db.LongText` without consulting relations, so `AiProject.createdBy` — a
  foreign key — became `LONGTEXT`. InnoDB refuses a foreign key on a TEXT
  column, so a MySQL deployment of the AI schema would have failed at the
  constraint. The generator now collects `@relation(fields: [...])` and keeps
  those columns `VARCHAR(191)`; the compatibility check reports 266/266 models,
  0 parity errors, 0 relation collisions.
- Twelve server-side suites resolved `node:sqlite` inside `jsdom` and failed to
  *load* — reported as 13 failing files, which hid that they were one
  environment mismatch. They now carry `@vitest-environment node`, matching the
  existing integration-test convention.

---

## 5. The local runtime (and what it is not)

`scripts/local-model-runtime.mjs` is a dependency-free inference server that
speaks both the Ollama native protocol (`/api/chat`, `/api/tags`,
`/api/embeddings`) and the OpenAI-compatible one (`/v1/chat/completions`,
`/v1/models`, `/v1/embeddings`).

It runs a **real** interpolated trigram language model over a bundled corpus and
**real** deterministic hashed embeddings. Every response is computed from the
request; there is no reply table and no echo.

**It is not a neural LLM.** It exists because this host has no GPU and cannot
reach `ollama.com` or `huggingface.co`, and the routing, fallback, streaming,
usage and isolation behaviour still has to be *proved* rather than asserted.
`/api/tags` marks it `alo_builtin: true` so nothing downstream mistakes it for a
7B model, and its catalogue entry carries a note saying the same.

Replacing it is a configuration change, not a code change:

```bash
# real local models
ollama serve
ollama pull qwen2.5-coder:1.5b
export OLLAMA_BASE_URL=http://127.0.0.1:11434

# or the built-in runtime, for a hardware-free install
node scripts/local-model-runtime.mjs
export ALO_PLATFORM_LOCAL_URL=http://127.0.0.1:11434
```

Both are exercised by the same adapter.

### Fault injection

The runtime can also be told to fail, which is how the classifier is tested
against real HTTP responses:

```bash
ALO_RUNTIME_FAIL_MODE=429 ALO_RUNTIME_RETRY_AFTER=3 \
  node scripts/local-model-runtime.mjs --port 11436
```

---

## 6. Configuration

| Variable | Purpose | Default |
|---|---|---|
| `ALO_PLATFORM_LOCAL_URL` | Built-in runtime base URL | unset (disabled) |
| `ALO_PLATFORM_LOCAL_PRIORITY` | Ordering for that runtime | 5 |
| `OLLAMA_BASE_URL` | Ollama base URL | unset |
| `VLLM_BASE_URL` | vLLM base URL | unset |
| `LITELLM_BASE_URL` | LiteLLM base URL | unset |
| `ALO_ALLOW_REMOTE_MODELS` | Permit paid/remote lanes | `false` |
| `JWT_SECRET` | Session signing key (≥32 chars) | dev-only random |
| `REDIS_URL` | Shared rate-limit and routing state | unset → DB + in-process |
| `DATABASE_URL` | Database | required |
| `PRISMA_SQLITE_ADAPTER` | Use the SQLite driver adapter | unset |

`JWT_SECRET` matters more than it looks: without it, `resolveAuth` generates a
**per-process** random key, so a session issued by one process cannot be
verified by another and every restart invalidates every session. Set it in
`.env.local` for development and as a real secret in production.

---

## 7. Known gaps

Honest list, in the order they would hurt:

1. **Provider credentials are not encrypted at rest by the platform.** The
   existing `AIProviderConfig.encryptedApiKey` column is used by the AgentOS
   provider layer; the new platform routes read endpoints from the environment
   instead. A UI for adding a provider with an encrypted key is the next step,
   and it must use the existing encryption helper rather than invent a second
   scheme.
2. **Rate limiting is Redis-shared only when `REDIS_URL` is set.** Without it the
   fallback is in-process, which is correct for a single instance and wrong for
   a multi-replica deployment. The response header does not yet tell the caller
   which mode is active.
3. **No background health prober.** Health is updated only when a real request
   happens, so an idle platform has stale health. A prober that hits
   `/api/tags` on a schedule is the fix, and it must not consume paid quota.
4. **Streaming is not implemented** in the platform adapters (the `streaming`
   capability is declared, but `complete()` is non-streaming). The chat UI waits
   for the whole response. SSE plumbing exists elsewhere in the repo and should
   be reused rather than rewritten.
5. **Coding, image, video, audio, automations and builders are not built.** Each
   needs infrastructure this host does not have (Docker, a GPU, a workflow
   engine). They are shown as unavailable in the navigation.
6. **No migrations directory.** The schema is applied with
   `scripts/sqlite-push.ts`, which now handles additive columns but refuses to
   guess at anything requiring a table rebuild. A real migration path is needed
   before a production database is upgraded rather than created.

---

## 8. Licence position

Verified by `node scripts/licence-inventory.mjs --pretty`, which inspects the
installed tree rather than a document:

- Application: MIT, `LICENSE` present, `package.json` `license` field set.
  (All three were missing or contradictory before this work; the README claimed
  MIT and linked to a file that did not exist.)
- 508 dependencies inspected: 503 permissive, 2 MPL-2.0 (build-time only), 0
  unknown.
- The seven licence claims in `docs/LICENCE_REGISTER.md` were re-checked against
  the installed packages and all match.

Obligations that actually matter for a self-hosted deployment, none of which are
`npm install` dependencies:

| Service | Licence | What it means |
|---|---|---|
| Ollama | MIT | free |
| vLLM | Apache-2.0 | free, keep NOTICE on redistribution |
| LiteLLM | MIT core | check optional packages before bundling |
| Qwen2.5 | Apache-2.0 (most sizes) | verify the model card per pin |
| Llama 3.2 | Meta Community Licence | **not OSI**; 700M MAU cap, attribution |
| ComfyUI | GPL-3.0 | keep it a separate process; do not vendor |
| NocoBase | AGPL-3.0 | network use of a *modified* version requires publishing source |
| Directus | BSL-1.1 | **not open source**; revenue threshold for commercial use |
| Activepieces | MIT core + EE | enterprise features are separately licensed |

Cost classes are separate things and must not be added together as "AI cost":

- **Software licence** — one-off or zero; obligation is compliance.
- **API usage** — per token; only reachable if an administrator enables a paid
  lane.
- **Infrastructure** — per hour; the dominant cost of self-hosting, and
  independent of request volume at idle.
