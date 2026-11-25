# ALO Labs — AgentOS Product Audit

> Generated: 2026-11-25 · Baseline: `main @ 689739e` (verified local clone, clean tree). Every claim below names its source path on this commit. Local verification commands were executed in this session; see §6.

## 1. What AgentOS is (verified composition)

AgentOS is a multi-tenant AI workforce platform built as one Next.js 15/TypeScript application plus Node mini-services, backed by Prisma over **250 models** (`prisma/schema.prisma`), with 169 documented environment variables (`.env.example`) and Docker/Caddy/nginx deployment assets.

## 2. Core subsystems (verified paths)

| Subsystem | Verified location | Notes |
|---|---|---|
| AI Router (inference gateway) | `src/lib/ai-router/` — `router.ts`, `provider-registry.ts`, `model-tiers.ts`, `tool-calls.ts` | 15+ providers: ollama, groq, deepseek, mistral, gemma, llama, phi, qwen, openai-compatible, openrouter, unorouter, zai; local-first with free-only operating mode |
| FREE-ONLY control plane | `src/lib/ai-router/free-only-mode.ts`, `free-only-admin.ts`, `free-models.ts`, `free-provider-specs.ts`, `free-tier-quota-tracker.ts` | zero paid inference spend posture; weekly model discovery (`scripts/run-model-discovery.ts`, CI workflow) |
| Multi-tenant AI gateway | `src/lib/multi-tenant-ai/service.ts` — `executeCompanyAIChat` | the single routing path: budget guards, failover, atomic usage metering |
| Unified chat surface | `src/app/api/chat/route.ts` + `src/components/chat/unified-chat.tsx` | ChatGPT-style; conversations in `Conversation`/`ConversationMessage` scoped by `userId`+`companyId` in-query; failed turns recorded honestly |
| Command agent | `src/app/api/command-agent/` (`catalog/`, `chat/`, 157-line chat route) | natural-language command surface for Super Admin |
| Multi-agent orchestration | `src/lib/multi-agent-orchestrator/`, `src/lib/orchestrator.ts` | department/workforce execution |
| Workflow engine | `src/lib/workflow-engine/`, `workflows/`, validator scripts | canonicalized definitions, lint/check/import scripts |
| Approval engine | `src/lib/approval-engine/`, `src/app/api/approvals/` | human-in-the-loop gate |
| Memory / RAG | `src/lib/memory/`, `agent-memory`, `agent-learning` APIs | knowledge grounding layer |
| Audit | `src/lib/audit-events.ts`, `src/app/api/audit-logs/`, `agent-runs`, `agent-status-history` | event records for every run |
| Security | `src/lib/ai-security/`, `src/lib/security/` (rate-limiter), `src/lib/api-auth.ts` (`requireCompanyAuth`) | endpoint rate limits, tenant auth |
| Mini-services | `mini-services/queue-service/`, `realtime-service/`, `shared/` | queue + realtime extraction |
| Voice | `src/app/api/voice/` (calls contract documented in `scripts/voice-smoke-test.mjs`), Bangla speech engine | TTS sidecar, call lifecycle (POST `/api/voice/calls`, PATCH `answer` action) |

## 3. What is genuinely complete vs partial vs missing

**Complete and verified (do not rebuild):** AI router + provider registry + free-only mode; tenant-scoped chat with honest failure semantics; approval engine APIs; audit event pipeline; 250-model schema; queue/realtime mini-services; voice call contract.

**Partial (components exist, capability incomplete):**
- Super Admin command center UI: `unified-chat.tsx` + `super-commanding-chat.tsx` exist; execution timeline, diff previews, right-rail project/branch context are not complete (see `docs/architecture/SUPER_ADMIN_AI_COMMAND_CENTER.md`).
- Coding agent loop: command-agent scaffolding; the full 16-step branch→edit→lint→test→build→diff→approval→PR→CI loop is not end-to-end wired.
- Handoff/delegation primitive exposed to chat; MCP server/client; dataset-driven evaluations; visual workflow canvas; permission-aware federated search.

**Missing:** public (unauthenticated) webchat service and widget; MCP integration; guardrail pipeline with pre-inference tripwires.

## 4. Honest-capability posture (verified in tests)

The repo enforces non-fabrication by test: solutions never claim stronger states than their service line; case studies list unfinished work; social channels ship empty until verified; failed AI turns are recorded `status: 'failed'` and surfaced; no agent execution is claimed unless the orchestrator ran (`src/app/api/chat/route.ts` header contract). This posture matches the audit discipline requirements and is a competitive differentiator (benchmark doc §Cross-vendor observations).

## 5. Recent regression history (verified from git log on this commit)

- PR #52 fixed corrupted source/missing modules/security gates; PR #55 restored business solutions + conversion; PR #57 published verified socials and unified company pages; commits `e4b0c7b`/`fe1b2fb`/`9a6baca` documented and fixed the NODE_ENV=test test-environment leak (99-file local failure reproduced as environment-only, not application defects); commit `7627729` fixed Ollama `/v1` endpoint normalization (503 `AI_DEFERRED` root cause) with protocol-level tests; commit `541e2cc` documented the real voice call contract.

## 6. Local verification executed in this session (real evidence, exit codes)

On the clean verified checkout of `689739e` with dependencies installed via bun from the lockfile (780 packages):

| Command | Result |
|---|---|
| `npx prisma generate` | exit 0 |
| `npm run typecheck` (next typegen + scripts/typecheck/run.mjs) | exit 0 |
| `npm run typecheck:tests` | exit 0 |
| `npm run lint` (eslint .) | exit 0 |
| `PRISMA_SQLITE_ADAPTER=1 SKIP_PAID_SERVICES=true npx vitest run` | exit 0 — **2326 passed / 15 skipped / 0 failed (212 files)** in 212.58s |
| `npm run build` (typecheck + next build compile/generate + package-standalone + build:services + verify-standalone) | exit 0 |

## 7. Product audit verdict

AgentOS is architecturally real and substantially built: the inference, tenancy, approval, audit, workflow and workforce subsystems are present and tested. The remaining distance to the 20-benchmark positioning is concentrated in **exposure surfaces** (public webchat, Super Admin command-center completion, run timeline UI) and two **protocol primitives** (handoff-as-tool, MCP) — all scoped as P1/P2 items in the feature gap matrix, not rebuilds of existing subsystems.
