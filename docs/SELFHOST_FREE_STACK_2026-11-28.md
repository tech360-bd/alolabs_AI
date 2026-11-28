# Self-Hosted Free Stack — Integration Guide (2026-11-28)

Practical enablement guide for the seven opt-in service profiles added in
`docker-compose.selfhost-free-stack.yml`. Every system here is free to
self-host, boots without any paid API key, and was license-checked against its
upstream LICENSE file on 2026-11-28 (see
`REQUESTED_LINKS_AUDIT_2026-11-28.md` for the per-link evidence).

## Quick start

```bash
# 1. Add the required secrets to .env next to the compose file (all fail-closed)
cat >> .env <<'EOF'
LITELLM_MASTER_KEY=sk-local-change-me
CREDS_IV=<32-hex>
CREDS_KEY=<32-hex>
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
AP_API_KEY=<random>
AP_ENCRYPTION_KEY=<16+ chars>
AP_JWT_SECRET=<random>
AP_POSTGRES_PASSWORD=<random>
TEMPORAL_POSTGRES_PASSWORD=<random>
DIRECTUS_SECRET=<32+ chars>
DIRECTUS_ADMIN_EMAIL=admin@example.com
DIRECTUS_ADMIN_PASSWORD=<random>
NOCOBASE_ADMIN_EMAIL=admin@example.com
NOCOBASE_ADMIN_PASSWORD=<random>
NOCOBASE_DB_PASSWORD=<random>
DIRECTUS_DB_PASSWORD=<random>
EOF

# 2. Start ONE profile (example: the AI gateway)
docker compose -f docker-compose.selfhost-free-stack.yml --profile ai-gateway up -d
```

## Profiles, ports, licenses

| Profile | Service(s) | UI / API (loopback) | License | RAM ceiling |
| --- | --- | --- | --- | --- |
| `ai-gateway` | LiteLLM | `127.0.0.1:4000` | MIT | 512 MB |
| `chat-ui` | LibreChat + MongoDB | `127.0.0.1:3080` | MIT | 1.0 GB |
| `openwebui` | Open WebUI | `127.0.0.1:3081` | BSD-3 + branding clause [CONDITIONAL] | 1.0 GB |
| `automation` | Activepieces + PostgreSQL + Redis | `127.0.0.1:3082` | MIT core | 1.6 GB |
| `workflows` | Temporal + PostgreSQL + UI | `127.0.0.1:3083` (UI), `7233` (gRPC) | MIT | 1.3 GB |
| `cms` | Directus + PostgreSQL | `127.0.0.1:3084` | MSCL-1.0-GPL [CONDITIONAL] | 1.0 GB |
| `nocode` | NocoBase + PostgreSQL | `127.0.0.1:3085` | custom agreement [CONDITIONAL — legal review] | 1.3 GB |

Nothing starts without an explicit `--profile` flag; the platform's default
`docker compose up` behaviour is unchanged.

## Wiring the local model runtime

LiteLLM, LibreChat and Open WebUI all resolve models against the local
Ollama runtime started by `docker-compose.inference.yml`:

```bash
# Reach Ollama from the free-stack network:
docker network connect alolabs-inference_alolabs-net alolabs-litellm
# then in .env: OLLAMA_API_BASE=http://ollama:11434
```

`deploy/litellm/config.yaml` exposes four local aliases (`local-general`,
`local-coder`, `local-voice`, `local-embedding`) that map onto the tier map in
`src/lib/ai-router/model-tiers.ts`. Keep the two in sync. No commercial
provider belongs in that config while `SKIP_PAID_SERVICES=true` is policy.

## Integration points in ALOLAS_AI

- **LiteLLM (`ai-gateway`)** — secondary gateway in front of Ollama with cost
  tracking and rate budgets. The app keeps using `LOCAL_INFERENCE_URL`; point
  it at `http://127.0.0.1:4000/v1` only after a staged cutover review.
- **LibreChat / Open WebUI (`chat-ui`, `openwebui`)** — operator-facing
  evaluation UIs for the same local models; they do not touch app data or the
  API gateway, so they carry no integration risk.
- **Activepieces (`automation`)** — second automation engine next to n8n; its
  ~400 MCP integrations complement n8n's workflow library. Route it through
  the same loopback-only policy; do not expose its port publicly.
- **Temporal (`workflows`)** — durable execution engine; the natural home for
  long-running agent runs if the in-process worker
  (`src/instrumentation.node.ts`) ever outgrows the single-node model.
  Evaluate, do not migrate, until a design review happens.
- **Directus (`cms`)** — headless CMS over an existing database; candidate for
  content/publishing surfaces. MSCL sustainable-use limits apply.
- **NocoBase (`nocode`)** — no-code business-system builder for internal
  departments. Legal review of the upstream agreement is required **before
  the first start**, not after.
- **GrapesJS (not a service)** — BSD-3 page-builder framework; the natural
  fit is `npm i grapesjs` inside the portal front-end when a visual template
  editor is requested. Not installed in this round (no consumer UI exists yet
  for it); adding a dependency without a consumer would be dead weight.
- **Aider / SWE-agent / mini-swe-agent** — MIT/Apache engineering CLIs for
  contributors; run them on workstations, not in production compose.
- **CapRover / Dokku** — free self-hosted PaaS options for the deployment
  host as an alternative to bare Compose + Caddy. Host-level install, out of
  scope for this file.

## Phase-2 candidates (documented, not deployed)

- **rasonyang voice stack** (`ai-native-callcenter`, `freesbc`,
  `cascade-realtime-gateway`, `web-sip-phone`, `mlx-realtime`, all
  Apache-2.0): the license-cleanest self-hosted AI-telephony pipeline found
  in any audit round. Recommended as the reference architecture for the ALO
  Voice Contact Center once telephony capacity (SBC + SIP trunk) is planned.
- **NYLLON-SOFTWARE/SignuDoc** (MIT): document e-signature platform; compose
  candidate when document signing enters scope.
- **MeiGen-AI/InfiniteTalk** (Apache-2.0): talking-avatar generation; needs a
  dedicated GPU, which the shared 16 GB host does not have.

## Excluded — not free (recorded to prevent repeat requests)

| Link | Why excluded |
| --- | --- |
| MirrorFly self-hosted chat | Commercial white-label SDK, quote-based pricing; no free self-host tier |
| jarvis.institute | Proprietary $9.99 Windows app |
| outstand.so | Paid SaaS ($19–$129/mo), not self-hostable |
| perrypixel/10x-Tool-Calls | No LICENSE file — nothing may be copied |
| twilio-labs/call-gpt, amulchapla/...Call-Center-Intelligence | MIT code, but runtime depends on paid Twilio/Azure services — violates the zero-paid policy |
| Alishahryar1/free-claude-code | AGPL — reference only per policy |

## Verification status (DoD honesty)

- Compose YAML: syntax-validated (parse check) and written against the
  fail-closed secrets pattern used by `docker-compose.inference.yml`.
- Runtime: **not deployed, not tested**. No claim is made that any service
  here currently runs. Enable one profile at a time; verify each service's
  health endpoint before wiring app traffic.
- License verdicts: text readings of upstream LICENSE files on 2026-11-28,
  not legal advice. Re-verify before commercial use.


## Round-2 additions (2026-11-28, same-day second batch)

### Code-Sync — free, integrate-ready (MIT)

`sahilatahar/Code-Sync` is a real-time collaborative code editor (rooms,
syntax highlighting, group chat, file save/download). Verified: Express +
Socket.io + React + CodeMirror; **no paid service, no Firebase, no API keys**;
ships its own docker-compose. No published image exists, so it is not added
to `docker-compose.selfhost-free-stack.yml` (we do not vendor third-party
source). Enablement path when needed:

```bash
git clone https://github.com/sahilatahar/Code-Sync.git /opt/code-sync
cd /opt/code-sync
# edit its compose to bind loopback only (127.0.0.1:3000:3000, 127.0.0.1:5173:5173)
docker compose up -d --build
```

Phase-2 candidate; its only real gap for platform use is that it is a
standalone dev tool, not wired into the API gateway.

### postmill — the free self-hosted answer to outstand.so (AGPL-3.0)

`postmill-ai/postmill-app` is an open-source social-media management platform
(45+ channels, AI-powered creative suite, publish/schedule/engage). It does
what the paid outstand.so SaaS does, self-hosted. Policy: AGPL = reference
only — its code must not be embedded here, but running the unmodified
upstream as a separate service is lawful; it ships a Dockerfile and compose.

### MeiGen-AI org — voice/avatar research shelf (Apache-2.0 unless noted)

`MultiTalk` (multi-person conversational video, NeurIPS 2025) joins
`InfiniteTalk` as the Apache-2.0 avatar-generation references for the ALO
Voice Contact Center design. All need dedicated GPU capacity this host does
not have. Repos with **no license** (PosterOmni, Infinite-World, llia,
PosterReward, LiveVAE, LongCat-Video-Avatar) are prohibited from copying;
`X-Cut` is AGPL (reference only); `PosterCraft` has unclear license text —
clarify upstream before any use.

### MirrorFly org — verdict confirmed at org level

All 26 `orgs/MirrorFly` repositories are sample apps and SDK wrappers for the
commercial MirrorFly platform. 22 carry **no license**, and the few MIT
wrappers require MirrorFly license keys to do anything. Together with the
quote-only pricing on mirrorfly.com, the verdict is final: **MirrorFly is not
a free self-hosted system.** The free in-stack equivalents remain LibreChat +
Open WebUI (`chat-ui` / `openwebui` profiles) for chat, and the rasonyang
Apache-2.0 voice stack for calling.

## Round 3 (2026-11-28): free equivalents BUILT into the compose stack

Per the operator instruction, every not-free requested service is now replaced
by a free self-hosted equivalent **added as an opt-in compose profile**:

| Not-free service | Free equivalent | Profile | Port (loopback) |
| --- | --- | --- | --- |
| MirrorFly chat SDK (commercial) | Rocket.Chat, MIT core (`apps/meteor/ee/` excluded from the published image) | `chat-calls` | 3020 |
| MirrorFly audio/video calls (commercial) | Jitsi Meet, Apache-2.0 (web + prosody + jicofo + jvb) | `video-calls` | 8100 (web), 10000/udp (media) |
| outstand.so ($19–$129/mo) | Postmill, AGPL-3.0 — published image, unmodified, billing off | `social` | 4007 |
| jarvis.institute ($9.99 proprietary) | already covered by `openwebui` / `chat-ui` (local-model assistant) | existing | 3085 / 3080 |

### Enabling the new profiles

```bash
# 1. Append the fail-closed secrets to .env
cat >> .env <<'EOF'
# chat-calls (Rocket.Chat)
ROCKETCHAT_ROOT_URL=http://127.0.0.1:3020
ROCKETCHAT_ADMIN_USERNAME=admin
ROCKETCHAT_ADMIN_EMAIL=admin@example.com
ROCKETCHAT_ADMIN_PASS=change-me-now

# video-calls (Jitsi Meet)
JITSI_PUBLIC_URL=http://127.0.0.1:8100
JITSI_JICOFO_COMPONENT_SECRET=$(openssl rand -hex 16)
JITSI_JICOFO_AUTH_PASSWORD=$(openssl rand -hex 16)
JITSI_JVB_AUTH_PASSWORD=$(openssl rand -hex 16)

# social (Postmill)
POSTMILL_MAIN_URL=http://127.0.0.1:4007
POSTMILL_JWT_SECRET=$(openssl rand -hex 24)
POSTMILL_DB_PASSWORD=$(openssl rand -hex 16)
POSTMILL_DISABLE_REGISTRATION=true
EOF

# 2. Enable one profile at a time (respect the RAM budget table)
docker compose -f docker-compose.selfhost-free-stack.yml --profile chat-calls up -d
docker compose -f docker-compose.selfhost-free-stack.yml --profile video-calls up -d
docker compose -f docker-compose.selfhost-free-stack.yml --profile social up -d

# 3. Verify health before wiring traffic
curl http://127.0.0.1:3020/api/info        # Rocket.Chat
curl -I http://127.0.0.1:8100              # Jitsi web
curl -I http://127.0.0.1:4007/             # Postmill
```

### Wiring chat to calls (free MirrorFly-style feature parity)

In Rocket.Chat's admin panel set **Settings → Video Conference → Jitsi** and
enable the app integration with the `JITSI_PUBLIC_URL` above; chat rooms then
gain one-click embedded voice/video calls with no third-party SDK or key.

### Postmill legal note

Postmill is AGPL-3.0 and is run here as an **unmodified separate service from
the published upstream image** — no source is embedded in this repository.
AGPL obligations attach to modifications of Postmill itself: run it as-is and
you owe nothing extra; fork or modify it and the modified source must be
offered to its users. Channel credentials and AI keys are configured in-app
per organization, so booting it requires zero paid services.
