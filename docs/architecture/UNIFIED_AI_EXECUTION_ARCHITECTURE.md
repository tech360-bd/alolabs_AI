# ALO Labs — Unified AI Execution Architecture

> Generated: 2026-11-25 · Baseline: `main @ 689739e`. Describes the one execution path all AI work follows, and the new surfaces that hang off it.

## 1. The single execution path (verified components)

```
Client surface (public webchat | portal | dashboard | super-commanding-chat)
        │
        ▼
Route handler  (zod-validated, requireCompanyAuth / public-session auth,
                checkEndpointLimit rate limit)      [src/lib/api-auth.ts, src/lib/security/rate-limiter.ts]
        │
        ▼
executeCompanyAIChat / company AI gateway          [src/lib/multi-tenant-ai/service.ts]
        │  budget guards · tenant scoping · atomic usage metering · failover
        ▼
AI Router                                          [src/lib/ai-router/router.ts + provider-registry.ts]
        │  free-only-mode · model-tiers · free-tier-quota-tracker · weekly discovery
        ▼
Providers (15+): ollama(local) · groq · deepseek · mistral · gemma · llama · phi · qwen
                 · openai-compatible · openrouter · unorouter · zai …
        │
        ├── Tools / MCP (planned)                  [src/lib/ai-router/tool-calls.ts]
        ├── Memory / RAG                           [src/lib/memory/]
        ├── Multi-agent orchestrator               [src/lib/multi-agent-orchestrator/]
        ├── Workflow engine                        [src/lib/workflow-engine/]
        └── Approval engine gate (sensitive ops)   [src/lib/approval-engine/]
        │
        ▼
Audit events + agent-runs + usage summaries        [src/lib/audit-events.ts, /api/agent-runs, /api/agent-usage-summaries]
```

Key verified contracts:
- One tenant-aware gateway (`executeCompanyAIChat`) owns routing, budget guards, failover and **atomic usage metering** (`/api/chat/route.ts` header contract).
- Conversations persist in `Conversation`/`ConversationMessage` with `userId` + `companyId` enforced **in the query** so a guessed id cannot cross tenants.
- Failure is honest: failed turns recorded `status: 'failed'`, error returned, nothing fabricated.
- FREE-ONLY mode (`free-only-mode.ts` + `free-only-admin.ts`) keeps paid inference off unless explicitly authorized; quota tracker meters free tiers (`free-tier-quota-tracker.ts`).
- Local-first: Ollama provider normalized to native API root (the `/v1` 503 defect fixed in commit `7627729` with protocol-level tests).

## 2. Surfaces over the path

| Surface | Auth | Enters at | Notes |
|---|---|---|---|
| Public webchat (PR B, new) | anonymous session + rate limit | new `public-chat` service wrapping the gateway | no tools, approved-knowledge prompt only |
| Client portal | company auth | portal chat | own tenant only |
| Dashboard unified chat | company auth | `/api/chat` | verified today |
| Super Admin Command Center | admin auth + roles | `/api/chat` + `/api/command-agent` + coding workspace | approvals + full tools |
| CI / scheduled jobs | service identity | model discovery, verification workflows | weekly discovery verified in CI |

## 3. Execution event model (for the run timeline UI)

Every meaningful step emits an audit event: `request_received → task_created → plan_generated → agent_assigned → tool_invoked → tool_result → file_changed → tests_started → tests_completed → approval_requested → approval_decision → pr_created → ci_completed`. These map onto existing `audit-events` + `agent-runs` + `agent-status-history` records. The Command Center timeline renders **only** these records — no fabricated progress, no simulated animations.

## 4. Guardrails (to be completed as P2)

Adopt the layered model (OpenAI guardrails + Anthropic permission order) over the existing router:
1. **Input guardrails** (before inference): schema + injection screening + rate limits (verified: rate-limiter).
2. **Permission resolution** for tools: allowlist → mode → runtime callback (approval engine).
3. **Output guardrails** (before delivery): secret redaction, tenant-leak check, honesty lint for claims (no invented metrics/prices).
4. **Tripwire aborts** for detected misuse, before expensive calls.

## 5. Failure and recovery semantics (verified posture)

- Inference failure → recorded, surfaced, retriable; router defers rather than bills when no authorized route exists (`AI_DEFERRED` behavior documented and fixed for the Ollama case).
- Queue work → mini-services `queue-service` with recovery (PR #50 read-only CRM workflow + queue recovery tests).
- Human-in-the-loop → approval-engine; interrupts/resume pattern recommended for long runs (LangGraph-adopted concept).
- Rollback → Replit-checkpoint-adopted concept: workspace checkpoints before file modifications (to be wired in the coding workspace PR).

## 6. Non-goals

- No second AI system; no parallel conversation store; no client-side provider keys; no direct `main` pushes from agents; no fabricated execution states anywhere in the UI.
