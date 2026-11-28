# CHANGELOG

## [2.0.0-groq] - 2026-08-18
### Added
- **Groq Provider** — First-class Groq LPU inference integration with 7 models
- **AI Gateway** — Unified AI API with validation, cost tracking, structured errors
  - POST /api/ai/chat — Non-streaming chat
  - POST /api/ai/stream — Streaming SSE chat
  - POST /api/ai/route — Dry-run routing decision
  - POST /api/ai/batch — Sequential batch execution
  - POST /api/ai/parallel — Parallel execution with aggregation
  - GET /api/ai/models — List all models
  - GET /api/ai/providers — Provider health status
- **100-Department Registry** — Full 12-group, 100-department architecture
  - Executive & Strategy (5), Finance (5), HR (5), Sales (5), Marketing (10)
  - ALO Education (10), Technology (10), Data & AI (10), Operations (10)
  - Customer & Communications (10), Research & Expansion (10), Product & Platform (10)
- **Model Routing Policy Engine** — 7 configurable routing policies
- **Multi-Agent Orchestrator** — 8 orchestration patterns
  - Sequential, Parallel, Conditional, Delegation, Aggregation, Voting, Consensus, Review
- **Agent Factory** — Dynamic agent creation with expiration and cloning
- **Production Documentation** — Full manifests, integrity reports, deployment guides

### Changed
- AIProvider type extended with 'groq' (additive, non-breaking)
- .env.example updated with GROQ_* variables

### Removed
- Nothing. Zero deletions.

## [Unreleased] — 2026-11-28 self-hosted free stack
### Added
- **docker-compose.selfhost-free-stack.yml** — 7 opt-in profiles / 14 services
  (LiteLLM ai-gateway, LibreChat chat-ui, Open WebUI, Activepieces automation,
  Temporal workflows, Directus cms, NocoBase nocode). Loopback-bound,
  fail-closed `${VAR:?}` secrets, memory ceilings, healthchecks. Nothing
  starts without an explicit `--profile`; default compose behaviour unchanged.
  Zero paid services: all images free to self-host, models resolve to local
  Ollama only.
- **deploy/litellm/config.yaml** — local-models-only LiteLLM gateway config
  (4 Ollama aliases mapped to the ai-router tier map).
- **deploy/librechat/librechat.yaml** — LibreChat wired to the LiteLLM
  gateway; no paid provider keys.
- **docs/SELFHOST_FREE_STACK_2026-11-28.md** — enablement guide: quick start,
  ports/licenses/RAM table, Ollama wiring, integration points, phase-2
  candidates, exclusion list.
- **REQUESTED_LINKS_AUDIT_2026-11-28.md** — per-link audit of 25 repositories
  + 3 sites: license verdicts from upstream LICENSE files, free-vs-paid
  disposition, prohibited items (no-license repo, AGPL reference-only,
  paid-runtime reference-only).

### Notes
- Definitions are syntax-validated only; no service deployed or
  runtime-tested (DoD honesty rules).
- MirrorFly self-hosted chat, jarvis.institute, outstand.so verified NOT free;
  excluded. perrypixel/10x-Tool-Calls has no license; prohibited.

### Round 2 — 2026-11-28 (second requested-links batch)
- **Audit round 2**: sahilatahar/Code-Sync (MIT — free self-host confirmed,
  Express+Socket.io, no paid deps), postmill-ai/postmill-app (AGPL — free
  self-hosted outstand.so alternative, reference-only per policy), MeiGen-AI
  org (18 repos: MultiTalk/OPSD-V Apache-2.0 research references; 7 no-license
  repos prohibited; X-Cut AGPL), MirrorFly org (26 repos — confirmed NOT free:
  unlicensed samples for a commercial SDK), jarvis.institute compare page
  (confirms $9.99 proprietary).
- Updated `REQUESTED_LINKS_AUDIT_2026-11-28.md` and
  `docs/SELFHOST_FREE_STACK_2026-11-28.md` with round-2 verdicts and the
  Code-Sync enablement path. No new compose services: no round-2 repo ships a
  publishable free image that fits the zero-paid profiles.

### Round 3 — 2026-11-28 (free equivalents BUILT for not-free services)
- **`docker-compose.selfhost-free-stack.yml`** grows from 10 to 24 services
  with three new opt-in profiles, replacing every requested service that
  failed the free-self-host test:
  - `chat-calls` — Rocket.Chat (MIT core, upstream LICENSE verified) +
    MongoDB replica set: free MirrorFly chat equivalent.
  - `video-calls` — Jitsi Meet (Apache-2.0, official docker-jitsi-meet
    pattern: web/prosody/jicofo/jvb): free MirrorFly audio/video equivalent;
    embeds into Rocket.Chat via its Jitsi integration.
  - `social` — Postmill (AGPL-3.0, published image, unmodified separate
    service, Stripe keys empty): free outstand.so equivalent.
- jarvis.institute maps to the already-integrated `openwebui` / `chat-ui`
  profiles (local-model assistant); documented, nothing proprietary added.
- All new services follow the established fail-closed pattern: `${VAR:?}`
  secrets, loopback-only ports, healthchecks, memory ceilings; RAM budget
  rows added to the header (each new profile ~1.5 GB).
- Docs: audit doc gains a Round-3 license-evidence table (Rocket.Chat MIT
  verified from the upstream LICENSE text; Jitsi Apache-2.0; Postmill AGPL);
  integration guide gains enablement commands + Rocket.Chat↔Jitsi wiring.
