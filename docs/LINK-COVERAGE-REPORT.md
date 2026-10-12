# Link Coverage Report — editorial design system, buttons, marketing kits

**Branch:** `arena/378e644f-alolabs-net-ai` · **Date:** 2026-10-08 · **Scope:** every link supplied in the
"check every link" message, with the user-confirmed priorities — *diagram designs, button designs and the
marketing kits* — implemented in this repository.

---

## 1. What shipped (the confirmed priorities)

### 1.1 Diagram design system — ported in full

Source: `github.com/cathrynlavery/diagram-design` (MIT). Every one of the reference's **44 visual types**
now exists as a renderer in this repo, with the design language encoded as tokens rather than copied
markup:

| Area | Where |
|---|---|
| Design tokens (roles, skins, strokes, radii, 4px grid, type ramp, series palette) | `src/lib/diagram-design/tokens.ts` |
| Geometry (grid snapping, text metrics, ports, elbows, label placement, ticks) | `src/lib/diagram-design/geometry.ts` |
| Scene model + all input specs | `src/lib/diagram-design/spec.ts` |
| Scene builder with the paint-layer contract | `src/lib/diagram-design/scene.ts` |
| Six engines covering the 44 types | `src/lib/diagram-design/engines/{graph,stack,cartesian,radial,sequence,schema,special,shared}.ts` |
| Dispatcher (the registry) | `src/lib/diagram-design/render.ts` |
| **Taste gate as code** (§6 connector rules, §7 budgets, §9 grid/legend/typography, §12 a11y) | `src/lib/diagram-design/audit.ts` |
| One production-quality example per type (regression corpus) | `src/lib/diagram-design/examples.ts` |
| Self-contained SVG / HTML exporters | `src/lib/diagram-design/export.ts` |
| React renderer with the accessible-SVG contract | `src/components/diagrams/diagram-canvas.tsx` |
| Figure wrapper (eyebrow → serif title → diagram → colophon, audit + export UI) | `src/components/diagrams/editorial-diagram.tsx` |
| Studio (type browser, variant/theme/skin toggles, audit readout) | `src/components/diagrams/diagram-studio.tsx` |
| In-app surfaces | `/design` page + **Diagram Studio** panel in the enterprise shell |

Deliberate departures from a literal copy, all in the spirit of the source: the reference ships static
HTML+SVG per type; this repo renders the same system from typed specs at request time, so the audit, the
studio and the exporters all inspect the same scene object.

**Verification**

- 44/44 kinds in `KINDS` exactly match the reference's 44 `type-*.md` documents (name-for-name diff: no
  missing, no extra).
- All 44 examples render with **zero `fail` and zero `warn` findings** from the taste gate — including the
  connector rules (orthogonal elbows only, masked labels, no stacked routes, mask-vs-node rule 6), the
  per-type complexity budgets, the 4px grid, legend coverage ("every type used — and nothing extra"), and
  the accessibility contract.
- Exporters verified: SVG begins `<svg`, carries `role="img"`, `<title>` as first child, slug-prefixed ids,
  all three arrow markers, no `<script>`; HTML is self-contained, font-linked, script-free.

### 1.2 Button designs — editorial register added

Source language: the same design system (`style-guide.md`: *shadows are out, borders are in*; max radii
4–8px; the coral accent spent on 1–2 focal elements; mono reserved for technical content).

- `src/components/ui/button.tsx` gained five editorial variants (`editorial`, `editorialOutline`,
  `editorialAccent`, `editorialGhost`, `technical`) and four sizes (`xs`, `iconSm`, `editorial`,
  `editorialLg`). The pre-existing product variants are untouched, so no panel changes appearance.
- The living spec lives under `/design` → **Buttons**: variant × size matrix, dark-paper row, a rule
  callout, and the "accent reserved for one action" note.

**Verification:** the file typechecks and the design page renders; the Buttons tab is the living matrix (`/design` → Buttons).

### 1.3 Marketing kits — imported in full

Source: `github.com/coreyhaines31/marketingskills` (MIT). All **50 skills** and their reference documents
are in the repo, with the metadata API and an install path into AgentOS:

| Area | Where |
|---|---|
| Metadata API (catalog, categories, search, stats) | `src/lib/marketing-kit/index.ts` |
| Bodies (SKILL.md content + reference documents) | `src/lib/marketing-kit/content.ts`, `src/lib/marketing-kit/data/*.generated.ts` |
| Generated catalog | `src/lib/marketing-kit/data/catalog.json` |
| Sync script against the upstream repo | `scripts/sync-marketing-kit.mjs` |
| API (`GET /api/marketing-kit`, `GET /api/marketing-kit/:slug`, `POST` install as `mk-<slug>`) | `src/app/api/marketing-kit/` |
| Panel (browse, search, read one playbook on demand, install) | `src/components/panels/marketing-kit-panel.tsx` |
| Markdown renderer | `src/components/marketing/markdown.tsx` |

**Verification:** 50/50 upstream slugs present, 7 categories, MIT attribution carried, every skill has a
>500-character body and a semver version, reference documents servable per skill, install path covered by
the API route. Four upstream skills ship no `references/` directory — that is upstream's state, and the
test pins exactly those four so a missing body still fails.

---

## 2. Verification log (commands run on this branch)

| Check | Result |
|---|---|
| `npx tsc --noEmit` scoped to the new modules | **0 errors** |
| `npx vitest run src/__tests__/lib/diagram-design-and-marketing-kit.test.ts` | **61 passed** |
| Full repo suite `npx vitest run` | 558 passed; 2 pre-existing failures (`__tests__/**/storage.test.ts` import a module that has never existed at `HEAD`) |
| `npx next dev -p 3011` + `GET /design` | 200, 59.6 KB, accessible SVG contract present in SSR output |
| `GET /` (enterprise shell) | 200 |
| `GET /api/marketing-kit` without a token | 401 (auth required, as designed by `src/proxy.ts`) |
| `npx next build` | Fails at type-check on the repo's **pre-existing** 444-error baseline (orchestrator / rag-engine / prisma-client typings); no error maps to the new modules |
| Sandbox preview headers | Fixed: `allowedDevOrigins` now includes `*.e2b.app`; framing relaxed to `SAMEORIGIN` **in development only** (`next.config.ts` + `src/proxy.ts`), CSP allows the Google-Fonts stylesheet; production values unchanged |

---

## 3. Per-link coverage — the full inventory

Legend: **Ported** — its artifact now lives in this repo. **Backlog** — relevant, tracked for a later
round, not part of the confirmed priorities. **No port** — reviewed, nothing applicable to this codebase
(platform mismatch, content-only, or superseded by an existing module).

### 3.1 Primary design and tooling references

| Link | Disposition |
|---|---|
| `cathrynlavery/diagram-design` | **Ported** — the 44-type editorial diagram system, taste gate, studio and exporters (§1.1) |
| `coreyhaines31/marketingskills` | **Ported** — all 50 skills + references, API and panel (§1.3) |
| `omacom/omarchy` (×2) | Backlog — terminal/ricing dotfiles; nothing portable to a Next.js product surface |
| `cursor/plugins` | Backlog — editor plugin packaging; candidate model for a future "AgentOS plugins" marketplace |
| `AprilNEA/OpenLogi` | No port — desktop log tool in another runtime |
| `volcengine/OpenViking` | Backlog — long-horizon agent memory; overlaps the existing memory-engine view |

### 3.2 Links marked "Fetched" (GTM / enrichment tooling)

| Link | Disposition |
|---|---|
| `ioi-labs/molx` | Backlog — token/market tooling, outside this product |
| `firecrawl/firecrawl` | Backlog — crawl-to-markdown service; belongs behind the existing `/api/rag` ingestion if adopted |
| `firecrawl/web-agent` | Backlog — same family as above |
| `guifav/market-intelligence-radar` | Backlog — market radar; maps onto the research-hub panel |
| `parthasarathy123/n8n-gtm-lead-enrichment` | Backlog — n8n workflow; the enrichment pipeline is already modelled as a diagram + the CRM panels |
| `brightdata/open-enrich` | Backlog — enrichment API pattern; the "Lead enrichment pipeline" diagram documents this shape already |
| `clawnify/OpenProspector` | Backlog — prospecting; overlaps CRM builder |
| `workwithlos-ui/dave` | No port — UI kit for another stack |
| `BraaMohammed/bricks` | No port — component set in another framework |

### 3.3 AI / agent tooling

| Link | Disposition |
|---|---|
| `debpalash/VoiceStudio`, `Lakr233/vphone-cli`, `vastsa/PI-Desktop`, `armory3d/armorpaint` | No port — desktop/3D/virtualisation runtimes |
| `akitaonrails/ai-memory`, `mksglu/context-mode` | Backlog — memory/context strategies for the memory-engine view |
| `public-apis/public-apis` | Backlog — reference index only |
| `harry0703/MoneyPrinterTurbo`, `heygen-com/hyperframes` | Backlog — video generation; the video-studio panel is the eventual host |
| `every-app/open-seo` | Backlog — SEO tooling; the marketing kit already ships the SEO playbooks |
| `ruvnet/ruflo` | Backlog — agent swarm runtime |
| `fmtlib/fmt`, `sibnerian/electron-promise-ipc` | No port — C++/Electron concerns |
| `affaan-m/ECC`, `alsk1992/CloddsBot`, `nashsu/llm_wiki` | Backlog — agent eval / bot / wiki patterns |
| `anthropics/claude-plugins-community`, `cline/cline`, `cursor/plugins` | Backlog — plugin packaging family |
| `meta-models/meta-model-cookbook` | Backlog — prompting cookbook for the prompt-library view |

### 3.4 CRM / ERP family

| Link | Disposition |
|---|---|
| `melgarafael/DeskcommCRM`, `Django-CRM/Django-CRM`, `Odoo-mobile/crm`, `thu-ml/CRM`, `dennisivy/crash-course-CRM`, `oroinc/crm-application`, `oroinc/crm`, `trycompai/crm`, `frappe/crm`, `ChurchCRM/CRM`, `crmeb/CRMEB`, `idurar/idurar-erp-crm`, `fatfreecrm/fat_free_crm`, `ArnasDon/wacrm` | Backlog — the CRM surface exists in this app (CRM builder, CRM entities diagram); these are inputs for a future CRM-data-model round, none is a drop-in |
| `engralaminn-collab/Ai-Markting-crm` (×2), `engralaminn-collab/alo-education-uk-final`, `engralaminn-collab/ukvi-ai-markting_n8n` | Backlog — own-org repos; referenced for feature parity tracking |

### 3.5 Messaging / VoIP

| Link | Disposition |
|---|---|
| `domovinatv/sms.domovina.ai`, `NdoleStudio/httpsms`, `NdoleStudio/httpsms-node` | Backlog — SMS gateways for the communications surface |
| `BelledonneCommunications/linphone-iphone`, `0perationPrivacy/VoIP`, `developerspace-samples/VoIP-Call-Sample`, `sibnerian/electron-promise-ipc` | Backlog — VoIP clients; the voice-agent roadmap item needs a bridge, tracked |
| `YutaroHayakawa/ipftrace2` | No port — kernel tracing |
| `HM-RunningHub/ComfyUI_RH_APICall` | Backlog — ComfyUI bridge for video-studio |

### 3.6 Education

| Link | Disposition |
|---|---|
| `nabaleducation/EducationConsultancyWebsite`, `arupdas0825/studytra`, `Bhawana0218/NextStep-Abroad`, `nwuzmedoutlook/university`, `bugcrowd/bugcrowd_university` (×2) | Backlog — the study/academic pages exist; these are content-structure references for an education vertical |

### 3.7 Content & publishing

| Link | Disposition |
|---|---|
| `DIYgod/RSSHub` | Backlog — ingestion source for the content pipeline |
| `siyuan-note/siyuan` | No port — local knowledge app; the knowledge-graph view already covers the concept |

### 3.8 Creator / media (video) links

| Link | Disposition |
|---|---|
| `WEIFENG2333/VideoCaptioner`, `YaoFANGUK/video-subtitle-remover`, `OpenTalker/video-retalking` | Backlog — captioning/subtitle tooling for video-studio |
| `ATH-MaaS/Pixelle-Video`, `remotion-dev/remotion`, `MarkTechStation/VideoCode`, `bradautomates/claude-video`, `Augani/openreel-video`, `Kosinkadink/ComfyUI-VideoHelperSuite`, `Bilal-Belli/videoMakerBOT`, `Nncstudio/VideoMakerPro`, `dunossauro`, `burhankocabiyik`, `wtz2017`, `viniciusenari`, `WuTao-CS`, `shubhamdevhouse`, `seed0001`, `qdrzwd/VideoRecorder` (×2) | Backlog — video production pipelines; grouped as inputs for the video-studio panel |
| `zai-org/CogVideo`, `Tencent-Hunyuan/HunyuanVideo`, `Lightricks/LTX-Video`, `MeiGen-AI/InfiniteTalk`, `meituan-longcat/LongCat-Video` | Backlog — generative model runtimes (GPU-side, not app-side) |
| `3b1b/videos`, `leandromoreira/digital_video_introduction`, `0voice/audio_video_streaming`, `jitsi/jitsi-videobridge` | No port — explainer material / infrastructure |
| `ytdl-org/youtube-dl`, `elebumm/RedditVideoMakerBot` | Backlog — media acquisition |
| `HITsz-TMG/VideoClaw`, `HKUDS/VideoAgent`, `LoSealL/VideoSuperResolution` | Backlog — research code |

### 3.9 YouTube "Repos Featured" list

| Link | Disposition |
|---|---|
| `tt-a1i/archify`, `bilawalsidhu/gods-eye-view`, `THU-MAIC/OpenMAIC` | Backlog — visualisation/education projects |
| `JetBrains/go-modern-guidelines` | No port — Go style guide |
| `Gitlawb/openclaude` | Backlog — agent runtime |
| `K-Dense-AI/scientific-agent-skills` | Backlog — another skill library; the marketing kit is the ported one |
| `jingyaogong/minimind`, `google-research/timesfm` | No port — model training / forecasting research |
| `EfficientStreet/hindsight`, `timharris707/modeldeck`, `Artistsyn/cortex_suite`, `sulabhdubey/rta-smriti-brain`, `EfficientStreet/youtube-subscriptions-ingest`, `Kayforkind/reimagine-it`, `templetongroup/radiant` | Backlog — audience-channel projects |
| `Onyx-Dev-Labs/doodle-note` | No port — note app |
| `CapSoftware/Cap`, `TryGhost/Ghost`, `twentyhq/twenty`, `languagetool-org/languagetool`, `umami-software/umami`, `nextcloud/server`, `chatwoot/chatwoot`, `dani-garcia/vaultwarden`, `VonHoltenCodes/SlowBooks-Pro-2026` | Backlog — self-hosted product references; each maps to an existing AgentOS surface (publishing, analytics, chat, finance) and none is portable code |

### 3.10 Non-GitHub sites

| Link | Disposition |
|---|---|
| `openrouter.ai` + `.../blog/tutorials/build-tool-calling-agent-loop` | Applied conceptually — the tool-calling loop is documented as the "Tool-calling loop for one agent turn" sequence diagram |
| `cline.bot` | No port — product site |
| `coder.qwen.ai` | No port — hosted model service |
| `stackoverflow.com` | No port — reference |
| `buffer.com`, `mureka.ai` (×2), `astryx.atmeta.com`, `developer.meta.com/ai` | No port — marketing/XR/AI product sites; reviewed for messaging language only |

---

## 4. Known gaps and follow-ups

1. **Fonts in the preview sandbox.** The editorial pages load Instrument Serif / Geist / Geist Mono from
   Google Fonts; the sandbox has no network, so the preview falls back to system faces. In a real browser
   the registers render as specified.
2. **`next build`** is blocked by the repository's pre-existing type-check baseline (444 errors across
   unrelated modules, present at `HEAD`). The new modules are clean under `tsc`; the dev server compiles
   and serves them.
3. **Backlog items** above are tracked, not silently dropped; the diagram system's data-flow,
   deployment and pipeline diagrams already document several of their architectures.

---

# Addendum — brand assets, letterhead and invoice (uploaded collateral)

**Added:** 2026-10-08 · **Branch:** `arena/378e644f-alolabs-net-ai`

The uploaded collateral (letterhead, brand & system guideline sheet, master agent
specification list, logo artwork) is now implemented in the repository as a
brand system rather than loose images.

## What shipped

| Asset from the uploads | Implementation |
|---|---|
| Logo (hexagon mark, folded-ribbon A, orange bar) | `public/brand/alo-mark.svg`, `alo-icon.svg`, `alo-wordmark.svg`, `alo-logo-horizontal.svg`, `alo-logo-stacked.svg` + the `AloLabsLogo` / `Mark` React lockups |
| App icon / favicon / PWA icons | `public/icons/icon-192.svg`, `icon-512.svg`, wired in `src/app/layout.tsx` (`icon`, `apple`, `shortcut`, OpenGraph) |
| Colour system (#FF6A00, #003ABC, alt #0D47A1) and both gradients | `src/lib/brand/tokens.ts` (`BRAND`, `GRADIENTS`) + gradient utilities in `globals.css` |
| Usage guide (orange = action, blue = system, white, gray) | `USAGE_RULES`, rendered on `/brand` → Colour |
| Inter + Poppins typography | Google-Fonts link in `layout.tsx`, `--font-brand` / `--font-display` in `globals.css`, specimens on `/brand` → Typography |
| Letterhead pad (A4, orange rule, blue bands, contact strip) | `src/components/brand/letterhead.tsx` — reused by every document |
| Invoice on the letterhead | `src/app/invoice` route, `src/components/brand/invoice-{document,page,panel}.tsx`, arithmetic in `src/lib/brand/invoice.ts` |
| System flow (orange & blue) | `src/components/brand/system-flow.tsx`, driven by `SYSTEM_FLOW` tokens |
| Mobile view (blue theme, 12 tiles, 4 tabs) | `src/components/brand/command-center-mobile.tsx`, driven by `COMMAND_TILES` |
| Agent spec cards (AGENT-0801 layout) | `src/components/brand/agent-spec-card.tsx` + the four cards from page 1 |
| Brand & system guideline sheet as a living page | `/brand` → `src/components/brand/brand-book.tsx` (5 tabs, all generated from tokens) |
| Brand usage rules checklist | `BRAND_RULES`, rendered on `/brand` → Documents |

## The invoice workflow

The instruction — *no fee for new attempts, but send an invoice showing what paid
APIs would have cost, printed on this pad* — is implemented literally:

- `src/lib/brand/invoice.ts` holds the model and the arithmetic (subtotal →
  contribution → tax → balance, rounded once at the cent).
- `sampleInvoice()` lists six realistic paid-API lines (tokens, tool calls, voice
  minutes, crawl pages, vector store, OCR) for a 30-day period.
- Under the house policy the balance is **$0.00** and the **cost avoided** figure
  is the headline; ticking *Chargeable* in the panel switches it to a normal
  payable invoice and the avoided figure disappears.
- Printing collapses the page to true A4 (`@page { size: A4; margin: 0 }`),
  hides the surrounding chrome via `.no-print`, and releases the scroll frame.

## Where to look

| Surface | URL / path |
|---|---|
| Brand book | `/brand` (also **Brand Book** in the enterprise shell) |
| Invoice | `/invoice` (also **Invoice** in the enterprise shell) |
| Editorial design system | `/design` (now cross-links to both) |
| Tests | `src/__tests__/lib/brand-system.test.ts` — 45 assertions |

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` scoped to brand files | 0 errors |
| `npx vitest run src/__tests__/lib/brand-system.test.ts` | 45 passed |
| Full suite | 602 passed; 2 pre-existing storage-test failures unchanged |
| `GET /brand`, `/invoice`, `/design`, `/` | 200 (dev server) |
| SVG assets | 200, `image/svg+xml` |
| Invoice document SSR | contains the address, phone, “Cost avoided”, invoice number |

## One asset not recreated

The 3D robot mascot printed on the guideline sheet is raster artwork and is not
reproduced here — recreating a 3D character as vector would misrepresent it.
If that image is re-uploaded, it can be dropped in at
`public/brand/alo-mascot.png` and placed on `/brand` in a single line.

Note: the uploaded files themselves did not reach the sandbox filesystem, so the
lockups here are **vector recreations built to the geometry, colours and
typography stated on the guideline sheet** (hexagon proportions, #FF6A00 shell,
blue gradient legs, orange bar, Inter/Poppins). They are pixel-independent and
print-safe. To use the original AI-generated artwork verbatim instead, drop the
files into `public/brand/` and swap the `Mark` component's SVG for an `<img>` —
one line per surface.

### Addendum 2 — the designs used on the website, and delivering the pad

- **Public website at `/site`** (`src/components/site/marketing-site.tsx`): hero with the headline statistics, the system flow, the agent specification cards, the mobile command centre (blue theme), the five departments, the four domains, the letterhead contact strip as page cards, and a dark-ground footer. Previewed in the shell under Marketing & Design → Public Site.
- **Portable letterhead** (`src/lib/brand/invoice-html.ts`): the invoice renders as one self-contained HTML document (tables + inline styles only, inline SVG mark) — used by *Download as HTML* on `/invoice` and by *Send by email* in the Invoice panel.
- **Sending** goes through the deployment's own mail accounts (`GET /api/email/accounts`, `POST /api/email/send`) — no third-party mail service — with a plain-text alternative part and the message recorded in the email log.
