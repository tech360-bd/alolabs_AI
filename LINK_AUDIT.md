# Link audit — 56 repositories and 13 sites

**Date:** 2026-10-18 · **Branch:** `arena/8cc412a3-alolabs-ai`
**Scope:** every link in the newest list, one row each, with a verdict and the evidence behind it.
**Companion documents:** `docs/MEDIA_GENERATION.md` (this pass's implementation), `docs/LINK-STATUS.md` (older diagram audit), `WORKFLOW_DEFINITIONS_CHECK.md`.

## How each link was checked

- **Repositories:** metadata via `gh api repos/<owner>/<repo>` (stars, language, archive flag) and the README via `gh api repos/<owner>/<repo>/readme`, all 56 fetched. Where the repo mapped onto an existing subsystem, the subsystem's routes and library files were opened and checked line by line.
- **Sites:** fetched and read (enerpize, aipraktor, supercool, coder.qwen.ai, mureka, astryx). Sites that are well-known infrastructure/products were classified from their published purpose.
- **Verdicts** mean exactly this:

| Verdict | Meaning |
|---|---|
| **Implemented** | The element exists in this repo and is exercised by code or tests added/verified in this pass. |
| **In-kind** | An equivalent subsystem already exists here; the upstream code was not copied. |
| **Reference** | Useful as a design or feature reference; porting it would duplicate a product this repo is not building. |
| **N/A** | Cannot apply here: model weights, a native mobile/OS/hardware component, an empty repo, or content-only material. |
| **Gap** | Concrete, implementable, and not implemented. Listed again in §4 with the exact next step. |

---

## 1. Repositories (56)

### 1.1 Tooling, design and context

| # | Repository | Element worth taking | Verdict | Evidence / remaining gap |
|---|---|---|---|---|
| 1 | `ToolJet/ToolJet` | Prompt-to-internal-app builder over databases/APIs; agents build against component + data contracts; MCP server. | Reference | `src/app/api/mcp-servers` and `workflow-factory` cover the agent/MCP half. A page builder is a separate product surface; not built. |
| 2 | `huggingface/education-toolkit` | University tutorials (Hub, Gradio, Transformers, Diffusers). Repo is **archived**. | Reference | Content, not software. The LMS equivalent is `/api/education-hub` (courses, assignments, exams, speaking). |
| 3 | `omacom/omarchy` | Arch/Hyprland distribution and manual. | N/A | OS distribution; nothing to port into a Next.js app. |
| 4 | `cathrynlavery/diagram-design` | 44 diagram types, editorial style guide (paper/ink/accent, no shadows), 87 icons, Mermaid/Draw.io/Excalidraw import, animation, taste audit. | **Implemented** | `src/lib/diagram-design/{tokens,scene,render,audit,export}.ts`, `src/components/diagrams/*`, editorial button variants in `src/components/ui/button.tsx`, `/design` living spec, tests in `__tests__/lib/diagram-design-and-marketing-kit.test.ts` and `diagram-motion-import.test.ts`. |
| 5 | `cursor/plugins` | Plugin manifest and official plugin set for an agent IDE. | Reference | `src/app/api/marketplace`, `/api/skills` provide a registry. The Cursor plugin format is editor-specific; not adopted. |
| 6 | `AprilNEA/OpenLogi` | Rust/GPUI Logitech Options+ replacement, TOML config, CLI. | N/A | Hardware driver for mice/keyboards; outside this product. |
| 7 | `volcengine/OpenViking` | "Context database": agent memory + knowledge RAG + skills in one store. | In-kind | `/api/memory`, `/api/agent-memory`, `/api/rag` (9 routes), `/api/skills`, `src/lib/agent-memory`. Not a port; the same three capabilities exist. |

### 1.2 Video generation, editing and production

| # | Repository | Element worth taking | Verdict | Evidence / remaining gap |
|---|---|---|---|---|
| 8 | `elebumm/RedditVideoMakerBot` | Post → script → TTS → subtitles → ffmpeg short, unattended. | **Gap** | Media generation exists now; the ffmpeg assembly + subtitle burn-in pipeline does not. |
| 9 | `Lightricks/LTX-Video` | DiT video model (weights, ComfyUI integration). | N/A | Model weights. Reachable through `MEDIA_VIDEO_ENDPOINT`. |
| 10 | `YaoFANGUK/video-subtitle-remover` | Hard-subtitle removal by inpainting. | N/A | CV model; no inference runtime in this app. |
| 11 | `leandromoreira/digital_video_introduction` | Video engineering reference (codecs, streaming). | Reference | Documentation only; nothing to execute. |
| 12 | `OpenTalker/video-retalking` | Audio-driven lip-sync for talking heads. | N/A | Model pipeline. |
| 13 | `meituan-longcat/LongCat-Video` | 13B long-duration video model. | N/A | Model weights; endpoint integration only. |
| 14 | `0voice/audio_video_streaming` | Curated AV/WebRTC learning index. | Reference | Link collection. |
| 15 | `HITsz-TMG/VideoClaw` | "AI creative video employee": script → storyboard → render. | Reference | `/api/video-hub` stores projects, avatars, subtitles and presenters; a storyboard agent is not built. |
| 16 | `jitsi/jitsi-videobridge` | WebRTC selective forwarding unit. | N/A | Server infrastructure. `/api/meetings` schedules meetings; no SFU is embedded. |
| 17 | `HKUDS/VideoAgent` | Understanding + editing + generation agent over video. | Reference | Would need video indexing (frames/ASR); not present. |
| 18 | `LoSealL/VideoSuperResolution` | TensorFlow super-resolution architectures. | N/A | Model weights. |
| 19 | `Augani/openreel-video` | Browser/desktop non-linear editor: timeline, captions, audio mix. | Reference | No timeline editor; video work here is job-based, not frame-based. |
| 20 | `Kosinkadink/ComfyUI-VideoHelperSuite` | ComfyUI video I/O nodes (load/combine/batch). | N/A | ComfyUI-specific nodes. |
| 21 | `dunossauro/videomaker-helper` | Silence detection, loudness equalisation, audio extraction, auto-cut. | **Gap** | Needs an ffmpeg/ffprobe worker; no media worker exists. |
| 22 | `burhankocabiyik/videomaker` | Image-anchored vs text-to-video scene editor (Seedance t2v). | Reference | The new `/api/image-studio` + `/api/video-studio` endpoints supply both primitives; the scene editor does not exist. |
| 23 | `wtz2017/VideoMaker` | Android OpenGL ES/MediaCodec recorder + RTMP. | N/A | Native Android. |
| 24 | `viniciusenari/slideshow-videomaker` | Images + audio → slideshow (MoviePy). | **Gap** | Same ffmpeg assembly gap as #8. |
| 25 | `WuTao-CS/VideoMaker` | Research talking-head pipeline. | N/A | Model pipeline. |
| 26 | `shubhamdevhouse/Animated-VideoMaker` | ImageMagick frame-by-frame text animation (2018). | N/A | Superseded toolchain; runs only on a desktop with ImageMagick. |
| 27 | `seed0001/videoMaker` | Prompt list → script → images → Kokoro TTS → ffmpeg → YouTube, with **review/approve gate**. | **Gap** | Media generation (`/api/media/generate`) and approvals (`/api/approvals`) now exist; script orchestration, ffmpeg assembly and YouTube upload do not. |
| 28 | `Bilal-Belli/videoMakerBOT` | MoviePy + Telegram bot. | N/A | Desktop/Telegram-specific. |
| 29 | `Nncstudio/VideoMakerPro` | Repository contains only a title. | N/A | No content to port. |

### 1.3 Email, agents and content libraries

| # | Repository | Element worth taking | Verdict | Evidence / remaining gap |
|---|---|---|---|---|
| 30 | `mohamed11sk/Email-markting` | PHP email marketing: SMTP, templates, campaigns, open-rate pixel. | In-kind | `/api/email/send`, `/api/email/templates`, `/api/email/inbox`, `/api/email/sync`. Open tracking is now real: HMAC token + `/api/email/track/open/[token]` + AuditLog (`src/lib/email/tracking.ts`, `tracking-store.ts`). |
| 31 | `knsoftic/Email_Markting` | Laravel multi-tenant email + real mailbox + A/B tests. | In-kind | Email accounts and inbox are tenant-scoped; A/B split testing is not implemented. |
| 32 | `FoundationAgents/MetaGPT` | SOP-driven multi-agent "software company" with role hand-offs. | In-kind | 40 agents, 17 departments, 109 instructions, workflow definitions + routing (`WORKFLOW_DEFINITIONS_CHECK.md`). |
| 33 | `songguoxs/gpt4o-image-prompts` | Structured prompt gallery (Markdown → `prompts.json`). | Reference | Media Studio takes free prompts; no curated gallery is bundled. |
| 34 | `ramon-victor/freegpt-webui` | UI over `gpt4free`. **Archived** and relies on unauthorised endpoints. | N/A | Not adoptable for licensing/ToS reasons. |

### 1.4 Agents, models and developer tooling

| # | Repository | Element worth taking | Verdict | Evidence / remaining gap |
|---|---|---|---|---|
| 35 | `Lin-jun-xiang/docGPT-langchain` | Chat with PDF/DOCX/CSV/TXT and document URLs. | In-kind | `/api/rag` (ingest/query) + `/api/documents` provide retrieval over uploaded documents. |
| 36 | `teremterem/claude-code-gpt-5-codex` | LiteLLM proxy to run Claude Code against GPT-5. | Reference | `src/lib/ai-router` already abstracts providers; a CLI shim is out of scope. |
| 37 | `GetGoAPI/Free-GPT-Grok-Gemini-Claude-API` | Paid model reseller (OKRouter). | N/A | Third-party paid service; not a code element. |
| 38 | `zai-org/GLM-5` | GLM-5 family, 1M context, configurable thinking effort. | In-kind | `src/lib/ai-router/zai-provider.ts` + model hub. Access depends on `ZAI_API_KEY`. |
| 39 | `GAIR-NLP/LiveTalk` | Real-time audio-driven avatar (24.8 FPS, 4-step distillation). | N/A | Model weights + GPU serving. |
| 40 | `tinystruct/smalltalk` | IM + ChatGPT over CLI/web. | Reference | `/api/super-chat` + `/api/notifications` cover chat; no standalone IM installer. |
| 41 | `ArnasDon/wacrm` | WhatsApp CRM: **shared inbox**, contacts, Kanban pipelines, broadcasts, no-code automations. | **Implemented** | Shared inbox built on the previously unused `Conversation`/`ConversationMessage` models: webhook persistence, `/api/whatsapp/inbox` (list, search, unread), `/api/whatsapp/inbox/[id]` (thread, reply via the owning number, read receipt). CRM pipelines/broadcasts already existed. |
| 42 | `nwuzmedoutlook/university` | Chinese university course-link index. | N/A | Content aggregation. |
| 43 | `bugcrowd/bugcrowd_university` | Security-training modules. | Reference | Education hub can host courses; the content is third-party. |
| 44 | `WEIFENG2333/VideoCaptioner` | ASR → subtitle optimisation → translation → burn-in; CLI + GUI. | In-kind | ASR + SRT/VTT implemented through the OpenAI-compatible transcription contract: `src/lib/media-generation/transcribe.ts`, `POST /api/video-studio/transcribe`, attached to Video Hub subtitle records. Translation and burn-in still need an ffmpeg worker. |
| 45 | `ATH-MaaS/Pixelle-Video` | End-to-end automatic short-video engine. | **Gap** | Same assembly/ASR gap. |
| 46 | `remotion-dev/remotion` | Programmatic React video + server-side render. | Reference | A render worker would be a new subsystem; the provider-based `/api/video-studio` covers generation, not composition. |
| 47 | `MarkTechStation/VideoCode` | Tutorial sample code for a Chinese video channel. | N/A | Sample snippets, no product element. |
| 48 | `3b1b/videos` | Manim scenes for 3Blue1Brown. | N/A | Content/animation source. |
| 49 | `ytdl-org/youtube-dl` | Site extractors and downloader. | N/A | Not embedded: licensing/ToS and a Python runtime. |
| 50 | `bradautomates/claude-video` | `/watch` skill: sample frames and feed them to Claude/Codex. | Reference | Frame extraction needs ffmpeg; the idea maps to the same worker gap as #21/#44. |
| 51 | `MeiGen-AI/InfiniteTalk` | Sparse-frame audio-driven dubbing. | N/A | Model weights. |
| 52 | `qdrzwd/VideoRecorder` | Android recorder demo (MediaRecorder, pause/resume). | N/A | Native Android. |
| 53 | `zai-org/CogVideo` | CogVideoX text/image-to-video. | N/A | Model weights; endpoint integration only. |
| 54 | `Tencent-Hunyuan/HunyuanVideo` | 13B open video model. | N/A | Model weights; endpoint integration only. |
| 55 | `cline/cline` | Coding agent as CLI, VS Code/JetBrains extension, SDK. | Reference | Agent runtime is server-side; no IDE extension or terminal agent. |
| 56 | `meta-models/meta-model-cookbook` | Recipes for an OpenAI/Anthropic-SDK-compatible model API. | In-kind | `src/lib/ai-gateway` + `ai-router` are OpenAI-compatible; adding the provider key is sufficient. |

**Repository totals:** Implemented **2** (#4, #41) · In-kind **8** (#7, 30, 31, 32, 35, 38, 44, 56) · Reference **16** (#1, 2, 5, 11, 14, 15, 17, 19, 22, 33, 36, 40, 43, 46, 50, 55) · N/A **25** (#3, 6, 9, 10, 12, 13, 16, 18, 20, 23, 25, 26, 28, 29, 34, 37, 39, 42, 47, 48, 49, 51, 52, 53, 54) · Gap **5** (#8, 21, 24, 27, 45). 2 + 8 + 16 + 25 + 5 = **56**.

---

## 2. Sites (13)

| # | Site | What it is | Element worth taking | Verdict |
|---|---|---|---|---|
| 1 | `enerpize.com` | Cloud ERP: sales/POS, accounting, inventory, HRM/payroll, CRM, projects. | Module navigation, industry presets, client follow-up. | Reference — this repo is an agent workforce, not an ERP; no accounting/POS ledger is being added. |
| 2 | `aipraktor.com` | Bangladeshi Messenger/Instagram/WhatsApp sales agent: catalog, image recognition, order capture, Steadfast/Pathao tracking, review requests, voice notes. | Conversation-to-order flow and courier status messages. | Reference — WhatsApp/CRM messaging exists, but there is no catalog/order/courier model. Recorded as a product gap, not silently claimed. |
| 3 | `supercool.com` | "Humanoid" assistant: face, voice, joins meetings, controls the desktop, builds artifacts, memory. | Voice-first agent with persistent memory and meeting presence. | Reference — `/api/super-chat`, `/api/meetings`, memory and the new voice generation cover parts; desktop control and live avatar do not exist. |
| 4 | `join.supercool.com` | Signup/onboarding for the same product. | Onboarding funnel. | Reference — no separate signup product surface. |
| 5 | `buffer.com` | Social publishing and analytics. | Scheduling, queue, per-channel analytics. | In-kind — `/api/social/{accounts,publish,analytics,oauth,webhooks}`; `scheduledAt` is validated and queued. |
| 6 | `coder.qwen.ai` | Prompt-to-web-app with GitHub export. | Generated app + export to a repository. | Reference — no code sandbox or GitHub export pipeline. |
| 7 | `stackoverflow.com` | Developer Q&A. | — | N/A — external knowledge source, not a feature. |
| 8 | `mureka.ai` | AI music generator: prompt, genre, mood, tempo, instrumentation, lyrics, stems. | Music job contract with musical controls. | **Implemented (provider contract)** — `MEDIA_MUSIC_*` endpoints plus `genre`, `mood`, `tempo` (20–300), `instrumental`, `lyrics` in `buildMusicRequest`. Stem separation is not implemented. |
| 9 | `astryx.atmeta.com` | Meta's open design system: React 19 + StyleX, 180+ components, themes, agent-ready CLI/MCP. | Token-driven theming, editorial component variants, agent-readable component docs. | Reference — this repo uses shadcn/ui plus the editorial tokens from the diagram-design link; adopting StyleX would be a rewrite with no product gain. |
| 10 | `cline.bot` | Marketing site for the Cline coding agent. | — | Reference — covered by #55. |
| 11 | `openrouter.ai` | Multi-provider model gateway. | Provider catalogue, fallbacks, per-model routing. | In-kind — `src/lib/ai-router/openrouter-provider.ts`, model hub, gateway fallbacks. |
| 12 | `openrouter.ai/blog/tutorials/build-tool-calling-agent-loop` | Tutorial: implement the tool-call loop. | `tool_calls` handling, tool result round-trip. | In-kind — `tool_calls` normalised in the OpenAI-compatible, DeepSeek, Groq, Mistral, Qwen and Z.AI providers; `tool-runs` / `tools` routes persist executions. |
| 13 | `developer.meta.com/ai` | Meta AI developer documentation. | Model API usage patterns. | Reference — the gateway is already OpenAI-compatible; no Meta-specific SDK is embedded. |

---

## 3. What was implemented in this pass

The media/studio surface was the largest verifiable gap: four pages called endpoints that did not exist (`/api/image-studio/generate`, `/api/music-studio/*`, `/api/video-studio/*`, `/api/avatar-voice/*`) and the Media Studio panel was a static empty state.

### 3.1 New backend

| Path | Purpose |
|---|---|
| `src/lib/media-generation/requests.ts` | Pure configuration, request builders, validation (no DB/storage imports). |
| `src/lib/media-generation/index.ts` | Job persistence (`media:job:*` in Settings), asset registration (`media:file:*`), provider calls, async refresh. |
| `src/app/api/media/generate/route.ts` | `POST` all four kinds; `GET` recent jobs. 503 with the exact missing variable when unconfigured. |
| `src/app/api/media/jobs/[id]/route.ts` | Job read + refresh for asynchronous providers. |
| `src/app/api/image-studio/generate/route.ts` | Image Studio. |
| `src/app/api/music-studio/generate/route.ts` | Music Studio submission + capability probe. |
| `src/app/api/music-studio/tracks/route.ts` | Paginated track list. |
| `src/app/api/video-studio/generate/route.ts` | Video Studio submission. |
| `src/app/api/video-studio/productions/route.ts` | Paginated production list. |
| `src/app/api/avatar-voice/generate-avatar/route.ts` | Avatar image, consent enforced. |
| `src/app/api/avatar-voice/generate-voice/route.ts` | Voice-over, consent enforced, style → `instructions`. |
| `src/app/api/avatar-voice/avatars/route.ts` | Paginated avatar list. |
| `src/app/api/uploads/route.ts` + `[id]/route.ts` | Project uploads: multipart POST, paginated GET, authorised DELETE (removes bytes and record). |
| `src/app/api/stats/route.ts` | Dashboard counters (agents, tasks, departments, commands, workflows, pending approvals). |
| `src/lib/whatsapp/{config,inbox}.ts` | Shared client resolution + `Conversation`/`ConversationMessage` persistence and inbox indexing. |
| `src/app/api/whatsapp/inbox/route.ts` + `[id]/route.ts` | Conversation list/search/unread; thread read; reply through the owning number; read receipt. |
| `src/lib/media-generation/transcribe.ts` + `src/app/api/video-studio/transcribe/route.ts` | Whisper-compatible transcription, SRT/VTT generation, optional attachment to a Video Hub project. |
| `src/lib/email/{tracking,tracking-store}.ts` + `src/app/api/email/track/open/[token]/route.ts` | HMAC-signed hosted pixel; durable open/delivery events in AuditLog. |
| `src/components/panels/media-studio-panel.tsx` | Replaced the 68-line stub with a working Image/Music/Video/Voice composer and recent-jobs list. |

Configuration is documented in `docs/MEDIA_GENERATION.md` and `.env.example` (`MEDIA_*`).

### 3.2 Deliberate design choices

- **No fake output.** Every unconfigured call throws `Configuration required: …` → HTTP 503. Synchronous and asynchronous provider contracts are both supported; an async job stays `processing` until the status endpoint reports a result.
- **Assets are real records.** Bytes go through the existing storage provider and appear in `/api/media`; remote URLs are marked `external: true` rather than downloaded silently.
- **Tenant isolation.** Jobs and uploads are scoped by `companyId`; cross-tenant reads return 404.
- **Consent.** Avatar and voice routes reject requests without `consent: true`, matching the existing UI switch.

### 3.3 Verification

| Check | Result |
|---|---|
| `vitest` (backup 13 + routing 8 + media 15 + tracking/transcript 9) | **45/45 pass** |
| esbuild parse of changed/new TS/TSX | **all pass** |
| Import resolution across `src` | **0 missing** (last full sweep, 828 files; new files add no unresolved imports) |
| Workflow definitions (`npm run check:workflows`) | 17 definitions, 0 errors, 27 single-word trigger warnings |
| Provider calls executed | **No** — sandbox has no Prisma client, no storage volume, no media credentials. The request/validation layer is unit-tested; the HTTP paths are parse-checked only. |

---

## 4. Gap register — implementable, not implemented

These are the only rows marked **Gap**. Each has an explicit next step; none is hidden behind a "done" label.

| Gap | Why it cannot be faked | Next step |
|---|---|---|
| Short-video assembly (#8, #24, #27, #45) | Requires ffmpeg to concatenate images/audio, burn subtitles and mux. A UI that claims to "render" without it would produce nothing. | Add a `media-worker` process (ffmpeg + ffprobe) and a `VideoRenderJob` queue; call it from `/api/video-studio`. |
| Audio analysis (#21, #50) | Silence detection and loudness need decoded audio. | Same worker: `ffprobe`/`silencedetect`/`loudnorm`, exposed as `/api/media/analyze`. |
| Catalog / orders / courier tracking (aipraktor) | Needs an order model and courier credentials (Steadfast/Pathao). | Product decision + schema; not started. |
| Subtitle translation and burn-in (#44) | Translation is a model call; burn-in is an ffmpeg mux. | Translation reuses the transcription provider; burn-in lands with the media worker above. |

Reference-only rows are not gaps: they describe products (ERP, IDE agents, OS distributions, model weights) that this repository is not.

---

## 5. Statement of completeness

- All **56** repositories appear exactly once in §1 with a verdict.
- All **13** sites appear in §2 with a verdict.
- Every **Implemented** row points at a file path; every **Gap** row is listed again in §4.
- Nothing in this document claims a provider call, render or transcription was executed in this sandbox. The limits are stated in §3.3.
