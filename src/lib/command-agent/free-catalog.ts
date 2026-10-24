/**
 * Free AI Catalog — the single source of truth for zero-cost AI in AgentOS.
 *
 * Everything here is a *pointer*, not a promise: free tiers change often, so
 * each entry links to the provider's official page where the operator must
 * verify the current terms, rate limits and commercial-use rules before
 * enabling it (the Super Admin provider-verification flow records that check).
 *
 * Cost model used across AgentOS stays unchanged:
 *  - a model is only *routed* as free when the provider config + verification
 *    say so (see `src/lib/multi-tenant-ai/policy.ts`);
 *  - this catalogue only tells admins what exists, where to get a free key,
 *    and which Control Plane provider kind / base URL / model ids to enter.
 */

export type FreeServiceCategory =
  | 'llm'
  | 'embedding'
  | 'image'
  | 'speech-to-text'
  | 'text-to-speech'
  | 'search'
  | 'data'
  | 'local'
  | 'infrastructure';

export interface FreeModel {
  /** Exact model id to enter in the provider catalogue. */
  id: string;
  name: string;
  strength: string;
  /** Router capabilities (subset of AICapability). */
  capabilities: string[];
  contextLength?: number;
}

export interface FreeProvider {
  id: string;
  label: string;
  category: FreeServiceCategory;
  /** AI_PROVIDER_PRESETS kind to pick in the Super Admin AI Control Plane. */
  providerKind: string;
  /** Base URL to paste into the provider config (empty = local/custom). */
  baseUrl: string;
  /** Where a human gets a free key / installs the runtime. */
  getKeyUrl: string;
  docsUrl: string;
  /** Environment variable the router auto-detects, when supported. */
  envVar?: string;
  apiKeyRequired: boolean;
  cardRequired: boolean;
  local: boolean;
  /** Typical free allowance at time of writing — always re-verify. */
  freeAllowance: string;
  notes: string;
  models: FreeModel[];
}

export interface FreeService {
  name: string;
  category: FreeServiceCategory;
  description: string;
  freeAllowance: string;
  url: string;
  apiKeyRequired: boolean;
  /** Set when the Command Agent can call it today as a tool. */
  agentTool?: string;
}

// ─── Free LLM providers (no card) ────────────────────────────────────────────

export const FREE_LLM_PROVIDERS: readonly FreeProvider[] = [
  {
    id: 'groq',
    label: 'Groq (fastest free inference)',
    category: 'llm',
    providerKind: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    getKeyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/openai',
    envVar: 'GROQ_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: '~30–100 req/min with a daily cap (free tier)',
    notes: 'Best first key to add: extremely fast, strong tool-calling, plus free Whisper speech-to-text.',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', strength: 'General + tool-calling workhorse', capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'], contextLength: 131072 },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', strength: 'Excellent tool-calling / coding', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation', 'reasoning'], contextLength: 131072 },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', strength: 'OpenAI open-weight, great tools', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 131072 },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', strength: 'Small & very fast', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', strength: 'Low-latency routine calls', capabilities: ['chat', 'streaming', 'json-mode'], contextLength: 131072 },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', strength: 'Multimodal (vision)', capabilities: ['chat', 'streaming', 'vision', 'function-calling'], contextLength: 131072 },
      { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2 Instruct', strength: 'Agentic / tool-calling', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 131072 },
    ],
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter :free (best aggregator)',
    category: 'llm',
    providerKind: 'openrouter-free',
    baseUrl: 'https://openrouter.ai/api/v1',
    getKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    envVar: 'OPENROUTER_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: '~20 req/min on :free models without payment (one-time $10 credit unlocks 1,000/day — optional)',
    notes: 'One key, hundreds of models. AgentOS only routes models whose catalogue price is explicitly $0. Live list: GET https://openrouter.ai/api/v1/models (filter ids ending in :free).',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (0324)', strength: 'Top-tier free general model', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 163840 },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', strength: 'Reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 163840 },
      { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B', strength: 'Excellent tool-calling (default agent pick)', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation', 'reasoning'], contextLength: 131072 },
      { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B A22B', strength: 'Flagship MoE, excellent tools (when available)', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 262144 },
      { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', strength: 'OpenAI open-weight, great tools', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 131072 },
      { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B', strength: 'Small & fast', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', strength: 'Reliable general model', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen2.5 72B Instruct', strength: 'Multilingual + coding', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 131072 },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (exp)', strength: 'Fast + huge context', capabilities: ['chat', 'streaming', 'function-calling', 'vision'], contextLength: 1048576 },
      { id: 'mistralai/mistral-small-3.2-24b-instruct:free', name: 'Mistral Small 3.2 24B', strength: 'Fast, efficient', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'microsoft/phi-3.5-mini-instruct:free', name: 'Phi-3.5 Mini', strength: 'Lightweight', capabilities: ['chat', 'streaming'], contextLength: 131072 },
      { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B IT', strength: 'Small, good', capabilities: ['chat', 'streaming'], contextLength: 8192 },
      { id: 'moonshotai/kimi-k2-instruct:free', name: 'Kimi K2 Instruct', strength: 'Agentic / tool calling', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 131072 },
      { id: 'meta-llama/llama-4-scout-17b-17e16-instruct:free', name: 'Llama 4 Scout', strength: 'New Llama 4, multimodal', capabilities: ['chat', 'streaming', 'vision', 'function-calling'], contextLength: 524288 },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B Instruct', strength: 'Strong reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 131072 },
      { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B', strength: 'Tool-use specialist (when available)', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
    ],
  },
  {
    id: 'gemini',
    label: 'Google AI Studio (Gemini)',
    category: 'llm',
    providerKind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    envVar: 'GEMINI_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: '~15–30 RPM / ~500 RPD on Flash models (free tier)',
    notes: 'Best free long-context (1M tokens) + free embeddings. Use for document/research agents.',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', strength: 'Fast, 1M context, vision', capabilities: ['chat', 'streaming', 'function-calling', 'vision'], contextLength: 1048576 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', strength: 'Newer Flash, reasoning', capabilities: ['chat', 'streaming', 'function-calling', 'vision', 'reasoning'], contextLength: 1048576 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', strength: 'Cheapest/fastest lane', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 1048576 },
      { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', strength: 'Embeddings for RAG', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'cerebras',
    label: 'Cerebras Inference (very fast)',
    category: 'llm',
    providerKind: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    getKeyUrl: 'https://cloud.cerebras.ai',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    envVar: 'CEREBRAS_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: 'Generous tiered RPM on the free tier',
    notes: 'Ideal fallback / batch lane behind Groq + OpenRouter.',
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', strength: 'General, wafer-fast', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen3 235B A22B', strength: 'Flagship MoE', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 131072 },
      { id: 'qwen-3-32b', name: 'Qwen3 32B', strength: 'Tool-calling / coding', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 131072 },
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', strength: 'Open-weight reasoning', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 131072 },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B', strength: 'Fast small model', capabilities: ['chat', 'streaming'], contextLength: 131072 },
    ],
  },
  {
    id: 'github-models',
    label: 'GitHub Models',
    category: 'llm',
    providerKind: 'github-models',
    baseUrl: 'https://models.github.ai/inference',
    getKeyUrl: 'https://github.com/settings/tokens',
    docsUrl: 'https://docs.github.com/en/github-models',
    envVar: 'GITHUB_MODELS_TOKEN',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: '~10–15 RPM / ~150 RPD with a GitHub account',
    notes: 'Use a fine-grained PAT with the models permission. Good GPT-4o-mini-class free lane.',
    models: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', strength: 'General + tools + vision', capabilities: ['chat', 'streaming', 'function-calling', 'vision'], contextLength: 131072 },
      { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 mini', strength: 'Coding + general', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 1048576 },
      { id: 'microsoft/phi-4', name: 'Phi-4', strength: 'Reasoning-leaning small model', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 16384 },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', strength: 'Reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 163840 },
    ],
  },
  {
    id: 'cloudflare-workers-ai',
    label: 'Cloudflare Workers AI',
    category: 'llm',
    providerKind: 'cloudflare-workers-ai',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    getKeyUrl: 'https://dash.cloudflare.com',
    docsUrl: 'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/',
    envVar: 'CLOUDFLARE_API_TOKEN',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: '10,000 neurons/day free',
    notes: 'Replace {account_id} in the base URL. Also covers embeddings (@cf/baai/bge-*), Whisper STT and translation.',
    models: [
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (fp8 fast)', strength: 'General', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', strength: 'Reasoning + tools', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 131072 },
      { id: '@cf/qwen/qwen3-30b-a3b-fp8', name: 'Qwen3 30B A3B', strength: 'Fast MoE', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 32768 },
      { id: '@cf/baai/bge-m3', name: 'BGE-M3', strength: 'Multilingual embeddings', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'huggingface',
    label: 'Hugging Face Inference Providers',
    category: 'llm',
    providerKind: 'huggingface',
    baseUrl: 'https://router.huggingface.co/v1',
    getKeyUrl: 'https://huggingface.co/settings/tokens',
    docsUrl: 'https://huggingface.co/docs/inference-providers/en/index',
    envVar: 'HF_TOKEN',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: 'Small monthly free credits + free tiny models',
    notes: 'Also the home of free embedding models (BGE, E5, Nomic) and FLUX/SDXL demo Spaces.',
    models: [
      { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B', strength: 'Tool-calling / coding', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'], contextLength: 131072 },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', strength: 'General', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'BAAI/bge-m3', name: 'BGE-M3', strength: 'Embeddings (multilingual)', capabilities: ['embedding'] },
      { id: 'nomic-ai/nomic-embed-text-v1.5', name: 'Nomic Embed v1.5', strength: 'Embeddings', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral La Plateforme',
    category: 'llm',
    providerKind: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    getKeyUrl: 'https://console.mistral.ai',
    docsUrl: 'https://docs.mistral.ai/api/',
    envVar: 'MISTRAL_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: 'Free tier (may require phone verification)',
    notes: 'Codestral is a strong free coding lane; mistral-embed for RAG.',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small', strength: 'Fast general + tools', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'codestral-latest', name: 'Codestral', strength: 'Coding specialist', capabilities: ['chat', 'streaming', 'code-generation'], contextLength: 256000 },
      { id: 'magistral-small', name: 'Magistral Small', strength: 'Reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 131072 },
      { id: 'mistral-embed', name: 'Mistral Embed', strength: 'Embeddings', capabilities: ['embedding'] },
    ],
  },
  {
    id: 'sambanova',
    label: 'SambaNova Cloud',
    category: 'llm',
    providerKind: 'openai-compatible',
    baseUrl: 'https://api.sambanova.ai/v1',
    getKeyUrl: 'https://sambanova.ai',
    docsUrl: 'https://docs.sambanova.ai',
    envVar: 'SAMBANOVA_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: '~20 RPM free tier',
    notes: 'Add as “Other OpenAI-compatible API” with this base URL.',
    models: [
      { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', strength: 'General', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B Instruct', strength: 'Multilingual + coding', capabilities: ['chat', 'streaming', 'code-generation'], contextLength: 131072 },
      { id: 'DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill 70B', strength: 'Reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 131072 },
    ],
  },
  {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM (build.nvidia.com)',
    category: 'llm',
    providerKind: 'openai-compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    getKeyUrl: 'https://build.nvidia.com',
    docsUrl: 'https://docs.api.nvidia.com/nim',
    envVar: 'NVIDIA_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: 'Free developer credits across 100+ models',
    notes: 'Add as “Other OpenAI-compatible API”. Includes embeddings and vision models.',
    models: [
      { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', strength: 'Reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 163840 },
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', strength: 'General', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B A22B', strength: 'Flagship MoE', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 262144 },
    ],
  },
  {
    id: 'zhipu',
    label: 'Zhipu AI / BigModel (GLM Flash)',
    category: 'llm',
    providerKind: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    getKeyUrl: 'https://open.bigmodel.cn',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    envVar: 'ZHIPU_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: 'GLM-4-Flash class models free (generous limits)',
    notes: 'Add as “Other OpenAI-compatible API”. Verify data-residency needs before sending confidential data.',
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash', strength: 'Fast general + tools', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', strength: 'Newer Flash', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
    ],
  },
  {
    id: 'unorouter-free',
    label: 'UnoRouter (free :free lanes only)',
    category: 'llm',
    providerKind: 'unorouter-free',
    baseUrl: 'https://api.unorouter.com/v1',
    getKeyUrl: 'https://unorouter.com/en/models',
    docsUrl: 'https://unorouter.com/en/models',
    envVar: 'UNOROUTER_API_KEY',
    apiKeyRequired: true,
    cardRequired: false,
    local: false,
    freeAllowance: 'Free lanes carry the :free suffix and $0 pricing',
    notes: 'AgentOS refuses any UnoRouter model without the :free suffix / explicit $0 pricing.',
    models: [
      { id: 'qwen/qwen3-32b:free', name: 'Qwen3 32B (:free)', strength: 'Tool-calling', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (local, offline, unlimited)',
    category: 'local',
    providerKind: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    getKeyUrl: 'https://ollama.com',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    envVar: 'OLLAMA_BASE_URL',
    apiKeyRequired: false,
    cardRequired: false,
    local: true,
    freeAllowance: 'Unlimited — runs on your own hardware, no key, no internet needed',
    notes: 'The only truly unlimited $0 option. 8GB RAM → 3–4B · 16GB → 7–8B · 32GB → 14–32B · 64GB+ → 70B. Pull with: ollama pull <model>.',
    models: [
      { id: 'qwen3:30b-a3b', name: 'Qwen3 30B A3B (MoE)', strength: 'Best local default — fast + smart', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation', 'reasoning'], contextLength: 131072 },
      { id: 'qwen3:8b', name: 'Qwen3 8B', strength: '16GB RAM friendly', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'llama3.2:3b', name: 'Llama 3.2 3B', strength: '8GB RAM friendly', capabilities: ['chat', 'streaming'], contextLength: 131072 },
      { id: 'llama3.3:70b', name: 'Llama 3.3 70B', strength: 'Flagship local (64GB+)', capabilities: ['chat', 'streaming', 'function-calling'], contextLength: 131072 },
      { id: 'qwen2.5-coder:32b', name: 'Qwen2.5 Coder 32B', strength: 'Coding specialist', capabilities: ['chat', 'streaming', 'code-generation'], contextLength: 131072 },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', strength: 'Local reasoning', capabilities: ['chat', 'streaming', 'reasoning'], contextLength: 131072 },
      { id: 'gpt-oss:20b', name: 'GPT-OSS 20B', strength: 'Open-weight tools/reasoning', capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'], contextLength: 131072 },
      { id: 'qwen2.5vl:7b', name: 'Qwen2.5-VL 7B', strength: 'Vision', capabilities: ['chat', 'streaming', 'vision'], contextLength: 32768 },
      { id: 'nomic-embed-text', name: 'Nomic Embed Text', strength: 'Embeddings', capabilities: ['embedding'] },
      { id: 'bge-m3', name: 'BGE-M3', strength: 'Embeddings (multilingual)', capabilities: ['embedding'] },
    ],
  },
] as const;

// ─── Free services beyond chat (all $0 tiers) ────────────────────────────────

export const FREE_SERVICES: readonly FreeService[] = [
  // Embeddings / RAG
  { name: 'Gemini Embedding (AI Studio)', category: 'embedding', description: 'gemini-embedding-001 / text-embedding-004 for RAG memory', freeAllowance: 'Free tier', url: 'https://aistudio.google.com/apikey', apiKeyRequired: true },
  { name: 'Jina Embeddings v3', category: 'embedding', description: 'Text + image embeddings', freeAllowance: '1M tokens free on signup', url: 'https://jina.ai/embeddings', apiKeyRequired: true },
  { name: 'Nomic Embed', category: 'embedding', description: 'nomic-embed-text v1.5 / v2', freeAllowance: '1M tokens/month free', url: 'https://atlas.nomic.ai', apiKeyRequired: true },
  { name: 'Ollama embeddings', category: 'embedding', description: 'nomic-embed-text, bge-m3, mxbai-embed-large — local', freeAllowance: 'Unlimited (local)', url: 'https://ollama.com', apiKeyRequired: false },
  // Image
  { name: 'Pollinations.ai', category: 'image', description: 'Free image generation, no key, no signup', freeAllowance: 'Free (rate-limited)', url: 'https://pollinations.ai', apiKeyRequired: false, agentTool: 'generate_image' },
  { name: 'FLUX.1-schnell (local / HF Spaces)', category: 'image', description: 'Apache-2.0 image model; ~12GB VRAM via ComfyUI', freeAllowance: 'Unlimited (local)', url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell', apiKeyRequired: false },
  { name: 'Stable Diffusion (ComfyUI)', category: 'image', description: 'SD 1.5 / SDXL / SD3.5 locally', freeAllowance: 'Unlimited (local)', url: 'https://github.com/comfyanonymous/ComfyUI', apiKeyRequired: false },
  { name: 'Bing Image Creator', category: 'image', description: 'Free with a Microsoft account', freeAllowance: 'Free daily boosts', url: 'https://www.bing.com/images/create', apiKeyRequired: false },
  // Speech to text
  { name: 'Groq Whisper', category: 'speech-to-text', description: 'whisper-large-v3 / turbo — extremely fast', freeAllowance: 'Free tier', url: 'https://console.groq.com', apiKeyRequired: true },
  { name: 'faster-whisper (local)', category: 'speech-to-text', description: 'CTranslate2 Whisper on your machine', freeAllowance: 'Unlimited (local)', url: 'https://github.com/SYSTRAN/faster-whisper', apiKeyRequired: false },
  { name: 'Deepgram Nova-3', category: 'speech-to-text', description: 'Hosted transcription', freeAllowance: '$200 free credit', url: 'https://deepgram.com', apiKeyRequired: true },
  { name: 'Azure Speech', category: 'speech-to-text', description: 'Fast transcription', freeAllowance: '5 hours/month free', url: 'https://azure.microsoft.com/en-us/products/ai-services/ai-speech', apiKeyRequired: true },
  // Text to speech
  { name: 'Edge-TTS', category: 'text-to-speech', description: 'pip install edge-tts — natural voices, no key', freeAllowance: 'Unlimited', url: 'https://github.com/rany2/edge-tts', apiKeyRequired: false },
  { name: 'ElevenLabs', category: 'text-to-speech', description: 'Premium voices', freeAllowance: '10,000 chars/month free', url: 'https://elevenlabs.io', apiKeyRequired: true },
  { name: 'Google Cloud TTS', category: 'text-to-speech', description: 'Standard voices', freeAllowance: '4M chars/month free', url: 'https://cloud.google.com/text-to-speech', apiKeyRequired: true },
  { name: 'Kokoro / Piper (local)', category: 'text-to-speech', description: 'Open-weight local TTS', freeAllowance: 'Unlimited (local)', url: 'https://huggingface.co/hexgrad/Kokoro-82M', apiKeyRequired: false },
  // Search & data — what makes it an agent
  { name: 'Open-Meteo', category: 'data', description: 'Weather + geocoding, no key', freeAllowance: 'Unlimited (fair use)', url: 'https://open-meteo.com', apiKeyRequired: false, agentTool: 'get_weather' },
  { name: 'Wikipedia / Wikidata', category: 'data', description: 'Encyclopaedia summaries + structured facts', freeAllowance: 'Unlimited (fair use)', url: 'https://www.mediawiki.org/wiki/API:Main_page', apiKeyRequired: false, agentTool: 'wikipedia_summary' },
  { name: 'DuckDuckGo Instant Answers', category: 'search', description: 'Instant-answer API, no key', freeAllowance: 'Free (fair use)', url: 'https://duckduckgo.com/api', apiKeyRequired: false, agentTool: 'web_search' },
  { name: 'Tavily', category: 'search', description: 'Agent-grade web search', freeAllowance: '1,000 credits/month free', url: 'https://tavily.com', apiKeyRequired: true },
  { name: 'Brave Search API', category: 'search', description: 'Independent web index', freeAllowance: '2,000 queries/month free', url: 'https://brave.com/search/api', apiKeyRequired: true },
  { name: 'Exa', category: 'search', description: 'Neural search for agents', freeAllowance: '1,000 searches free', url: 'https://exa.ai', apiKeyRequired: true },
  { name: 'Hacker News API', category: 'data', description: 'Top/new stories, no key', freeAllowance: 'Unlimited', url: 'https://github.com/HackerNews/API', apiKeyRequired: false, agentTool: 'hackernews_top' },
  { name: 'arXiv / OpenAlex / Semantic Scholar', category: 'data', description: 'Research papers + citations', freeAllowance: 'Free APIs', url: 'https://info.arxiv.org/help/api/index.html', apiKeyRequired: false },
  { name: 'yfinance / Stooq', category: 'data', description: 'Market data', freeAllowance: 'Free', url: 'https://github.com/ranaroussi/yfinance', apiKeyRequired: false },
  { name: 'CoinGecko', category: 'data', description: 'Crypto prices', freeAllowance: 'Free tier', url: 'https://www.coingecko.com/en/api', apiKeyRequired: true },
  { name: 'Nominatim / OSRM', category: 'data', description: 'Geocoding + routing (OpenStreetMap)', freeAllowance: 'Free (fair use)', url: 'https://nominatim.org', apiKeyRequired: false },
  { name: 'Resend / Brevo', category: 'data', description: 'Transactional email', freeAllowance: '3,000/mo · 300/day free', url: 'https://resend.com', apiKeyRequired: true },
  // Infrastructure
  { name: 'Supabase / Neon (pgvector)', category: 'infrastructure', description: 'Postgres + vectors for agent memory', freeAllowance: 'Free tiers', url: 'https://supabase.com', apiKeyRequired: true },
  { name: 'Qdrant Cloud / Pinecone Starter', category: 'infrastructure', description: 'Vector databases', freeAllowance: '1GB · 1 index free', url: 'https://qdrant.tech', apiKeyRequired: true },
  { name: 'Cloudflare Workers / R2', category: 'infrastructure', description: '100k req/day + 10GB storage free', freeAllowance: 'Free tiers', url: 'https://workers.cloudflare.com', apiKeyRequired: true },
  { name: 'Upstash Redis', category: 'infrastructure', description: 'Serverless cache/KV', freeAllowance: '10k commands/day free', url: 'https://upstash.com', apiKeyRequired: true },
  { name: 'Kaggle / Colab GPUs', category: 'infrastructure', description: 'Free GPU notebooks for local-model experiments', freeAllowance: '~30h GPU/week (Kaggle)', url: 'https://www.kaggle.com/code', apiKeyRequired: true },
] as const;

/** Recommended $0 fallback order shown in the Commanding Center. */
export const FREE_FALLBACK_ORDER = [
  'Groq (Qwen3-32B / Llama 3.3 70B) — speed',
  'OpenRouter :free (DeepSeek V3/R1, Qwen3, GPT-OSS) — breadth',
  'Google AI Studio (Gemini Flash, 1M ctx) — long documents',
  'Cerebras (Llama / Qwen3) — backup & batch',
  'Ollama local (qwen3:30b-a3b) — offline, unlimited, private',
] as const;

/** Which catalogue providers have credentials present in the environment. Never returns key values. */
export function configuredFromEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const provider of FREE_LLM_PROVIDERS) {
    result[provider.id] = Boolean(provider.envVar && env[provider.envVar]);
  }
  // Ollama needs no key; configured means an endpoint was declared.
  result.ollama = Boolean(env.OLLAMA_BASE_URL || env.OLLAMA_HOST || env.OLLAMA_URL || env.LOCAL_INFERENCE_URL);
  return result;
}

export function catalogStats() {
  const models = FREE_LLM_PROVIDERS.reduce((sum, p) => sum + p.models.length, 0);
  return {
    providers: FREE_LLM_PROVIDERS.length,
    models,
    services: FREE_SERVICES.length,
    noKeyTools: FREE_SERVICES.filter((s) => s.agentTool).length,
  };
}
