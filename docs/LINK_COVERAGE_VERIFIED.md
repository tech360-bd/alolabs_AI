# Link coverage — verified against the working tree

**Generated:** 2026-10-26T06:49:55.596Z
**Mode:** live (root: `/home/user/alolabs_AI`)
**Inventory:** 929 files under `src/`, 50 under `docs/`

**45 links** · 1 implemented · 20 in-kind · 3 reference · 11 gap · 10 N/A
**Evidence:** 162/162 paths found on disk · 0 missing · 0 unverifiable

## Categories

| Category | Links | Gaps |
|---|---|---|
| AI & models | 4 | 0 |
| Business operations | 5 | 2 |
| Chat & messaging | 8 | 0 |
| Design systems | 1 | 0 |
| Developer tooling | 3 | 2 |
| Education | 4 | 0 |
| Media & creation | 3 | 0 |
| Monitoring & ops | 1 | 0 |
| Reference & content | 1 | 0 |
| Research & science | 5 | 3 |
| Social & publishing | 1 | 0 |
| Voice, calls & SMS | 9 | 4 |

## Every link

| Link | Verdict | Files | Evidence (first three) | Missing |
|---|---|---|---|---|
| https://buffer.com | in_kind | 9/9 | `src/lib/social/index.ts`<br>`src/lib/social/facebook.ts`<br>`src/lib/social/linkedin.ts` | — |
| https://openrouter.ai | implemented | 8/8 | `src/lib/ai-router/openrouter-provider.ts`<br>`src/lib/ai-router/index.ts`<br>`src/lib/ai-router/free-models.ts` | — |
| https://coder.qwen.ai | reference | 3/3 | `src/lib/ai-router/qwen-provider.ts`<br>`src/components/panels/model-hub-panel.tsx`<br>`src/lib/open-source-models.ts` | — |
| https://cline.bot | in_kind | 5/5 | `src/lib/command-agent/free-catalog.ts`<br>`src/app/api/command-agent/chat/route.ts`<br>`src/lib/agent-runtime/tool-loop.ts` | — |
| https://github.com/cline/cline.git | in_kind | 6/6 | `src/lib/agent-runtime/index.ts`<br>`src/lib/agent-runtime/scheduler.ts`<br>`src/lib/tools/index.ts` | — |
| https://github.com/cometchat | in_kind | 5/5 | `src/app/api/super-chat/route.ts`<br>`src/app/api/enterprise/conversations/route.ts`<br>`src/lib/realtime/server.ts` | — |
| https://github.com/cometchat/cometchat-skills.git | in_kind | 5/5 | `src/app/api/skills/route.ts`<br>`src/app/api/skill-factory/build/route.ts`<br>`src/app/api/skill-permissions/route.ts` | — |
| https://github.com/cometchat/docs-mcp.git | in_kind | 4/4 | `src/app/api/mcp-servers/route.ts`<br>`src/components/panels/mcp-manager-panel.tsx`<br>`docs/AGENTOS_GUIDE.md` | — |
| https://github.com/cometchat/cometchat-uikit-react.git | in_kind | 3/3 | `src/components/panels/super-commanding-chat.tsx`<br>`src/app/api/super-chat/route.ts`<br>`src/components/ui/scroll-area.tsx` | — |
| https://github.com/cometchat/cometchat-uikit-android.git | not_applicable | 2/2 | `src/components/agent-hub-shell.tsx`<br>`package.json` | — |
| https://github.com/cometchat/cometchat-uikit-ios.git | not_applicable | 2/2 | `src/components/agent-hub-shell.tsx`<br>`package.json` | — |
| https://github.com/cometchat/cometchat-uikit-react-native.git | not_applicable | 2/2 | `src/components/agent-hub-shell.tsx`<br>`public/manifest.json` | — |
| https://github.com/ketanyekale/android-java-chat-app.git | not_applicable | 2/2 | `src/components/agent-hub-shell.tsx`<br>`package.json` | — |
| https://github.com/BelledonneCommunications/linphone-iphone.git | not_applicable | 2/2 | `src/app/api/voice-system/route.ts`<br>`src/components/panels/voice-system-panel.tsx` | — |
| https://github.com/developerspace-samples/VoIP-Call-Sample.git | not_applicable | 2/2 | `src/app/api/meetings/route.ts`<br>`src/components/panels/meetings-panel.tsx` | — |
| https://github.com/developerspace-samples/WebRTC-Kotlin-Sample.git | not_applicable | 2/2 | `src/app/api/meetings/route.ts`<br>`src/app/api/video-studio/transcribe/route.ts` | — |
| https://github.com/domovinatv/sms.domovina.ai.git | in_kind | 3/3 | `src/app/api/sms/route.ts`<br>`src/components/panels/sms-panel.tsx`<br>`src/lib/email/index.ts` | — |
| https://github.com/CALLE-AI/awesome-phone-call-agents.git | gap | 3/3 | `src/lib/agent-runtime/scheduler.ts`<br>`src/lib/cron-jobs.ts`<br>`src/app/api/skills/route.ts` | — |
| https://github.com/amulchapla/AI-Powered-Call-Center-Intelligence.git | gap | 3/3 | `src/app/api/video-studio/transcribe/route.ts`<br>`src/lib/qc/index.ts`<br>`src/app/api/meetings/route.ts` | — |
| https://github.com/rasonyang/ai-native-callcenter.git | gap | 2/2 | `src/components/panels/super-admin-command-center.tsx`<br>`src/lib/agent-runtime/index.ts` | — |
| https://github.com/microsoft/call-center-ai.git | gap | 2/2 | `src/app/api/runs/route.ts`<br>`src/app/api/webhooks/route.ts` | — |
| https://github.com/video-db/call.md.git | in_kind | 4/4 | `src/app/api/meetings/route.ts`<br>`src/components/panels/meetings-panel.tsx`<br>`src/app/api/video-studio/transcribe/route.ts` | — |
| https://github.com/xiaochong/hi-kid.git | in_kind | 4/4 | `src/app/api/education-hub/route.ts`<br>`src/components/panels/education-hub-panel.tsx`<br>`src/app/api/interview-hub/route.ts` | — |
| https://github.com/TheExplainthis/ChatGPT-AI-English-Tutor.git | in_kind | 3/3 | `src/app/api/education-hub/route.ts`<br>`src/app/api/super-chat/route.ts`<br>`src/app/api/interview-hub/route.ts` | — |
| https://github.com/xckevin/magic-english-buddy.git | in_kind | 3/3 | `src/components/panels/document-system-panel.tsx`<br>`src/app/api/rag/ingest/route.ts`<br>`src/components/panels/voice-system-panel.tsx` | — |
| https://github.com/graykode/toeicbert.git | not_applicable | 2/2 | `src/lib/model-registry.ts`<br>`src/components/panels/model-hub-panel.tsx` | — |
| https://www.mureka.ai | in_kind | 4/4 | `src/app/api/music-studio/generate/route.ts`<br>`src/app/api/music-studio/tracks/route.ts`<br>`src/lib/media-generation/index.ts` | — |
| https://supercool.com | in_kind | 5/5 | `src/app/api/image-studio/generate/route.ts`<br>`src/app/api/video-studio/transcribe/route.ts`<br>`src/app/api/music-studio/generate/route.ts` | — |
| https://join.supercool.com | in_kind | 3/3 | `src/app/api/video-hub/route.ts`<br>`src/components/panels/video-hub-panel.tsx`<br>`src/app/api/avatar-voice/generate-voice/route.ts` | — |
| https://astryx.atmeta.com | in_kind | 5/5 | `src/components/ui/button.tsx`<br>`src/components/ui/card.tsx`<br>`src/app/design/page.tsx` | — |
| https://www.enerpize.com | gap | 4/4 | `src/app/api/billing/invoices/route.ts`<br>`src/app/api/billing/plans/route.ts`<br>`src/app/api/billing/payments/route.ts` | — |
| https://www.aipraktor.com | in_kind | 6/6 | `src/lib/whatsapp/ai-handler.ts`<br>`src/app/api/whatsapp/inbox/route.ts`<br>`src/app/api/whatsapp/webhook/route.ts` | — |
| https://www.larksuite.com | in_kind | 6/6 | `src/app/api/documents/route.ts`<br>`src/app/api/approvals/route.ts`<br>`src/app/api/tasks/route.ts` | — |
| https://hatchable.com | in_kind | 4/4 | `src/app/api/mcp-servers/route.ts`<br>`src/app/api/projects/route.ts`<br>`src/app/api/deploy/route.ts` | — |
| https://www.refine.ink | gap | 4/4 | `src/app/api/documents/route.ts`<br>`src/lib/qc/index.ts`<br>`src/app/api/rag/query/route.ts` | — |
| https://hetrixtools.com | in_kind | 7/7 | `monitoring/prometheus/prometheus.yml`<br>`monitoring/grafana`<br>`monitoring/alertmanager` | — |
| https://platform.mat3ra.com | not_applicable | 2/2 | `src/lib/agent-runtime/index.ts`<br>`src/lib/job-queue.ts` | — |
| https://mat3ra.com | not_applicable | 2/2 | `src/lib/job-queue.ts`<br>`src/components/panels/queue-panel.tsx` | — |
| https://github.com/ioi-labs/molx.git | gap | 3/3 | `src/app/api/rag/ingest/route.ts`<br>`src/app/api/research-hub/route.ts`<br>`src/lib/rag-engine.ts` | — |
| https://github.com/nikmcfly/MiroFish-Offline.git | gap | 3/3 | `src/lib/multi-agent-orchestrator/index.ts`<br>`src/lib/ai-router/ollama-provider.ts`<br>`src/lib/memory/index.ts` | — |
| https://github.com/PennyroyalTea/gibberlink.git | gap | 3/3 | `src/lib/event-bus/index.ts`<br>`src/lib/realtime/server.ts`<br>`src/lib/multi-agent-orchestrator/index.ts` | — |
| https://github.com/iamakshayshar/AITestCaseGenerator.git | gap | 3/3 | `src/app/api/quality/route.ts`<br>`src/app/api/evaluations/route.ts`<br>`src/lib/qc/index.ts` | — |
| https://github.com/monkscode/Natural-Language-to-Robot-Framework.git | gap | 2/2 | `src/app/api/quality/route.ts`<br>`src/app/api/automation` | — |
| https://github.com/mattpocock/dictionary-of-ai-coding.git | reference | 3/3 | `AI_AGENT_GUIDE.md`<br>`ARCHITECTURE.md`<br>`DEVELOPER_GUIDE.md` | — |
| https://stackoverflow.com | reference | 2/2 | `src/app/api/rag/ingest/route.ts`<br>`src/app/api/research-hub/route.ts` | — |

## Action items (11)

- **https://github.com/CALLE-AI/awesome-phone-call-agents.git** — Needs a telephony adapter (Twilio/SIP trunk) plus an outbound-call job type before any skill pack applies.
- **https://github.com/amulchapla/AI-Powered-Call-Center-Intelligence.git** — Missing: call transcript persistence, sentiment/key-phrase scoring and a call-analytics view.
- **https://github.com/rasonyang/ai-native-callcenter.git** — Requires FreeSWITCH/Asterisk + a SIP trunk and a realtime audio bridge; out of scope until telephony is a product decision.
- **https://github.com/microsoft/call-center-ai.git** — Needs an outbound telephony provider behind a `POST /api/calls` route with a call record model.
- **https://www.enerpize.com** — A real ERP would need ledger/journal models, inventory with stock movements, and payroll — none of which exist in prisma/schema.prisma. Do not claim ERP parity.
- **https://www.refine.ink** — Would need a fan-out review job (N parallel critics over one document) plus a consolidated feedback artifact and claim/table cross-checking.
- **https://github.com/ioi-labs/molx.git** — Needs a fetch→clean→markdown step (with robots/rate limits and SSRF protection) in front of /api/rag/ingest.
- **https://github.com/nikmcfly/MiroFish-Offline.git** — Missing a simulation loop (N personas × T rounds), a graph store, and an outcome/forecast report.
- **https://github.com/PennyroyalTea/gibberlink.git** — Agent-to-agent discovery/negotiation is only an idea in enterprise-roadmap.ts; no wire protocol or capability handshake is implemented.
- **https://github.com/iamakshayshar/AITestCaseGenerator.git** — Needs a generate-tests job type (requirement → test file) with a sandboxed run to validate the output. pytest and Robot Framework both fit the same job.
- **https://github.com/monkscode/Natural-Language-to-Robot-Framework.git** — Same job type as the row above: NL → test artefact, with a runner and a stored result.
