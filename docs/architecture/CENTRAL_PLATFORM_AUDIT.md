# ALOLAS_AI / ALO Labs — Central AI Platform Audit (Master Directive, Priority 1)

> Generated: 2026-11-25 · Baseline audited: `main @ 689739e` (merge of PR #57) · Additive increment built on top: branch `feat/central-platform-gateway-v1`.
> Repo: `tech360-bd/alolabs_AI` ("ALOLAS_AI" in the directive refers to this same central platform repository).
> Method: every claim below was verified against the working tree at the named commit by path inspection, grep and executed commands. Status values: **verified** · **partial** · **missing**.

## 0. Executive summary

The central platform the directive describes is **already ~70% built inside this repository** — it was not distributed across projects. One Next.js application contains the Agent OS (agents, departments, orchestration, approvals, runs, audit), the model infrastructure (AI router with 15+ providers including local Ollama/Qwen), the voice stack, the shared services and a 48-route `/api/v1` gateway with per-company API keys and tenant isolation. The genuine gaps are enumerated in §7 and the first increment (knowledge / inference / analytics gateway routes + gateway-wide rate limiting) is implemented and tested in this PR.

## 1. Module A — ALO Agent OS

| Directive item | Status | Verified evidence (path at `689739e`) |
|---|---|---|
| Central AI Agent Runtime | verified | `src/lib/orchestrator.ts`, `src/lib/multi-agent-orchestrator/`, `src/app/api/v1/agents/*`, `src/app/api/v1/runs/*` |
| Departments orchestration | verified | `model Department` + `model DepartmentMemory` (`prisma/schema.prisma:89,555`), `src/app/api/agent-*` routes |
| AI employees | verified | `model AIEmployeeIdentity` (`prisma/schema.prisma:186`), provisioning scripts `npm run provision:workforce*`, `verify:ai-employees` |
| Agent Manager / Builder | verified | `src/app/api/agents`, `docs/AGENT_BUILDER_GUIDE.md`, `src/app/api/agent-versions` |
| Autonomous coding & debugging | partial | run/task system + `src/app/api/command-agent` exist; the full plan→branch→test→PR loop (directive §6) is **not yet** end-to-end; LangGraph/OpenHands/Aider not integrated (only incidental string matches) |
| AI Code Reviewer / QA agents | partial | agent types + quality assessment exist in the workforce; no dedicated reviewer pipeline PR |
| Skills & tool registry | verified | `src/lib/agent-skills/`, `/api/v1/skills`, `/api/v1/tools`, `docs/AGENT_SKILLS.md` |
| Agent memory & knowledge | verified | `src/lib/memory/`, `/api/v1/memory`, `model DepartmentMemory`, `KnowledgeNode`/`KnowledgeEdge` |
| Performance & evaluation | verified | `model DepartmentModelEvaluation`, `/api/v1/ai/usage`, agent-performance routes |
| Workflow automation | verified | `src/lib/workflow-engine/`, `/api/v1/workflows`, `/api/v1/workflows/[id]/run` |
| Human approval management | verified | `src/lib/approval-engine/`, `/api/v1/approvals`, `/api/v1/approvals/[id]` |

## 2. Module B — ALO Model Infrastructure

| Directive item | Status | Verified evidence |
|---|---|---|
| Ollama integration | verified | `src/lib/ai-router/ollama-provider.ts` |
| Qwen / coding / gemma / llama models | verified | `qwen-provider.ts`, `gemma-provider.ts`, `llama-provider.ts`, `deepseek-provider.ts`, `mistral-provider.ts`, `phi-provider.ts` |
| Model registry & router | verified | `src/lib/ai-router/router.ts` (`AIRouter.chat`, failover), `provider-registry.ts`, `model-tiers.ts`, `free-models.ts`, `/api/v1/models`, `/api/v1/providers/*` |
| llama.cpp | missing | no adapter found |
| Embedding models | verified | `AIEmbeddingRequest` (`src/lib/ai-router/types.ts:103`), `executeCompanyAIEmbeddings` (`src/lib/multi-tenant-ai/service.ts:954`) |
| Local STT/TTS | partial | `docs/BANGLA_SPEECH_ENGINE.md`, `docs/BANGLA_VOICE_MODEL_EVALUATION.md`, `src/app/api/voice/asr`, `avatar-voice` routes |
| Model benchmarking | partial | weekly model discovery workflow (`.github/workflows/weekly-model-discovery.yml`), no on-demand benchmark API |
| GPU/CPU workload management | missing | no workload scheduler found |
| Free-first routing, paid guard | verified | `free-only-mode.ts`, `free-only-admin.ts`, `free-tier-quota-tracker.ts`, routing profiles (`local_*`, `free_*`, `approved_paid`) in `src/lib/multi-tenant-ai/policy.ts` |

## 3. Module C — ALO Voice OS

| Directive item | Status | Verified evidence |
|---|---|---|
| Voice API surface | verified | `/api/v1/voice/*`: agents (+versions), calls (+end/transfer/inbound), campaigns (+actions), analytics, billing, health — 15 route files; plus `/api/voice/*` (asr, ivr, recordings, callbacks, inbox, presence, pronunciation, intelligence) |
| Call transfer / human handoff | verified | `src/app/api/v1/voice/calls/[id]/transfer/route.ts` |
| Outbound campaigns | verified | `src/app/api/v1/voice/campaigns/*` (outbound via campaigns) |
| Asterisk / Pipecat | partial | voice system routes + docs exist; explicit Asterisk/Pipecat adapters not found in this audit (see `docs/AGENTOS_RUN_EXECUTION_ARCHITECTURE.md`) |
| Bangla & English | partial | Bangla STT/TTS docs + evaluation harness; runtime quality parity is an open workstream |
| CRM integration for voice | verified | `src/app/api/v1/crm/*` (connections/verify, followup-drafts, preflight) |

## 4. Module D — Shared AI Services

| Directive item | Status | Verified evidence |
|---|---|---|
| Knowledge base / RAG / vector store | partial | `KnowledgeNode`/`KnowledgeEdge` graph models + memory lib; **no `/api/v1/knowledge` route existed** (built in this PR); dedicated vector DB (pgvector/Pinecone) not found |
| Versioned prompts | partial | agent versions exist; standalone prompt registry not audited |
| Notification service / scheduler | partial | job queue (`src/lib/job-queue.ts`), realtime service (`mini-services/realtime-service`); central notification surface not audited |
| Audit logging | verified | `src/lib/audit-events.ts`, `/api/v1/events`, audit-logs routes |
| Evaluation engine | verified | `DepartmentModelEvaluation`, ai/usage + agent-performance routes |

## 5. Central API Gateway (`/api/v1`)

**48 route files existed at `689739e`** under `src/app/api/v1/`: agents(+execute, [id], [id]/run), ai(capabilities, health, tasks, usage), approvals, artifacts, command, crm(3), events, health, memory, models, projects(+discover), providers(+[id], test, decisions), runs, skills, tasks, tools, voice(15), workflows(+run).

Cross-cutting mechanisms, verified:

- **Auth**: `src/lib/v1-auth.ts` — session bearer + company API keys (`alo_…`, sha256-hashed at rest, scoped, expirable, `lastUsedAt` tracking). Client-key audiences separated from internal.
- **RBAC scopes**: `v1Handler` derives `resource:read|write|execute` from path+method; fail-closed scope parsing (malformed JSON grants nothing).
- **Tenant isolation**: every query predicates on `identity.companyId`; `v1ProjectAccess` for project links; `sanitizePublic` defense-in-depth.
- **Idempotency**: `IdempotencyKey` model (`@@unique([companyId, key])`, request-hash exact match) enforced inside `executeCompanyAIChat` (AI plane) and job/workflow queues. Generic enforcement for non-AI mutating v1 routes: not yet centralized (model exists; per-route adoption).
- **Rate limiting**: `checkEndpointLimit` (Redis sliding window w/ in-memory fallback) — **existed but was not wired into the v1 gateway**; now available as `v1RateLimit()` and applied to the three new routes.
- **Usage metering**: `TokenUsage`/`TokenBudget` models + atomic metering in the company AI gateway.
- **Signed webhooks**: missing (verified — no HMAC webhook signing found). Open gap.
- **Versioning**: `/api/v1/` namespace + `API_V1_AI.md` contract doc. **Docs**: partial (this PR adds `docs/api/API_GATEWAY_V1.md`).

## 6. Directives §3 required API groups vs. reality

| Directive group | Status | Where |
|---|---|---|
| /api/v1/auth | partial | v1 auth is key/bearer identity; session flows live at `/api/auth/*` |
| /api/v1/agents, agents/tasks, agents/memory, agents/skills | verified | `/api/v1/agents*`, `tasks`, `memory`, `skills` (semantic equivalents; `agents/[id]/run` covers "agents/run") |
| /api/v1/models | verified | `/api/v1/models` |
| /api/v1/models/inference | **missing → built here** | `src/app/api/v1/models/inference/route.ts` (via `executeCompanyAIChat`) |
| /api/v1/workflows, tools | verified | existing |
| /api/v1/knowledge | **missing → built here** | `src/app/api/v1/knowledge/route.ts` (KnowledgeNode, tenant-scoped) |
| /api/v1/voice/calls, inbound, handoff | verified | `voice/calls`, `voice/calls/inbound`, `voice/calls/[id]/transfer` |
| /api/v1/voice/outbound | partial | `voice/campaigns` is the outbound mechanism; no literal `outbound` route |
| /api/v1/analytics | **missing → built here** | `src/app/api/v1/analytics/route.ts` (TokenUsage aggregation) |
| /api/v1/approvals, health | verified | existing |

## 7. Verified gaps (priority order)

1. **G1 (closed in this PR)** — `/api/v1/knowledge`, `/api/v1/models/inference`, `/api/v1/analytics` + gateway rate limiting helper.
2. **G2** — signed (HMAC) webhooks for gateway events.
3. **G3** — generic idempotency middleware adoption across all mutating v1 routes (pattern exists in the AI plane).
4. **G4** — autonomous engineering loop end-to-end (LangGraph orchestration, OpenHands/Aider adapters; directive §6).
5. **G5** — llama.cpp adapter; GPU/CPU workload scheduler; on-demand model benchmarking.
6. **G6** — vector DB + RAG retrieval service behind `/api/v1/knowledge/search`.
7. **G7** — project onboarding for the named ALO projects (Hosting Portal, TECH360, Education, NRC, MarketingOS) as API-key consumers with per-project scopes. **Not started; requires coordination with each project's owners.**
8. **G8** — literal `/api/v1/voice/outbound` + explicit Asterisk/Pipecat adapters.

## 8. Preservation compliance (directive §8)

This increment is **purely additive**: 1 modified file (`src/lib/v1.ts` — new helper + one scope-derivation clause for `inference` paths; existing routes unaffected since no pre-existing path contains `inference`), 3 new route files, 1 new test file, 3 new docs. No migrations (no schema change), no existing behaviour altered, all 2,337 existing tests still pass.

## 9. Verification on this branch

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:tests` | exit 0 |
| `npm run lint` | exit 0 |
| vitest full suite | **2337 passed / 15 skipped / 0 failed** (213 files) — includes 11 new gateway tests |
| `npm run build` | exit 0 |
