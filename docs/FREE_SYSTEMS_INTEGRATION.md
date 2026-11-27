# Free & Open Systems — Integration Record (Wave 2)

> Companion to [`ECOSYSTEM_REVERSE_MAP.md`](./ECOSYSTEM_REVERSE_MAP.md) §3 (License
> Compliance Policy) and §4 (ONE Runtime architecture).
> Every system the user listed is recorded here with its **verified** license,
> the strategy it was given, and exactly where it landed in the codebase.
> Verified against live GitHub LICENSE files on **2026-11-26**.

## 1. Why this document exists

The user asked to "add all free systems" to AgentOS. "Add" cannot mean *copy the
code in*: several of them are AGPL, fair-code, custom-commercial, or carry no
license at all. Per the binding policy, each system is added by exactly one of
four routes — and never a second, parallel execution path:

| Strategy | Meaning | Code in this repo |
|---|---|---|
| `REUSE` | Permissive license; patterns/helpers (or vendored code with attribution) may be used | Pure TypeScript helpers, no upstream code copied unless noted |
| `API_INTEGRATE` | Copyleft / source-available / custom license; connect over REST to a **separately hosted, unmodified** instance | Adapter with `guardedFetch` + tenant audit; **zero** upstream code |
| `LEARN` | Clean-room re-implementation of the published idea; no code, no service dependency | Pure helpers encoding the method |
| `AVOID` | License or ToS exposure | No adapter; registry refuses to register it |

All 20 adapters live in `src/lib/integrations/connectors/**`, are registered by
`bootstrapIntegrations()` in `src/lib/integrations/index.ts`, and are readable at
runtime from `GET /api/integrations/catalog`.

## 2. Verified license table

Legend — **V**: verified by reading the repository's actual LICENSE file via the
GitHub license API on 2026-11-26. Where a "common belief" differed from the
LICENSE, the trap is called out.

| # | System | Upstream | Verified license | Strategy | Category | Adapter file |
|---|---|---|---|---|---|---|
| 1 | LibreChat | LibreChat-AI/LibreChat | MIT **V** | REUSE | `ai-chat` | `connectors/ai-chat/librechat.ts` |
| 2 | LiteLLM | BerriAI/litellm | MIT core; `litellm/enterprise/` under BerriAI Enterprise License **V** | API_INTEGRATE | `gateway` | `connectors/gateway/litellm.ts` |
| 3 | Open WebUI | open-webui/open-webui | **"Open WebUI License"** = BSD-3 + branding clause 4 **V** → source-available | API_INTEGRATE | `ai-chat` | `connectors/ai-chat/open-webui.ts` |
| 4 | Aider | Aider-AI/aider | Apache-2.0 **V** | REUSE | `coding-agent` | `connectors/coding-agent/aider.ts` |
| 5 | SWE-agent | SWE-agent/SWE-agent | MIT **V** | REUSE | `coding-agent` | `connectors/coding-agent/swe-agent.ts` |
| 6 | Directus | directus/directus | **MSCL-1.0-GPL** (Monospace Sustainable Core License, fair-code) **V** | API_INTEGRATE | `content` | `connectors/content/directus.ts` |
| 7 | Activepieces | activepieces/activepieces | MIT core; `packages/ee/**` separate commercial license **V** | API_INTEGRATE | `automation` | `connectors/automation/activepieces.ts` |
| 8 | NocoBase | nocobase/nocobase | **Custom "NocoBase License Agreement"** (v3, amended 2026-11-16) **V** | API_INTEGRATE | `automation` | `connectors/automation/nocobase.ts` |
| 9 | GrapesJS | GrapesJS/grapesjs | BSD-3-Clause **V** | REUSE | `content` | `connectors/content/grapesjs.ts` |
| 10 | Temporal | temporalio/temporal | MIT **V** | API_INTEGRATE | `automation` | `connectors/automation/temporal.ts` |
| 11 | CapRover | caprover/caprover | Apache-2.0 **V** | API_INTEGRATE | `deploy` | `connectors/deploy/caprover.ts` |
| 12 | Dokku | dokku/dokku | MIT **V** | REUSE | `deploy` | `connectors/deploy/dokku.ts` |
| 13 | AI-Powered Call Center Intelligence | amulchapla/… | MIT **V** (code) — but Azure-service dependent, not free to run | LEARN | `telephony` | `connectors/telephony/call-intelligence.ts` |
| 14 | Call GPT | twilio-labs/call-gpt | MIT **V** | REUSE | `telephony` | `connectors/telephony/call-gpt.ts` |
| 15 | AI Native Call Center | rasonyang/ai-native-callcenter | Apache-2.0 **V** | API_INTEGRATE | `telephony` | `connectors/telephony/ai-native-callcenter.ts` |
| 16 | InfiniteTalk | MeiGen-AI/InfiniteTalk | Apache-2.0 **V** (code; check each checkpoint's weights) | API_INTEGRATE | `media` | `connectors/media/infinite-talk.ts` |
| 17 | OmniCopilot / OmniRoute | cheaper-inference/OmniCopilot | MIT **V** | API_INTEGRATE | `gateway` | `connectors/gateway/omniroute.ts` |
| 18 | Free Claude Code | Alishahryar1/free-claude-code | **AGPL-3.0-only V** | API_INTEGRATE (never vendor) | `gateway` | `connectors/gateway/free-claude-code.ts` |
| 19 | 10x-Tool-Calls | perrypixel/10x-Tool-Calls | **No license file ⚠** (GitHub `license: null` → all rights reserved) | LEARN | `coding-agent` | `connectors/coding-agent/tool-loop.ts` |
| 20 | Jarvis | jarvis.institute (+ `topic:jarvis-ai`) | **Proprietary, closed source ⚠** | LEARN | `automation` | `connectors/automation/jarvis.ts` |

### Traps corrected during verification (do not re-introduce the belief)

- **Open WebUI is not BSD-3.** Clause 4 of its LICENSE forbids altering,
  removing or obscuring "Open WebUI" branding unless you have ≤ 50 end users in a
  rolling 30-day window, written permission, or an enterprise license. Treat as
  source-available: run unmodified, never white-label.
- **Directus is not MIT or MPL.** It is MSCL-1.0-GPL: internal use, non-commercial
  education/research and hosting-for-a-licensee are permitted; **Competing Use**
  (offering the software itself as a paid product) and license-key circumvention
  are forbidden.
- **NocoBase 3+ is not Apache-2.0.** LICENSE.txt is a bespoke agreement the vendor
  may amend unilaterally; commercial/Studio features need a paid license.
- **LiteLLM and Activepieces are open-core.** Only the `enterprise/` / `packages/ee/`
  subtrees are commercially licensed — they must never be vendored, and the
  adapters only speak to the OSS proxy/API.
- **amulchapla/AI-Powered-Call-Center-Intelligence is MIT but not "free".** Its
  architecture requires Azure OpenAI, Azure Speech and Power BI; therefore LEARN,
  not a hosted dependency.
- **10x-Tool-Calls has no license at all.** Absence of a license is *not*
  permissiveness — all rights reserved. Only the uncopyrightable method (loop
  follow-ups inside one tool-call budget) was independently re-implemented.
- **Jarvis is a proprietary Windows product**, not an open-source repo. The
  `topic:jarvis-ai` list is a topic, not a project; patterns only.

## 3. What each adapter actually does

### Gateways (`category: 'gateway'`)

| Adapter | Operations | Notes |
|---|---|---|
| `gateway.litellm` | `testConnection`, `litellmListModels`, `litellmChat` | OpenAI-compatible proxy: `/v1/models`, `/v1/chat/completions`; bearer auth. Complements — does not replace — `src/lib/ai-router/`. |
| `gateway.omniroute` | `testConnection`, `omnirouteListModels` | Self-hosted OmniRoute gateway over free/paid providers. |
| `gateway.free-claude-code` | `testConnection`, `freeClaudeCodeListModels` | **AGPL** — point at a separately hosted, unmodified FCC instance. Adapter never proxies credentials from AgentOS to a third-party "free token" pool without a provider-ToS review. |

### Chat UIs (`category: 'ai-chat'`)

`ai-chat.librechat` and `ai-chat.open-webui` expose `testConnection` + `listModels`.
They are integration targets for teams that already run those UIs; AgentOS's own
command center stays the primary surface. Both are `API_INTEGRATE` only.

### Coding agents (`category: 'coding-agent'`)

All three are **pattern** adapters (no subprocess, no remote service):

- `coding-agent.aider` — `aiderFormatHunks` / `aiderParseHunks` implement the
  SEARCH/REPLACE edit protocol (Apache-2.0, so REUSE).
- `coding-agent.swe-agent` — `sweValidateTrajectory` enforces monotonic step order
  and non-empty actions on an agent-computer-interface trajectory (MIT, REUSE).
- `coding-agent.tool-loop` — `toolLoopShouldContinue`, `DEFAULT_TOOL_LOOP_POLICY`
  (25 turns, stop on empty input) — clean-room, LEARN.

### Content & data

- `content.directus` — `directusListItems(ctx, collection, {limit})` (limit clamped
  to ≤ 100), `testConnection` via `/server/health`. API_INTEGRATE (fair-code).
- `content.grapesjs` — `grapesSanitizeTemplate` strips `<script>` from template
  exports before preview; `testConnection` checks the `grapes.min.js` asset host.
  REUSE (BSD-3).

### Automation & workflow

- `automation.activepieces` — `activepiecesListFlows`, `/v1/flows`.
- `automation.nocobase` — `nocobaseListCollections`, `/api/collections`.
- `automation.temporal` — health probe against the HTTP API
  `/api/v1/namespaces/{ns}/workflows`; namespace from `credential.extras.namespace`
  (default `default`). The in-process path stays `src/lib/job-queue.ts`.
- `automation.jarvis` — `jarvisRequiresApproval`, `jarvisAllowsCloud`
  (`strict` = local-only). Proprietary → LEARN.

### Deploy

- `deploy.caprover` — Captain API `POST /api/v2/user/apps` with `x-captain-api-key`.
- `deploy.dokku` — **no REST API**: `dokkuValidateSpec` validates app name +
  git URL. The adapter never shells out (`child_process` is not imported).

### Telephony / call center

- `telephony.ai-native-callcenter` — `testConnection` via `/healthz`; REST to a
  FreeSWITCH-backed instance (Apache-2.0).
- `telephony.call-gpt` — `callGptValidateCall` for Media-Streams function calls (MIT).
- `telephony.call-intelligence` — `callIntelValidate` for post-call summaries; the
  Azure reference architecture is not free, hence LEARN.

Existing `src/lib/voice/` (call service, dialer, campaigns, consent, ASR/TTS)
remains the single telephony runtime; these adapters feed it, they do not replace it.

### Media

- `media.infinite-talk` — health probe against a Gradio host
  (`gradio_api/call/generate`); treats < 500 (incl. 422 validation) as healthy.
  Complements `media.video` (Wan2.2), which stays the default video worker.

## 4. Security & governance properties (tested)

`__tests__/unit/free-systems-integrations.test.ts` (23 tests) asserts:

1. **All 20 adapters register** and ids are unique.
2. **No `AVOID` adapter is registered** — the registry stays fail-closed.
3. **License policy is executable**: every copyleft / source-available / custom /
   unlicensed adapter is asserted **not** to be `REUSE`.
4. **No credential, no egress** — `litellmListModels` without `apiKey` returns
   `ok: false` and `fetch` is never called.
5. **HTTP failures are structured** — a 401 surfaces as `{ ok: false, httpStatus: 401 }`.
6. **Egress goes through `guardedFetch`** — SSRF guard + no redirects + timeout,
   inherited from `types.ts`; no adapter calls `fetch` directly.

Every call is tenant-scoped (`ctx.companyId`) and returns an `audit` block for
`ToolRun`/`auditLog` persistence.

## 5. Deliberate non-actions

- **No vendoring.** Not one line of AGPL/GPL/fair-code/`enterprise`/`ee` code was
  copied into this repository.
- **No second runtime.** Adapters expose functions; they do not spawn servers,
  daemons, or subprocesses.
- **No schema change.** The catalog is derived from the in-process registry, so
  `prisma/schema.prisma` and `prisma/schema.mysql.prisma` are untouched.
- **No replacement of existing systems.** LiteLLM/OmniRoute sit *beside*
  `src/lib/ai-router/`; Temporal sits *beside* `src/lib/job-queue.ts`; call-center
  adapters sit *beside* `src/lib/voice/`.

## 6. Next steps (not done here)

1. Persist per-tenant integration credentials (encrypted) so the catalog can show
   `configured: true/false` — needs a new Prisma model in **both** schemas.
2. Admin UI page under the console that renders `GET /api/integrations/catalog`.
3. Provider-ToS review before enabling `gateway.free-claude-code` in any
   customer-facing deployment.
4. Pin upstream commit SHAs for every `API_INTEGRATE` target and record them in
   this table's "version pin" column.
