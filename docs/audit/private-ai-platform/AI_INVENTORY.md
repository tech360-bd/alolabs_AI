# AI Infrastructure Inventory — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification.

## 1. Model providers (12 real implementations)

| Provider | File | Lines | Status |
|---|---|---|---|
| Ollama | `src/lib/ai-router/ollama-provider.ts` | 368 | Real REST client (`OLLAMA_URL`/`OLLAMA_BASE_URL`/`LOCAL_INFERENCE_URL`) |
| OpenAI-compatible | `src/lib/ai-router/openai-compatible-provider.ts` | 472 | Real |
| OpenRouter | `src/lib/ai-router/openrouter-provider.ts` | 467 | Real |
| Groq | `src/lib/ai-router/groq-provider.ts` | 473 | Real |
| DeepSeek | `src/lib/ai-router/deepseek-provider.ts` | 332 | Real |
| Mistral | `src/lib/ai-router/mistral-provider.ts` | 353 | Real |
| Qwen | `src/lib/ai-router/qwen-provider.ts` | 341 | Real |
| Llama | `src/lib/ai-router/llama-provider.ts` | 322 | Real |
| Phi | `src/lib/ai-router/phi-provider.ts` | 315 | Real |
| Gemma | `src/lib/ai-router/gemma-provider.ts` | 317 | Real |
| Z.AI | `src/lib/ai-router/zai-provider.ts` | 412 | Real |
| UnoRouter | `src/lib/ai-router/unorouter-provider.ts` | 430 | Real |
| **Anthropic** | — | — | **NOT FOUND** (only OpenAI-compatible adapter) |
| **Gemini (native)** | — | — | **NOT FOUND** (only via OpenRouter) |
| **Cloudflare AI** | — | — | **NOT FOUND** |
| **Hugging Face** | — | — | **NOT FOUND** |

Shared infrastructure:
- `src/lib/ai-router/provider-base.ts` — base class
- `src/lib/ai-router/provider-registry.ts` — registry
- `src/lib/ai-router/router.ts` (1,110 lines) — circuit breakers, fallback chains, decision recording, capability matching

## 2. Agent registry

| Aspect | Status | Evidence |
|---|---|---|
| 2,000-agent target | PASS | `src/lib/workforce/constants.ts:11-17` (`DEPARTMENT_COUNT=100`, `AGENTS_PER_DEPARTMENT=20`, `PRIMARY_AGENT_COUNT=2000`) |
| Agent ID pattern | PASS | `AGENT_ID_PATTERN = /^AGENT-(\d{4})$/` (line 39) |
| Seed script | PASS | `scripts/seed-enterprise-v3.ts:64` (provisions 2,000 agents) |
| Verification script | PASS | `scripts/verify-2000-workforce.ts` |
| Agent model fields | PASS | `prisma/schema.prisma:96-159` — `systemInstructions`, `runtimeProfile` (model config, knowledge scope, memory policy, resource limits), `companyId`, `departmentId`, `skills`, `toolPermissions`, `riskLevel`, `budget`, `timeout`, `concurrency`, `approvalPolicy`, version history, evaluation history, status |
| **Agent lifecycle (Draft → Reviewed → Approved → Available → Assigned → Executing → Evaluated → Improved → Versioned)** | PARTIAL | `status` field exists; full lifecycle state machine not verified end-to-end |
| **Hidden from public API** | **FAIL** | `/v1/agents` returns count + list; `/v1/agents/:id` returns prompts + model config |

## 3. Workforce engine

| Aspect | Status | Evidence |
|---|---|---|
| Orchestrator (routing, delegation, multi-agent) | PASS | `src/lib/orchestrator.ts` (1,381 lines) — `RoutingCandidate` scoring by department match + skill overlap + purpose relevance + role fit; adaptive reasoning paths (fast/standard/complex/enterprise) |
| Multi-agent collaboration | PASS | `src/lib/multi-agent-orchestrator/` (orchestrator, agent-factory, types) |
| Agent runtime | PASS | `src/lib/agent-runtime/` (9 files: pipeline, execution, scheduler, tool-loop, lifecycle) |
| Run planner | PASS | `src/lib/runs/planner.ts` — LLM planner with deterministic fallback |
| Task queues, scheduling, escalation | PASS | `src/lib/agent-runtime/scheduler.ts` |
| Dead-letter queues, graceful shutdown | PARTIAL | present in queue infra, not fully verified |

## 4. Knowledge & RAG

| Aspect | Status | Evidence |
|---|---|---|
| Document ingestion, chunking, embeddings | PASS | `src/lib/rag-engine.ts` (536 lines) |
| Vector store (Qdrant) | PASS | `src/lib/qdrant.ts` (443 lines) |
| Hybrid search (vector + keyword) | PASS | `src/lib/rag-engine.ts` |
| RAG routes | PASS | `src/app/api/rag/{collections,documents,search,query,ingest,feedback,logs,engine-stats,chunks/[id]}` |
| RAG models | PASS | `RagCollection`, `RagDocument`, `RagChunk`, `RagQuery`, `RagAnswer`, `RagFeedback` (`schema.prisma:1045-1133`) |
| Tenant isolation on RAG | PASS | `companyId` on all RAG models |
| **`tenant-knowledge.ts`** | **PARTIAL** | 28-line stub at `src/lib/tenant-knowledge.ts` |

## 5. Memory

| Category | Status |
|---|---|
| Platform memory | PARTIAL (exists via `Settings`) |
| Tenant memory | PARTIAL (`companyId`-scoped records) |
| Department memory | PARTIAL |
| Agent memory | PARTIAL (`Agent.runtimeProfile.memoryPolicy`) |
| Task memory | PASS (`Task` + `RunEvent`) |
| Authorized user preferences | PARTIAL |
| Operational memory | PASS (`AuditLog`, `SecurityEvent`) |

## 6. Voice AI

| Aspect | Status | Evidence |
|---|---|---|
| Voice contact center runtime | PASS | `src/app/api/v1/voice/**` (campaigns, calls, agents, billing, analytics, health) |
| Conversation brain, turn-taking, handoff | PASS | merged PR #27 (`7b9d192`) |
| Recording pipeline, billing, agent versioning | PASS | merged PR #27 |
| **STT/TTS adapters** | **PARTIAL** | `src/lib/voice/speech.ts` — `available: false` (honest placeholder, `no_speech_provider_configured`) |
| **LiveKit integration** | **NOT FOUND** | zero references to LiveKit in codebase |
| **Bangla TTS** | **NOT FOUND** | Piper has no Bangla voice; candidates identified but not integrated (see prior voice audit) |

## 7. Business intelligence / predictive analytics

| Aspect | Status | Evidence |
|---|---|---|
| Operational analytics | PARTIAL | `src/app/api/dashboard/{stats,usage,cost,security}` (admin-only) |
| Cost analytics | PARTIAL | `CostEstimate`, `PaymentGuardLog`, `UsageLog` models + `/api/dashboard/cost` |
| Workforce analytics | PARTIAL | super-admin panel shows aggregate counts |
| **Predictive analytics engine** | **NOT FOUND** | no `Prediction`/`Forecast` model; no ML training pipeline |
| **Anomaly detection** | **NOT FOUND** | |
| **Self-learning pipeline** | **NOT FOUND** | no dataset versioning, no model training, no drift detection |

## 8. Tool & connector hub

| Aspect | Status | Evidence |
|---|---|---|
| Tool registry model | PASS | `Tool` model in schema |
| Tool execution | PASS | `src/lib/agent-runtime/tool-loop.ts` |
| Approval policy on tools | PASS | `Agent.approvalPolicy` |
| Risk classification | PASS | `Agent.riskLevel` |
| Integrations (Gmail, Calendar, WhatsApp, SMS, CRM, GitHub, storage) | PARTIAL | WhatsApp/SMS/voice wired; email (SMTP/IMAP) wired; GitHub partial; storage (MinIO) wired |
| **External tool registry hidden from public API** | **FAIL** | `/v1/tools` GET exposes internal tool registry |

## 9. Provider status granularity

The spec requires distinguishing: Configured / Credential Available / Authenticated / Reachable / Model Available / Inference Tested / Tool Calling Tested / Production Approved.

| Status dimension | Tracked? | Evidence |
|---|---|---|
| Configured | YES | provider config in DB |
| Credential available | YES | env var presence checked |
| Authenticated | PARTIAL | runtime check on first call |
| Reachable | YES | health endpoint |
| Model available | YES | `/v1/models` lists models |
| Inference tested | PARTIAL | `verify:inference` script exists |
| Tool calling tested | PARTIAL | |
| Production approved | **NOT FOUND** | no "production approved" flag |
