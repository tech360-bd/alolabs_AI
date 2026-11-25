# ALO Labs — Feature Gap Matrix (20-Company Benchmark)

> Generated: 2026-11-25 · Baseline: `main @ 689739e` (merge of PR #57).
> Status values: **verified** (path inspected in this repo on this commit) · **partial** (component exists, capability incomplete) · **missing** (no implementation found).
> Priority: P1 = blocks the 20-benchmark positioning, P2 = competitive parity, P3 = later.
> Companion document: [`COMPETITIVE_BENCHMARK_20_COMPANIES.md`](./COMPETITIVE_BENCHMARK_20_COMPANIES.md).

## 1. Matrix

| # | Feature (benchmark source) | ALO Labs equivalent (verified path on `689739e`) | Status | Gap | Priority |
|---|---|---|---|---|---|
| 1 | Handoffs / agent-to-agent delegation (OpenAI Agents SDK, CrewAI hierarchical) | `src/lib/multi-agent-orchestrator/` + `src/lib/multi-tenant-ai/service.ts` | partial | delegation is implemented for internal agents, but no "handoff-as-tool" primitive exposed to chat; handoff events are not rendered in the UI timeline | P1 |
| 2 | Parallel guardrails with tripwires before model calls (OpenAI, Sierra) | `src/lib/ai-security/` + rate limiter (`src/lib/security/rate-limiter.ts`), endpoint limits in `/api/chat/route.ts` | partial | input guards + rate limits exist; no formal guardrail pipeline (output guardrails, tool-level tripwires) that runs *before* expensive inference | P2 |
| 3 | First-class execution tracing spans (OpenAI, LangSmith, AWS Observability) | `src/lib/audit-events.ts`, `src/app/api/audit-logs/`, `agent-runs` routes | verified | spans exist as audit events; no UI timeline view that renders a single run as ordered spans (tool → result → file change → test) | P1 |
| 4 | Durable, resumable, interruptible execution with checkpoints (LangGraph, Replit rollback) | `src/lib/workflow-engine/` + `src/lib/orchestrator.ts`; `mini-services/queue-service/` | partial | workflow engine + queue exist; interrupt-and-resume of a *chat-initiated* multi-step run with checkpoint rollback is not exposed end-to-end | P1 |
| 5 | Human approval gates on sensitive actions (UiPath Action Center, Cursor PR approval, IBM AgentOps) | `src/lib/approval-engine/` + `src/app/api/approvals/` | verified | engine + API exist; the Super Admin chat surface must enforce that paid execution, PR merge, and destructive ops route through it (see security boundaries doc) | P1 |
| 6 | Permission-aware retrieval (Glean) | `src/lib/memory/`, tenant scoping in `src/app/api/chat/route.ts` (`userId` + `companyId` enforced in query) | verified | per-user permission filtering *within* a company's knowledge base is not proven; tenant isolation is verified at company level only | P2 |
| 7 | Non-human agent identities with scoped credentials (Glean, IBM) | `scripts/provision-ai-employee-identities.ts`, `src/app/api/agent-permissions/` | verified | identity provisioning exists; per-agent scoped credential vaulting (per-app secrets broker, Zapier-style) is partial | P2 |
| 8 | Free/consumption cost attribution per agent (IBM, Copilot Credits, Devin ACU) | `src/lib/ai-router/free-tier-quota-tracker.ts`, `agent-usage-summaries` API | verified | usage metering atomic in `executeCompanyAIChat`; per-agent cost attribution dashboards partial | P3 |
| 9 | Model registry + provider health (AWS, LangSmith gateway) | `src/lib/ai-router/` — `router.ts`, `provider-registry.ts`, 15+ provider files (ollama, groq, deepseek, mistral, gemma, llama, phi, qwen, openrouter, unorouter, zai, openai-compatible…), `free-only-mode.ts` | verified | provider health/fallback-order admin UI partial; model discovery weekly job exists (`verify:model-discovery`) | P1 |
| 10 | MCP integration (OpenAI, Zapier MCP, n8n, Glean, Cursor) | no MCP server/client found in repo scan | missing | exposing ALO Labs tools via an MCP server and consuming external MCP servers | P2 |
| 11 | Visual workflow builder (n8n, Copilot Studio, Google Agent Studio) | `workflows/` + `scripts/canonicalize-workflow-definitions.mjs`, `check-workflow-definitions.mjs`, `import-workflow-definitions.ts` | partial | workflow definitions are data + validators; no in-product visual canvas | P3 |
| 12 | Public website conversion + chat (Intercom Fin, Sierra) | `/site/*` (21 routes, verified in `src/app/site/`), `/api/public/contact` | partial | conversion routes exist (`start-a-project`, `request-a-solution`, `book-a-consultation`); **public webchat is missing** — no `src/app/api/public/chat`, no chat widget under `src/app/site` | P1 |
| 13 | Super Admin conversational command center (Devin, Cursor, IBM control plane) | `src/components/chat/unified-chat.tsx`, `src/components/panels/super-commanding-chat.tsx`, `src/app/api/chat/route.ts`, `src/app/api/command-agent/` | partial | ChatGPT-style surface + command-agent catalog/chat exist; execution timeline, diff previews, agent assignment panel and approval states in the right-rail are not complete | P1 |
| 14 | Autonomous coding agent loop (Devin, Cursor, Replit) | `src/app/api/command-agent/`, mini-services queue | partial | command-agent scaffolding exists; the 16-step loop (branch → edit → lint → test → build → diff → approval → PR → CI monitor) is not fully wired end-to-end | P1 |
| 15 | Session persistence + encrypted conversation storage (OpenAI Sessions) | `Conversation` / `ConversationMessage` Prisma models (250 models total in `prisma/schema.prisma`) | verified | multi-turn persistence verified; encryption-at-rest choice is a deployment concern (documented in security boundaries doc) | P3 |
| 16 | Evaluation datasets / quality scoring (LangSmith, AWS Evaluations, ServiceNow Control Tower) | `src/app/api/agent-intelligence/`, `agent-stability`, `agent-performance` | partial | agent telemetry exists; no dataset-driven evaluation harness or safety scoring loop | P3 |
| 17 | Knowledge-grounded support agent with handoff (Fin, Sierra) | — | missing | this is exactly the public webchat scope (see `docs/audits/PUBLIC_WEBCHAT_AUDIT.md`) | P1 |
| 18 | Prompt-to-app / guided build journeys (Replit, Bolt-style) | `src/app/api/agent-factory/` | partial | agent factory exists; guided public-facing app-builder journey not built | P3 |
| 19 | Enterprise search across company knowledge (Glean) | `src/lib/memory/` + RAG routes (`agent-memory`, `agent-learning`) | partial | memory/RAG layer exists; permission-aware federated search across all connectors is not implemented | P2 |
| 20 | Cron/scheduled + webhook-triggered automation (n8n, Zapier, ServiceNow) | `weekly-model-discovery.yml` + workflow definitions + queue service | verified | scheduled jobs verified at CI level; user-facing trigger configuration UI partial | P3 |

## 2. What the matrix says

**Verified strengths (do not rebuild):** AI router with free-only operating mode and quota tracking; tenant-scoped unified chat API with honest failure handling; approval engine; audit events; workflow engine; multi-agent orchestrator; 250-model Prisma schema; 15+ inference providers including local Ollama. Five verification commands pass on this exact commit: `npm run typecheck` (0), `npm run typecheck:tests` (0), `npm run lint` (0), full vitest suite (2326 passed / 15 skipped / 0 failed), `npm run build` (0).

**Four P1 gaps that define the next PRs:**
1. **Public webchat (row 12/17)** — highest revenue impact; designed in `docs/architecture/` docs and audited in `docs/audits/PUBLIC_WEBCHAT_AUDIT.md`.
2. **Super Admin command center completion (row 13)** — components exist; missing execution timeline, diff preview, right-rail context.
3. **Coding agent end-to-end loop (row 14)** — wire command-agent through lint/test/build/approval/PR with real events only.
4. **Run-timeline visualization (row 3/4)** — render audit events as ordered spans per run; no fabricated progress.

**Explicitly out of scope by license:** copying n8n `.ee` code (Enterprise License), Cursor/Cognition proprietary code, any vendor UI assets. Concept adoption only.
