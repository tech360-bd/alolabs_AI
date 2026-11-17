/**
 * Curated free-tier resources for the ALO Labs voice & contact-center product.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The owner asked for the free-for.dev list to be used "so no paid AI provider
 * is required". That list is 100+ vendors across 36 categories; pasting it into
 * the product would be noise. This module keeps only the entries that map onto
 * a real capability this repo implements, and states honestly what each one can
 * and cannot do for us.
 *
 * RULES THIS FILE OBEYS
 * ---------------------
 * 1. Nothing here is auto-enabled. A resource is a *candidate*; the operator
 *    connects it by setting env vars or creating an `AIProviderConfig` row.
 * 2. `freeAllowance` is quoted from the vendor at the time of writing and is
 *    explicitly marked unverified. Free tiers change without notice, so the UI
 *    must always show `verifyUrl` next to the claim.
 * 3. `free: 'free'` means the runtime is genuinely free to self-host with no
 *    quota (Piper, Whisper). `free: 'quota'` means a hosted allowance that can
 *    be exhausted or withdrawn. `free: 'no-free-tier'` exists so a vendor we
 *    integrate for capability reasons is never mislabelled free.
 * 4. This is NOT a list of licenses. Open-source status of a *product* is
 *    separate from the terms of the *models* it serves; the voice evaluation
 *    doc governs model licensing.
 *
 * The LLM side deliberately lives in `ai-provider-catalog.ts` +
 * `ai-router/free-provider-specs.ts` (the executable path). This module covers
 * the capability gaps those do not: speech engines and infrastructure.
 */

export type FreeTierKind = 'free' | 'quota' | 'no-free-tier';

export type ResourceCategory =
  | 'speech-tts'
  | 'speech-asr'
  | 'llm-inference'
  | 'telephony'
  | 'hosting'
  | 'database'
  | 'storage'
  | 'messaging'
  | 'ci-cd'
  | 'monitoring'
  | 'error-tracking'
  | 'email';

export interface FreeResource {
  id: string;
  name: string;
  category: ResourceCategory;
  free: FreeTierKind;
  /** Self-hostable with no time limit and no vendor quota. */
  selfHostable: boolean;
  /** Quoted free allowance. Always paired with verifyUrl in the UI. */
  freeAllowance: string;
  /** Where a human confirms the current terms. Never treated as proof. */
  verifyUrl: string;
  /** The module in THIS repo the resource plugs into. */
  usedBy: string[];
  /** Honest constraint an operator must know before relying on it. */
  caveat: string;
}

/**
 * Ordered by product criticality: speech first, because Bangla TTS/ASR is the
 * capability this deployment is actually missing.
 */
export const FREE_RESOURCES: readonly FreeResource[] = [
  // ─── Speech: the real gap ────────────────────────────────────────────────
  {
    id: 'piper',
    name: 'Piper (Rhasspy)',
    category: 'speech-tts',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted — no vendor account, no quota.',
    verifyUrl: 'https://github.com/rhasspy/piper',
    usedBy: ['VOICE_TTS_PROVIDER=piper', 'src/lib/voice/speech-adapters/http-engine.ts', 'Voice Studio'],
    caveat:
      'Model quality varies per voice. A bn-BD voice must be trained or commissioned and evaluated by native speakers before any quality claim — see docs/BANGLA_VOICE_MODEL_EVALUATION.md.',
  },
  {
    id: 'coqui-xtts',
    name: 'Coqui XTTS',
    category: 'speech-tts',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted.',
    verifyUrl: 'https://github.com/coqui-ai/TTS',
    usedBy: ['VOICE_TTS_PROVIDER=openai (XTTS server)', 'Voice Library & Cloning'],
    caveat:
      'Cloning requires the voice owner’s documented consent. The Coqui company wound down; the code is community-maintained, so pin and audit the revision you deploy.',
  },
  {
    id: 'kokoro-fastapi',
    name: 'Kokoro-FastAPI',
    category: 'speech-tts',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted; exposes the OpenAI audio contract.',
    verifyUrl: 'https://github.com/remsky/Kokoro-FastAPI',
    usedBy: ['VOICE_TTS_PROVIDER=openai', 'VOICE_TTS_MODEL=kokoro'],
    caveat:
      'Bangla coverage is not guaranteed by upstream — verify a bn-BD voice exists before configuring, and run the eval harness before enabling.',
  },
  {
    id: 'faster-whisper-server',
    name: 'Faster-Whisper-Server',
    category: 'speech-asr',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted.',
    verifyUrl: 'https://github.com/speaches-ai/speaches',
    usedBy: ['VOICE_ASR_PROVIDER=openai', 'Voice Studio', 'Call transcripts'],
    caveat:
      'Whisper-family Bangla WER is UNMEASURED here. Record a baseline with scripts/run-voice-benchmark.ts before claiming accuracy.',
  },

  // ─── Hosted LLM allowances (executable path already exists) ──────────────
  {
    id: 'groq',
    name: 'Groq',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Rate-limited free tier (re-verify; limits change often).',
    verifyUrl: 'https://console.groq.com/docs/rate-limits',
    usedBy: ['AI_PROVIDER_PRESETS: groq', 'GROQ_API_KEY'],
    caveat: 'Quota-based, not price-guaranteed. Never route regulated call audio here without the tenant’s data policy approval.',
  },
  {
    id: 'gemini-ai-studio',
    name: 'Google AI Studio (Gemini)',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free tier for Flash/Gemma models (re-verify per model).',
    verifyUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    usedBy: ['AI_PROVIDER_PRESETS: gemini', 'GEMINI_API_KEY'],
    caveat: 'Free-tier inputs may be used to improve the product. Do not send customer PII or call recordings without a signed data agreement.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras Inference',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free developer tier (re-verify).',
    verifyUrl: 'https://inference-docs.cerebras.ai/',
    usedBy: ['AI_PROVIDER_PRESETS: cerebras', 'CEREBRAS_API_KEY'],
    caveat: 'Quota-based. Suitable for drafting and summarisation, not for guaranteed 24/7 call handling.',
  },
  {
    id: 'sambanova',
    name: 'SambaNova Cloud',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free developer tier (re-verify).',
    verifyUrl: 'https://docs.sambanova.ai/cloud/docs/get-started/overview',
    usedBy: ['AI_PROVIDER_PRESETS: sambanova', 'SAMBANOVA_API_KEY'],
    caveat: 'Quota-based. Was previously unsupported in the admin console despite a working runtime spec — now selectable.',
  },
  {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free API credits on the hosted catalogue (re-verify).',
    verifyUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
    usedBy: ['AI_PROVIDER_PRESETS: nvidia', 'NVIDIA_API_KEY'],
    caveat: 'Credits expire and are not a standing free tier. NIM containers can also be self-hosted on your own GPU.',
  },
  {
    id: 'cloudflare-workers-ai',
    name: 'Cloudflare Workers AI',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Daily free neuron allowance (re-verify).',
    verifyUrl: 'https://developers.cloudflare.com/workers-ai/platform/limits/',
    usedBy: ['AI_PROVIDER_PRESETS: cloudflare-workers-ai', 'CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID'],
    caveat: 'Requires an account id in the path; the router skips it when the id is missing.',
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free with rate limits for GitHub accounts (re-verify).',
    verifyUrl: 'https://docs.github.com/en/github-models',
    usedBy: ['AI_PROVIDER_PRESETS: github-models', 'GITHUB_MODELS_TOKEN'],
    caveat: 'Rate-limited and intended for prototyping; not an SLA-bearing production endpoint.',
  },
  {
    id: 'huggingface-inference',
    name: 'Hugging Face Inference Providers',
    category: 'llm-inference',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Monthly included credits (re-verify).',
    verifyUrl: 'https://huggingface.co/docs/inference-providers/en/index',
    usedBy: ['AI_PROVIDER_PRESETS: huggingface', 'HF_TOKEN'],
    caveat: 'Model licences differ per repository. Check the licence of each model you call, especially for Bangla speech models.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    category: 'llm-inference',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted.',
    verifyUrl: 'https://docs.ollama.com/api/openai-compatibility',
    usedBy: ['AI_PROVIDER_PRESETS: ollama', 'Local AI inference'],
    caveat: 'Needs an inference-capable machine. This sandbox has 2 vCPU / 3.8 GiB and is not a production speech or LLM host.',
  },

  // ─── Infrastructure for running the product ──────────────────────────────
  {
    id: 'fly-io',
    name: 'Fly.io',
    category: 'hosting',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Limited free machine allowance (re-verify; terms have changed repeatedly).',
    verifyUrl: 'https://fly.io/docs/about/pricing/',
    usedBy: ['Production deployment (not yet approved)'],
    caveat: 'A telephony workload needs a stable IP and low jitter. Do not treat any free host as carrier-grade for call media.',
  },
  {
    id: 'render',
    name: 'Render',
    category: 'hosting',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free web services that sleep when idle (re-verify).',
    verifyUrl: 'https://render.com/docs/free',
    usedBy: ['Staging deployment'],
    caveat: 'Cold starts break inbound call webhooks. Never point a production telephony webhook at a sleeping instance.',
  },
  {
    id: 'neon',
    name: 'Neon Postgres',
    category: 'database',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free project with storage and compute limits (re-verify).',
    verifyUrl: 'https://neon.com/pricing',
    usedBy: ['MySQL/Postgres production twin (prisma/schema.mysql.prisma)'],
    caveat: 'This repo targets MySQL in production (src/lib/production-database.ts). Postgres would need a datasource change and is not the supported path.',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'database',
    free: 'quota',
    selfHostable: true,
    freeAllowance: 'Free project tier; the stack is open source and self-hostable.',
    verifyUrl: 'https://supabase.com/pricing',
    usedBy: ['Storage adapter candidate (src/lib/storage/)'],
    caveat: 'Free projects pause when idle. Call recordings must not depend on a pausing store.',
  },
  {
    id: 'minio',
    name: 'MinIO',
    category: 'storage',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted.',
    verifyUrl: 'https://min.io/docs/minio/linux/index.html',
    usedBy: ['src/lib/storage/ (S3-compatible adapter)'],
    caveat: 'You own durability and backups. Recording retention is a legal question, not a storage one.',
  },
  {
    id: 'redis',
    name: 'Redis / Valkey',
    category: 'database',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Unlimited when self-hosted.',
    verifyUrl: 'https://valkey.io/',
    usedBy: ['Job queue, presence, rate limiting'],
    caveat: 'In-memory: losing the instance loses queued jobs unless persistence is configured and tested.',
  },
  {
    id: 'twilio-trial',
    name: 'Twilio',
    category: 'telephony',
    free: 'no-free-tier',
    selfHostable: false,
    freeAllowance: 'Trial credit only — NOT a free tier. Listed so it is never mistaken for one.',
    verifyUrl: 'https://www.twilio.com/en-us/pricing',
    usedBy: ['Telephony provider adapter (VOICE_TELEPHONY_PROVIDER)'],
    caveat:
      'PSTN calling costs money per minute and requires regulatory compliance in Bangladesh. The adapter is replaceable; no free carrier exists for real outbound calls.',
  },
  {
    id: 'livekit',
    name: 'LiveKit',
    category: 'telephony',
    free: 'free',
    selfHostable: true,
    freeAllowance: 'Open source and self-hostable; hosted tier is separate.',
    verifyUrl: 'https://github.com/livekit/livekit',
    usedBy: ['WebRTC media path candidate for agent workspace'],
    caveat: 'Carries media, not PSTN. You still need a carrier (paid) to reach phone numbers.',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    category: 'error-tracking',
    free: 'quota',
    selfHostable: true,
    freeAllowance: 'Free tier for small teams; unlimited when self-hosted.',
    verifyUrl: 'https://docs.sentry.io/',
    usedBy: ['Error tracking for API routes'],
    caveat: 'Scrub call metadata and PII before sending events off-host.',
  },
  {
    id: 'grafana-cloud',
    name: 'Grafana Cloud',
    category: 'monitoring',
    free: 'quota',
    selfHostable: true,
    freeAllowance: 'Free metrics/logs allowance; Grafana itself is open source.',
    verifyUrl: 'https://grafana.com/pricing/',
    usedBy: ['Call-quality and latency dashboards'],
    caveat: 'Retention on the free tier is short — insufficient for a months-long QA audit trail.',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    category: 'ci-cd',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free minutes for public repos; metered for private (re-verify).',
    verifyUrl: 'https://docs.github.com/en/billing/managing-billing-for-github-actions',
    usedBy: ['CI: vitest, tsc, eval-harness exit codes'],
    caveat: 'A full-repo type check needs ~4 GiB and exceeds the default runner heap — mirror the scoped tsconfig used here.',
  },
  {
    id: 'brevo',
    name: 'Brevo',
    category: 'email',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Daily/monthly send allowance (re-verify).',
    verifyUrl: 'https://www.brevo.com/pricing/',
    usedBy: ['Transactional email (src/lib/email/)', 'Inbox email channel'],
    caveat: 'Bulk marketing consent rules apply. Transactional and marketing sending must stay separate.',
  },
  {
    id: 'resend',
    name: 'Resend',
    category: 'email',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Free monthly sends (re-verify).',
    verifyUrl: 'https://resend.com/pricing',
    usedBy: ['Transactional email (src/lib/email/)'],
    caveat: 'Requires a verified sending domain; free tier limits daily volume.',
  },
  {
    id: 'appwrite',
    name: 'Appwrite',
    category: 'storage',
    free: 'quota',
    selfHostable: true,
    freeAllowance: 'Free cloud project tier; self-hostable.',
    verifyUrl: 'https://appwrite.io/pricing',
    usedBy: ['Alternate storage/auth backend (not wired)'],
    caveat: 'Not integrated. Listed as an option, not a supported path.',
  },
  {
    id: 'backblaze-b2',
    name: 'Backblaze B2',
    category: 'storage',
    free: 'quota',
    selfHostable: false,
    freeAllowance: 'Small free storage allowance (re-verify).',
    verifyUrl: 'https://www.backblaze.com/cloud-storage/pricing',
    usedBy: ['Call recording archive'],
    caveat: 'Egress is metered. Playback of recordings at scale is a real cost.',
  },
] as const;

export function resourcesByCategory(category: ResourceCategory): FreeResource[] {
  return FREE_RESOURCES.filter((r) => r.category === category);
}

/** Only resources that cost nothing to self-host with no vendor quota. */
export function trulyFreeResources(): FreeResource[] {
  return FREE_RESOURCES.filter((r) => r.free === 'free' && r.selfHostable);
}

/**
 * Resources a tenant can enable right now with env vars and no new code.
 * Derived from the adapters that actually exist, not from aspiration.
 */
export function immediatelyUsableResources(): FreeResource[] {
  return FREE_RESOURCES.filter((r) =>
    r.usedBy.some((u) => /^[A-Z_]+=/.test(u) || /AI_PROVIDER_PRESETS:/.test(u)),
  );
}

/**
 * Honest roll-up for the admin UI. States plainly how much of the stack can run
 * at zero marginal cost and what cannot.
 */
export function freeStackCoverage() {
  const total = FREE_RESOURCES.length;
  const free = FREE_RESOURCES.filter((r) => r.free === 'free').length;
  const quota = FREE_RESOURCES.filter((r) => r.free === 'quota').length;
  const paidOnly = FREE_RESOURCES.filter((r) => r.free === 'no-free-tier').length;
  return {
    total,
    selfHostedUnlimited: free,
    hostedQuota: quota,
    paidOnly,
    caveat:
      'PSTN telephony, Bangla speech model quality, and production call capacity cannot be obtained free. Everything else in this list is a zero-or-quota option, and every allowance must be re-verified with the vendor.',
  };
}
