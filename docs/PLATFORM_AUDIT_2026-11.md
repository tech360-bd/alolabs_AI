# ALO Labs AI — evidence-based platform audit

Date: 2026-11-23 · Base commit `d725e43` + branch `arena/95359bda-alolabs-ai` @ `99a5112`

Method: every claim below was produced by reading the file named next to it, or by
running a command whose output is quoted. A feature is **not** marked working because a
route or table exists. Status vocabulary: `VERIFIED LIVE`, `VERIFIED IN STAGING`,
`VERIFIED IN TESTS ONLY`, `PARTIALLY IMPLEMENTED`, `SIMULATED`, `NOT IMPLEMENTED`,
`BLOCKED BY INFRASTRUCTURE`.

Measured scale: **508 API routes**, **33 pages**, **260 components**, **391 lib modules**,
**250 Prisma models**, **200 test files**.

---

## 1. The finding that matters most

**There is no ChatGPT-style chat interface, and the Super Admin chat is deliberately
non-operational.**

- `find src/app -name "page.tsx"` returns 33 pages: `/dashboard`, `/login`, `/portal/*`,
  `/site/*` (marketing), `/invoice`, `/brand`, `/design`. **No `/chat` page exists.**
- The only conversational surfaces are dashboard *panels*, not a chat application:
  `src/components/panels/super-commanding-chat.tsx` (455 lines) mounted at nav id
  `super-admin` (`src/lib/dashboard/navigation.ts:239`, `:593`).
- That panel's own tab description states: *"This chat is audited and uses the central AI
  service. **It does not dispatch agents, execute broadcasts, or perform operational
  actions.**"* (`super-admin-ai-control-plane.tsx:665`)
- The backend agrees. `src/app/api/super-chat/route.ts:16` system prompt: *"this chat
  endpoint does not dispatch agents or execute operational actions. Never claim that
  tasks, broadcasts, CRM changes, security scans, or other real-world operations have been
  performed."*

So the honest description of "chat-driven Super Admin control" today is: **an AI assistant
that answers questions and plans work, and explicitly cannot act.** Phase 3 requires the
opposite. This is the single largest gap between the brief and reality.

Two concrete defects in that same endpoint:

- `broadcastExecuted: false` is a **hardcoded literal** in the JSON response
  (`super-chat/route.ts:120`), not a computed outcome.
- Conversation history is a **module-level `Map`** (`super-chat/route.ts:14`). It is not
  persisted, so every restart wipes the Super Admin's conversation, and it cannot survive
  more than one server instance. `Conversation` / `ConversationMessage` tables exist
  (`prisma/schema.prisma:2523`, `:2544`) and are **not used by this endpoint at all**.

---

## 2. What is genuinely real (do not rebuild)

These are substantial and were verified by reading the execution path, not the route name.

| Capability | Evidence | Status |
|---|---|---|
| Single tenant-aware inference path | `src/lib/multi-tenant-ai/service.ts:740 executeCompanyAIChat` | **VERIFIED LIVE** |
| Provider failover, bounded | same file: `MAX_ROUTE_ATTEMPTS = 4` (`:56`), loop `:839`–`:860`, returns `fallbackUsed` | **VERIFIED LIVE** |
| Usage metering atomic with the call | `service.ts:146` writes `modelUsageRecord` **inside the same transaction** as the provider call — a failure cannot be metered as success | **VERIFIED LIVE** |
| Paid-provider ceiling | `local_fast`/`local_general` are `localOnly: true, permitsPaidWithAuthorization: false` (`multi-tenant-ai/policy.ts:27`) | **VERIFIED LIVE** |
| Agent runtime → real model | `src/lib/agent-runtime/execution.ts:18` imports `executeCompanyAIChat`; called at `:703` | **VERIFIED LIVE** |
| Multi-agent orchestrator | `src/lib/multi-agent-orchestrator/orchestrator.ts:238` class with `executeTask:244`, `decomposeTask:1715`, `findBestAgentBySkills:1771`; delegates to `executeAgentPipeline` (`:10`, `:1219`) | **VERIFIED LIVE** |
| Agent execution + approvals | `src/lib/ai-workforce/execution-engine.ts:42 executeAgentPipeline` — membership check, tenant scoping, approval-bound execution | **VERIFIED LIVE** |
| Agent chat backend | `src/app/api/enterprise/agent-chat/route.ts` — zod validation, `requireCompanyAuth`, `agentCompanyScope`, real pipeline | **VERIFIED LIVE (backend only)** |
| Project / artifact data layer | `Project` (`:3360`), `Artifact` (`:3382`) with version, checksum, projectId, companyId | **VERIFIED LIVE (schema)** |
| Voice conversation loop | `handleConversationTurn` → real LLM via `local_fast`, persists turns | **VERIFIED LIVE (no telephony)** |
| Telephony | `registry.ts` — only `sandbox` (simulated) + `NotConnectedAdapter` that throws | **BLOCKED BY INFRASTRUCTURE** |

---

## 3. Capability matrix: existing vs missing

| # | Brief requirement | Reality | Status |
|---|---|---|---|
| 2 | Unified chat UI (history, search, uploads, streaming, edit/regenerate) | No chat page; only a Super Admin panel | **NOT IMPLEMENTED** |
| 2 | Auto agent routing from chat | Backend exists (`agent-chat`), no UI, no classifier in the chat path | **PARTIALLY IMPLEMENTED** |
| 3 | Super Admin chat that executes changes | Explicitly refuses to act (system prompt + docs) | **NOT IMPLEMENTED** |
| 3 | 14-step change lifecycle (plan→approve→branch→PR→verify) | Approval primitives exist; no change-execution pipeline | **NOT IMPLEMENTED** |
| 4 | Agent registry with permissions/limits/versioning | `Agent`, `AgentVersion`, `AgentPermission`, `AgentHealth`, `AgentStatusHistory` models exist and are used by the execution engine | **PARTIALLY IMPLEMENTED** |
| 4 | Agents cannot self-modify permissions | No evidence of an agent-facing mutator; **not proven by a test** | **PARTIALLY IMPLEMENTED** |
| 5 | Free/local-first provider policy | `localOnlyEnabled()`, `isFreeOnlyMode()`, Ollama/llama.cpp/OpenAI-compatible adapters present | **VERIFIED LIVE (no reachable local model here)** |
| 5 | Bounded failover, no paid silent fallback | `MAX_ROUTE_ATTEMPTS=4`, profile ceilings | **VERIFIED LIVE** |
| 6 | ~37 specialised agents with real execution | Orchestrator + runtime real; individual agent **capability** claims unverified | **PARTIALLY IMPLEMENTED** |
| 7 | Coding agent that writes files, runs tests/builds | **No sandbox, no file-write, no child_process execution anywhere in `src/lib`** | **NOT IMPLEMENTED** |
| 8 | Per-user isolated workspace, tenant isolation | `companyId` scoping is pervasive (`agentCompanyScope`, `requireCompanyAuth`) | **VERIFIED IN TESTS** |
| 9 | Multi-modal with real engines | Voice/ASR/TTS adapters exist; **no image/video generation engine** | **PARTIALLY IMPLEMENTED** |
| 10 | Voice + telephony | Conversation real; telephony absent (`NotConnectedAdapter`) | **BLOCKED BY INFRASTRUCTURE** |
| 11 | Permissioned memory/RAG | `AgentMemory`, knowledge retrieval in voice path | **PARTIALLY IMPLEMENTED** |
| 12 | Security: SSRF, rate limit, audit, approvals | `guardedFetch`, Redis-atomic `checkLimit`, `writeAuditEvent`, approval-bound execution | **VERIFIED IN TESTS** |
| 13 | Real E2E user + Super Admin journeys | Not executable — no chat UI, no sandbox | **NOT IMPLEMENTED** |

### Explicitly missing subsystems

- **Coding sandbox** (Phase 7). Nothing in `src/lib` imports `child_process`/`spawn` for
  execution, and there is no `sandbox`/`workspace`/`coding` module. `find src/lib -ipath
  "*sandbox*"` returns only `voice/telephony/sandbox-adapter.ts`. Generated code therefore
  **cannot** be run, tested or built today.
- **Browser automation** (Phase 9). No `browser`/`playwright`/`puppeteer` module and no
  dependency in `package.json`.
- **Request classifier / capability planner** (Phase 2/6). No module maps a free-text
  request to a capability set and an execution plan.
- **Chat persistence** for the Super Admin path (see §1).

---

## 4. Security risks found

| Severity | Finding | Location |
|---|---|---|
| **High** | Super Admin chat history in process memory — lost on restart, inconsistent across instances, never audited as conversation | `super-chat/route.ts:14` |
| **High** | `broadcastExecuted: false` hardcoded — a client cannot distinguish "not executed" from "field never wired" | `super-chat/route.ts:120` |
| Medium | Agents have no sandbox; when one is added, it must not inherit host credentials | absent subsystem |
| Medium | Test/coverage gaps: `src/app/**` excluded from coverage (`vitest.config.ts`) | config |
| Carried over | XFF first-hop trust; `rejectUnauthorized:false` ×3; 13 flat migrations, no `migration_lock.toml`; `db push` in `scripts/build.sh`; masked `|| warn` in `scripts/deploy.sh` | see prior audit |

---

## 5. Duplicate / conflicting implementations

- **Two conversation stores**: the unused `Conversation`/`ConversationMessage` tables vs.
  the in-memory `Map` in `super-chat`. Consolidating onto the tables removes an entire
  class of bug (see §1).
- **Two Super Admin chat surfaces**: `super-commanding-chat.tsx` (nav `super-admin`) and a
  `<SuperCommandingChat />` tab inside `super-admin-ai-control-plane.tsx:665`. Same
  component, two entry points, no difference in capability.
- No duplicate AIRouter was found. `executeCompanyAIChat` is the single gateway; the voice,
  agent-runtime and orchestrator paths all route through it. This must be preserved.

---

## 6. Prioritised implementation order

Chosen for dependency order and verifiability — each step is independently testable and
does not require the previous one to be "finished" to be safe.

1. **P1 — Persist Super Admin chat + remove the hardcoded flag.** Smallest, highest
   security value, unblocks auditing, uses existing tables. Removes a High finding.
2. **P2 — Chat persistence + conversation list API.** Foundation for the unified chat.
3. **P3 — Unified chat UI.** Consumes existing `agent-chat` + conversation APIs. No new
   orchestration.
4. **P4 — Request classifier → capability plan.** Deterministic, testable, no model needed
   for classification.
5. **P5 — Sandboxed coding execution.** Largest and riskiest; must land behind approvals
   and resource limits, and cannot be verified beyond unit level on a 2-core/4 GB host.
6. **P6 — Super Admin change pipeline** (plan → approve → branch → PR → verify).

Steps that cannot be completed in this environment are reported as such rather than
faked: a coding sandbox needs containerisation and a second machine to be meaningfully
verified, and local model inference needs egress that this sandbox does not have.

---

## 7. What this audit deliberately does not claim

- Not claimed: that any of the ~37 named agent archetypes performs its advertised
  specialist work. The orchestrator can *dispatch* an agent; whether that agent's prompt
  and tools actually accomplish, say, SEO analysis, is unverified.
- Not claimed: production readiness. See the voice verification record for the telephony
  and local-inference blockers.
- Not claimed: that schema presence implies execution. `Project`/`Artifact` exist and are
  written by some flows, but no build/test/verify loop exists for generated code.
