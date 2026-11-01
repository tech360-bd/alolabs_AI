import type { CoverageEntry } from './types';

/**
 * The reference list, one row per link, deduplicated.
 *
 * Rules this registry follows:
 *  1. Every evidence path is repository-relative and must exist on disk.
 *     `__tests__/lib/link-coverage.test.ts` fails the build if one does not.
 *  2. A verdict is a claim that can be disproved by opening a file. `gap` rows
 *     carry the next concrete step; they do not pretend to be done.
 *  3. `upstreamMeta` is copied from `gh api repos/<owner>/<repo>` on the check
 *     date — it is upstream fact, not a claim about this repo.
 *
 * Checked: 2026-10-26.
 */

const CHECKED = '2026-10-26';

export const LINK_COVERAGE: CoverageEntry[] = [
  // ─── Social, scheduling and publishing ────────────────────────────────────
  {
    id: 'buffer',
    url: 'https://buffer.com',
    kind: 'site',
    category: 'Social & publishing',
    upstream: 'Social media scheduling and publishing across X, LinkedIn, Instagram, Facebook, TikTok.',
    verdict: 'in_kind',
    claim:
      'This repo publishes and schedules to eleven networks itself: per-network providers, an OAuth flow, a publish endpoint, per-account analytics and a social tab in the super admin panel.',
    evidence: [
      { label: 'Social provider registry', path: 'src/lib/social/index.ts', kind: 'library' },
      { label: 'Facebook provider', path: 'src/lib/social/facebook.ts', kind: 'library' },
      { label: 'LinkedIn provider', path: 'src/lib/social/linkedin.ts', kind: 'library' },
      { label: 'Instagram provider', path: 'src/lib/social/instagram.ts', kind: 'library' },
      { label: 'Publish route', path: 'src/app/api/social/publish/route.ts', kind: 'route' },
      { label: 'Accounts route', path: 'src/app/api/social/accounts/route.ts', kind: 'route' },
      { label: 'Analytics route', path: 'src/app/api/social/analytics/route.ts', kind: 'route' },
      { label: 'OAuth route', path: 'src/app/api/social/oauth/[provider]/route.ts', kind: 'route' },
      { label: 'Super admin social tab', path: 'src/components/panels/super-admin-panel.tsx', kind: 'panel' },
    ],
    gap: 'No queue-based best-time scheduler (Buffer\'s core feature) and no external Buffer API adapter.',
    upstreamMeta: { checkedAt: CHECKED },
  },

  // ─── AI models, providers and coding agents ───────────────────────────────
  {
    id: 'openrouter',
    url: 'https://openrouter.ai',
    kind: 'site',
    category: 'AI & models',
    upstream: 'Multi-model API gateway with one key for hundreds of models.',
    verdict: 'implemented',
    claim:
      'An OpenRouter adapter exists in the router (chat, streaming, model listing, fallback), the provider is registered in the router index, and the super admin AI control plane manages providers, quotas and routing policies. Live calls require a key and are NOT VERIFIED here.',
    evidence: [
      { label: 'OpenRouter adapter', path: 'src/lib/ai-router/openrouter-provider.ts', kind: 'library' },
      { label: 'Router index and fallback', path: 'src/lib/ai-router/index.ts', kind: 'library' },
      { label: 'Free-model catalogue', path: 'src/lib/ai-router/free-models.ts', kind: 'library' },
      { label: 'Provider catalogue', path: 'src/lib/ai-provider-catalog.ts', kind: 'library' },
      { label: 'Super admin AI control plane', path: 'src/components/enterprise/panels/super-admin-ai-control-plane.tsx', kind: 'panel' },
      { label: 'Provider admin route', path: 'src/app/api/super-admin/ai/providers/route.ts', kind: 'route' },
      { label: 'Provider test route', path: 'src/app/api/super-admin/ai/providers/[id]/test/route.ts', kind: 'route' },
      { label: 'Usage aggregation route', path: 'src/app/api/super-admin/ai/usage/route.ts', kind: 'route' },
    ],
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'coder-qwen',
    url: 'https://coder.qwen.ai',
    kind: 'site',
    category: 'AI & models',
    upstream: 'Hosted Qwen coding assistant / cloud coding surface.',
    verdict: 'reference',
    claim:
      'Qwen is reachable as a model provider through this repo\'s router, but the hosted cloud-IDE product is not something this codebase hosts or embeds.',
    evidence: [
      { label: 'Qwen provider adapter', path: 'src/lib/ai-router/qwen-provider.ts', kind: 'library' },
      { label: 'Model hub panel', path: 'src/components/panels/model-hub-panel.tsx', kind: 'panel' },
      { label: 'Open-source model catalogue', path: 'src/lib/open-source-models.ts', kind: 'library' },
    ],
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'cline-site',
    url: 'https://cline.bot',
    kind: 'site',
    category: 'AI & models',
    upstream: 'Autonomous coding agent (IDE extension, CLI and SDK).',
    verdict: 'in_kind',
    claim:
      'This repo has its own tool-calling agent loop (the Command Agent) plus a full agent runtime with tools, approvals and run history. It is not a drop-in Cline replacement and does not ship an IDE extension.',
    evidence: [
      { label: 'Command agent tool loop', path: 'src/lib/command-agent/free-catalog.ts', kind: 'library' },
      { label: 'Command agent route', path: 'src/app/api/command-agent/chat/route.ts', kind: 'route' },
      { label: 'Agent runtime', path: 'src/lib/agent-runtime/tool-loop.ts', kind: 'library' },
      { label: 'Agent runs route', path: 'src/app/api/agent-runs/[taskId]/route.ts', kind: 'route' },
      { label: 'Super admin command center', path: 'src/components/panels/super-admin-command-center.tsx', kind: 'panel' },
    ],
    gap: 'No editor extension and no repository-editing sandbox (file write + diff loop).',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'cline-repo',
    url: 'https://github.com/cline/cline.git',
    kind: 'repository',
    category: 'AI & models',
    upstream: 'Cline — autonomous coding agent as an SDK, IDE extension and CLI (TypeScript, ~70.9k stars).',
    verdict: 'in_kind',
    claim:
      'Agent execution, tool permissioning and streaming run events exist here. The upstream SDK/editor surface was reviewed for the contract, not copied.',
    evidence: [
      { label: 'Agent runtime entry', path: 'src/lib/agent-runtime/index.ts', kind: 'library' },
      { label: 'Scheduler', path: 'src/lib/agent-runtime/scheduler.ts', kind: 'library' },
      { label: 'Tool registry', path: 'src/lib/tools/index.ts', kind: 'library' },
      { label: 'Tool runs route', path: 'src/app/api/tool-runs/route.ts', kind: 'route' },
      { label: 'Agent permissions route', path: 'src/app/api/agent-permissions/route.ts', kind: 'route' },
      { label: 'SSE run events', path: 'src/app/api/runs/[id]/events/route.ts', kind: 'route' },
    ],
    gap: 'No plan/act editing loop against a repository checkout, no diff-apply tool.',
    upstreamMeta: { stars: 70854, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },

  // ─── Chat, messaging and agent skills ─────────────────────────────────────
  {
    id: 'cometchat-org',
    url: 'https://github.com/cometchat',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'CometChat organisation: chat, voice and video SDKs plus UI kits for web and mobile.',
    verdict: 'in_kind',
    claim:
      'In-app chat exists here as first-class product surface: a super chat route, enterprise conversations, a realtime server, and a WhatsApp inbox — all backed by this repo\'s own database rather than a third-party SDK.',
    evidence: [
      { label: 'Super chat route', path: 'src/app/api/super-chat/route.ts', kind: 'route' },
      { label: 'Enterprise conversations', path: 'src/app/api/enterprise/conversations/route.ts', kind: 'route' },
      { label: 'Realtime server', path: 'src/lib/realtime/server.ts', kind: 'library' },
      { label: 'Commanding chat panel', path: 'src/components/panels/super-commanding-chat.tsx', kind: 'panel' },
      { label: 'Chat conversation model', path: 'prisma/schema.prisma', kind: 'schema' },
    ],
    gap: 'No CometChat adapter, no call signalling over WebRTC, no third-party moderation API.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'cometchat-skills',
    url: 'https://github.com/cometchat/cometchat-skills.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'Agent skill pack that teaches coding agents to add CometChat messaging and calls to a project.',
    verdict: 'in_kind',
    claim:
      'This repo has a skill registry, skill versions, skill permissioning, skill runs and validation logs — the same distribution problem the upstream skill pack solves — plus an MCP-compatible tool surface.',
    evidence: [
      { label: 'Skills route', path: 'src/app/api/skills/route.ts', kind: 'route' },
      { label: 'Skill factory route', path: 'src/app/api/skill-factory/build/route.ts', kind: 'route' },
      { label: 'Skill permissions route', path: 'src/app/api/skill-permissions/route.ts', kind: 'route' },
      { label: 'Skill versions route', path: 'src/app/api/skill-versions/route.ts', kind: 'route' },
      { label: 'Skills panel', path: 'src/components/panels/skills-panel.tsx', kind: 'panel' },
    ],
    gap: 'No portable skill package format that other agents (Claude Code, Cursor) can install from this repo.',
    upstreamMeta: { stars: 155, language: 'JavaScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'cometchat-docs-mcp',
    url: 'https://github.com/cometchat/docs-mcp.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'MCP server that exposes product docs search and implementation bundles to coding agents.',
    verdict: 'in_kind',
    claim:
      'An MCP server registry with CRUD exists here, and the repo\'s own documentation corpus is in-tree, but the two are not yet joined into a docs-search MCP server.',
    evidence: [
      { label: 'MCP servers route', path: 'src/app/api/mcp-servers/route.ts', kind: 'route' },
      { label: 'MCP manager panel', path: 'src/components/panels/mcp-manager-panel.tsx', kind: 'panel' },
      { label: 'AgentOS guide', path: 'docs/AGENTOS_GUIDE.md', kind: 'doc' },
      { label: 'Agent guide', path: 'AI_AGENT_GUIDE.md', kind: 'doc' },
    ],
    gap: 'No MCP tool that answers questions over this repository\'s own docs/ folder.',
    upstreamMeta: { stars: 130, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'cometchat-uikit-react',
    url: 'https://github.com/cometchat/cometchat-uikit-react.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'React chat and calling UI kit (TypeScript, ~921 stars).',
    verdict: 'in_kind',
    claim:
      'This repo has its own React chat UI (the super commanding chat panel) on top of its own conversation API, so the UI-kit role is filled; the upstream components were not vendored.',
    evidence: [
      { label: 'Commanding chat panel', path: 'src/components/panels/super-commanding-chat.tsx', kind: 'panel' },
      { label: 'Super chat route', path: 'src/app/api/super-chat/route.ts', kind: 'route' },
      { label: 'UI primitives', path: 'src/components/ui/scroll-area.tsx', kind: 'library' },
    ],
    gap: 'Message threads, presence and typing indicators are not implemented in the in-house chat UI.',
    upstreamMeta: { stars: 921, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'cometchat-uikit-android',
    url: 'https://github.com/cometchat/cometchat-uikit-android.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'Android (Kotlin) chat and calling UI kit.',
    verdict: 'not_applicable',
    claim:
      'This is a Next.js web application; it ships no Android client, so a Kotlin UI kit has nowhere to live here.',
    evidence: [
      { label: 'Dashboard shell (authenticated)', path: 'src/components/dashboard/dashboard-shell.tsx', kind: 'panel' },
      { label: 'Package manifest', path: 'package.json', kind: 'config' },
    ],
    upstreamMeta: { stars: 776, language: 'Kotlin', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'cometchat-uikit-ios',
    url: 'https://github.com/cometchat/cometchat-uikit-ios.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'iOS (Swift) ready-to-use chat UI components.',
    verdict: 'not_applicable',
    claim: 'No iOS target exists in this repository.',
    evidence: [
      { label: 'Dashboard shell (authenticated)', path: 'src/components/dashboard/dashboard-shell.tsx', kind: 'panel' },
      { label: 'Package manifest', path: 'package.json', kind: 'config' },
    ],
    upstreamMeta: { stars: 638, language: 'Swift', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'cometchat-uikit-react-native',
    url: 'https://github.com/cometchat/cometchat-uikit-react-native.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'React Native chat and calling UI kit (TypeScript, ~939 stars).',
    verdict: 'not_applicable',
    claim:
      'There is no React Native or Expo target here; the mobile experience is a responsive web layout (the shell renders the same panels on small screens).',
    evidence: [
      { label: 'Responsive shell with mobile sheet nav', path: 'src/components/dashboard/dashboard-shell.tsx', kind: 'panel' },
      { label: 'PWA manifest route', path: 'public/manifest.json', kind: 'config' },
    ],
    upstreamMeta: { stars: 939, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'android-java-chat-app',
    url: 'https://github.com/ketanyekale/android-java-chat-app.git',
    kind: 'repository',
    category: 'Chat & messaging',
    upstream: 'Small native Android (Java) chat sample, 1 star.',
    verdict: 'not_applicable',
    claim: 'Native Java Android sample; no Android runtime here.',
    evidence: [
      { label: 'Dashboard shell (authenticated)', path: 'src/components/dashboard/dashboard-shell.tsx', kind: 'panel' },
      { label: 'Package manifest', path: 'package.json', kind: 'config' },
    ],
    upstreamMeta: { stars: 1, language: 'Java', archived: false, checkedAt: CHECKED },
  },

  // ─── Voice, telephony and calls ───────────────────────────────────────────
  {
    id: 'linphone-iphone',
    url: 'https://github.com/BelledonneCommunications/linphone-iphone.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Linphone iOS SIP softphone (Swift, ~663 stars).',
    verdict: 'not_applicable',
    claim:
      'No SIP stack and no iOS target here. Voice inside this app is speech synthesis, not a SIP call leg — see the voice-system route.',
    evidence: [
      { label: 'Voice system route', path: 'src/app/api/voice-system/route.ts', kind: 'route' },
      { label: 'Voice system panel', path: 'src/components/panels/voice-system-panel.tsx', kind: 'panel' },
    ],
    upstreamMeta: { stars: 663, language: 'Swift', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'voip-call-sample',
    url: 'https://github.com/developerspace-samples/VoIP-Call-Sample.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Android sample using ConnectionService for incoming/outgoing calls (Java).',
    verdict: 'not_applicable',
    claim: 'Android ConnectionService integration; this repo has no Android client and no telecom integration.',
    evidence: [
      { label: 'Meetings route (closest surface)', path: 'src/app/api/meetings/route.ts', kind: 'route' },
      { label: 'Meetings panel', path: 'src/components/panels/meetings-panel.tsx', kind: 'panel' },
    ],
    upstreamMeta: { stars: 32, language: 'Java', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'webrtc-kotlin-sample',
    url: 'https://github.com/developerspace-samples/WebRTC-Kotlin-Sample.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Kotlin sample for peer-to-peer WebRTC audio/video (117 stars).',
    verdict: 'not_applicable',
    claim:
      'There is no WebRTC peer connection or media transport anywhere in this codebase (grep for "webrtc" returns no source hits). Meetings are scheduled and stored, not carried.',
    evidence: [
      { label: 'Meetings route', path: 'src/app/api/meetings/route.ts', kind: 'route' },
      { label: 'Browser recording upload', path: 'src/app/api/video-studio/transcribe/route.ts', kind: 'route' },
    ],
    gap: 'If live calls are wanted, the media transport (SFU or peer connection) has to be added first.',
    upstreamMeta: { stars: 117, language: 'Kotlin', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'sms-domovina',
    url: 'https://github.com/domovinatv/sms.domovina.ai.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Go SMS gateway built on NdoleStudio/httpsms, deployed behind Cloudflare Tunnel (3 stars).',
    verdict: 'in_kind',
    claim:
      'An SMS surface exists here — send route, message records and a marketing tab — but it sends through an HTTP/SMTP provider, not an Android device bridge.',
    evidence: [
      { label: 'SMS route', path: 'src/app/api/sms/route.ts', kind: 'route' },
      { label: 'SMS panel', path: 'src/components/panels/sms-panel.tsx', kind: 'panel' },
      { label: 'Email/SMS delivery library', path: 'src/lib/email/index.ts', kind: 'library' },
    ],
    gap: 'No device-bridge gateway adapter (httpSMS API client) and no inbound SMS webhook handler.',
    upstreamMeta: { stars: 3, language: 'Go', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'awesome-phone-call-agents',
    url: 'https://github.com/CALLE-AI/awesome-phone-call-agents.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Portable phone-call agent skills, adapters and scheduler recipes (TypeScript, 112 stars).',
    verdict: 'gap',
    claim:
      'Agent scheduling and skills exist here, but nothing in this repo can place or receive a telephone call, so the phone-call skill set has no runtime.',
    evidence: [
      { label: 'Agent scheduler', path: 'src/lib/agent-runtime/scheduler.ts', kind: 'library' },
      { label: 'Cron jobs', path: 'src/lib/cron-jobs.ts', kind: 'library' },
      { label: 'Skills route', path: 'src/app/api/skills/route.ts', kind: 'route' },
    ],
    gap: 'Needs a telephony adapter (Twilio/SIP trunk) plus an outbound-call job type before any skill pack applies.',
    upstreamMeta: { stars: 112, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'ai-call-center-intelligence',
    url: 'https://github.com/amulchapla/AI-Powered-Call-Center-Intelligence.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Azure AI call-centre analytics: transcription, sentiment, key-phrase extraction, summarisation (268 stars).',
    verdict: 'gap',
    claim:
      'Transcription and summary primitives exist (a transcribe endpoint and the QC module), and sentiment is not analysed anywhere. There is no call-record ingestion path.',
    evidence: [
      { label: 'Transcribe route', path: 'src/app/api/video-studio/transcribe/route.ts', kind: 'route' },
      { label: 'QC module', path: 'src/lib/qc/index.ts', kind: 'library' },
      { label: 'Meetings route', path: 'src/app/api/meetings/route.ts', kind: 'route' },
    ],
    gap: 'Missing: call transcript persistence, sentiment/key-phrase scoring and a call-analytics view.',
    upstreamMeta: { stars: 268, language: 'JavaScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'ai-native-callcenter',
    url: 'https://github.com/rasonyang/ai-native-callcenter.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Self-hosted AI call centre on FreeSWITCH with SIP trunk and realtime model, plus agent desktop (Go, 394 stars).',
    verdict: 'gap',
    claim:
      'Nothing here terminates SIP or runs an IVR. The agent desktop role is partly covered by the command centre, but the call leg does not exist.',
    evidence: [
      { label: 'Command center panel', path: 'src/components/panels/super-admin-command-center.tsx', kind: 'panel' },
      { label: 'Agent runtime', path: 'src/lib/agent-runtime/index.ts', kind: 'library' },
    ],
    gap: 'Requires FreeSWITCH/Asterisk + a SIP trunk and a realtime audio bridge; out of scope until telephony is a product decision.',
    upstreamMeta: { stars: 394, language: 'Go', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'microsoft-call-center-ai',
    url: 'https://github.com/microsoft/call-center-ai.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Send a phone call from an AI agent in one API call (Python, 6.7k stars).',
    verdict: 'gap',
    claim:
      'This repo can trigger long-running agent work over HTTP, but no endpoint causes a phone call, so the upstream capability is absent.',
    evidence: [
      { label: 'runs API (agent work trigger)', path: 'src/app/api/runs/route.ts', kind: 'route' },
      { label: 'Outbound webhooks', path: 'src/app/api/webhooks/route.ts', kind: 'route' },
    ],
    gap: 'Needs an outbound telephony provider behind a `POST /api/calls` route with a call record model.',
    upstreamMeta: { stars: 6689, language: 'Python', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'call-md',
    url: 'https://github.com/video-db/call.md.git',
    kind: 'repository',
    category: 'Voice, calls & SMS',
    upstream: 'Turn meetings into live agent loops: record, transcribe, analyse before/during/after (TypeScript, 1.8k stars).',
    verdict: 'in_kind',
    claim:
      'Meetings are stored with schedules and links, and recorded media can be transcribed through the video-studio transcribe endpoint; the "live agent loop" during a call is not built.',
    evidence: [
      { label: 'Meetings route', path: 'src/app/api/meetings/route.ts', kind: 'route' },
      { label: 'Meetings panel', path: 'src/components/panels/meetings-panel.tsx', kind: 'panel' },
      { label: 'Transcribe route', path: 'src/app/api/video-studio/transcribe/route.ts', kind: 'route' },
      { label: 'Video hub route', path: 'src/app/api/video-hub/route.ts', kind: 'route' },
    ],
    gap: 'No live meeting bot that joins a call, and no per-meeting transcript→action pipeline.',
    upstreamMeta: { stars: 1772, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },

  // ─── Education and language learning ──────────────────────────────────────
  {
    id: 'hi-kid',
    url: 'https://github.com/xiaochong/hi-kid.git',
    kind: 'repository',
    category: 'Education',
    upstream: 'Desktop English speaking/listening practice app for children (TypeScript, 1.2k stars).',
    verdict: 'in_kind',
    claim:
      'The education hub ships courses, lessons, assignments, exams and a speaking practice exercise, with its own panel and API — the practice loop exists, as a web app instead of a desktop one.',
    evidence: [
      { label: 'Education hub route', path: 'src/app/api/education-hub/route.ts', kind: 'route' },
      { label: 'Education hub panel', path: 'src/components/panels/education-hub-panel.tsx', kind: 'panel' },
      { label: 'Interview hub (spoken practice)', path: 'src/app/api/interview-hub/route.ts', kind: 'route' },
      { label: 'Voice system route', path: 'src/app/api/voice-system/route.ts', kind: 'route' },
    ],
    gap: 'No child-specific UI mode, no speech scoring against a target phrase.',
    upstreamMeta: { stars: 1169, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'chatgpt-english-tutor',
    url: 'https://github.com/TheExplainthis/ChatGPT-AI-English-Tutor.git',
    kind: 'repository',
    category: 'Education',
    upstream: 'AI English tutor that converses and corrects learner English (Python, 100 stars).',
    verdict: 'in_kind',
    claim:
      'Tutoring runs on the same agent + education primitives: course records in the education hub, and a chat surface that can answer and correct through the router.',
    evidence: [
      { label: 'Education hub route', path: 'src/app/api/education-hub/route.ts', kind: 'route' },
      { label: 'Super chat route', path: 'src/app/api/super-chat/route.ts', kind: 'route' },
      { label: 'Interview hub route', path: 'src/app/api/interview-hub/route.ts', kind: 'route' },
    ],
    gap: 'No dedicated tutor persona with correction diffing or a learner progress model.',
    upstreamMeta: { stars: 100, language: 'Python', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'magic-english-buddy',
    url: 'https://github.com/xckevin/magic-english-buddy.git',
    kind: 'repository',
    category: 'Education',
    upstream: 'AI English reading companion for children (TypeScript, 316 stars).',
    verdict: 'in_kind',
    claim:
      'Reading material is handled by the document system and RAG; the audio side by the voice system. There is no reading-specific learner mode.',
    evidence: [
      { label: 'Document system panel', path: 'src/components/panels/document-system-panel.tsx', kind: 'panel' },
      { label: 'RAG ingest route', path: 'src/app/api/rag/ingest/route.ts', kind: 'route' },
      { label: 'Voice system panel', path: 'src/components/panels/voice-system-panel.tsx', kind: 'panel' },
    ],
    gap: 'Missing a read-aloud exercise model (per-word pronunciation scoring, child-safe content filter).',
    upstreamMeta: { stars: 316, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'toeicbert',
    url: 'https://github.com/graykode/toeicbert.git',
    kind: 'repository',
    category: 'Education',
    upstream: 'TOEIC question solving with a pretrained BERT model (PyTorch, 127 stars).',
    verdict: 'not_applicable',
    claim:
      'This is trained model weights for a Korean/English exam task. No Python inference runtime exists here; the equivalent capability would be a hosted endpoint.',
    evidence: [
      { label: 'Model registry', path: 'src/lib/model-registry.ts', kind: 'library' },
      { label: 'Model hub panel', path: 'src/components/panels/model-hub-panel.tsx', kind: 'panel' },
    ],
    upstreamMeta: { stars: 127, language: 'Python', archived: false, checkedAt: CHECKED },
  },

  // ─── Media, creation and design ───────────────────────────────────────────
  {
    id: 'mureka',
    url: 'https://www.mureka.ai',
    kind: 'site',
    category: 'Media & creation',
    upstream: 'AI music generation (songs, instrumentals, vocals).',
    verdict: 'in_kind',
    claim:
      'A music studio exists here with a generate endpoint and a tracks endpoint, surfaced as its own panel; generation goes through the configured media provider rather than Mureka\'s API.',
    evidence: [
      { label: 'Music generate route', path: 'src/app/api/music-studio/generate/route.ts', kind: 'route' },
      { label: 'Music tracks route', path: 'src/app/api/music-studio/tracks/route.ts', kind: 'route' },
      { label: 'Media generation library', path: 'src/lib/media-generation/index.ts', kind: 'library' },
      { label: 'Media studio panel', path: 'src/components/panels/media-studio-panel.tsx', kind: 'panel' },
    ],
    gap: 'No Mureka adapter; vocal/instrumental stems and lyric-to-song are not modelled.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'supercool',
    url: 'https://supercool.com',
    kind: 'site',
    category: 'Media & creation',
    upstream: 'Famous Labs "one subscription for everything" creation suite: video, image, music, voice, docs, sites.',
    verdict: 'in_kind',
    claim:
      'The same spread exists as separate studios here — image, video, music, voice, documents and the media library — each with its own API and panel. They are not unified behind one prompt.',
    evidence: [
      { label: 'Image studio route', path: 'src/app/api/image-studio/generate/route.ts', kind: 'route' },
      { label: 'Video studio transcribe route', path: 'src/app/api/video-studio/transcribe/route.ts', kind: 'route' },
      { label: 'Music generate route', path: 'src/app/api/music-studio/generate/route.ts', kind: 'route' },
      { label: 'Media library panel', path: 'src/components/panels/media-library-panel.tsx', kind: 'panel' },
      { label: 'Media generation library', path: 'src/lib/media-generation/index.ts', kind: 'library' },
    ],
    gap: 'No single "make anything" prompt that routes one request across studios and returns a finished bundle.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'supercool-film',
    url: 'https://join.supercool.com',
    kind: 'site',
    category: 'Media & creation',
    upstream: 'SuperCool Film Maker: screenplay → scenes → voices → music → trailer → poster, released and promoted.',
    verdict: 'in_kind',
    claim:
      'The video hub stores projects, avatars, subtitles and presenters, and the video studio transcribes and generates clips. Nothing assembles a finished film from those parts.',
    evidence: [
      { label: 'Video hub route', path: 'src/app/api/video-hub/route.ts', kind: 'route' },
      { label: 'Video hub panel', path: 'src/components/panels/video-hub-panel.tsx', kind: 'panel' },
      { label: 'Avatar voice route', path: 'src/app/api/avatar-voice/generate-voice/route.ts', kind: 'route' },
    ],
    gap: 'No scene graph, no ffmpeg assembly worker, no trailer/poster generation step. This is the largest real gap in the media set.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'astryx',
    url: 'https://astryx.atmeta.com',
    kind: 'site',
    category: 'Design systems',
    upstream: 'Meta\'s open-source Astryx design system: 150+ accessible React components on React 19 + StyleX, 7 themes, CLI + MCP, built over 8 years for 13,000+ apps.',
    verdict: 'in_kind',
    claim:
      'This repo already runs a design system of its own: a shadcn/Radix component set with editorial variants, brand tokens, a living spec page at /design, and a separate diagram-design token layer. It is a different stack (Tailwind, not StyleX).',
    evidence: [
      { label: 'Button variants', path: 'src/components/ui/button.tsx', kind: 'library' },
      { label: 'Card primitive', path: 'src/components/ui/card.tsx', kind: 'library' },
      { label: 'Living design spec', path: 'src/app/design/page.tsx', kind: 'page' },
      { label: 'Diagram design tokens', path: 'src/lib/diagram-design/tokens.ts', kind: 'library' },
      { label: 'Brand book panel', path: 'src/components/brand/brand-book-panel.tsx', kind: 'panel' },
    ],
    gap: 'No machine-readable component manifest for agents (Astryx ships one) and no swizzle/copy-out path — the two things that make Astryx agent-usable.',
    upstreamMeta: { checkedAt: CHECKED },
  },

  // ─── Business operations ──────────────────────────────────────────────────
  {
    id: 'enerpize',
    url: 'https://www.enerpize.com',
    kind: 'site',
    category: 'Business operations',
    upstream: 'Cloud ERP for SMBs: 30+ modules across accounting, sales/invoicing, inventory, purchasing, HR & payroll, CRM (40,000+ businesses).',
    verdict: 'gap',
    claim:
      'Only the finance edge of that surface exists here: billing plans, subscriptions, invoices and payments, plus documents. There is no double-entry ledger, no inventory or purchasing, and no HR/payroll.',
    evidence: [
      { label: 'Invoices route', path: 'src/app/api/billing/invoices/route.ts', kind: 'route' },
      { label: 'Plans route', path: 'src/app/api/billing/plans/route.ts', kind: 'route' },
      { label: 'Payments route', path: 'src/app/api/billing/payments/route.ts', kind: 'route' },
      { label: 'Billing panel', path: 'src/components/panels/billing-panel.tsx', kind: 'panel' },
    ],
    gap: 'A real ERP would need ledger/journal models, inventory with stock movements, and payroll — none of which exist in prisma/schema.prisma. Do not claim ERP parity.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'aipraktor',
    url: 'https://www.aipraktor.com',
    kind: 'site',
    category: 'Business operations',
    upstream: 'Bangladeshi AI sales agent for Messenger, Instagram and WhatsApp: 24/7 replies in Bangla/English, product recognition from photos, order taking, courier updates, human handoff, pay-per-reply pricing.',
    verdict: 'in_kind',
    claim:
      'The messaging substrate is here: a WhatsApp client with a multi-number manager, an AI handler, an inbox, and per-network social providers with webhooks. Order capture, product recognition and courier tracking are not.',
    evidence: [
      { label: 'WhatsApp AI handler', path: 'src/lib/whatsapp/ai-handler.ts', kind: 'library' },
      { label: 'WhatsApp inbox route', path: 'src/app/api/whatsapp/inbox/route.ts', kind: 'route' },
      { label: 'WhatsApp webhook', path: 'src/app/api/whatsapp/webhook/route.ts', kind: 'route' },
      { label: 'Multi-number manager', path: 'src/lib/whatsapp/multi-number.ts', kind: 'library' },
      { label: 'Instagram provider', path: 'src/lib/social/instagram.ts', kind: 'library' },
      { label: 'Facebook provider', path: 'src/lib/social/facebook.ts', kind: 'library' },
    ],
    gap: 'Missing product catalogue + order model, image-based product matching, courier status lookups, and per-reply metered pricing (Bangla-first).',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'larksuite',
    url: 'https://www.larksuite.com',
    kind: 'site',
    category: 'Business operations',
    upstream: 'Lark/Feishu all-in-one workspace: chat, docs, sheets, calendar, video meetings, approvals, tasks.',
    verdict: 'in_kind',
    claim:
      'Chat, documents, approvals, tasks, meetings and productivity analytics each exist as their own module here. There is no spreadsheet grid, no calendar view, and no Lark tenant integration.',
    evidence: [
      { label: 'Documents route', path: 'src/app/api/documents/route.ts', kind: 'route' },
      { label: 'Approvals route', path: 'src/app/api/approvals/route.ts', kind: 'route' },
      { label: 'Tasks route', path: 'src/app/api/tasks/route.ts', kind: 'route' },
      { label: 'Meetings route', path: 'src/app/api/meetings/route.ts', kind: 'route' },
      { label: 'Productivity panel', path: 'src/components/panels/productivity-panel.tsx', kind: 'panel' },
      { label: 'Document system panel', path: 'src/components/panels/document-system-panel.tsx', kind: 'panel' },
    ],
    gap: 'No spreadsheet surface, no calendar UI, and no export/import against Lark\'s open API.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'hatchable',
    url: 'https://hatchable.com',
    kind: 'site',
    category: 'Business operations',
    upstream: 'Woobox\'s free AI app builder/host: an MCP server that provisions a database, auth, email, storage and a live URL for code an agent writes.',
    verdict: 'in_kind',
    claim:
      'The building blocks exist here — an MCP server registry, a project model, a deploy route and a deployment panel — but they deploy *this* app rather than arbitrary agent-written projects.',
    evidence: [
      { label: 'MCP servers route', path: 'src/app/api/mcp-servers/route.ts', kind: 'route' },
      { label: 'Projects route', path: 'src/app/api/projects/route.ts', kind: 'route' },
      { label: 'Deploy route', path: 'src/app/api/deploy/route.ts', kind: 'route' },
      { label: 'Deployment panel', path: 'src/components/panels/deployment-panel.tsx', kind: 'panel' },
    ],
    gap: 'No multi-tenant project hosting (per-project DB/URL/SSL) and no "deploy this" MCP tool.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'refine-ink',
    url: 'https://www.refine.ink',
    kind: 'site',
    category: 'Business operations',
    upstream: 'AI manuscript review: parallel workers critique a draft for correctness, clarity and internal logic (~$30–50 per review).',
    verdict: 'gap',
    claim:
      'Document storage, retrieval and a QC module exist, but there is no manuscript-review pipeline — no draft ingestion that fans out to reviewers and returns a consolidated critique.',
    evidence: [
      { label: 'Documents route', path: 'src/app/api/documents/route.ts', kind: 'route' },
      { label: 'QC module', path: 'src/lib/qc/index.ts', kind: 'library' },
      { label: 'RAG query route', path: 'src/app/api/rag/query/route.ts', kind: 'route' },
      { label: 'Approvals route', path: 'src/app/api/approvals/route.ts', kind: 'route' },
    ],
    gap: 'Would need a fan-out review job (N parallel critics over one document) plus a consolidated feedback artifact and claim/table cross-checking.',
    upstreamMeta: { checkedAt: CHECKED },
  },

  // ─── Monitoring and operations ────────────────────────────────────────────
  {
    id: 'hetrixtools',
    url: 'https://hetrixtools.com',
    kind: 'site',
    category: 'Monitoring & ops',
    upstream: 'Uptime, blacklist and server monitoring with alerts (external SaaS probes).',
    verdict: 'in_kind',
    claim:
      'Self-hosted monitoring is wired here: Prometheus, Grafana and Alertmanager configs, a metrics route, shallow and deep health checks, a system-health route and an observability dashboard.',
    evidence: [
      { label: 'Prometheus config', path: 'monitoring/prometheus/prometheus.yml', kind: 'config' },
      { label: 'Grafana provisioning', path: 'monitoring/grafana', kind: 'directory' },
      { label: 'Alertmanager config', path: 'monitoring/alertmanager', kind: 'directory' },
      { label: 'Metrics route', path: 'src/app/api/metrics/route.ts', kind: 'route' },
      { label: 'Deep health check', path: 'src/app/api/health/deep/route.ts', kind: 'route' },
      { label: 'System health route', path: 'src/app/api/system-health/route.ts', kind: 'route' },
      { label: 'Observability dashboard', path: 'src/app/api/observability/dashboard/route.ts', kind: 'route' },
    ],
    gap: 'Probes are in-cluster only. No external vantage point (what HetrixTools actually sells), no blacklist/RBL monitoring, no SMS/phone escalation.',
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'mat3ra-platform',
    url: 'https://platform.mat3ra.com',
    kind: 'site',
    category: 'Research & science',
    upstream: 'Mat3ra platform: cloud materials modelling (DFT/MD) with job orchestration and a notebook-style workbench.',
    verdict: 'not_applicable',
    claim:
      'Materials-science simulation (VASP/Quantum ESPRESSO-class workloads) is not a capability of this application; there is no scientific compute runtime here.',
    evidence: [
      { label: 'Agent runtime (generic job host)', path: 'src/lib/agent-runtime/index.ts', kind: 'library' },
      { label: 'Job queue', path: 'src/lib/job-queue.ts', kind: 'library' },
    ],
    upstreamMeta: { checkedAt: CHECKED },
  },
  {
    id: 'mat3ra',
    url: 'https://mat3ra.com',
    kind: 'site',
    category: 'Research & science',
    upstream: 'Mat3ra corporate site — same platform as above (materials modelling for industry and academia).',
    verdict: 'not_applicable',
    claim: 'Same as platform.mat3ra.com: no scientific simulation runtime in this repository.',
    evidence: [
      { label: 'Job queue', path: 'src/lib/job-queue.ts', kind: 'library' },
      { label: 'Queue panel', path: 'src/components/panels/queue-panel.tsx', kind: 'panel' },
    ],
    upstreamMeta: { checkedAt: CHECKED },
  },

  // ─── Research, scraping and simulation ────────────────────────────────────
  {
    id: 'molx',
    url: 'https://github.com/ioi-labs/molx.git',
    kind: 'repository',
    category: 'Research & science',
    upstream: 'Self-hosted Firecrawl alternative: scrape, search, batch-process and LLM-enrich web content over an HTTP API (Go, 24 stars).',
    verdict: 'gap',
    claim:
      'Ingestion and retrieval exist (RAG ingest of supplied text/URLs, a research hub), but there is no crawler: nothing here fetches a page, follows links, or converts HTML to markdown.',
    evidence: [
      { label: 'RAG ingest route', path: 'src/app/api/rag/ingest/route.ts', kind: 'route' },
      { label: 'Research hub route', path: 'src/app/api/research-hub/route.ts', kind: 'route' },
      { label: 'RAG engine', path: 'src/lib/rag-engine.ts', kind: 'library' },
    ],
    gap: 'Needs a fetch→clean→markdown step (with robots/rate limits and SSRF protection) in front of /api/rag/ingest.',
    upstreamMeta: { stars: 24, language: 'Go', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'mirofish-offline',
    url: 'https://github.com/nikmcfly/MiroFish-Offline.git',
    kind: 'repository',
    category: 'Research & science',
    upstream: 'Offline multi-agent simulation and prediction engine with Neo4j + Ollama (Python, 2.7k stars).',
    verdict: 'gap',
    claim:
      'Multi-agent orchestration exists, and Ollama is a configured provider, but nothing here runs a population simulation over a graph, and there is no Neo4j adapter.',
    evidence: [
      { label: 'Multi-agent orchestrator', path: 'src/lib/multi-agent-orchestrator/index.ts', kind: 'library' },
      { label: 'Ollama provider', path: 'src/lib/ai-router/ollama-provider.ts', kind: 'library' },
      { label: 'Memory module', path: 'src/lib/memory/index.ts', kind: 'library' },
    ],
    gap: 'Missing a simulation loop (N personas × T rounds), a graph store, and an outcome/forecast report.',
    upstreamMeta: { stars: 2659, language: 'Python', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'gibberlink',
    url: 'https://github.com/PennyroyalTea/gibberlink.git',
    kind: 'repository',
    category: 'Research & science',
    upstream: 'Two conversational agents detecting each other and switching to a sound-level protocol (TypeScript, 4.9k stars).',
    verdict: 'gap',
    claim:
      'Agents here coordinate through an orchestrator and an event bus, and the realtime server carries session events. There is no agent-to-agent handshake or non-text protocol.',
    evidence: [
      { label: 'Event bus', path: 'src/lib/event-bus/index.ts', kind: 'library' },
      { label: 'Realtime server', path: 'src/lib/realtime/server.ts', kind: 'library' },
      { label: 'Multi-agent orchestrator', path: 'src/lib/multi-agent-orchestrator/index.ts', kind: 'library' },
    ],
    gap: 'Agent-to-agent discovery/negotiation is only an idea in enterprise-roadmap.ts; no wire protocol or capability handshake is implemented.',
    upstreamMeta: { stars: 4920, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'ai-test-case-generator',
    url: 'https://github.com/iamakshayshar/AITestCaseGenerator.git',
    kind: 'repository',
    category: 'Developer tooling',
    upstream: 'Generates pytest test cases from plain-English requirements using an LLM (OpenAI or Ollama), 5 stars.',
    verdict: 'gap',
    claim:
      'There is an evaluation/QC module and a 700+ test suite, but nothing in this repo generates test code from a requirement.',
    evidence: [
      { label: 'Quality route', path: 'src/app/api/quality/route.ts', kind: 'route' },
      { label: 'Evaluations route', path: 'src/app/api/evaluations/route.ts', kind: 'route' },
      { label: 'QC module', path: 'src/lib/qc/index.ts', kind: 'library' },
    ],
    gap: 'Needs a generate-tests job type (requirement → test file) with a sandboxed run to validate the output. pytest and Robot Framework both fit the same job.',
    upstreamMeta: { stars: 5, language: 'Python', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'nl-to-robot-framework',
    url: 'https://github.com/monkscode/Natural-Language-to-Robot-Framework.git',
    kind: 'repository',
    category: 'Developer tooling',
    upstream: 'Turns plain English into validated, runnable Robot Framework test files (Python, 17 stars).',
    verdict: 'gap',
    claim:
      'No Robot Framework support of any kind: a search across src/ for "robot framework" and "test case" returns no source hits.',
    evidence: [
      { label: 'Quality route (closest surface)', path: 'src/app/api/quality/route.ts', kind: 'route' },
      { label: 'Automation routes', path: 'src/app/api/automation', kind: 'directory' },
    ],
    gap: 'Same job type as the row above: NL → test artefact, with a runner and a stored result.',
    upstreamMeta: { stars: 17, language: 'Python', archived: false, checkedAt: CHECKED },
  },
  {
    id: 'dictionary-of-ai-coding',
    url: 'https://github.com/mattpocock/dictionary-of-ai-coding.git',
    kind: 'repository',
    category: 'Developer tooling',
    upstream: 'AI coding jargon explained in plain English (TypeScript, 5.3k stars) — a documentation project.',
    verdict: 'reference',
    claim:
      'Documentation, not software. This repo maintains its own agent-facing documentation set, which is the right place for any glossary borrowed from upstream.',
    evidence: [
      { label: 'Agent guide', path: 'AI_AGENT_GUIDE.md', kind: 'doc' },
      { label: 'Architecture doc', path: 'ARCHITECTURE.md', kind: 'doc' },
      { label: 'Developer guide', path: 'DEVELOPER_GUIDE.md', kind: 'doc' },
    ],
    upstreamMeta: { stars: 5276, language: 'TypeScript', archived: false, checkedAt: CHECKED },
  },

  // ─── Reference only ───────────────────────────────────────────────────────
  {
    id: 'stackoverflow',
    url: 'https://stackoverflow.com',
    kind: 'site',
    category: 'Reference & content',
    upstream: 'Developer Q&A knowledge base.',
    verdict: 'reference',
    claim:
      'A public Q&A site: nothing to vendor. Its API is not called anywhere in this codebase, and questions/answers are not ingested into RAG.',
    evidence: [
      { label: 'RAG ingest (where it would land)', path: 'src/app/api/rag/ingest/route.ts', kind: 'route' },
      { label: 'Research hub', path: 'src/app/api/research-hub/route.ts', kind: 'route' },
    ],
    gap: 'If wanted: a Stack Exchange API ingestion job into /api/rag/ingest, respecting the site\'s attribution licence (CC BY-SA).',
    upstreamMeta: { checkedAt: CHECKED },
  },
];

/** Convenience lookups used by the API route, the panel and the tests. */
export const COVERAGE_CATEGORIES = Array.from(
  new Set(LINK_COVERAGE.map((entry) => entry.category)),
).sort();

export const COVERAGE_CHECKED_AT = CHECKED;
