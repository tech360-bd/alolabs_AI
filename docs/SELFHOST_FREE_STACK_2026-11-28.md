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
