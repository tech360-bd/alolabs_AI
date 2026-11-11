# Ecosystem Reverse-Engineering & Integration Map

**ALO Labs AI-EOS — Phase 2 of the Universal Private AI API program**
Date: 2026-11-10 · Scope: 100 open-source repositories, license-verified · Status: **Approved for integration planning**

---

## 1. Purpose

Phase 1 (Universal Private AI Gateway, `src/lib/ai-gateway`) gave ALO Labs one model surface. Phase 2 answers the next question: **which external systems do we connect to, rebuild, or avoid — and exactly how, under which license?**

The target list covered the categories the owner requested: low-code platforms, web crawling, CRM/ERP, VoIP/SMS, video generation, speech AI, multi-agent frameworks, agent skills, and LLM gateway/observability. Every repository was license-verified in November 2026 against live GitHub data. **No repository was cloned for code reuse in this phase** — reuse decisions name what may be vendored, and everything copyleft is confined to API integration.

### Hard constraints (unchanged, still enforced)

1. No fabricated call/usage/billing data — integrations are measured only when they actually run.
2. ONE Runtime — external systems enter through the adapter layer (`src/lib/integrations`); there is no second execution path.
3. Demo and production remain separated; production deployment needs owner approval.
4. Vendor material stays license-identical to upstream (SPDX recorded per adapter and per vendored tree).

---

## 2. Method

- **License verification**: live GitHub repo metadata + raw `LICENSE` files (GitHub API was rate-limited; HTML metadata and raw-file fetches cross-checked every non-standard case). The `LICENSE` field is the single most load-bearing datum in the inventory — all integration strategies derive from it.
- **Strategy assignment** per repo: `REUSE` (permissive, vendor with attribution), `API_INTEGRATE` (connect to a separately hosted instance / official API), `LEARN` (clean-room reference only), `AVOID` (license or ToS risk — no adapter permitted).
- **Priority**: P0 (build now) → P3 (reference/deferred), mapped onto AI-EOS gaps: universal gateway, CRM connectors, RAG ingestion, telephony/SMS, video generation, multi-agent orchestration, agent skills.
- **Executable compliance**: the strategy is not only documented — the adapter contract (`ExternalSystemAdapter.strategy`) encodes it, and the registry **fails closed** when an `AVOID` adapter is registered. The video adapter additionally rejects HunyuanVideo models at the call level.

---

## 3. License Compliance Policy (binding)

| Class | SPDX examples | ALO Labs policy |
|---|---|---|
| Permissive | MIT, Apache-2.0, BSD-3-Clause | Vendor/copy **with attribution** (LICENSE + NOTICE retained); pin commit SHA; re-check per release; never vendor `ee/`/`enterprise/` subdirs |
| Weak copyleft | MPL-2.0, LGPL-3.0 | Link via API/process boundary is safe; modifications to those files themselves must be released |
| Strong copyleft (network) | **AGPL-3.0** | **Never vendor.** Run UNMODIFIED as a separately hosted service; integrate via REST. Modified self-hosting inside ALO SaaS triggers source-disclosure of the modifications |
| Strong copyleft (process) | GPL-2.0, GPL-3.0 | Separate process only; official APIs (e.g. Asterisk ARI/AMI/FastAGI). No linking |
| Source-available / fair-code | n8n Sustainable Use, ELv2, BUSL-1.1, SSPL, MSCL, Remotion License, LobeHub Community | No embedding; no offering as (part of) a hosted service unless the license grants it; internal self-host only where granted |
| Custom model licenses | Tencent Community, Fish Audio Community, Coqui CPML, CC-BY-NC weights | Code license ≠ weights license. Verify per checkpoint. HunyuanVideo excludes EU/UK/KR; fish-speech has a $500k revenue threshold; CC-BY-NC weights are non-commercial, period |
| ToS risk | gpt4free, unofficial edge-tts/signal-cli, Reddit scraping | Never in production; demos only where explicitly acceptable |

**Named traps found during verification** (things that look safe but are not):

- **n8n** (210k stars) — Sustainable Use License: fair-code, *not* open source. Reference only; embedding it in AI-EOS is prohibited.
- **httpsms** — widely believed MIT; actually **AGPL-3.0** (verified in LICENSE file). Separate-service rule applies.
- **NocoDB** — no longer AGPL; now Sustainable Use (internal use only).
- **Akaunting** — BUSL-1.1 caps production at 2 users / 1 company / 1k invoices.
- **Airbyte** — re-relicensed to ELv2; fine as internal pipeline, prohibited as a resold managed service.
- **Invoice Ninja** — ELv2 (hosted API is the safe route). **Crater** is archived → InvoiceShelf (AGPL).
- **microsoft/autogen** — code under **CC-BY-4.0**, an unusual choice; LEARN, don't vendor.
- **F5-TTS / ChatTTS / XTTS-v2** — MIT/AGPL code but **non-commercial weights**; voice cloning in production requires licensed or self-trained models.
- **browserless** — SSPL (not OSI); use Playwright + own grid or steel-browser (Apache-2.0) instead.
- **new-api** — AGPL; do not fork into the gateway; one-api (MIT) is the reference to learn from.
- **gpt4free** — GPL-3.0 *and* provider-ToS exposure; **AVOID**, no legitimate use in a commercial gateway.

**Net result: 36/100 repos are direct-vendor safe (REUSE). Every category has at least one permissive path, so the full feature set can be built with zero copyleft contamination.**

---

## 4. Architecture — how external systems enter the ONE Runtime

```
Agent runtime / tool-loop  ─┐
Master Orchestrator         ├─▶ src/lib/integrations  ─▶ guardedFetch() ─▶ external system
ai-gateway (models)        ─┘        │ registry (fail-closed)
                                     │ adapters: crm.twenty, crm.frappe,
                                     │ messaging.httpsms, content.rsshub,
                                     │ media.video … (one per system)
```

Rules encoded in `src/lib/integrations/types.ts`:

- **Single egress path**: every adapter call goes through `guardedFetch()` — SSRF guard (private/loopback ranges blocked unless `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true`), per-call timeout, normalized `IntegrationError`.
- **Tenant scoping + audit**: every result carries `{ adapter, operation, companyId, agentId }` for ToolRun/audit persistence.
- **Registry fail-closed**: AVOID adapters cannot be registered; duplicate ids throw; `catalog()` feeds the admin UI.
- **License policy in code**: adapters declare `licenseClass` + `strategy`; the video adapter rejects license-blocked models (`hunyuan*`) at submission time.
- **Idempotent bootstrap**: `bootstrapIntegrations()` registers the Wave-1 set exactly once per process.

This layer sits *beside* the AI gateway (models) and *under* the agent runtime (tools) — it does not replace either, preserving the ONE Runtime boundary.

---

## 5. Category findings (highlights)

### 5.1 Automation / Low-code (8 repos)
Build the integration/action library on **activepieces (MIT)** — ~400 MCP servers and a piece-per-integration architecture map directly onto the tool registry. **Playwright (Apache-2.0)** is the browser substrate for everything. **n8n** stays a reference only (Sustainable Use License).

### 5.2 Crawling / Browser (16 repos)
P0 stack: **crawl4ai (Apache-2.0)** self-hosted ingestion + **firecrawl via hosted API** (AGPL — cloud API is the compliant route) + **browser-use (MIT)** as the browser-agent brain + **Playwright**. **trafilatura** (Apache) for main-content extraction quality. Avoid browserless (SSPL).

### 5.3 CRM / ERP (14 repos)
**twenty (AGPL)** is the P0 connector target and the best metadata-driven object model to learn from — connect REST to customer-hosted instances only. **chatwoot (MIT core)** is the P0 support-desk: its agent-bot API is exactly the AI↔human handoff surface for the voice contact center. EspoCRM's `entityDefs` and Frappe's DocType→auto-REST pattern are the clean-room references for the Prisma API layer.

### 5.4 Invoicing / Finance (4 repos)
Invoice Ninja via hosted API (ELv2), **bigcapital** architecture study (same TypeScript stack, AGPL — API only), Akaunting avoided (BUSL caps).

### 5.5 Communication (9 repos)
**Fonoster (MIT)** or **jambonz (MIT)** as the telephony backbone — jambonz is purpose-built for voice-AI with native ASR/TTS/LLM connectors; pick one, do not run both. **Asterisk (GPL-2.0)** underneath via ARI/AMI only, never linked. **postal (MIT)** for transactional email; **httpsms (AGPL)** as the low-cost SMS channel running unmodified on a customer phone.

### 5.6 Video Generation (9 repos)
**Wan2.2 is the primary**: the only large model where code *and* weights are unambiguously Apache-2.0. CogVideoX (Apache code) and LTX-Video (verify weights per checkpoint) mount behind the same job API. **HunyuanVideo is blocked** (custom license, EU/UK/KR exclusion) — enforced in the adapter. **MoneyPrinterTurbo (MIT)** is the pipeline blueprint for "video from brief". Remotion is license-limited (≤3-employee companies) — LEARN.

### 5.7 Speech AI (8 repos)
**faster-whisper (MIT)** for ASR/call transcription — cleanest license in the batch. TTS: idiap fork of Coqui (MPL-2.0, mind XTTS-v2 weight license); F5-TTS/fish-speech only with weight-license diligence. edge-tts for demos only (ToS gray zone). **jitsi (Apache-2.0)** embeds meetings into CRM with jibri audio capture feeding the ASR pipeline.

### 5.8 Multi-Agent (10 repos)
The in-house orchestrator (`src/lib/multi-agent-orchestrator`) remains the ONE orchestrator. **langgraph (MIT)** is the checkpointing/HITL engine candidate where orchestration primitives are needed. MetaGPT/crewAI/AutoGen/AgentScope are clean-room references (role-SOP, crews, actor topology, tracing). **GLM-5 (zai-org, Apache-2.0)** verified — native flagship option for the gateway via Z.ai API or self-host.

### 5.9 Agent Skills (4 repos)
**anthropics/skills (Apache-2.0)** defines the SKILL.md standard — adopt it for the 2,000-agent workforce skill catalog (P0, effort S). Seed the catalog from **K-Dense scientific-agent-skills (MIT, 177 skills)** and the plugin/marketplace format from **anthropics/claude-plugins-community (Apache-2.0)**. omarchy is out of scope (Linux desktop config) — flagged as a list error in the original request.

### 5.10 LLM Gateway / Observability (11 repos)
**LiteLLM (MIT core)** = universal gateway core (Phase 1 foundation); **Langfuse (MIT core)** = observability for all agents; pick Langfuse *or* Helicone, never both. one-api (MIT) for channel/quota design; new-api (AGPL) reference only; **gpt4free AVOID**. MCP `servers` + `registry` (Apache-2.0 transition) = baseline tool library + private marketplace.

---

## 6. Full inventory (100 repositories)

<!-- INVENTORY_TABLE_START -->
| # | Repository | Category | License | Lang | Stars | Status | What | Strategy | AI-EOS mapping | Pri | Eff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ToolJet/ToolJet | Automation / Low-code | AGPL-3.0 | TypeScript | 41,200 | active | Low-code internal tool/dashboard builder with AI app generation | **LEARN** | UI-builder reference for CRM dashboards (AGPL: no code copy) | P3 | L |
| 2 | AppsmithOrg/Appsmith | Automation / Low-code | Apache-2.0 | Java/TS | 41,200 | active | Admin panel / internal tool builder, 25+ DB connectors | **REUSE** | CRM/dashboard UI layer (exclude ee/ dir) | P2 | M |
| 3 | budibase/budibase | Automation / Low-code | GPL-3.0 | TypeScript | 28,400 | active | AI agents + automations + app builder for business ops | **LEARN** | Competitive reference for agent-driven ops apps | P3 | L |
| 4 | n8n-io/n8n | Automation / Low-code | Sustainable Use (fair-code) | TypeScript | 210,000 | active | Workflow automation, 400+ integrations, native AI/LangChain nodes | **LEARN** | Orchestrator + integration-library reference; MUST NOT embed in AI-EOS (fair-code) | P1 | M |
| 5 | activepieces/activepieces | Automation / Low-code | MIT | TypeScript | 25,500 | active | AI workflow automation + ~400 MCP servers, Zapier alternative | **REUSE** | Integration/action library + MCP gateway for agents (exclude ee/) | P0 | M |
| 6 | node-red/node-red | Automation / Low-code | Apache-2.0 | JavaScript | 23,800 | active | Flow-based programming for event-driven apps | **REUSE** | Telephony/IoT event-flow wiring (webhooks) | P3 | S |
| 7 | windmill-labs/windmill | Automation / Low-code | AGPL-3.0 | Rust/TS | 18,500 | active | Code-first workflows, internal apps, AI agents on fast orchestrator | **LEARN** | Workflow/orchestrator engine reference | P2 | L |
| 8 | huginn/huginn | Automation / Low-code | MIT | Ruby | 50,500 | active | Agents that monitor the web and act (IFTTT-like) | **LEARN** | Conceptual ancestor of agent runtime (agents-as-event-graph) | P3 | S |
| 9 | dgtlmoon/changedetection.io | Automation / Low-code | Apache-2.0 | Python | 35,700 | active | Website change detection, monitoring and alerting | **REUSE** | Web-monitoring triggers for RAG knowledge refresh | P2 | S |
| 10 | firecrawl/firecrawl | Crawling / Browser | AGPL-3.0 | TypeScript | 200,000 | active | Web crawl API: URL to clean LLM-ready markdown, extraction, search | **API-INTEGRATE** | RAG/knowledge ingestion via hosted cloud API (AGPL: no self-host embed) | P0 | S |
| 11 | unclecode/crawl4ai | Crawling / Browser | Apache-2.0 | Python | 87,000 | active | LLM-optimized crawler: markdown/structured output, adaptive crawling | **REUSE** | Self-hosted RAG ingestion engine | P0 | S |
| 12 | apify/crawlee | Crawling / Browser | Apache-2.0 | TypeScript | 26,400 | active | Node.js scraping/automation library: queues, proxies, anti-block | **REUSE** | Core crawling engine for hosted scraping microservice | P1 | M |
| 13 | scrapy/scrapy | Crawling / Browser | BSD-3-Clause | Python | 65,300 | active | High-level web crawling/scraping framework | **REUSE** | Bulk site-crawl jobs feeding RAG (Python service boundary) | P2 | M |
| 14 | gocolly/colly | Crawling / Browser | Apache-2.0 | Go | 25,600 | active | Fast HTTP-level scraper framework for Go | **LEARN** | Static-page crawl worker (Go runtime friction) | P3 | S |
| 15 | microsoft/playwright | Crawling / Browser | Apache-2.0 | TypeScript | 99,700 | active | Browser automation: Chromium/Firefox/WebKit, one API | **REUSE** | Browser substrate for all agent browsing/scraping/form-fill | P0 | S |
| 16 | browserless/browserless | Crawling / Browser | SSPL-1.0 / Commercial | TypeScript | 13,900 | active | Dockerized headless-browser grid with screenshot/PDF/scrape APIs | **AVOID** | Use Playwright + own grid instead (SSPL not OSI) | P2 | M |
| 17 | steel-dev/steel-browser | Crawling / Browser | Apache-2.0 | TypeScript | 7,900 | active | Open browser-API sandbox for AI agents: sessions, proxies, CDP | **REUSE** | Managed browser sessions for agent runtime | P1 | S |
| 18 | daijro/camoufox | Crawling / Browser | MPL-2.0 | Python/C++ | 13,200 | active | Anti-detect Firefox build with fingerprint spoofing | **REUSE** | Stealth layer for scraping (MPL: API linking OK) | P2 | M |
| 19 | DIYgod/RSSHub | Crawling / Browser | AGPL-3.0 | TypeScript | 46,900 | active | Turns everything into RSS feeds (thousands of routes) | **API-INTEGRATE** | Knowledge/news ingestion triggers into RAG | P2 | S |
| 20 | adbar/trafilatura | Crawling / Browser | Apache-2.0 | Python | 7,100 | active | Web text/metadata gathering + main-content extraction | **REUSE** | Article extraction quality layer for RAG | P1 | S |
| 21 | browser-use/browser-use | Crawling / Browser | MIT | Python | 120,000 | active | AI browser agents: LLM controls Playwright browser | **REUSE** | Browser-agent brain for the 2000-agent workforce | P0 | M |
| 22 | jina-ai/reader | Crawling / Browser | Apache-2.0 | TypeScript | 12,200 | active | URL to LLM-friendly markdown (r.jina.ai prefix) | **API-INTEGRATE** | Quick read_url function-call tool for agents | P1 | S |
| 23 | kestra-io/kestra | Automation / Low-code | Apache-2.0 | Java/Vue | 30,200 | active | Declarative orchestration/control plane (YAML + code tasks) | **REUSE** | Backend job orchestration: RAG refresh, media pipelines | P1 | M |
| 24 | SeleniumHQ/selenium | Crawling / Browser | Apache-2.0 | Java | 34,600 | active | The browser automation framework (WebDriver, Grid) | **LEARN** | Legacy reference; Playwright supersedes | P3 | S |
| 25 | twentyhq/twenty | CRM / ERP | AGPL-3.0 | TypeScript | 60,700 | active | Open-source Salesforce alternative CRM, designed for AI | **API-INTEGRATE** | P0 CRM connector target + metadata-driven object model reference | P0 | M |
| 26 | frappe/crm | CRM / ERP | AGPL-3.0 | Vue/Python | 3,900 | active | Modern CRM on Frappe framework | **API-INTEGRATE** | Secondary CRM connector; Lead-to-Deal pipeline reference | P2 | S |
| 27 | odoo/odoo | CRM / ERP | LGPL-3.0 | Python | 55,700 | active | Massive open business suite ERP/CRM (100+ apps) | **API-INTEGRATE** | ERP/invoicing connector for enterprise clients (JSON-RPC) | P2 | L |
| 28 | idurar/idurar-erp-crm | CRM / ERP | AGPL-3.0 | JavaScript | 8,900 | active | Node.js ERP/CRM/invoicing dashboard | **LEARN** | Lightweight invoicing module reference (clean-room) | P2 | S |
| 29 | Django-CRM/Django-CRM | CRM / ERP | MIT | Python | 2,500 | active | Django CRM: sales, support tickets, invoicing (ex MicroPyramid) | **REUSE** | Contact/deal/ticket schema reference (MIT: safe copy) | P2 | S |
| 30 | DjangoCRM/django-crm | CRM / ERP | AGPL-3.0 | Python | 650 | active | Django CRM + tasks + email marketing, multi-company | **LEARN** | Multi-company pattern reference | P3 | S |
| 31 | SuiteCRM/SuiteCRM | CRM / ERP | AGPL-3.0 | PHP | 5,900 | active | Established SugarCRM fork (v7/v8) | **API-INTEGRATE** | Connector for legacy mid-market clients (REST v8) | P2 | M |
| 32 | espocrm/espocrm | CRM / ERP | AGPL-3.0 | PHP | 3,600 | active | Clean fast CRM with strong entity framework | **API-INTEGRATE** | entityDefs metadata-driven model reference + connector | P1 | M |
| 33 | monicahq/monica | CRM / ERP | AGPL-3.0 | PHP | 25,800 | active | Personal CRM (remember everything about people) | **API-INTEGRATE** | Agent people-memory UX reference | P3 | S |
| 34 | krayin/laravel-crm | CRM / ERP | MIT | PHP | 24,100 | active | Laravel open-source CRM (leads, contacts, automation) | **REUSE** | Lead-pipeline + EAV attribute-family patterns | P2 | S |
| 35 | frappe/erpnext | CRM / ERP | GPL-3.0 | Python | 41,100 | active | Flagship open ERP: accounting, inventory, manufacturing, HR | **API-INTEGRATE** | Invoicing/accounting connector; DocType metadata reference | P2 | L |
| 36 | YetiForceCompany/YetiForce | CRM / ERP | AGPL-3.0 | PHP | 24 | slow | Vtiger-derived versatile CRM (successor of archived YetiForceCRM) | **AVOID** | Dormant on GitHub; weak API momentum | P3 | M |
| 37 | crater-invoice-inc/crater | Invoicing / Finance | AGPL-3.0 | PHP | 8,400 | archived | Self-hosted invoicing (successor: InvoiceShelf/InvoiceShelf, AGPL) | **LEARN** | Invoicing reference only | P3 | S |
| 38 | invoiceninja/invoiceninja | Invoicing / Finance | Elastic-2.0 (ELv2) | PHP | 9,000 | active | Invoicing/quotes/payments platform | **API-INTEGRATE** | Invoicing connector via hosted API (ELv2: no embedding) | P1 | M |
| 39 | akaunting/akaunting | Invoicing / Finance | BUSL-1.1 | PHP | 10,300 | active | Online accounting (double-entry ledger, invoices) | **AVOID** | BUSL 2-user/1k-invoice production cap; ledger model LEARN only | P3 | S |
| 40 | bigcapitalhq/bigcapital | Invoicing / Finance | AGPL-3.0 | TypeScript | 4,100 | active | Open-source QuickBooks alternative (accounting, reports) | **API-INTEGRATE** | Accounting module decomposition reference (same TS stack) | P1 | M |
| 41 | chatwoot/chatwoot | CRM / ERP | MIT | Ruby | 39,500 | active | Omnichannel support desk: voice, WhatsApp, email, chat | **REUSE** | P0 support-desk connector: AI agent to human handoff (agent-bot API) | P0 | M |
| 42 | nocodb/nocodb | Business Data Platforms | Sustainable Use (fair-code) | TypeScript | 65,500 | active | Self-hostable Airtable alternative over any DB | **API-INTEGRATE** | Data-grid/admin back-office (internal use only) | P1 | M |
| 43 | teableio/teable | Business Data Platforms | AGPL-3.0 (core) / MIT (SDK) | TypeScript | 22,000 | active | AI spreadsheet/database on Postgres (Airtable-like) | **API-INTEGRATE** | Data-grid module; MIT SDK packages reusable | P1 | M |
| 44 | baserow/baserow | Business Data Platforms | MIT (core) | Python/Vue | 6,300 | active | No-code database platform with automations + AI | **REUSE** | Data-grid + automation reference (exclude premium/ dirs) | P2 | M |
| 45 | airbytehq/airbyte | Business Data Platforms | Elastic-2.0 (ELv2) | Python | 22,300 | active | ELT data-movement platform, 550+ connectors | **API-INTEGRATE** | Universal data-import layer feeding RAG + CRM syncs (no resale as managed service) | P1 | M |
| 46 | frappe/frappe | Business Data Platforms | MIT | Python | 11,100 | active | Low-code framework behind Frappe CRM/ERPNext (DocType ORM) | **LEARN** | DocType to auto-REST to permission pattern: best reference for Prisma API layer | P1 | M |
| 47 | oroinc/crm-application | CRM / ERP | OSL-3.0 | PHP | 1,000 | active | B2B enterprise CRM (accounts, commerce data) | **API-INTEGRATE** | B2B account/multi-org model reference | P3 | M |
| 48 | directus/directus | Business Data Platforms | MSCL-1.0-GPL (source-available) | TypeScript | 38,700 | active | Instant headless API + admin app on any SQL DB | **API-INTEGRATE** | Universal data layer for legacy DBs; schema-introspection LEARN | P1 | M |
| 49 | NdoleStudio/httpsms | Communication | AGPL-3.0 | Kotlin/Go | 6,300 | active | SMS-over-HTTP gateway: Android phone becomes SMS API | **API-INTEGRATE** | Cheap self-hosted SMS channel (separate network service) | P1 | S |
| 50 | BelledonneCommunications/linphone | Communication | GPL-3.0 | C/C++ | 515 | active | SIP softphone family (linphone-sdk) | **LEARN** | SIP client for QA/testing voice agents only | P3 | M |
| 51 | fonoster/fonoster | Communication | MIT | TypeScript | 8,200 | active | Open Twilio alternative: programmable telephony, gRPC, routr SIP | **REUSE** | Telephony backbone for voice agents (P0: choose Fonoster OR jambonz) | P0 | L |
| 52 | jambonz/jambonz-feature-server | Communication | MIT | JavaScript | 100 | active | CPaaS for voice-AI: SIP SBCs + WebSocket verbs + ASR/TTS/LLM connectors | **REUSE** | Voice pipeline orchestration (alternative to Fonoster) | P0 | L |
| 53 | asterisk/asterisk | Communication | GPL-2.0 | C | 3,700 | active | Canonical open-source PBX/telephony engine | **API-INTEGRATE** | Battle-tested engine under Fonoster/jambonz (ARI/AMI only, never link) | P1 | XL |
| 54 | AsamK/signal-cli | Communication | GPL-3.0 | Java | 5,000 | active | Signal messaging via JSON-RPC/CLI (unofficial) | **API-INTEGRATE** | Secure-messaging channel (ToS risk; niche) | P3 | M |
| 55 | mautic/mautic | Communication | GPL-3.0 | PHP | 11,000 | active | Marketing automation: campaigns, email/SMS, lead scoring | **API-INTEGRATE** | Outbound campaign/lead-nurture layer adjacent to CRM | P2 | M |
| 56 | postalserver/postal | Communication | MIT | Ruby | 17,000 | active | Self-hosted transactional email delivery platform | **REUSE** | Email channel infrastructure for agents (send + bounce webhooks) | P1 | S |
| 57 | knadh/listmonk | Communication | AGPL-3.0 | Go | 24,000 | active | Single-binary newsletter/mailing-list manager | **API-INTEGRATE** | Bulk campaign email (Postal = transactional, listmonk = campaigns) | P2 | S |
| 58 | remotion-dev/remotion | Video Generation | Source-available (<=3 employees free) | TypeScript | 72,000 | active | Programmatic video creation in React | **LEARN** | Clean-room video assembly concept (license blocks use at ALO scale) | P1 | L |
| 59 | zai-org/CogVideo | Video Generation | Apache-2.0 | Python | 13,200 | active | CogVideoX text/image-to-video DiT family (2B/5B) | **API-INTEGRATE** | Marketing video generation (self-host weights; verify per checkpoint) | P1 | M |
| 60 | Tencent-Hunyuan/HunyuanVideo | Video Generation | Tencent Community (custom) | Python | 12,750 | slow | 13B open SOTA-class text-to-video model | **AVOID** | EU/UK/KR excluded, <100M MAU limit: production risk | P2 | L |
| 61 | Lightricks/LTX-Video | Video Generation | Apache-2.0 (code; weights separate terms) | Python | 11,400 | active | Fast DiT video generation (0.6B-13B) | **API-INTEGRATE** | Fastest self-hosted video-gen (verify weights per checkpoint) | P1 | M |
| 62 | Wan-Video/Wan2.2 | Video Generation | Apache-2.0 (code + weights) | Python | 18,500 | active | Alibaba open T2V/I2V models (A14B MoE, 5B TI2V) | **API-INTEGRATE** | PRIMARY self-hosted video generation: cleanest license | P1 | M |
| 63 | hpcaitech/Open-Sora | Video Generation | Apache-2.0 | Python | 30,000 | active | Open training/inference framework for Sora-style video diffusion | **LEARN** | Future in-house video model fine-tuning | P3 | XL |
| 64 | harry0703/MoneyPrinterTurbo | Video Generation | MIT | Python | 141,700 | active | One-click pipeline: topic to LLM script to footage/TTS/captions video | **REUSE** | Blueprint + partial code for AI-EOS video-from-brief feature | P0 | M |
| 65 | elebumm/RedditVideoMakerBot | Video Generation | GPL-3.0 | Python | 12,500 | slow | Reddit threads to narrated caption videos | **LEARN** | Narrow; Reddit ToS exposure; pipeline ideas only | P3 | S |
| 66 | RayVentura/ShortGPT | Video Generation | MIT | Python | 8,100 | slow | Framework/DSL for automated short-video production | **REUSE** | Programmatic video assembly engine (vendored/forked) | P1 | M |
| 67 | coqui-ai/TTS (use idiap fork) | Speech AI | MPL-2.0 | Python | 46,200 | dormant | Most complete open TTS toolkit (VITS, XTTS, vocoders) | **API-INTEGRATE** | Self-hosted TTS; use active fork idiap/coqui-ai-TTS; XTTS-v2 weights non-commercial | P1 | M |
| 68 | SWivid/F5-TTS | Speech AI | MIT (code); CC-BY-NC-4.0 (weights) | Python | 15,500 | active | SOTA flow-matching TTS with fast voice cloning | **LEARN** | Premium cloned-voice TTS; WEIGHTS ARE NON-COMMERCIAL: train own or license | P1 | M |
| 69 | rany2/edge-tts | Speech AI | LGPL-3.0 | Python | 12,500 | active | Python client for Edge online neural TTS (no API key) | **API-INTEGRATE** | Free TTS for demos/dev only (MS ToS gray zone) | P2 | S |
| 70 | SYSTRAN/faster-whisper | Speech AI | MIT | Python | 26,600 | active | 4x faster Whisper ASR via CTranslate2, word timestamps | **REUSE** | P0 real-time ASR for voice agents + call transcription | P0 | M |
| 71 | lipku/LiveTalking | Speech AI | Apache-2.0 (code; model weights vary) | Python | 10,300 | active | Real-time streaming talking-head avatar over WebRTC | **API-INTEGRATE** | Avatar/video-presence layer for agents (weight diligence) | P2 | L |
| 72 | fishaudio/fish-speech | Speech AI | Fish Audio Community (custom) | Python | 33,600 | active | SOTA open TTS/voice-clone, multilingual | **API-INTEGRATE** | Top-quality TTS/clone; $500k revenue threshold trap | P1 | M |
| 73 | 2noise/ChatTTS | Speech AI | AGPL-3.0 (code); CC-BY-NC-4.0 (weights) | Python | 40,000 | slow | Dialogue-optimized TTS, natural conversational prosody | **LEARN** | Prosody research reference; non-commercial weights kill production | P3 | S |
| 74 | jitsi/jitsi-meet | Communication | Apache-2.0 | JS/Java | 30,200 | active | Self-hosted video conferencing (SFU), iframe-embeddable | **REUSE** | Meeting rooms in CRM + jibri audio capture to ASR for meeting agents | P1 | M |
| 75 | FoundationAgents/MetaGPT | Multi-Agent | MIT | Python | 71,200 | active | Multi-agent AI software company: role-specialized SOP pipeline | **LEARN** | Role/SOP orchestration patterns for department agents | P2 | M |
| 76 | zai-org/GLM-5 | Multi-Agent | Apache-2.0 | Python | 7,400 | active | GLM-5/5.1/5.2/5.3 flagship models: agentic engineering | **API-INTEGRATE** | Native-model option for the universal AI gateway (Z.ai API or self-host) | P1 | S |
| 77 | crewAIInc/crewAI | Multi-Agent | MIT | Python | 60,700 | active | Role-based autonomous agent crews with tasks/tools | **LEARN** | Crew/task/delegation model reference | P2 | M |
| 78 | microsoft/autogen | Multi-Agent | CC-BY-4.0 | Python | 61,800 | active | Event-driven multi-agent conversation framework (Actor model) | **LEARN** | Actor/event-driven topology reference (CC-BY for code is a quirk) | P2 | M |
| 79 | langchain-ai/langgraph | Multi-Agent | MIT | Python/JS | 44,700 | active | Graph/state-machine orchestration with checkpointing + HITL | **REUSE** | Orchestrator engine candidate for multi-agent runtime | P1 | M |
| 80 | agentscope-ai/agentscope | Multi-Agent | Apache-2.0 | Python | 35,700 | active | Alibaba multi-agent platform: actors, tracing, Studio dashboard | **LEARN** | Tracing pattern reference | P2 | M |
| 81 | All-Hands-AI/OpenHands | Multi-Agent | MIT | Python/TS | 93,100 | active | AI software-development agent platform in sandboxed runtime | **LEARN** | Agent runtime sandboxing reference | P2 | L |
| 82 | SWE-agent/SWE-agent | Multi-Agent | MIT | Python | 20,800 | active | Agent that fixes GitHub issues via Agent-Computer Interface | **LEARN** | Tool/ACI design reference | P3 | M |
| 83 | Aider-AI/aider | Multi-Agent | Apache-2.0 | Python | 50,000 | active | Terminal AI pair-programmer: git-integrated, repo-map edits | **LEARN** | Repo-map/context engineering for agent runtime | P3 | M |
| 84 | lobehub/lobe-chat | Multi-Agent | LobeHub Community (custom) | TypeScript | 84,600 | active | Self-hosted AI chat/agent platform: plugins, marketplace, multi-model | **LEARN** | UX/plugin-marketplace reference (no commercial derivative distribution) | P2 | L |
| 85 | omacom/omarchy | Agent Skills | MIT | Shell | 46,700 | active | Opinionated Arch Linux + Hyprland desktop setup (DHH) | **LEARN** | Out-of-scope for AI-EOS: opinionated-install DX only | P3 | S |
| 86 | anthropics/claude-plugins-community | Agent Skills | Apache-2.0 | Markdown/TS | 4,800 | active | De-facto community plugin marketplace for Claude Code | **REUSE** | Plugin/marketplace format for 2000-agent workforce skills | P1 | S |
| 87 | K-Dense-AI/scientific-agent-skills | Agent Skills | MIT | Python/Markdown | 56,600 | active | 177 scientific agent skills (100+ domain DBs), Agent Skills standard | **REUSE** | Skills library seeding workforce skill catalog | P1 | S |
| 88 | anthropics/skills | Agent Skills | Apache-2.0 | Markdown/TS | 191,000 | active | Official Agent Skills repo + spec (SKILL.md standard) | **REUSE** | SKILL.md standard for AI-EOS skill system | P0 | S |
| 89 | sst/opencode (anomalyco) | Multi-Agent | MIT | TypeScript | 226,000 | active | Terminal coding agent, provider-agnostic, client/server split | **REUSE** | Coding-agent surface + server-split architecture reference | P1 | M |
| 90 | xtekky/gpt4free | LLM Gateway / Observability | GPL-3.0 | Python | 67,000 | unstable | Reverse-engineered free access to consumer LLM web endpoints | **AVOID** | GPL contamination + provider ToS/legal exposure: no legitimate use | P3 | - |
| 91 | OpenRouter (hosted service) | LLM Gateway / Observability | N/A (commercial service) | - | - | active | Unified API for 400+ models with fallbacks and BYOK | **API-INTEGRATE** | External aggregation channel + gateway design reference | P1 | S |
| 92 | songquanpeng/one-api | LLM Gateway / Observability | MIT | Go | 37,400 | active | OpenAI-format LLM gateway: channels, tokens, quotas | **LEARN** | Channel rotation + per-tenant quota model | P2 | M |
| 93 | QuantumNous/new-api | LLM Gateway / Observability | AGPL-3.0 | Go | 51,600 | active | one-api fork: richer routing, billing, relay support | **AVOID** | AGPL: no fork into AI-EOS; feature reference only | P2 | M |
| 94 | yym68686/uni-api | LLM Gateway / Observability | Apache-2.0 | Python | 1,300 | slow | YAML-config unified LLM gateway with load balancing/fallback | **LEARN** | Config-driven routing simplicity | P3 | S |
| 95 | berriai/litellm | LLM Gateway / Observability | MIT (core; exclude enterprise/) | Python | 63,000 | active | De-facto standard LLM gateway: 100+ providers, budgets, rate limits | **REUSE** | UNIVERSAL AI GATEWAY core (Phase 1 foundation) | P0 | M |
| 96 | langfuse/langfuse | LLM Gateway / Observability | MIT (core; exclude ee/) | TypeScript | 37,200 | active | LLM tracing, evals, prompt management, observability | **REUSE** | LLM observability layer for all 2000 agents | P0 | M |
| 97 | Helicone/helicone | LLM Gateway / Observability | Apache-2.0 | TypeScript | 6,300 | active | LLM observability + gateway (caching, rate limiting) via proxy | **API-INTEGRATE** | Alternative to Langfuse: pick ONE, do not run both | P2 | M |
| 98 | modelcontextprotocol/servers | LLM Gateway / Observability | Apache-2.0 (was MIT) | TypeScript | 91,900 | active | Reference MCP servers: filesystem, git, fetch, postgres | **REUSE** | Baseline tool library for the agent workforce | P1 | S |
| 99 | modelcontextprotocol/registry | LLM Gateway / Observability | Apache-2.0 (was MIT) | Go | 7,500 | active | Community MCP server registry (metadata API) | **REUSE** | Private MCP-plugin marketplace for tenants | P1 | M |
| 100 | openai/codex | Multi-Agent | Apache-2.0 | Rust | 134,000 | active | OpenAI terminal coding agent: approvals, sandboxing, MCP | **LEARN** | Agent-execution security model reference (approvals + sandbox) | P2 | M |
<!-- INVENTORY_TABLE_END -->

Columns: `#` · Repository (verified path) · Category · License · Language · Stars (Nov 2026, approximate) · Status · What · Strategy · AI-EOS mapping · Priority · Effort.

---

## 7. Roadmap

| Wave | Items | Theme |
|---|---|---|
| **Wave 1 (P0, 14 items)** | activepieces · Playwright · browser-use · crawl4ai · firecrawl(API) · twenty · chatwoot · fonoster *or* jambonz · faster-whisper · MoneyPrinterTurbo · LiteLLM · Langfuse · anthropics/skills | Foundation: gateway + observability + skill standard + browser/crawl + CRM/support connectors + telephony + ASR + video pipeline |
| **Wave 2 (P1, 42 items)** | kestra · crawlee · trafilatura · steel-browser · jina reader · espocrm · frappe/frappe · bigcapital · invoiceninja · nocodb · teable · directus · airbyte · httpsms · postal · asterisk · CogVideoX · LTX-Video · Wan2.2 · ShortGPT · idiap-coqui · F5-TTS · fish-speech · jitsi · GLM-5 · langgraph · opencode · claude-plugins-community · scientific-agent-skills · MCP servers · MCP registry · OpenRouter … | Core build-out |
| **Wave 3 (P2, 31 items)** | Appsmith · changedetection.io · Scrapy · camoufox · RSSHub · frappe/crm · odoo · idurar · Django-CRM · SuiteCRM · krayin · mautic · listmonk · LiveTalking · edge-tts · MetaGPT · crewAI · autogen · AgentScope · OpenHands · lobe-chat · one-api · Helicone · openai/codex … | Selective |
| **Wave 4 (P3, 13 items)** | ToolJet · budibase · huginn · colly · selenium · Monica · DjangoCRM · YetiForce(AVOID) · crater · akaunting · linphone · signal-cli · ChatTTS · Open-Sora · RedditVideoMakerBot · gpt4free(AVOID) · uni-api | Reference / deferred |

AVOID items are retained in the inventory with explicit rationale so they are never re-litigated from memory.

---

## 8. Implementation status (this commit)

Shipped in `src/lib/integrations/` + `__tests__/unit/lib/integrations.test.ts`:

| Artifact | Purpose |
|---|---|
| `types.ts` | Adapter contract, SSRF-guarded egress (`guardedFetch`), audit-shaped results, license strategy enum |
| `registry.ts` | Fail-closed singleton registry (AVOID adapters cannot register), tenant health sweep |
| `connectors/crm/twenty.ts` | Twenty REST: list/create contacts, cursor paging, bearer auth |
| `connectors/crm/frappe.ts` | Frappe DocType REST: list/create docs, token auth (key:secret) |
| `connectors/messaging/httpsms.ts` | SMS send via unmodified httpsms gateway (owner-phone + x-api-key) |
| `connectors/media/video-gen.ts` | Job-based video worker client; Wan2.2 default; HunyuanVideo rejected in code |
| `connectors/content/rsshub.ts` | RSS route fetch → normalized feed items for RAG ingestion |
| `integrations/index.ts` | Idempotent bootstrap of the Wave-1 connector set |
| Tests | 20 unit tests: SSRF guard, fail-closed registry, per-connector request/response mapping, license-blocked model rejection — **20/20 green**, `tsc --noEmit` clean, eslint clean |

Next implementation steps (Wave 1 continuation): firecrawl cloud ingestion adapter, chatwoot agent-bot connector, Fonoster/jambonz decision spike (pick one backbone), LiteLLM wiring behind the existing ai-gateway, Langfuse self-host eval, SKILL.md catalog importer for the workforce.

---

## 9. Verification notes

- All 100 licenses verified against live GitHub (HTML metadata + raw LICENSE files) in November 2026; star counts are point-in-time approximations.
- Repo-path corrections made during verification: `mendableai/firecrawl` → `firecrawl/firecrawl`; `MicroPyramid/django-crm` → `Django-CRM/Django-CRM` (MIT); YetiForceCRM archived → `YetiForceCompany/YetiForce` (near-dormant, AVOID); `invoiceninja` org is lowercase; coqui-ai/TTS dormant → use `idiap/coqui-ai-TTS`; `basecamp/omarchy` → `omacom/omarchy`; `sst/opencode` → `anomalyco/opencode`; K-Dense repo renamed to `scientific-agent-skills`; CogVideo redirects to `zai-org/CogVideo`; **`zai-org/GLM-5` exists (Apache-2.0)** and GLM-4.6 is 404.
- Pin upstream commit SHAs before vendoring anything and re-verify license per release (roughly half the batch had renames/moves within the last year).
