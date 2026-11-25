# Requested links: availability and integration audit — 2026-11-24

Checked 2026-11-24 via the GitHub repository API (`gh api repos/<owner>/<repo>`).
Availability is not an integration test. License identifiers are GitHub
detections, not legal conclusions; inspect all upstream files, model weights and
dependencies before use. Stars and last-push dates are upstream facts as of the
check date, not claims about this repository.

## Repository inventory

The table records upstream metadata, **not installation or functional
equivalence**. We searched tracked application code, `package.json` and compose
files for project names and inspected the link-coverage registry. A name match
alone is not proof of an integration; lack of an exact name match does not rule
out similar functionality. No upstream repositories were added, installed,
forked, or runtime-tested as part of this audit.

| Requested repository | GitHub result | Detected license | Language | Stars | Last push (UTC) |
| --- | --- | --- | --- | --- | --- |
| [anomalyco/browse](https://github.com/anomalyco/browse) | OK | MIT | TypeScript | 1,077 | 2026-11-24 |
| [honwee/mynah](https://github.com/honwee/mynah) | OK | Apache-2.0 | Go | 324 | 2026-10-24 |
| [vllm-project/vllm](https://github.com/vllm-project/vllm) | OK | Apache-2.0 | Python | 97,496 | 2026-11-24 |
| [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | OK | MIT | TypeScript | 4,029 | 2026-11-24 |
| [openai/whisper](https://github.com/openai/whisper) | OK | MIT | Python | 113,428 | 2026-08-31 |
| [jookies/jasmin](https://github.com/jookies/jasmin) | OK | NOASSERTION (see note) | Python | 1,220 | 2026-04-26 |
| [api-evangelist/telnyx](https://github.com/api-evangelist/telnyx) | OK | unspecified | — | 0 | 2026-11-21 |
| [MerlinStacks/VidSliderWP](https://github.com/MerlinStacks/VidSliderWP) | OK | GPL-2.0 | PHP | 0 | 2026-10-11 |
| [MerlinStacks/true-video-product-gallery](https://github.com/MerlinStacks/true-video-product-gallery) | OK | unspecified | PHP | 0 | 2026-10-28 |
| [MerlinStacks/socaliseit](https://github.com/MerlinStacks/socaliseit) | OK | MIT | TypeScript | 32 | 2026-11-18 |
| [gravitational/teleport](https://github.com/gravitational/teleport) | OK | AGPL-3.0 | Go | 21,139 | 2026-11-17 |
| [jixserver/free-for-dev](https://github.com/jixserver/free-for-dev) | OK | unspecified | — | 5,702 | 2024-08-15 |
| [anomalyco/phonecall](https://github.com/anomalyco/phonecall) | OK | MIT | TypeScript | 12 | 2026-11-14 |
| [anomalyco/nightmail](https://github.com/anomalyco/nightmail) | OK | MIT | TypeScript | 48 | 2026-11-24 |
| [Link2theWorld/phonecall-mint](https://github.com/Link2theWorld/phonecall-mint) | OK | MIT | JavaScript | 4 | 2026-11-23 |
| [cheaper-inference/OmniRoute](https://github.com/cheaper-inference/OmniRoute) | OK | MIT | TypeScript | 90,121 | 2026-11-24 |

All sixteen requested repositories resolved as public and non-archived.

### Input quirks, duplicates and notes

- `openai/openai-agents-js` was requested twice (once inside the concatenated
  string `…openai-agents-js.githttps://github.com/vllm-project`). The
  concatenation was interpreted as two links: the agents-js repository and the
  `vllm-project` organisation page. Nothing was silently substituted.
- `jookies/jasmin`: GitHub reports `NOASSERTION`, but the repository's `LICENSE`
  file begins with the Apache License 2.0 grant ("Copyright 2014-2016 Jookies
  LTD"). Treat as Apache-2.0 text pending review, not as a GitHub-verified
  Apache-2.0 identifier.
- `api-evangelist/telnyx` is an independent third-party **profile of the Telnyx
  API surface** (documentation/OpenAPI-style content by API Evangelist). It is
  not Telnyx's platform, SDK, or service, and carries no detected license.
- `MerlinStacks/VidSliderWP` ("Reel It") and
  `MerlinStacks/true-video-product-gallery` are **WordPress/WooCommerce PHP
  plugins**. This repository is a Next.js application with no WordPress
  runtime; they cannot be installed here as-is. The gallery plugin has no
  detected license — clarify terms before any code reuse.
- `jixserver/free-for-dev` carries the free-for.dev list description, is **not
  flagged as a fork** by GitHub, has no detected license, and was last pushed
  2024-08-15 — its content is older than the live list.
- `cheaper-inference/OmniRoute`: default branch is a release branch
  (`release/v3.8.55`) and the repository is ~3.9 GB. Pin a commit and review
  before any import; do not clone blindly into this tree.
- `anomalyco/browse`, `anomalyco/phonecall` and `anomalyco/nightmail` are from
  the same organisation as `anomalyco/opencode`, whose instruction documents
  are already quarantined in `src/lib/agent-skills/`. No documents or code from
  browse/phonecall/nightmail were imported in this round.

## Other supplied links

| Link | Handling |
| --- | --- |
| `https://github.com/vllm-project` | Organisation page (from the concatenated input). Registered as an organisation row; the engine repo has its own row. |
| `https://github.com/orgs/nuxt/repositories` | Nuxt organisation repository listing. Registered as sent. This app is Next.js 16 / React 19; Nuxt is a different (Vue) framework runtime. |
| `https://scripts.nuxt.com/scripts` | `@nuxt/scripts` documentation site. **Not fetched**: the sandbox permits outbound access to GitHub and package registries only. Targets Nuxt, not Next.js. |
| `https://free-for.dev/#/` | The free-for.dev catalogue (client-side routed site). **Not fetched** for the same egress reason. A curated subset already exists locally (below). |

## Existing local evidence (not feature parity)

- **AI routing / vLLM / OmniRoute**: `src/lib/ai-router/openai-compatible-provider.ts`
  explicitly targets OpenAI-compatible gateways including vLLM;
  `src/lib/ai-router/provider-registry.ts` names a local Ollama/vLLM gateway;
  `src/lib/ai-router/index.ts`, `free-models.ts`, `model-tiers.ts` and
  `src/lib/ai-provider-catalog.ts` implement multi-provider routing with
  fallback. The bundled `docker-compose.inference.yml` runs **Ollama**, not
  vLLM. No OmniRoute deployment exists. Live provider execution remains
  NOT VERIFIED (`ALO_LABS_AI_ECOSYSTEM_MATRIX.md`).
- **Agent framework**: `src/lib/agent-runtime/tool-loop.ts`, `src/app/api/runs/route.ts`
  and `src/lib/voice/orchestrator.ts` provide an agent loop, runs API and voice
  orchestration. `@openai/agents` is not a dependency in `package.json`.
- **Speech / Whisper**: `src/lib/voice/speech-adapters/http-engine.ts` implements
  an OpenAI-compatible ASR/TTS engine using whisper model names (documented to
  work with local Whisper servers); `src/lib/media-generation/transcribe.ts`
  is a transcription client. The upstream Python package and weights are not
  vendored; no Whisper server is bundled; live transcription unverified.
- **Telephony / phonecall / Telnyx**: `src/lib/voice/telephony/adapter.ts`,
  `registry.ts` and `sandbox-adapter.ts` implement a replaceable telephony
  interface whose default adapter is explicitly **simulated**; unconfigured
  real providers fail honestly (`NotConnectedAdapter`). See
  `docs/TELEPHONY_ARCHITECTURE.md`. No Twilio, Telnyx, Grok Voice or carrier
  integration is deployed.
- **SMS / Jasmin**: `src/app/api/sms/route.ts` stores pending records;
  `src/lib/sms/httpsms-client.ts` is a tested httpSMS send adapter not yet wired
  to the route. No SMPP gateway exists.
- **Email / Nightmail**: `src/lib/email/smtp.ts` (nodemailer), `imap.ts`
  (raw-socket IMAP reader), templates and tracking, with routes under
  `src/app/api/email/`. Live delivery against real accounts is
  configuration-dependent and unverified here.
- **Browser control / browse**: `src/lib/command-agent/tools.ts` provides
  fetch-based `web_search`, `wikipedia_summary` and `get_weather` tools — not
  real-browser control. An MCP server registry exists
  (`src/app/api/mcp-servers/route.ts`); no browse MCP server is connected.
- **Digital human / Mynah**: `src/app/api/avatar-voice/generate-avatar/route.ts`
  (consent-gated) and `src/components/pages/human-avatar-voice.tsx` exist;
  generation delegates to the media-generation service and requires a
  configured provider. No realtime digital-human engine exists.
- **Social / socaliseit**: `src/lib/social/index.ts` and per-network providers,
  `src/app/api/social/publish/route.ts`, `analytics/route.ts`, and
  `src/app/api/video-studio/generate/route.ts` provide publishing, analytics
  and video generation. No Remotion multi-track timeline editor and no
  Shopify/WooCommerce sync exist here (grep finds no source hits).
- **Call UI / phonecall-mint**: `src/components/voice/voice-calls.tsx` and
  `src/lib/voice/call-service.ts` are an operations console for calls, not a
  consumer slide-to-answer screen; the upstream component targets SillyTavern.
- **free-for.dev**: `src/lib/free-resources.ts` + `src/app/api/free-resources/route.ts`
  serve a curated subset of the catalogue, exercised by
  `__tests__/unit/lib/free-resources.test.ts`. Allowances are explicitly marked
  unverified with vendor verify URLs.
- **Teleport**: application auth/RBAC (`src/lib/auth.ts`, `SECURITY.md`) secures
  this app's API surface, not SSH/Kubernetes access. No infrastructure access
  proxy is deployed by this repository.
- `git submodule status` produced no entries. No upstream service was started
  or tested; feature completeness, security, self-hosting and compatibility
  remain unverified.

## What this change did

- Added 20 rows to `src/lib/link-coverage/registry.ts` (16 repositories, 2
  organisation links, 2 sites), each with an honest verdict, on-disk evidence
  paths and a `2026-11-24` check date. Verdicts: 7 `in_kind`, 5 `gap`,
  4 `not_applicable`, 4 `reference` — none claims an upstream installation.
- Extended `__tests__/lib/link-coverage.test.ts` `EXPECTED_LINKS` with the same
  20 normalised links so the coverage test enforces them.
- No repository was installed, forked, vendored or added as a submodule; no
  dependency, schema, route or compose change was made.

## Verification (real output, 2026-11-24)

- `npx tsx scripts/verify-link-coverage.ts` → `mode: live`,
  `links: 73 (52 repos, 21 sites)`, `evidence: 232/232 found, 0 missing`,
  exit 0. Verdict totals: implemented=1, in_kind=27, reference=10, gap=21,
  not_applicable=14.
- `npx vitest run __tests__/lib/link-coverage.test.ts
  __tests__/unit/lib/free-resources.test.ts
  __tests__/api/super-admin-link-coverage.test.ts
  __tests__/components/panels/link-coverage-panel.test.tsx` → 4 files,
  39 tests passed.
- `PRISMA_SQLITE_ADAPTER=1 SKIP_PAID_SERVICES=true npx vitest run` →
  **208 files passed, 1 skipped; 2287 tests passed, 15 skipped (2302), 0 failed.**
- `npm run typecheck` and `npm run typecheck:tests` → 0 errors.
- `npm run lint` → clean, exit 0.

Environment notes: dependencies installed with `npm ci --ignore-scripts`
(nodejs.org header downloads are blocked by sandbox egress); the
`better-sqlite3` binding was then rebuilt from local headers
(`npx node-gyp rebuild --release --nodedir=/usr/local`, per AGENTS.md) and the
Prisma client generated via `scripts/dev-generate-client.sh`. These are
sandbox build steps, not repository changes.

## Remaining work and decisions

1. Select a first integration and its acceptance tests. The list spans an
   inference engine (vLLM), an agent SDK, speech models, an SMS gateway, a
   telephony API profile, WordPress plugins, an email client, a social
   platform, an access proxy and an AI gateway; importing all of them does not
   implement or safely integrate their functionality.
2. Highest-leverage candidates given existing adapters: a vLLM serving option
   for the OpenAI-compatible provider (GPU host required), a Whisper-compatible
   ASR server for the speech engine, a real telephony adapter (Telnyx/Twilio or
   Asterisk/FreeSWITCH per `docs/TELEPHONY_ARCHITECTURE.md`), and wiring the SMS
   route to a configured gateway (Jasmin or httpSMS).
3. Review licenses before importing anything: AGPL-3.0 (Teleport), GPL-2.0
   (VidSliderWP), NOASSERTION/Apache-2.0 text (Jasmin), and the three
   no-detected-license repositories require explicit terms review. Model
   weights (Whisper) have their own license separate from the code.
4. WordPress plugins and Nuxt packages target runtimes this app does not have;
   treat them as design references only unless a separate WordPress/Vue
   project is deliberately created.
5. Implement and test each selected adapter with authentication, tenant
   isolation, operational controls, deployment instructions and real
   end-to-end verification. Do not represent references or stubs as functioning
   integrations.
