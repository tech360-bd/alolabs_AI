# Super Admin Ecosystem Control Plane, Asset Vault & Multi-Protocol Gateway (2026-11-28)

## Overview

This architecture unifies all 30 supplied upstream ecosystems, multi-protocol AI model gateways, license/security gating, isolated coding harnesses, tool optimization, LiveKit voice/meetings, and responsive UI QA into one cohesive ALO Labs AgentOS control plane.

## 1. Unified Execution Flow & Multi-Protocol Gateways

### Protocol Endpoints (`src/app/api/v1/gateway/*`, `src/lib/ai-router/protocol-gateway.ts`)
- **Anthropic Messages**: `POST /api/v1/gateway/anthropic/v1/messages` (`x-api-key` or `Bearer alo_pk_...`, real SSE `message_start` / `content_block_delta` / `message_stop`)
- **OpenAI Chat Completions**: `POST /api/v1/gateway/openai/v1/chat/completions` (streaming `chat.completion.chunk` + `data: [DONE]` & completion JSON)
- **OpenAI Responses**: `POST /api/v1/gateway/openai/v1/responses` (streaming `response.created` / `response.output_text.delta` / `response.completed`; explicit `501` refusal on stateful `previous_response_id` / `background`)
- **Google Gemini GenerateContent**: `POST /api/v1/gateway/gemini/v1beta/models/[model]/generateContent` (`x-goog-api-key`, `x-api-key`, or `Bearer alo_pk_...`; optional `?alt=sse` streaming)

Every gateway route follows the single canonical execution pipeline:
`platformRoute` (principal resolution + `ai:chat` scope + per-credential rate limit + Zod schema) -> protocol request translator -> `executeCommandRoute` / `streamCommandRoute` (tenant concurrency slot + `applyGuardedRedaction` + privacy/strategy profile mapping) -> **`AIGateway.chat` / `AIGateway.streamChunks`** -> **`executeCompanyAIChat` / `streamCompanyAIChat`** (company status, `CompanyBudget`, `CompanySettings`, `AIProviderVerification`, `ProviderQuotaSnapshot`, global `isFreeOnlyMode()` hard ban on paid fallback, `ModelUsageRecord`, `AuditEvent`) -> **`aiRouter`** -> **`OllamaProvider` / `OpenAICompatibleProvider`** -> real upstream endpoint -> protocol response/error envelope.

### Command Router (`src/lib/ai-router/command-router.ts`, `/api/super-admin/ai/command-router`)
- **Strategies**: `capability`, `free-first`, `local-first`, `lowest-cost`, `lowest-latency`, `priority`, `manual`, `fallback`.
- **Privacy Guard Tiers**:
  - `standard`: normal routing across eligible providers.
  - `guarded`: masks API keys, bearer credentials, GitHub tokens, and JWTs (`applyGuardedRedaction`) before forwarding prompts externally.
  - `strict`: blocks remote cloud inference and routes exclusively to verified local runtimes (`ollama`, `vllm`, `localai`, `lm-studio`, `jan`).
- **Live Model Discovery**: `/models` & `/api/tags` discovery for Ollama and OpenAI-compatible endpoints behind `assertSafeExternalUrl` SSRF & DNS-resolution validation.

## 2. Asset Vault Reconciliation (30/30 Sources) & ONE Runtime (35 Adapters)

- **Intake Snapshot**: `src/lib/ecosystem/intake-data.generated.ts` (live verified 2026-11-28 metadata across 15 direct repositories, 10 paginated GitHub organizations/users, `topic:jarvis-ai` = 238, and `search:ai call` = 34,573).
- **30-Source Reconciliation**: `src/lib/ecosystem/asset-vault.ts` persists `30` `ExternalSource`, `30` `ExternalAsset`, `30` `LicenseRecord`, and `30` `SecurityReview` records across both SQLite and MySQL (`284` models). Concrete integrable platforms/sidecars produce pinned `Integration` + `IntegrationVersion` records (`27` records), while discovery indexes (`topic:jarvis-ai`, `search:ai+call`) and proprietary non-integrable sites stay cleanly separated as `reference_only` / `EXCLUDED`. Customer project copies always pin immutable `IntegrationVersion` IDs and are never silently mutated during Vault sync.
- **35 ONE Runtime Adapters**: `src/lib/integrations/index.ts` & `src/lib/ecosystem/adapters.ts` expose `getOneRuntimeAdapterInventory()`, reporting truthful per-adapter readiness (`operational`, `configured`, `configuration_required`, `restricted`, `degraded`, `disabled`) rather than treating code registration as operational readiness.
- **Verified License Boundaries**:
  - `Alishahryar1/free-claude-code`: GitHub reports `NOASSERTION`, actual `LICENSE` is **`AGPL-3.0-only`** -> strictly isolated over REST (`gateway.free-claude-code`); zero code copied.
  - `obsproject/obs-studio`: **`GPL-2.0`** -> controlled strictly as an external process over authenticated OBS WebSocket v5 (`media.obs-websocket`).
  - `postmill-ai/postmill-app`: **`AGPL-3.0`** -> isolated external API sidecar (`content.postmill`), publish actions human-gated.
  - `perrypixel/10x-Tool-Calls`: **No LICENSE file** -> excluded from copying; clean-room first-party Tool Optimization Engine built in `src/lib/coding-agents/tool-optimizer.ts`.
  - `nocobase/NocoCRM` & `nocobase/nocobase`: Custom NocoBase License Agreement -> flagged `restricted`, never embedded or auto-deployed without legal clearance.
  - `neondatabase/autoscaling`: K8s Postgres NeonVM -> flagged incompatible with MySQL/MariaDB production DB; reference only.
  - `MeiGen-AI`: hardware/VRAM gate enforced via `hardwareSnapshot()` (`src/lib/platform/hardware.ts`); zero unrequested weights downloaded.

## 3. Coding Harnesses, MCP Execution, LiveKit Lifecycle & Browser QA

- **Coding Harnesses & Disposable Git Sandbox** (`src/lib/coding-agents/harness-registry.ts`, `/api/super-admin/coding-agents`): 12 harnesses registered (`Claude Code`, `Codex`, `OpenCode`, `Pi`, `Cline`, `Hermes`, `DeepSeek Harness`, `Aider`, `SWE-agent`, `mini-SWE-agent`, `Code-Sync`, `anomalyco/browse`). Protected branches (`main`, `master`, `production`, `release/*`) and path traversal outside isolated `/tmp/` or `sandboxes/` are blocked; `executeSandboxedHarnessSession` requires explicit `approved` status, scrubs secret env vars, initializes an isolated `/tmp/alo-sandboxes/...` git repo on the `sandbox/*` branch, executes bounded verification (`node --check`), records real `git diff --cached --stat`, persists `diffSummaryJson`, cleans up `/tmp` artifacts, and writes `AuditEvent`.
- **MCP Server Execution** (`src/app/api/mcp-servers/{test,call}/route.ts`, `src/components/panels/mcp-manager-panel.tsx`): enforces `assertSafeExternalUrl` DNS-SSRF validation, runs MCP `initialize` -> `notifications/initialized` -> paginated `tools/list`, enforces `classifyToolRisk` human approval for mutating `tools/call` requests, rate-limits per user, and audits all invocations.
- **Voice, LiveKit & Meetings** (`src/lib/integrations/connectors/telephony/livekit.ts`, `src/app/api/meetings/route.ts`): implements HS256 JWT tokens, full Twirp `CreateRoom`/`ListRooms`/`GetRoom`/`DeleteRoom`/`ListParticipants`/`RemoveParticipant`, and SHA-256 webhook verification (`verifyLiveKitWebhook`). `POST /api/meetings` distinguishes `verified_room`, `unconfigured_sfu`, and `sfu_error` truthfully.
- **UI & Browser QA**: `SuperAdminEcosystemHub` (`src/components/enterprise/panels/super-admin-ecosystem-hub.tsx`) and `tests/browser/ecosystem-control-plane.test.mjs` verify Desktop (`1440x900`), Tablet (`768x1024`), and Mobile (`390x844`) layouts in real Chromium CI.
