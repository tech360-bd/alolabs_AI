# Requested links: availability and integration audit — 2026-11-28

Checked 2026-11-28 via the GitHub repository API and direct fetches of each
upstream `LICENSE` file for repositories GitHub could not classify
(`NOASSERTION`). Availability is not an integration test. License identifiers
marked "(sniffed)" come from reading the upstream LICENSE text, not from
GitHub's detection and not from legal counsel — inspect before commercial use.
Stars and last-push dates are upstream facts as of the check date. No upstream
code was copied into this repository in this round; the only additions are
Compose service definitions that reference upstream **published images**
(no source redistribution) plus documentation.

## Answer to the headline question

**Are these free with self-hosting?** — Split verdict, recorded per link below:

- **Free self-host (compose-integrated this round):** LibreChat, LiteLLM,
  Aider, SWE-agent, Activepieces (MIT core), Temporal, GrapesJS, Dokku,
  CapRover (Apache-2.0), plus the rasonyang voice-stack repositories.
- **Free self-host with license conditions (integrated, flagged CONDITIONAL):**
  Open WebUI (branding clause), Directus (MSCL-1.0-GPL source-available),
  NocoBase (custom agreement — legal review before first run).
- **NOT free:** **MirrorFly self-hosted chat is a commercial, contact-sales
  license** (the page advertises full source access and white-label, but
  pricing is quote-only; there is no free self-hosted tier). jarvis.institute
  is a proprietary $9.99 Windows application. outstand.so is a paid SaaS
  ($19–$129/month). All three are excluded.
- **Prohibited:** perrypixel/10x-Tool-Calls carries **no license** — its code
  (even the rules text) must not be copied.

## Repository inventory

| Requested repository | GitHub result | Detected license | Language | Stars | Disposition |
| --- | --- | --- | --- | --- | --- |
| [LibreChat-AI/LibreChat](https://github.com/LibreChat-AI/LibreChat) | OK | MIT | TypeScript | 47,586 | Compose profile `chat-ui` |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | OK | MIT (sniffed; enterprise dir separate) | Python | 64,028 | Compose profile `ai-gateway` |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | OK | Open WebUI License (BSD-3 base + branding clause) | Svelte | 159,689 | Compose profile `openwebui` [CONDITIONAL] |
| [Aider-AI/aider](https://github.com/Aider-AI/aider) | OK | Apache-2.0 | Python | 50,288 | Engineering tool (documented) |
| [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent) | OK | MIT | Python | 20,883 | Engineering tool (documented) |
| [directus/directus](https://github.com/directus/directus) | OK | MSCL-1.0-GPL (sniffed, source-available) | TypeScript | 38,715 | Compose profile `cms` [CONDITIONAL] |
| [activepieces/activepieces](https://github.com/activepieces/activepieces) | OK | MIT core (sniffed; `ee/` dirs excluded) | TypeScript | 25,756 | Compose profile `automation` |
| [nocobase/nocobase](https://github.com/nocobase/nocobase) | OK | Custom NocoBase agreement (sniffed) | TypeScript | 25,035 | Compose profile `nocode` [CONDITIONAL, legal review first] |
| [GrapesJS/grapesjs](https://github.com/GrapesJS/grapesjs) | OK | BSD-3-Clause (sniffed) | TypeScript | 26,437 | Frontend library candidate (npm), documented |
| [temporalio/temporal](https://github.com/temporalio/temporal) | OK | MIT | Go | 24,637 | Compose profile `workflows` |
| [caprover/caprover](https://github.com/caprover/caprover) | OK | Apache-2.0 (sniffed) | TypeScript | 15,210 | Deploy-target candidate (host-installed PaaS), documented |
| [dokku/dokku](https://github.com/dokku/dokku) | OK | MIT | Shell | 32,241 | Deploy-target candidate (host-installed PaaS), documented |
| [amulchapla/AI-Powered-Call-Center-Intelligence](https://github.com/amulchapla/AI-Powered-Call-Center-Intelligence) | OK | MIT | JavaScript | 268 | Reference only — runtime depends on paid Azure AI |
| [twilio-labs/call-gpt](https://github.com/twilio-labs/call-gpt) | OK | MIT | JavaScript | 497 | Reference only — runtime depends on paid Twilio Media Streams |
| [perrypixel/10x-Tool-Calls](https://github.com/perrypixel/10x-Tool-Calls) | OK | **none** | Python | 852 | **Prohibited** — no license, nothing may be copied |
| [rasonyang/ai-native-callcenter](https://github.com/rasonyang/ai-native-callcenter) | OK | Apache-2.0 | Go | 842 | Voice-stack candidate (phase 2), documented |
| [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | OK | Apache-2.0 | Python | 8,488 | Research reference — heavy GPU + model weights required |
| [cheaper-inference/OmniCopilot](https://github.com/cheaper-inference/OmniCopilot) | OK | MIT | TypeScript | 209 | Reference — sibling of OmniRoute already audited 2026-11-24 |
| [Alishahryar1/free-claude-code](https://github.com/Alishahryar1/free-claude-code) | OK | AGPL-3.0 (sniffed) | Python | 73,510 | Reference only — AGPL per policy, no embedding |
| [meta/astryx](https://github.com/meta/astryx) | OK | MIT | TypeScript | 33,504 | Frontend design-system candidate, documented |
| [DistinctZA/patina](https://github.com/DistinctZA/patina) | OK | MIT | Svelte | 8 | Record only — macOS Finder alternative, out of scope |
| [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot) | OK | Apache-2.0 | TypeScript | 28,507 | Reference — sandboxed bot VM pattern |
| [Immortal-Protocols/lastbook](https://github.com/Immortal-Protocols/lastbook) | OK | MIT | Python | 3,099 | Reference — offline knowledge bundle pattern |
| [NYLLON-SOFTWARE/SignuDoc](https://github.com/NYLLON-SOFTWARE/SignuDoc) | OK | MIT | TypeScript | 3,393 | Phase-2 compose candidate (e-signature platform) |
| [monid-ai/monid](https://github.com/monid-ai/monid) | OK | MIT | TypeScript | 5,691 | Reference — agent-tool routing pattern |

All twenty-five requested repositories resolved as public and non-archived.

## Non-GitHub sites

| Link | Verdict | Evidence |
| --- | --- | --- |
| `https://www.mirrorfly.com/self-hosted-chat-solution.php` | **NOT free** — commercial white-label SDK; self-hosting is quote-based ("contact sales"). No free self-hosted tier is offered on the page. | Page fetched 2026-11-28: feature list + demo/contact-sales CTAs only, no pricing. |
| `https://jarvis.institute` | **NOT free/open source** — proprietary Windows desktop assistant, $9.99 one-time. AI model access can be free (Ollama/llama.cpp local), but the app itself is paid and closed. | Site fetched 2026-11-28. |
| `https://www.outstand.so` | **NOT free** — paid social-posting SaaS API, $19/mo (pay-as-you-go) or $129/mo (business). Not self-hostable. | Site fetched 2026-11-28. |
| `https://github.com/search?q=ai+call&type=repositories` | Search page, not a repository. Covered by the concrete ai-call repositories listed above (rasonyang stack is the strongest free self-host match). | — |

## Organisation / user listings

The requested `orgs/<name>/repositories` pages resolve as follows (top repos
kept in `oss-audit-data/new-links-2026-11-28.json`, full listings paginated at
up to 100 per org):

- **BerriAI** (82 repos): core `litellm` integrated; `moyai`, `liteLLM-proxy`,
  `agentchat`, `litellm-skills` are MIT siblings, tracked for later.
- **open-webui** (26 repos): `mcpo`, `open-terminal`, `pipelines`,
  `openapi-servers` are MIT and composable with the `openwebui` profile;
  `desktop` is AGPL-3.0 (reference only).
- **Aider-AI** (7 repos): all Apache-2.0 except `polyglot-benchmark`
  (no license — do not copy its content).
- **SWE-agent** (10 repos): `SWE-agent`, `mini-swe-agent`, `SWE-ReX` are MIT.
- **directus** (28 repos): core MSCL; `mcp`, `rstore` are MIT.
- **nocobase** (37 repos): core custom agreement; `docs` is MIT.
- **temporalio** (100 repos): core + all SDKs (python/go/typescript) MIT.
- **LibreChat-AI** (14 repos): `rag-api` (MIT) is the RAG companion for the
  `chat-ui` profile; `admin-panel` is AGPL-3.0 (reference only).
- **rasonyang** (user, 55 repos): `ai-native-callcenter`, `freesbc` (pure-Go
  SBC keeping FreeSWITCH/Asterisk off the public internet),
  `cascade-realtime-gateway` (OpenAI Realtime-protocol voice gateway with
  cascaded ASR/LLM/TTS), `web-sip-phone`, `mlx-realtime` — **all Apache-2.0**.
  This is the most license-clean, fully self-hosted AI-telephony stack found
  in any audit round so far; recommended for the ALO Voice Contact Center
  phase-2 design.

## What was actually added to this repository (and what was not)

Added (definitions and documentation only — no upstream source copied):

1. `docker-compose.selfhost-free-stack.yml` — 7 opt-in profiles / 13 services,
   loopback-bound, fail-closed secrets, memory ceilings, healthchecks.
2. `deploy/litellm/config.yaml` — local-models-only gateway config.
3. `deploy/librechat/librechat.yaml` — LibreChat wired to the LiteLLM gateway.
4. `docs/SELFHOST_FREE_STACK_2026-11-28.md` — enablement guide, RAM budgets,
   integration points, license conditions.

Not added, and why: MirrorFly / jarvis.institute / outstand.so (paid),
10x-Tool-Calls (no license), free-claude-code and open-webui `desktop` and
LibreChat `admin-panel` (AGPL — reference only), call-gpt and
AI-Powered-Call-Center-Intelligence (code MIT but runtime billed — zero-paid
policy), patina (out of scope), InfiniteTalk (free but needs GPU capacity the
shared 16 GB host does not have spare).

## Honesty notes

- Compose definitions are **syntax-validated only**; no service in this file
  has been deployed or runtime-tested by this repository. Per DoD rules, no
  runtime capability is claimed.
- Sniffed license verdicts are text readings of upstream LICENSE files, not
  legal advice. NocoBase and Directus especially need sign-off before
  commercial operation.
- Image tags pinned to `latest`/`main` intentionally for evaluation; pin
  digests before production hardening.


## Round 2 — 2026-11-28 (same day, second batch)

Checked the same way: GitHub API metadata + upstream LICENSE reads. Raw data:
`oss-audit-data/new-links-2026-11-28-round2.json`.

| Link | GitHub result | License | Stars | Disposition |
| --- | --- | --- | --- | --- |
| [sahilatahar/Code-Sync](https://github.com/sahilatahar/Code-Sync) | OK | MIT | 335 | **Free self-host confirmed** — Express + Socket.io server, React client, own compose, zero paid dependencies (no Firebase). No published image; enable via source clone (see guide). |
| [postmill-ai/postmill-app](https://github.com/postmill-ai/postmill-app) | OK | AGPL-3.0 | 355 | Reference only (AGPL per policy). Ships Dockerfile + compose; legally self-hostable as a separate unmodified service. **The free self-hosted replacement for outstand.so** (45+ social channels, AI creative suite). |
| [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | OK | Apache-2.0 | 8,490 | Already recorded round 1 — GPU research reference. |
| [MeiGen-AI/MultiTalk](https://github.com/MeiGen-AI/MultiTalk) | OK | Apache-2.0 | 3,044 | Voice/avatar research reference (NeurIPS 2025, audio-driven multi-person conversational video). |
| MeiGen-AI/OPSD-V | OK | Apache-2.0 | 704 | Research reference (video generator post-training). |
| MeiGen-AI/PositionIC, MeiGen-AI/Tool-Reflection-Bench | OK | Apache-2.0 / MIT | 7 / 10 | Research references. |
| MeiGen-AI/GenEvolve | OK | Apache-2.0 (sniffed) | 106 | Research reference. |
| MeiGen-AI/X-Cut | OK | AGPL-3.0 | 36 | Reference only per policy. |
| MeiGen-AI/PosterCraft | OK | NOASSERTION (unclear text) | 1,029 | Do not copy until upstream license is clarified. |
| MeiGen-AI/LongCat-Video-Avatar, PosterOmni, Infinite-World, llia, PosterReward, LiveVAE, multi-talk | OK | **none** | — | **Prohibited** — no license file. |
| [MirrorFly org](https://github.com/orgs/MirrorFly/repositories) (26 repos) | OK | 22× **no license**, 3× MIT wrappers, 1× NOASSERTION | ≤60★ | **Confirmed NOT free.** All repos are sample apps for MirrorFly's commercial SDK: the samples carry no license, and even the MIT wrappers require MirrorFly license keys to function. Self-hosting MirrorFly remains quote-based (see round 1). |
| `jarvis.institute/compare/jarvis-vs-chatgpt/` | — | proprietary | — | Comparison page confirms: $9.99 one-time, Microsoft Store distribution. Stays excluded. |

Round-2 answers, compact: **free = Code-Sync (integrate-ready), MultiTalk/InfiniteTalk
(research, GPU-gated); free-with-conditions = postmill (AGPL isolated service);
not free = MirrorFly (org-level confirmed), jarvis.institute (page-level confirmed);
prohibited = the no-license MeiGen-AI repos and MirrorFly samples.**
