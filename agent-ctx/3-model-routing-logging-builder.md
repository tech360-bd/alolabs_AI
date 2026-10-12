# Task 3: Model Routing + Centralized Logging Builder

## Work Record

### Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/llm/models/route.ts` | **Replaced** | Enhanced GET returns defaults + dynamic models from Settings (key prefix `model:`), plus routing rules. POST upserts model configs as JSON in Settings. |
| `src/app/api/llm/route/route.ts` | **Replaced** | Intelligent model routing: detects task type via regex heuristics, checks explicit routing rules, scores all active models on capability match, context window, cost preference, quality preference. Returns selected model with reasoning, estimated cost, estimated tokens, and all model scores. |
| `src/app/api/logs/route.ts` | **Created** | Centralized logging: POST ingests log entries → ServerLog; error/fatal also → ErrorLog. GET queries with level, source, time range filters, pagination. DELETE prunes old logs by `olderThan` param. Source/agentId/companyId stored in ServerLog metadata JSON since schema lacks dedicated columns. |
| `src/lib/token-guard.ts` | **Created** | `checkTokenBudget(companyId, estimatedTokens)` checks daily + monthly budgets, blocks if exceeded, creates/resolves Alert records when warning threshold crossed. Returns `{ allowed, reason?, monthlyUsed, monthlyBudget, dailyUsed, dailyBudget }`. |
| `src/lib/metrics-collector.ts` | **Created** | `collectSystemMetrics()` runs parallel DB queries for agent count, tasks by status, queue items by status, companies total, daily token usage. Records all as Metric entries via `createMany`. |
| `src/app/api/metrics/collect/route.ts` | **Created** | POST endpoint triggers `collectSystemMetrics()` and returns the result. |
| `src/app/api/llm/stream/route.ts` | **Replaced** | Enhanced streaming: auto model routing via `/api/llm/route` when no model specified, token budget check via `checkTokenBudget()`, detailed metrics recording (latency, time-to-first-token, token counts, success/failure), model info in SSE events and `X-Model` header. |

### Key Design Decisions

1. **Model storage**: Dynamic models stored in Settings table as `model:{id}` → JSON. GET merges defaults with dynamic (dynamic overrides defaults by id).
2. **Task detection**: Regex-based heuristic patterns for 5 task types (code_generation, analysis, creative, conversation, data_processing) with confidence scoring. Falls back to conversation.
3. **Routing scoring**: Multi-factor scoring — capability match (40pts), context fit (15/5/-10/-50pts), cost preference (20/10pts), quality preference (5-15pts), streaming bonus (+5pts), default model stability bonus (+2pts).
4. **Logging**: ServerLog schema has no source/agentId/companyId columns, so these are embedded in the `metadata` JSON field. GET endpoint extracts them for the response.
5. **Token guard**: Non-blocking alert creation via upsert pattern (updates existing firing alert or creates new one). Alert severity escalates to 'critical' at ≥95% utilization.
6. **Metrics collector**: Uses Prisma `groupBy` for efficient status-aggregated counts, `aggregate` for daily token sum, `count` for totals — all in parallel.
7. **Streaming enhancements**: Uses `performance.now()` for high-resolution timing. Records 5 metrics per successful call (latency, TTFT, prompt tokens, completion tokens, request count). Failure also recorded.