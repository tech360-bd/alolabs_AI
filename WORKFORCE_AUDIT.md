# Workforce activation audit — Phase 1 findings

**Date:** 2026-10-18 · **Branch:** `arena/8cc412a3-alolabs-ai`
**Checked against:** this checkout (`/home/user/alolabs_AI`), commit `87349b8` + working tree.

## 0. What this environment could and could not see — read this first

| Requirement | Status here |
|---|---|
| Production directory `/home/aloedu/alolabs_AI` | **Not present.** This sandbox has its own clone; the production host is unreachable. |
| Live database (MySQL) | **Not reachable.** No `DATABASE_URL`, no `mysql`/`psql` client, no `.env`, no `node_modules`, no Prisma client generated. |
| Ollama / GPU / model weights | **Not installed.** `ollama` and `ffmpeg` are absent; no model download is possible from this network. |
| Production process manager / nginx / systemd | **Not inspectable.** Only `deploy/` manifests in the repo could be read. |

**Therefore: no production counts in this document are invented.** Every number below is
either (a) a count of files/records in the repository, or (b) labelled "must be measured".
Section 7 gives the exact read-only command that produces the real counts on the
production host. Anything I could not execute is marked **NOT EXECUTED**, not "working".

---

## 1. Phase 1 answers (evidence-based)

### 1.1 How departments are stored and related to agents

`Department` (`prisma/schema.prisma:67`) → `Agent.departmentId` FK (`:99`, relation `:130`).
Departments also carry `runtimeProfile` (budget, allowed models/providers, knowledge
sources, KPIs). The planned inventory is 100 departments
(`docs/workforce/departments.csv`, 100 rows + header) with 20 agents each.

**Verified in repository, not in database:** the plan exists; the rows cannot be counted
from here.

### 1.2 How AI employees differ from AI agents

**There is no Employee model.** `grep -c "employee" prisma/schema.prisma` → **0**. The
"2,000 AI employees" are not a separate entity: they are the same `Agent` rows viewed
through `Agent.role` (`manager`, `planner`, `execution`, `qa`, `report`, `automation`,
`safety`, `memory`, `productivity`, `owner_approval`, `specialist`) plus
`Agent.type` (`conversational`, `autonomous`, `workflow`, `specialized`).

Consequence: **any claim of "2,000 agents + 2,000 employees" counts one table twice.**
Real cardinality must be measured (`SELECT COUNT(*) FROM Agent`). If the production
dashboard shows 2,000 and 2,000, it is almost certainly reading the same rows through two
labels. This is a reporting defect, not a second workforce.

### 1.3 Model assignments

Present, but indirect. `Agent.runtimeProfile` is JSON containing
`modelConfig: { policy, fallbackPolicy, pinnedModel, maxOutputTokens, temperature }`
(`src/lib/workforce/plan.ts:266-274`). `policy` is a **tier alias** (`fast`, `balanced`,
`reasoning`, `coding`, `vision`) resolved at call time by the router — not a pinned model
id. `selectModelForTask()` (`src/lib/agent-runtime/pipeline.ts:97`) returns the alias.
There is no per-agent model id unless `pinnedModel` is set (it is `null` in the plan).

### 1.4 System prompts and role definitions

`Agent.systemInstructions` (schema `:112`) plus `purpose`, `inputSchema`, `outputSchema`,
`workflowSteps`, `protectionRules`, `approvalRules`, `qualityChecklist`. Populated by
`src/lib/workforce/plan.ts`. Runtime uses `buildAgentContext()` and falls back to a
one-line prompt if that throws (`execution.ts:474-488`) — the fallback is real, not a stub.

### 1.5 Tool permissions

**Columns exist, enforcement did not.** `Agent.allowedTools` / `forbiddenTools` and
`Skill.allowedTools` are stored, and `ToolApprovalRequest` exists. But before this pass
**no code read `selectedTools` or `allowedTools` at execution time**:

```
$ grep -rn "selectedTools" src --include=*.ts
(no matches)
$ grep -rln "executeTool|ToolRegistry" src/lib src/app/api
(no matches)
```

`ToolRun` (`schema:1070`) was never written. Agents could not call a tool at all.

### 1.6 Execution engine

Exists and is substantial: `src/lib/agent-runtime/execution.ts` (845 lines) with state
machine (`state.ts`), health (`health.ts`), scheduler (`scheduler.ts`), lifecycle
(`lifecycle.ts`), pipeline (`pipeline.ts`). It is reachable from
`/api/agent-runtime/execute`, `/api/v1/agents/execute`,
`/api/v1/agents/[id]/run`, `src/lib/runs`, `src/lib/orchestrator`.

### 1.7 Background workers

`src/instrumentation.ts` → `instrumentation.node.ts` starts a durable queue worker inside
the Next.js server process (`startWorker()`, `:57`). It polls every 3 s, reclaims expired
leases every 30 s, dispatches `agentos.run` / `agentos.workflow` / `agentos.command`.
**This is real**, but it runs *inside the web process*: if the server is down, nothing
runs, and one crashed replica is not isolated. There is no separate worker deployment
unit (no `deploy/systemd/*worker*`).

### 1.8 Task queues

`JobQueue` + `QueueItem` (`schema:1334`) with `status`, `attempts`, `maxAttempts`,
`idempotencyKey` (unique), `lockedBy`, `lockExpiresAt`, `heartbeatAt`. `src/lib/job-queue.ts`
(557 lines) implements claim/lease/reclaim/dead-letter. **Operational by design**; whether
the queue is *draining* must be measured (`SELECT status, COUNT(*) FROM QueueItem GROUP BY status`).

### 1.9 Task results persisted?

Yes: `AgentRun` (`schema:838`) stores input, output, duration, model, tokens, latency,
contextSources, reviewResult; `TaskStep`, `Output`, `Artifact`, `ToolRun` also exist. The
engine writes `AgentRun` before transitioning to completed (`execution.ts:607-645`).

### 1.10 Execution logs and health

`AgentRun` + `AuditLog` (action `agent_execution`) + `AgentHealth` + `AgentStatusHistory`.
`AuditLog` has **no tenant column** (`schema:565-577`), so tenant-scoped audit queries
filter on `details` JSON or resource prefix — a reporting limitation to be aware of.

### 1.11 Is the model gateway connected?

Two layers exist: `src/lib/ai-router` (provider registry, circuit breaker, routing
decisions, usage tracking) and `src/lib/ai-gateway/gateway.ts` (higher-level facade).
Providers: ollama, qwen, gemma, llama, phi, deepseek, groq, mistral, openrouter, zai,
openai-compatible. **Whether any provider is registered and healthy in production cannot
be determined here** — `ensureRouterSynced()` reads provider config from the database and
env. With no key and no Ollama, `router.route()` throws
`No providers are available`; every agent then fails at first inference.

### 1.12 Do endpoints invoke real inference or return placeholders?

Sampled the execution path: it calls `router.chat(...)` for real
(`execution.ts:527`), with a fallback chain (`:530`). No placeholder response was found in
the agent path. The **placeholder defect was one level lower** — see §2.

### 1.13 Do dashboard statistics reflect real executions?

Partly. `/api/stats` (added in the previous pass) counts rows: agents, tasks, departments,
commands, workflows, pending approvals. It does **not** count executions, successes or
latency, so a dashboard built on it shows *catalogue size*, not *work*. The new
`scripts/activate-workforce.ts` produces execution-derived numbers instead.

### 1.14 Migrations complete?

`prisma/migrations/mysql/` holds three SQL files (foundation, hardening, hardening rollback)
plus a rollback script. The schema has 179 models. **Schema drift cannot be verified
without the production database** — run `npx prisma migrate status` / compare
`information_schema` on the host.

---

## 2. The defect that explains "agents are not performing tasks"

The execution engine sends `tools` to the router, and every provider forwards them
(`qwen-provider.ts:205`, and the same in the other nine). But the response contract had
nowhere to put the model's tool calls:

```ts
// src/lib/ai-router/types.ts (before)
export interface AIResponse {
  id: string; content: string; model: string; usage: AITokenUsage;
  finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error';
  latencyMs: number;
}
```

All ten providers mapped `finish_reason: "tool_calls"` → `finishReason: 'tool-calls'` and
then **discarded `message.tool_calls`**. The model asked to call a tool, the gateway
returned `content: ""`, and the engine persisted a *completed* `AgentRun` with an empty
output. Nothing errored, so nothing was ever reported as broken.

This is the exact failure mode described in the brief: records exist, executions "succeed",
and no work is produced.

### Repair shipped in this pass

| Change | File |
|---|---|
| `AIToolCall` type; `toolCalls` on `AIResponse`/`AIMessage` | `src/lib/ai-router/types.ts` |
| Defensive extractor + strict JSON argument parser (rejects arrays/prose) | `src/lib/ai-router/tool-calls.ts` |
| All 10 providers now return `toolCalls` | `src/lib/ai-router/*-provider.ts` |
| Tool registry, 5 read-only tenant-scoped tools | `src/lib/tools/{registry,arithmetic}.ts` |
| Deny-by-default authorisation (`allowedTools` ∩ ¬`forbiddenTools`, no wildcards, approval for high risk) | `src/lib/tools/policy.ts` |
| Execution + `ToolRun` persistence (blocked runs recorded too) | `src/lib/tools/execute.ts` |
| Bounded ReAct loop (≤5 model turns, forced textual answer when budget is spent) | `src/lib/agent-runtime/tool-loop.ts` |
| Engine advertises only permitted tools and runs the loop | `src/lib/agent-runtime/execution.ts` |

Tools available to agents: `search_knowledge` (company RAG), `crm_lookup_contact`,
`crm_pipeline_summary`, `department_directory`, `calculate`. There is **no shell, no
filesystem write, no arbitrary HTTP, no raw SQL** tool — by construction, not by prompt.

---

## 3. Lifecycle: configuration ≠ execution

`scripts/activate-workforce.ts` implements the required lifecycle and refuses to promote
an agent without evidence:

| Stage | Condition |
|---|---|
| CREATED | row exists |
| CONFIGURED | instructions ≥40 chars, purpose, model policy, input/output schema, ≥1 allowed tool, active agent, active department |
| READY | CONFIGURED **and** the agent's model alias resolves to a registered, circuit-closed provider *right now* |
| DEMONSTRATED | READY **and** ≥1 completed `AgentRun` with output inside the window |

Operational = **DEMONSTRATED**. Department readiness = 40 % configured + 30 % ready +
30 % demonstrated; a department cannot score on paperwork alone.

---

## 4. What was executed and verified here

| Check | Result |
|---|---|
| `vitest` — backup 13, routing 8, media 15, email/tracking 9, tool policy/arithmetic/tool-call 21, tool loop 4 | **70/70 pass** |
| esbuild parse — **every** `.ts`/`.tsx` under `src/` and `scripts/` | **896 files, 0 failures** |
| Import resolution — 69 changed/untracked TS files | **0 missing** |
| Negative controls on `src/lib/tools/` | `child_process`/`spawn`: **0** · `eval`/`new Function`: **0** · `.create/.update/.delete/.upsert`: **0** · `queryRaw`/`executeRaw`: **0** |
| Circular-import check (`pipeline` → `execution` → `tool-loop` → `tools` → `pipeline`) | **no cycle** — `pipeline.ts` imports neither `execution` nor `tool-loop` |
| Live end-to-end inference (task → agent → model → tool → DB → dashboard) | **NOT EXECUTED** — no provider, no database in this sandbox |
| Real agent execution against production | **NOT EXECUTED** — host unreachable |
| Model benchmarks (Phase 2 measurements) | **NOT EXECUTED** — see §6 |

The tool loop is unit-tested with the executor mocked: what is proven is control flow
(bounded steps, transcript, blocked calls surfaced, forced final answer). What is **not**
proven here is a model choosing a tool and the result reaching a real database.

---

## 5. What the test suite actually covers in the tool path

- `authoriseTool` — deny-by-default, forbidden-wins, no wildcards, approval gate.
- `parseToolList` — JSON array, pipe form from the CSVs, junk → empty.
- `evaluateArithmetic` — precedence, parentheses, injection attempts, division by zero.
- `extractToolCalls` — OpenAI `tool_calls`, legacy `function_call`, object args, junk rows.
- `parseToolArguments` — fenced JSON, arrays rejected, invalid JSON rejected.
- `runToolLoop` — one round-trip, blocked tool surfaced as error, max-step cutoff forces an
  answer, no-tool path is a no-op.

---

## 6. Phase 2 — model plan under the measured constraints

No GPU, no Ollama and no model weights are reachable from this environment, so no model
was downloaded and **no accuracy or throughput number is claimed**. The decision table
below is a *plan* to be confirmed by `scripts/benchmark-gateway.ts` on the target host.

| Candidate | Intended role | Why | Gate before use |
|---|---|---|---|
| Qwen3 4B (Ollama) | `fast` tier: chat, summarisation, classification | Fits CPU/small-VRAM; lowest latency | p95 < 4 s, JSON validity ≥ 95 % on the benchmark |
| Qwen3 8B (Ollama) | `balanced` tier: writing, CRM replies | Best quality/latency compromise at 8B | tool-call accuracy ≥ 90 % |
| Qwen3 30B-A3B (Ollama) | `reasoning` / `coding` | MoE: 3B active params, so cost closer to 8B | only if RAM ≥ 48 GB (Q4) |
| EmbeddingGemma | RAG embeddings | Local, no per-token cost | recall@5 on 20 real queries vs current embedder |
| Whisper-compatible (already wired) | transcription/subtitles | Implemented in `src/lib/media-generation/transcribe.ts` | WER spot-check on 3 real recordings |
| Local image model (SDXL-class) | image generation | Only if GPU present | not on CPU-only hosts |

**vLLM:** only when a CUDA GPU with ≥24 GB VRAM exists. On CPU-only infrastructure vLLM
adds no throughput and complicates deployment; Ollama is the correct first backend.

Rules applied: no model is downloaded by this pass; no production resource is allocated;
tier aliases are only marked ready when `router.route()` resolves them.

---

## 7. Run these on the production host (read-only first)

```bash
cd /home/aloedu/alolabs_AI
git fetch origin && git checkout arena/8cc412a3-alolabs-ai   # or merge to your release branch

# 0. Backup before anything (see docs/BACKUPS.md)
bash scripts/backup.sh

# 1. Real counts + readiness + blockers (writes nothing)
npx tsx scripts/activate-workforce.ts
npx tsx scripts/activate-workforce.ts --json > workforce-inventory.json

# 2. What the gateway can actually do
npx tsx scripts/benchmark-gateway.ts --samples 5

# 3. Schema drift
npx prisma migrate status

# 4. Queue reality
#   SELECT status, COUNT(*) FROM QueueItem GROUP BY status;
#   SELECT COUNT(*) FROM AgentRun WHERE createdAt > NOW() - INTERVAL 1 DAY;
```

`activate-workforce.ts` prints exactly the Phase-12 fields: department count, agent
count, configured, ready, demonstrated, failing, plus per-agent blockers and the top
blocker histogram. That output *is* the Phase-12 answer; it is not a template.

---

## 8. Phase 12 — status of the 14 deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | Actual department count | **NOT MEASURED** — `SELECT COUNT(*) FROM Department` on the host; plan = 100 |
| 2 | Actual agent count | **NOT MEASURED** — plan = 2,000 |
| 3 | Actual employee count | **Does not exist as a table** — same rows as agents (§1.2) |
| 4 | Number configured correctly | Script ready (`activate-workforce.ts`), **not run against production** |
| 5 | Number executable (READY) | Script ready, **not run** |
| 6 | Number tested successfully (DEMONSTRATED) | Script ready; **0 proven until a real AgentRun is recorded** |
| 7 | Number failing | Script ready, **not run** |
| 8 | Exact failure causes | Per-agent `blockers[]` in the JSON report; **not produced** |
| 9 | Working model inventory | Benchmark ready; **no provider reachable here** |
| 10 | Working service catalog | Code-complete for media/transcription/chat/agent-exec/CRM/WhatsApp/email; **provider-backed paths need keys** |
| 11 | Performance benchmark | **NOT EXECUTED** |
| 12 | Production health report | Needs `/api/health/deep` on the host |
| 13 | CI / deployment verification | **NOT RUN** — no runner or deploy target reachable |
| 14 | Remaining blockers | §9 |

### Phase-by-phase delivery

| Phase | Delivered | Not delivered |
|---|---|---|
| 1 — discover failure | Full read-only audit (§1), root cause proven with `grep` evidence (§2) | Live DB counts (no DB access) |
| 2 — model gateway | Tool-call contract repaired across 10 providers; benchmark harness | Provider configuration; model download; accuracy/latency measurement; vLLM evaluation |
| 3 — activate agents | Tool loop + permissions now enforced at execution; lifecycle audit script | No agent re-provisioned; no run evidence on production |
| 4 — AI employees | — | **Not started.** No Employee model; no supervisor/delegation/schedule/inbox entity |
| 5 — 100 departments | Department readiness scoring in the script | No per-department tool registration or representative task run |
| 6 — service catalog | Media (image/music/video/voice), transcription, chat, agent execution, CRM, WhatsApp inbox, email | Code/document analysis, translation, IELTS/PTE, student counselling; no benchmarks vs paid models |
| 7 — execution engine | Existing durable queue confirmed; tool service added; leases/idempotency/dead-letter present | Independent worker process; ffmpeg/ASR worker; rate limits per tenant; full cancellation UI |
| 8 — service API | Existing `/api/v1/*`, `/api/ai/*`, `/api/agent-runtime/*`, `/api/media/*` | OpenAI-compatible surface not verified end-to-end; quotas not enforced |
| 9 — testing | 70 unit tests; 896-file parse sweep | Vertical slice, 1/10/100/2,000-agent runs, concurrency tests — **none executed** |
| 10 — production safety | Backup tooling from earlier pass; branch isolation | Backup restore rehearsal, migration review, rollback rehearsal — not run |
| 11 — deployment | — | **Not started.** Port/proxy/process topology unknown from here |
| 12 — deliverables | This document + two measurement scripts | The numbers themselves |

## 9. Remaining blockers (real, not stylistic)

1. **No model provider is guaranteed.** If production has no `*_API_KEY` and no Ollama,
   every agent is CONFIGURED but not READY. This is the single biggest blocker and is
   measurable in one command.
2. **Workers run inside the web process.** No independent worker unit; a restart of the
   app interrupts the queue (leases recover, but nothing executes meanwhile).
3. **No per-agent execution evidence yet.** Partly fixed: tool calls are no longer dropped
   and the loop is bounded. Still unproven end-to-end until a run is recorded.
4. **`AuditLog` has no tenant column**, so tenant-scoped audit reporting is approximate.
5. **Dashboard shows catalogue size**, not executions. `/api/stats` should gain
   `runs24h`, `successRate24h`, `p95LatencyMs` — not done yet.
6. **Employee ≠ Agent** — the 2,000/2,000 claim cannot be substantiated; it needs a single
   source of truth.
7. **No GPU/Ollama in this sandbox**, so no benchmark, no accuracy claim, no model download.

---

## 10. Honest statement

I have not made 2,000 agents operational, and I will not claim it. What this pass changed
is that the pipeline can now *actually complete work* rather than silently returning empty
output, and that the platform can *measure* which agents are configured, routable and
demonstrated. The remaining distance is provider configuration, an execution run against
the production database, and the measurement commands in §7 — none of which can be
performed from this sandbox.
