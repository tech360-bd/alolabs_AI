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

// Second sweep: the AI-platform ecosystem links requested 2026-11-27.
const REQUESTED_DATE = '2026-11-27';

export const LINK_COVERAGE: CoverageEntry[] = [
  // Requested 2026-11-24: upstream availability checked via the GitHub API on
  // 2026-11-24. Local evidence below is related capability, not upstream
  // installation or feature parity. See REQUESTED_LINKS_AUDIT_2026-11-24.md.
  {
    id: 'anomalyco-browse', url: 'https://github.com/anomalyco/browse.git', kind: 'repository', category: 'Developer tooling',
    upstream: 'MCP server + Chromium extension that lets AI agents drive a real browser.', verdict: 'gap',
    claim: 'The Command Agent has fetch-based tools (web_search, wikipedia_summary, get_weather) and an MCP server registry exists, but no real-browser control tool and no browse MCP server is connected.',
    evidence: [
      { label: 'Command Agent tools', path: 'src/lib/command-agent/tools.ts', kind: 'library' },
      { label: 'MCP servers route', path: 'src/app/api/mcp-servers/route.ts', kind: 'route' },
    ],
    gap: 'No browser automation tool, Chromium extension or browse MCP connection; agent web tasks are plain HTTP fetches. Needs consent/isolation review and an end-to-end browser task test.',
    upstreamMeta: { stars: 1077, language: 'TypeScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'mynah', url: 'https://github.com/honwee/mynah.git', kind: 'repository', category: 'Media & creation',
    upstream: 'Self-hosted realtime digital human (Go, one GPU, admin console, Apache-2.0).', verdict: 'gap',
    claim: 'Avatar/voice generation routes exist with a consent gate and delegate to the media-generation service, which requires a configured provider; there is no realtime digital-human streaming engine here.',
    evidence: [
      { label: 'Avatar generation route', path: 'src/app/api/avatar-voice/generate-avatar/route.ts', kind: 'route' },
      { label: 'Human avatar & voice page', path: 'src/components/pages/human-avatar-voice.tsx', kind: 'page' },
    ],
    gap: 'No Mynah deployment, GPU inference stack or realtime avatar stream; live avatar generation itself is unverified.',
    upstreamMeta: { stars: 324, language: 'Go', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'vllm', url: 'https://github.com/vllm-project/vllm.git', kind: 'repository', category: 'AI & models',
    upstream: 'High-throughput LLM inference and serving engine (Python, Apache-2.0).', verdict: 'gap',
    claim: 'An OpenAI-compatible provider explicitly targets vLLM-style gateways and the provider registry names a local Ollama/vLLM gateway, but the bundled inference compose runs Ollama; no vLLM service, GPU deployment or live contract test exists here.',
    evidence: [
      { label: 'OpenAI-compatible provider (names vLLM)', path: 'src/lib/ai-router/openai-compatible-provider.ts', kind: 'library' },
      { label: 'Provider registry (local gateway)', path: 'src/lib/ai-router/provider-registry.ts', kind: 'library' },
      { label: 'Inference compose (Ollama, not vLLM)', path: 'docker-compose.inference.yml', kind: 'config' },
    ],
    gap: 'Add a vLLM deployment option on a GPU host, point the local gateway/provider config at it, and run live model contract tests.',
    upstreamMeta: { stars: 97496, language: 'Python', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'openai-agents-js', url: 'https://github.com/openai/openai-agents-js.git', kind: 'repository', category: 'AI & models',
    upstream: 'OpenAI framework for multi-agent workflows and voice agents (TypeScript, MIT). Requested twice; listed once.', verdict: 'in_kind',
    claim: 'An agent runtime with a tool loop, a runs API and a voice orchestrator exists here as first-party code; the @openai/agents SDK is not a dependency and no upstream parity test exists.',
    evidence: [
      { label: 'Agent tool loop', path: 'src/lib/agent-runtime/tool-loop.ts', kind: 'library' },
      { label: 'Runs API', path: 'src/app/api/runs/route.ts', kind: 'route' },
      { label: 'Voice orchestrator', path: 'src/lib/voice/orchestrator.ts', kind: 'library' },
      { label: 'Package manifest (no @openai/agents)', path: 'package.json', kind: 'config' },
    ],
    gap: 'No upstream SDK integration or feature-parity test; live provider execution remains NOT VERIFIED (see ALO_LABS_AI_ECOSYSTEM_MATRIX.md).',
    upstreamMeta: { stars: 4029, language: 'TypeScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'openai-whisper', url: 'https://github.com/openai/whisper.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'OpenAI Whisper speech recognition model and Python inference code (MIT).', verdict: 'in_kind',
    claim: 'Speech-to-text exists here as adapters: an OpenAI-compatible ASR engine using whisper model names (works with local Whisper servers) and a media transcription client. The upstream Python package and model weights are not vendored and no Whisper server is bundled.',
    evidence: [
      { label: 'ASR/TTS HTTP engine', path: 'src/lib/voice/speech-adapters/http-engine.ts', kind: 'library' },
      { label: 'Media transcription client', path: 'src/lib/media-generation/transcribe.ts', kind: 'library' },
      { label: 'Speech orchestrator tests', path: '__tests__/unit/lib/voice/speech-orchestrator.test.ts', kind: 'test' },
    ],
    gap: 'Deploy a Whisper-compatible ASR server (or vendor weights under their licence) and run a live transcription test; no provider-backed success produced here.',
    upstreamMeta: { stars: 113428, language: 'Python', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'jasmin-sms', url: 'https://github.com/jookies/jasmin.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'Jasmin open-source SMS gateway (Python, SMPP/HTTP).', verdict: 'gap',
    claim: 'The SMS route stores pending records and a tested httpSMS client exists, but no SMPP gateway is deployed and the route does not call any send adapter.',
    evidence: [
      { label: 'SMS route (pending records)', path: 'src/app/api/sms/route.ts', kind: 'route' },
      { label: 'httpSMS client', path: 'src/lib/sms/httpsms-client.ts', kind: 'library' },
    ],
    gap: 'No Jasmin deployment, SMPP connector or carrier agreement; wire the route to a configured gateway and verify live delivery. GitHub licence detection is NOASSERTION; the LICENSE file carries Apache-2.0 text — review before use.',
    upstreamMeta: { stars: 1220, language: 'Python', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'telnyx-api-profile', url: 'https://github.com/api-evangelist/telnyx.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'API Evangelist third-party profile of the Telnyx API surface (documentation, not Telnyx code).', verdict: 'reference',
    claim: 'A replaceable telephony adapter interface exists with a simulated sandbox and honest not-connected failures; no Telnyx adapter is implemented. This upstream repo is an API-surface profile, not an SDK.',
    evidence: [
      { label: 'Telephony adapter interface', path: 'src/lib/voice/telephony/adapter.ts', kind: 'library' },
      { label: 'Telephony registry', path: 'src/lib/voice/telephony/registry.ts', kind: 'library' },
      { label: 'Telephony architecture', path: 'docs/TELEPHONY_ARCHITECTURE.md', kind: 'doc' },
    ],
    gap: 'If Telnyx is chosen: implement the adapter against the real API with credentials, webhooks and a live call test.',
    upstreamMeta: { stars: 0, archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'vidslider-wp', url: 'https://github.com/MerlinStacks/VidSliderWP.git', kind: 'repository', category: 'Media & creation',
    upstream: 'Reel It video slider WordPress plugin with WooCommerce product tagging (PHP, GPL-2.0).', verdict: 'not_applicable',
    claim: 'Requires a WordPress/WooCommerce (PHP) runtime; this repository is a Next.js application with no WordPress target. Video management here is the video hub, not a storefront gallery plugin.',
    evidence: [
      { label: 'Video hub route', path: 'src/app/api/video-hub/route.ts', kind: 'route' },
      { label: 'Package manifest (Next.js, no PHP)', path: 'package.json', kind: 'config' },
    ],
    upstreamMeta: { stars: 0, language: 'PHP', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'true-video-product-gallery', url: 'https://github.com/MerlinStacks/true-video-product-gallery.git', kind: 'repository', category: 'Media & creation',
    upstream: 'WooCommerce product-gallery replacement with a video slider (YouTube, Vimeo, TikTok, Reels, self-hosted).', verdict: 'not_applicable',
    claim: 'A WordPress/WooCommerce PHP plugin; no WordPress runtime or WooCommerce storefront exists here. GitHub detects no licence — terms must be clarified before any code reuse.',
    evidence: [
      { label: 'Video hub route', path: 'src/app/api/video-hub/route.ts', kind: 'route' },
      { label: 'Package manifest (Next.js, no PHP)', path: 'package.json', kind: 'config' },
    ],
    upstreamMeta: { stars: 0, language: 'PHP', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'socaliseit', url: 'https://github.com/MerlinStacks/socaliseit.git', kind: 'repository', category: 'Social & publishing',
    upstream: 'Social media management platform: multi-track Remotion video editing, unified publishing, AI captions, analytics, e-commerce sync (Next.js 16 + Prisma, MIT).', verdict: 'in_kind',
    claim: 'This repo already publishes to eleven networks with per-network providers, OAuth, analytics and a video studio; the upstream application is not installed and no parity test exists.',
    evidence: [
      { label: 'Social provider registry', path: 'src/lib/social/index.ts', kind: 'library' },
      { label: 'Publish route', path: 'src/app/api/social/publish/route.ts', kind: 'route' },
      { label: 'Analytics route', path: 'src/app/api/social/analytics/route.ts', kind: 'route' },
      { label: 'Video studio generate', path: 'src/app/api/video-studio/generate/route.ts', kind: 'route' },
    ],
    gap: 'No multi-track Remotion timeline editor and no Shopify/WooCommerce sync here; upstream code not imported.',
    upstreamMeta: { stars: 32, language: 'TypeScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'teleport', url: 'https://github.com/gravitational/teleport.git', kind: 'repository', category: 'Monitoring & ops',
    upstream: 'Infrastructure access platform (SSH/Kubernetes/apps) with identity-based access (Go, AGPL-3.0).', verdict: 'gap',
    claim: 'Application-level auth, sessions and RBAC exist here; they secure this app, not infrastructure access. No Teleport deployment or access-proxy configuration exists in this repo.',
    evidence: [
      { label: 'Auth library', path: 'src/lib/auth.ts', kind: 'library' },
      { label: 'Security policy', path: 'SECURITY.md', kind: 'doc' },
    ],
    gap: 'Infrastructure access (SSH/Kubernetes) is outside this app; deploying Teleport is an ops decision with AGPL-3.0 review, separate from app auth.',
    upstreamMeta: { stars: 21139, language: 'Go', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'free-for-dev-mirror', url: 'https://github.com/jixserver/free-for-dev.git', kind: 'repository', category: 'Reference & content',
    upstream: 'Free-tier SaaS/PaaS/IaaS list (free-for.dev content); last push 2024-08-15; GitHub reports no licence and does not flag it as a fork.', verdict: 'reference',
    claim: 'A curated subset of the free-for.dev catalogue is already served by the free-resources route with tests; this copy is not vendored or synced and its content is older than the live list.',
    evidence: [
      { label: 'Curated free-tier catalogue', path: 'src/lib/free-resources.ts', kind: 'library' },
      { label: 'Free resources route', path: 'src/app/api/free-resources/route.ts', kind: 'route' },
      { label: 'Catalogue tests', path: '__tests__/unit/lib/free-resources.test.ts', kind: 'test' },
    ],
    gap: 'No automated sync against the upstream list; free-tier allowances are quoted as unverified and must be re-checked at the vendor.',
    upstreamMeta: { stars: 5702, archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'anomalyco-phonecall', url: 'https://github.com/anomalyco/phonecall.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'Agent phone calls: Grok Voice + Twilio on Cloudflare, with CLI and MCP server (MIT).', verdict: 'in_kind',
    claim: 'A voice call orchestrator, campaigns, metering and a telephony adapter registry exist here; the default adapter is explicitly simulated and real providers fail honestly until connected. No Twilio/Grok Voice bridge is deployed.',
    evidence: [
      { label: 'Voice orchestrator', path: 'src/lib/voice/orchestrator.ts', kind: 'library' },
      { label: 'Telephony registry (sandbox default)', path: 'src/lib/voice/telephony/registry.ts', kind: 'library' },
      { label: 'Telephony architecture', path: 'docs/TELEPHONY_ARCHITECTURE.md', kind: 'doc' },
    ],
    gap: 'No live PSTN provider, carrier credentials or real-call verification; upstream Cloudflare/Grok stack not installed.',
    upstreamMeta: { stars: 12, language: 'TypeScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'nightmail', url: 'https://github.com/anomalyco/nightmail.git', kind: 'repository', category: 'Chat & messaging',
    upstream: 'Nightmail email application (TypeScript, MIT).', verdict: 'in_kind',
    claim: 'Email is a first-party subsystem here: SMTP send (nodemailer), a raw-socket IMAP reader, templates and tracking with API routes. The Nightmail application is not installed and no parity test exists.',
    evidence: [
      { label: 'SMTP client', path: 'src/lib/email/smtp.ts', kind: 'library' },
      { label: 'IMAP client', path: 'src/lib/email/imap.ts', kind: 'library' },
      { label: 'Inbox route', path: 'src/app/api/email/inbox/route.ts', kind: 'route' },
      { label: 'Send route', path: 'src/app/api/email/send/route.ts', kind: 'route' },
    ],
    gap: 'Live SMTP/IMAP delivery against real accounts is configuration-dependent and not verified here; upstream client not imported.',
    upstreamMeta: { stars: 48, language: 'TypeScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'phonecall-mint', url: 'https://github.com/Link2theWorld/phonecall-mint.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'Phone/FaceTime-style call UI for AI roleplay (SillyTavern extension + embeddable web component, MIT).', verdict: 'reference',
    claim: 'Call management UI exists here (voice calls panel, call service); it is an operations console, not a consumer slide-to-answer call screen. The upstream component targets SillyTavern/embedded roleplay, not this console.',
    evidence: [
      { label: 'Voice calls panel', path: 'src/components/voice/voice-calls.tsx', kind: 'panel' },
      { label: 'Call service', path: 'src/lib/voice/call-service.ts', kind: 'library' },
    ],
    gap: 'If a consumer-style incoming-call screen is wanted, design it against the existing call lifecycle; do not import the SillyTavern extension.',
    upstreamMeta: { stars: 4, language: 'JavaScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'omniroute', url: 'https://github.com/cheaper-inference/OmniRoute.git', kind: 'repository', category: 'AI & models',
    upstream: 'MIT AI gateway: one endpoint, hundreds of providers/models, quota-aware auto-fallback, token compression, MCP/A2A.', verdict: 'in_kind',
    claim: 'A multi-provider router with fallback, a free-model catalogue and provider administration exist here as first-party code; no OmniRoute gateway is deployed or adapted and live routing is NOT VERIFIED.',
    evidence: [
      { label: 'Router index and fallback', path: 'src/lib/ai-router/index.ts', kind: 'library' },
      { label: 'Free-model catalogue', path: 'src/lib/ai-router/free-models.ts', kind: 'library' },
      { label: 'Provider catalogue', path: 'src/lib/ai-provider-catalog.ts', kind: 'library' },
      { label: 'Model tiers', path: 'src/lib/ai-router/model-tiers.ts', kind: 'library' },
    ],
    gap: 'No OmniRoute deployment/adapter; upstream default branch is a release branch (release/v3.8.55) and the repo is ~3.9 GB — pin and review before any import.',
    upstreamMeta: { stars: 90121, language: 'TypeScript', archived: false, checkedAt: '2026-11-24' },
  },
  {
    id: 'vllm-project-org', url: 'https://github.com/vllm-project', kind: 'repository', category: 'AI & models',
    upstream: 'vLLM project organisation (inference engine and companion repositories).', verdict: 'reference',
    claim: 'Organisation listing, not an installable artefact; the engine repo has its own row (vllm). A local OpenAI-compatible provider could target a vLLM server, but none is deployed.',
    evidence: [
      { label: 'OpenAI-compatible provider', path: 'src/lib/ai-router/openai-compatible-provider.ts', kind: 'library' },
      { label: 'Inference compose (Ollama)', path: 'docker-compose.inference.yml', kind: 'config' },
    ],
    upstreamMeta: { checkedAt: '2026-11-24' },
  },
  {
    id: 'nuxt-org-repos', url: 'https://github.com/orgs/nuxt/repositories', kind: 'repository', category: 'Developer tooling',
    upstream: 'Nuxt organisation repository listing (Vue/Nuxt framework and modules).', verdict: 'not_applicable',
    claim: 'This application is Next.js 16 / React 19 (App Router); Nuxt is a different framework runtime (Vue) and no Nuxt package is a dependency. Rebuilding on Nuxt is out of scope for this repo.',
    evidence: [
      { label: 'Next.js config', path: 'next.config.ts', kind: 'config' },
      { label: 'Package manifest (Next.js/React)', path: 'package.json', kind: 'config' },
    ],
    upstreamMeta: { checkedAt: '2026-11-24' },
  },
  {
    id: 'nuxt-scripts', url: 'https://scripts.nuxt.com/scripts', kind: 'site', category: 'Developer tooling',
    upstream: '@nuxt/scripts: third-party script loading for the Nuxt runtime.', verdict: 'not_applicable',
    claim: 'Targets Nuxt/Vue; this app is Next.js and does not depend on @nuxt/scripts. The site could not be fetched from this sandbox (GitHub/registry-only egress).',
    evidence: [
      { label: 'Package manifest (no @nuxt/scripts)', path: 'package.json', kind: 'config' },
      { label: 'Next.js config', path: 'next.config.ts', kind: 'config' },
    ],
    upstreamMeta: { checkedAt: '2026-11-24' },
  },
  {
    id: 'free-for-dev-site', url: 'https://free-for.dev/#/', kind: 'site', category: 'Reference & content',
    upstream: 'The free-for.dev catalogue of free developer service tiers.', verdict: 'in_kind',
    claim: 'A curated subset of this catalogue is implemented locally (free-resources module + API + tests), restricted to entries that map onto real capabilities; the full list is not vendored and the site itself could not be fetched from this sandbox.',
    evidence: [
      { label: 'Curated free-tier catalogue', path: 'src/lib/free-resources.ts', kind: 'library' },
      { label: 'Free resources route', path: 'src/app/api/free-resources/route.ts', kind: 'route' },
      { label: 'Catalogue tests', path: '__tests__/unit/lib/free-resources.test.ts', kind: 'test' },
    ],
    gap: 'No sync with the live list; allowances are marked unverified and carry vendor verify URLs.',
    upstreamMeta: { checkedAt: '2026-11-24' },
  },
  // Requested 2026-11-02: local evidence is not upstream installation or parity.
  {
    id: 'opensms', url: 'https://github.com/daslearning-org/OpenSMS.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'Locally hosted SMS API server.', verdict: 'gap',
    claim: 'The local SMS route stores pending records; it does not run OpenSMS or send these records.',
    evidence: [{ label: 'SMS route', path: 'src/app/api/sms/route.ts', kind: 'route' }],
    gap: 'No OpenSMS deployment, adapter, or end-to-end delivery test.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'httpsms', url: 'https://github.com/NdoleStudio/httpsms.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'Android phone SMS gateway and server.', verdict: 'gap',
    claim: 'A tested httpSMS send adapter exists, but it is not wired to the SMS route and no server or Android bridge has been deployed.',
    evidence: [{ label: 'SMS route', path: 'src/app/api/sms/route.ts', kind: 'route' }, { label: 'httpSMS client', path: 'src/lib/sms/httpsms-client.ts', kind: 'library' }, { label: 'Adapter contract tests', path: '__tests__/lib/httpsms-client.node.test.mjs', kind: 'test' }],
    gap: 'Secure route integration, configured gateway, Android device, inbound webhooks and live delivery verification are missing.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'httpsms-node', url: 'https://github.com/NdoleStudio/httpsms-node.git', kind: 'repository', category: 'Voice, calls & SMS',
    upstream: 'Node.js client for the httpSMS API.', verdict: 'gap',
    claim: 'A first-party adapter implements the documented send request; the upstream Node package is not installed and the SMS route does not call the adapter.',
    evidence: [{ label: 'SMS route', path: 'src/app/api/sms/route.ts', kind: 'route' }, { label: 'httpSMS client', path: 'src/lib/sms/httpsms-client.ts', kind: 'library' }, { label: 'Contract tests', path: '__tests__/lib/httpsms-client.node.test.mjs', kind: 'test' }],
    gap: 'No route integration, live provider test, inbound handling or encryption support.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'wacrm', url: 'https://github.com/ArnasDon/wacrm.git', kind: 'repository', category: 'Chat & messaging',
    upstream: 'Self-hostable WhatsApp CRM template.', verdict: 'gap',
    claim: 'CRM and WhatsApp routes exist locally; they are not the wacrm application and parity has not been verified.',
    evidence: [{ label: 'CRM contacts', path: 'src/app/api/crm/contacts/route.ts', kind: 'route' }, { label: 'WhatsApp send', path: 'src/app/api/whatsapp/send/route.ts', kind: 'route' }],
    gap: 'No wacrm fork or integration, and no feature parity test.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'deskcomm-crm', url: 'https://github.com/melgarafael/DeskcommCRM.git', kind: 'repository', category: 'Chat & messaging',
    upstream: 'Self-hosted sales CRM with AI agents and WhatsApp.', verdict: 'gap',
    claim: 'Related CRM and agent routes exist; DeskcommCRM is not installed and parity has not been verified.',
    evidence: [{ label: 'CRM contacts', path: 'src/app/api/crm/contacts/route.ts', kind: 'route' }, { label: 'Agent runtime', path: 'src/lib/agent-runtime/tool-loop.ts', kind: 'library' }],
    gap: 'No DeskcommCRM integration or feature parity test.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'meta-model-cookbook', url: 'https://github.com/meta-models/meta-model-cookbook.git', kind: 'repository', category: 'AI & models',
    upstream: 'Meta Model API recipes and examples.', verdict: 'reference',
    claim: 'A Llama provider adapter and agent loop exist locally, but cookbook examples are not imported or validated.',
    evidence: [{ label: 'Llama adapter', path: 'src/lib/ai-router/llama-provider.ts', kind: 'library' }, { label: 'Agent loop', path: 'src/lib/agent-runtime/tool-loop.ts', kind: 'library' }],
    gap: 'Live model contracts and cookbook feature parity remain unverified.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'meta-developer-ai', url: 'https://developer.meta.com/ai', kind: 'site', category: 'AI & models',
    upstream: 'Meta developer AI resources.', verdict: 'reference',
    claim: 'A Llama provider adapter exists locally. This site could not be fetched in the sandbox.',
    evidence: [{ label: 'Llama adapter', path: 'src/lib/ai-router/llama-provider.ts', kind: 'library' }],
    gap: 'No live Meta service or site feature parity verification.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
  {
    id: 'openrouter-agent-loop-tutorial', url: 'https://openrouter.ai/blog/tutorials/build-tool-calling-agent-loop', kind: 'site', category: 'AI & models',
    upstream: 'OpenRouter tool-calling agent loop tutorial.', verdict: 'reference',
    claim: 'Local tool-loop and OpenRouter adapter code exists. The tutorial could not be fetched in the sandbox; parity and live execution are unverified.',
    evidence: [{ label: 'Agent loop', path: 'src/lib/agent-runtime/tool-loop.ts', kind: 'library' }, { label: 'OpenRouter provider', path: 'src/lib/ai-router/openrouter-provider.ts', kind: 'library' }],
    gap: 'Compare against the tutorial and test against a configured provider.', upstreamMeta: { checkedAt: '2026-11-02' },
  },
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
      'An SMS surface exists here, but its SMS route only stores pending messages; it does not dispatch them to an SMS provider or Android device bridge.',
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
      'Ingestion and retrieval exist (RAG ingest of supplied text/URLs, a research hub). Phase D added a single-page public analyser (robots-aware, SSRF-guarded HTTP fetch, capped), but there is no crawler: it does not follow links, batch-process sites, or convert pages to markdown.',
    evidence: [
      { label: 'Public page analyser', path: 'src/lib/research/public-page.ts', kind: 'library' },
      { label: 'Research API', path: 'src/app/api/research/analyze/route.ts', kind: 'route' },
      { label: 'RAG ingest route', path: 'src/app/api/rag/ingest/route.ts', kind: 'route' },
      { label: 'RAG engine', path: 'src/lib/rag-engine.ts', kind: 'library' },
    ],
    gap: 'Needs a crawl/batch layer (link following, markdown conversion, per-host budgets) in front of /api/rag/ingest; rendered-DOM capture is still Phase D tier 2.',
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
  // ─── Requested 2026-11-27: the AI-platform ecosystem, audit at call time ───
  // These fifteen links arrived together. Eight of them already have a
  // registered adapter under ONE Runtime, so the honest verdict is
  // `implemented` — the adapter exists and is catalogue-visible, but no
  // upstream instance is deployed by this repository. Three are genuine gaps
  // (e-signature, cloud browser, OpenAPI export) and are labelled as such.
  {
    id: 'litellm-org', url: 'https://github.com/orgs/BerriAI/repositories', kind: 'repository', category: 'AI & models',
    upstream: 'BerriAI — LiteLLM proxy and SDK: one OpenAI-compatible gateway in front of 100+ providers (Python core, MIT with separately licensed enterprise features).',
    verdict: 'implemented',
    claim: 'A LiteLLM adapter is registered under ONE Runtime as `gateway.litellm`, and the platform provider layer also treats LiteLLM as a provider kind, so a self-hosted proxy is a supported backend rather than a rewrite.',
    evidence: [
      { label: 'LiteLLM adapter', path: 'src/lib/integrations/connectors/gateway/litellm.ts', kind: 'library' },
      { label: 'Adapter catalogue API', path: 'src/app/api/integrations/catalog/route.ts', kind: 'route' },
      { label: 'Platform provider adapters', path: 'src/lib/platform/providers.ts', kind: 'library' },
    ],
    gap: 'No LiteLLM proxy is deployed here and no live-proxy contract test runs in CI; the adapter is exercised against a local stub only.',
    upstreamMeta: { stars: 64009, language: 'Python', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'monid', url: 'https://github.com/monid-ai/monid.git', kind: 'repository', category: 'AI & models',
    upstream: 'Monid — open-source AI tool directory and agent workspace (TypeScript, MIT).',
    verdict: 'reference',
    claim: 'A tool/model directory, not an engine. This repository keeps its own curated catalogues instead (open-source model hub, free-tier resources, adapter registry), so no Monid code is vendored.',
    evidence: [
      { label: 'Open-source model catalogue', path: 'src/lib/open-source-models.ts', kind: 'library' },
      { label: 'Model hub panel', path: 'src/components/panels/model-hub-panel.tsx', kind: 'panel' },
      { label: 'Free-tier resource catalogue', path: 'src/lib/free-resources.ts', kind: 'library' },
    ],
    upstreamMeta: { stars: 5683, language: 'TypeScript', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'monid-tools', url: 'https://monid.ai/tools', kind: 'site', category: 'AI & models',
    upstream: 'Monid’s hosted AI tool directory — a browsable index of third-party AI tools.',
    verdict: 'reference',
    claim: 'A public directory: nothing to integrate. Its role is covered in kind by this repository’s own tool surfaces — the model hub, the adapter catalogue and the stack register page — which list what is actually usable here rather than what exists elsewhere.',
    evidence: [
      { label: 'Adapter registry (26 upstream systems)', path: 'src/lib/integrations/registry.ts', kind: 'library' },
      { label: 'Model hub panel', path: 'src/components/panels/model-hub-panel.tsx', kind: 'panel' },
      { label: 'Stack register page', path: 'src/app/site/stack/page.tsx', kind: 'page' },
    ],
    upstreamMeta: { checkedAt: REQUESTED_DATE },
  },
  {
    id: 'signudoc', url: 'https://github.com/NYLLON-SOFTWARE/SignuDoc.git', kind: 'repository', category: 'Business operations',
    upstream: 'SignuDoc — self-hostable electronic signature and document-signing suite (TypeScript, MIT, 3.3k stars).',
    verdict: 'gap',
    claim: 'Deliverable acceptance, invoicing and human approvals exist, but there is no signature capture, document hash, timestamp authority or tamper-evident signing record anywhere in this repository.',
    evidence: [
      { label: 'Deliverables acceptance page', path: 'src/app/portal/deliverables/page.tsx', kind: 'page' },
      { label: 'Invoice surface', path: 'src/app/invoice/page.tsx', kind: 'page' },
      { label: 'Approval resolution (closest existing gate)', path: 'src/app/api/v1/approvals/[id]/route.ts', kind: 'route' },
    ],
    gap: 'Add a `DocumentSignature` model (documentId, signerId, companyId, sha256, signedAt, IP), a SignuDoc adapter registered under ONE Runtime, and an end-to-end test that a tampered document fails verification. Needs legal review of eIDAS/ESIGN evidence requirements before it is offered to customers.',
    upstreamMeta: { stars: 3314, language: 'TypeScript', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'floppydata-cloud-browser', url: 'https://floppydata.com/cloud-browser/', kind: 'site', category: 'Developer tooling',
    upstream: 'FloppyData Cloud Browser — hosted browser sessions for agents (CDP/VNC endpoints, per-session isolation).',
    verdict: 'gap',
    claim: 'The Command Agent’s tools are HTTP fetches (search, Wikipedia, weather) and an MCP server registry exists, but no agent can drive a real browser session: there is no CDP client, no session pool and no screenshot/consent flow.',
    evidence: [
      { label: 'Command Agent tools (fetch only)', path: 'src/lib/command-agent/tools.ts', kind: 'library' },
      { label: 'MCP server registry', path: 'src/app/api/mcp-servers/route.ts', kind: 'route' },
    ],
    gap: 'Same underlying gap as the browse MCP row: add a browser tool that opens an isolated CDP session, records every navigation, requires approval for credentialed flows, and is covered by a task-level test. A hosted provider is one option; a self-hosted container pool is the other.',
    upstreamMeta: { checkedAt: REQUESTED_DATE },
  },
  {
    id: 'nocobase', url: 'https://github.com/orgs/nocobase/repositories', kind: 'repository', category: 'Business operations',
    upstream: 'NocoBase — no-code/low-code data platform for internal tools (TypeScript core, AGPL-3.0 with separately licensed plugins).',
    verdict: 'implemented',
    claim: 'A NocoBase adapter is registered under ONE Runtime as `automation.nocobase` with an API-only strategy and a custom-model-license classification, so a separately hosted NocoBase instance can be read from without vendoring AGPL code.',
    evidence: [
      { label: 'NocoBase adapter', path: 'src/lib/integrations/connectors/automation/nocobase.ts', kind: 'library' },
      { label: 'Bootstrap registration', path: 'src/lib/integrations/index.ts', kind: 'library' },
      { label: 'Adapter catalogue API', path: 'src/app/api/integrations/catalog/route.ts', kind: 'route' },
    ],
    gap: 'Collections are listed but no record write-back path or live instance test exists; internal-tool authoring stays in the platform’s own panels.',
    upstreamMeta: { stars: 25028, language: 'TypeScript', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'temporalio', url: 'https://github.com/orgs/temporalio/repositories', kind: 'repository', category: 'Developer tooling',
    upstream: 'Temporal — durable execution engine: workflows as code with retries, timers and crash recovery (Go server, MIT).',
    verdict: 'in_kind',
    claim: 'Durable execution is implemented natively rather than delegated: `AgentOSRun` + `RunEvent` + a lease-based `QueueItem` job queue give checkpointing, retry, cancel and crash recovery (20 behaviours acceptance-tested). A Temporal adapter also exists for teams that already run a cluster.',
    evidence: [
      { label: 'Run engine (checkpoints, retry, cancel)', path: 'src/lib/runs/index.ts', kind: 'library' },
      { label: 'Lease-based job queue', path: 'src/lib/job-queue.ts', kind: 'library' },
      { label: 'Durability acceptance tests', path: '__tests__/integration/run-engine-behaviours.test.ts', kind: 'test' },
      { label: 'Temporal adapter', path: 'src/lib/integrations/connectors/automation/temporal.ts', kind: 'library' },
    ],
    gap: 'No Temporal cluster is deployed; the native engine is the production path, so a Temporal migration would be a deliberate architectural change, not an upgrade.',
    upstreamMeta: { stars: 24627, language: 'Go', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'activepieces', url: 'https://github.com/activepieces/activepieces', kind: 'repository', category: 'Business operations',
    upstream: 'Activepieces — open-source automation builder with 200+ pieces (TypeScript, MIT core).',
    verdict: 'implemented',
    claim: 'An Activepieces adapter is registered as `automation.activepieces` and the platform’s own workflow engine plus tenant-scoped automation triggers (17 definitions, 109 steps, checked by `npm run check:workflows`) cover the flows this product needs.',
    evidence: [
      { label: 'Activepieces adapter', path: 'src/lib/integrations/connectors/automation/activepieces.ts', kind: 'library' },
      { label: 'Workflow definitions', path: 'src/lib/workflow-engine/index.ts', kind: 'library' },
      { label: 'Tenant-scoped automation API', path: 'src/app/api/automation/triggers/route.ts', kind: 'route' },
    ],
    gap: 'No Activepieces instance is deployed and no flow is imported from it; the adapter lists flows for display, it does not execute upstream pieces.',
    upstreamMeta: { stars: 25753, language: 'TypeScript', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'directus', url: 'https://github.com/orgs/directus/repositories', kind: 'repository', category: 'Business operations',
    upstream: 'Directus — headless data platform and admin for any SQL database (TypeScript, source-available BSL-style licence).',
    verdict: 'implemented',
    claim: 'A Directus adapter is registered as `content.directus` with a source-available licence class and API-only strategy: content can be read from a separately hosted Directus without mixing licences.',
    evidence: [
      { label: 'Directus adapter', path: 'src/lib/integrations/connectors/content/directus.ts', kind: 'library' },
      { label: 'Bootstrap registration', path: 'src/lib/integrations/index.ts', kind: 'library' },
      { label: 'Prisma schema (own data model)', path: 'prisma/schema.prisma', kind: 'schema' },
    ],
    gap: 'No Directus instance is deployed; the platform keeps its own Prisma model as the source of truth, so Directus is an optional side-car rather than the admin layer.',
    upstreamMeta: { stars: 38699, language: 'TypeScript', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'aider-org', url: 'https://github.com/orgs/Aider-AI/repositories', kind: 'repository', category: 'Developer tooling',
    upstream: 'Aider — AI pair-programming CLI that edits a local git repository through structured diffs (Python, Apache-2.0).',
    verdict: 'implemented',
    claim: 'An Aider adapter is registered as `coding-agent.aider` with a REUSE strategy, including hunk formatting/parsing so generated edits are applied as reviewable diffs rather than whole-file overwrites.',
    evidence: [
      { label: 'Aider adapter (REUSE)', path: 'src/lib/integrations/connectors/coding-agent/aider.ts', kind: 'library' },
      { label: 'Agent factory route', path: 'src/app/api/agent-factory/build/route.ts', kind: 'route' },
      { label: 'Skill factory route', path: 'src/app/api/skill-factory/build/route.ts', kind: 'route' },
    ],
    gap: 'No Aider process is spawned here: the adapter formats and validates diffs, it does not run upstream code, and no repository-editing task has been executed end to end.',
    upstreamMeta: { stars: 50282, language: 'Python', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'librechat-org', url: 'https://github.com/LibreChat-AI', kind: 'repository', category: 'AI & models',
    upstream: 'LibreChat — multi-provider chat UI with agents, presets and file handling (TypeScript, MIT).',
    verdict: 'implemented',
    claim: 'A LibreChat adapter lists models from a separately hosted instance, and the platform ships its own multi-provider chat (`/platform/chat`, the unified dashboard chat panel) with conversation persistence and per-workspace tenancy.',
    evidence: [
      { label: 'LibreChat adapter', path: 'src/lib/integrations/connectors/ai-chat/librechat.ts', kind: 'library' },
      { label: 'Platform chat route', path: 'src/app/api/v1/platform/chat/route.ts', kind: 'route' },
      { label: 'Unified chat panel', path: 'src/components/chat/unified-chat.tsx', kind: 'panel' },
    ],
    gap: 'Model listing only — conversations are not mirrored between LibreChat and this platform, and no LibreChat instance is deployed.',
    upstreamMeta: { stars: 47577, language: 'TypeScript', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'open-webui-org', url: 'https://github.com/orgs/open-webui/repositories', kind: 'repository', category: 'AI & models',
    upstream: 'Open WebUI — self-hosted AI interface for Ollama and OpenAI-compatible backends (Svelte, source-available licence with branding terms).',
    verdict: 'implemented',
    claim: 'An Open WebUI adapter is registered as `ai-chat.open-webui` with a source-available licence class, and the platform’s model hub panel renders the same deployment/health information for its own registry.',
    evidence: [
      { label: 'Open WebUI adapter', path: 'src/lib/integrations/connectors/ai-chat/open-webui.ts', kind: 'library' },
      { label: 'Model hub panel', path: 'src/components/panels/model-hub-panel.tsx', kind: 'panel' },
      { label: 'Model registry (capability routing)', path: 'src/lib/platform/model-registry.ts', kind: 'library' },
    ],
    gap: 'The licence gates redistribution of Open WebUI’s branding, so this repository integrates over HTTP only and does not vendor its frontend.',
    upstreamMeta: { stars: 159669, language: 'Svelte', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'free-for-dev-upstream', url: 'https://github.com/ripienaar/free-for-dev.git', kind: 'repository', category: 'Reference & content',
    upstream: 'free-for.dev — the canonical list of free developer tiers (HTML/Markdown, 143k stars, no licence file).',
    verdict: 'implemented',
    claim: 'A curated, honest subset lives in `src/lib/free-resources.ts` and is served by `/api/free-resources`: only entries that map onto a capability this product implements, each with the quoted allowance and a verify URL, and nothing auto-enabled.',
    evidence: [
      { label: 'Curated free-tier catalogue', path: 'src/lib/free-resources.ts', kind: 'library' },
      { label: 'Free resources API', path: 'src/app/api/free-resources/route.ts', kind: 'route' },
      { label: 'Link coverage for the mirror', path: 'src/lib/link-coverage/registry.ts', kind: 'library' },
    ],
    gap: 'The curated subset is intentionally partial and the quoted allowances are dated; re-verify vendor terms before anything is offered as free to a customer.',
    upstreamMeta: { stars: 143797, language: 'HTML', archived: false, checkedAt: REQUESTED_DATE },
  },
  {
    id: 'postman', url: 'https://www.postman.com', kind: 'site', category: 'Developer tooling',
    upstream: 'Postman — API client, collection runner and documentation host.',
    verdict: 'gap',
    claim: 'The API surface is real and mechanically classified (542 route files, 856 non-public handlers checked by `scripts/validate-route-auth.mjs`), but no OpenAPI document or Postman collection is published, so a client developer cannot import the API into Postman today.',
    evidence: [
      { label: 'Route classification gate', path: 'scripts/classify-routes.mjs', kind: 'config' },
      { label: 'Route auth gate', path: 'scripts/validate-route-auth.mjs', kind: 'config' },
      { label: 'Typed platform API (zod schemas)', path: 'src/app/api/v1/platform/models/route.ts', kind: 'route' },
    ],
    gap: 'Generate an OpenAPI 3.1 document from the zod request/response schemas, publish it at `/api/openapi.json`, and export a Postman collection from it in CI so the two cannot drift.',
    upstreamMeta: { checkedAt: REQUESTED_DATE },
  },
  {
    id: 'youbtech01', url: 'https://github.com/YouBTech01', kind: 'repository', category: 'Reference & content',
    upstream: 'GitHub account supplied in the reference list without a named repository.',
    verdict: 'not_applicable',
    claim: 'The link is an account profile, not an artefact: no repository, release or package was identified at request time, so nothing could be inspected, attributed or integrated. Recording it here keeps the reference list complete without pretending to a capability.',
    evidence: [
      { label: 'This coverage registry', path: 'src/lib/link-coverage/registry.ts', kind: 'library' },
      { label: 'Ecosystem reverse map', path: 'docs/ECOSYSTEM_REVERSE_MAP.md', kind: 'doc' },
    ],
    gap: 'Re-submit with the specific repository URL(s) to be evaluated; an account listing alone cannot move past this verdict.',
    upstreamMeta: { checkedAt: REQUESTED_DATE },
  },

];

/** Convenience lookups used by the API route, the panel and the tests. */
export const COVERAGE_CATEGORIES = Array.from(
  new Set(LINK_COVERAGE.map((entry) => entry.category)),
).sort();

export const COVERAGE_CHECKED_AT = CHECKED;
