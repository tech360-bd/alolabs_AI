/**
 * Free hosted-inference provider specs derived from environment variables.
 *
 * ALO Labs AgentOS — additive expansion of `providersFromEnvironment()`.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `.env.example` has documented GEMINI_API_KEY, CEREBRAS_API_KEY,
 * CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SAMBANOVA_API_KEY,
 * NVIDIA_API_KEY, HF_TOKEN and GITHUB_MODELS_TOKEN for a long time, and
 * `src/lib/command-agent/free-catalog.ts` lists the exact model ids for each.
 * However `providersFromEnvironment()` only built Groq, DeepSeek, Mistral,
 * Qwen, OpenRouter, Ollama, OpenAI and the local gateway — so an operator who
 * filled in the advertised variables got **no provider registered at all**.
 * That is the gap this module closes.
 *
 * DESIGN RULES
 * ------------
 * 1. Only providers whose credentials are actually present are returned.
 *    Nothing is "assumed" and no provider is enabled by default.
 * 2. Every spec is an OpenAI-compatible endpoint, so the single audited
 *    adapter (`OpenAICompatibleProvider`) serves them all — no vendor SDKs.
 * 3. `freeOnly` is left false here. These vendors' free tiers are *quotas*,
 *    not *prices*: usage is tracked by `free-tier-quota-tracker`, and the
 *    free-vs-paid decision stays with company policy in
 *    `multi-tenant-ai/policy.ts` (which requires a human-verified
 *    `AIProviderVerification` row before a provider is treated as free).
 *    Marking them `freeOnly` would be a claim the code cannot verify.
 * 4. Cloudflare Workers AI needs an account id in the path; a missing account
 *    id means the provider is skipped rather than failing at request time.
 * 5. Catalogues are defaults from the curated free catalogue so the router can
 *    route by exact model id without a live `/models` call. An
 *    `AIProviderConfig` row always wins.
 */

import type { AICapability } from './types';
import type { OpenAICompatibleModelConfig } from './openai-compatible-provider';

export interface FreeProviderEnv extends NodeJS.ProcessEnv {
  GEMINI_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  GITHUB_MODELS_TOKEN?: string;
  GITHUB_TOKEN?: string;
  HF_TOKEN?: string;
  HUGGINGFACE_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  SAMBANOVA_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  AI_FREE_PROVIDER_TIMEOUT_MS?: string;
}

/** A provider the router should register, derived purely from configuration. */
export interface FreeProviderSpec {
  /** Unique router id, e.g. `openai-compatible:gemini`. */
  id: string;
  /** Human label for admin UI / health output. */
  label: string;
  baseUrl: string;
  apiKey: string;
  models: OpenAICompatibleModelConfig[];
  /** Env variables that produced this spec (never the values). */
  source: string;
  timeoutMs: number;
}

interface CatalogueEntry {
  id: string;
  contextLength?: number;
  capabilities?: AICapability[];
}

function entries(list: CatalogueEntry[]): OpenAICompatibleModelConfig[] {
  return list.map((item) => ({ ...item }));
}

/**
 * Curated default catalogues. These mirror `src/lib/command-agent/free-catalog.ts`
 * (the operator-facing catalogue) so the router and the UI agree on model ids.
 */
export const FREE_PROVIDER_CATALOGUES: Record<string, OpenAICompatibleModelConfig[]> = {
  gemini: entries([
    { id: 'gemini-2.0-flash', contextLength: 1_048_576, capabilities: ['chat', 'streaming', 'function-calling', 'vision'] },
    { id: 'gemini-2.5-flash', contextLength: 1_048_576, capabilities: ['chat', 'streaming', 'function-calling', 'vision', 'reasoning'] },
    { id: 'gemini-2.5-flash-lite', contextLength: 1_048_576, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: 'gemini-embedding-001', capabilities: ['embedding'] },
  ]),
  cerebras: entries([
    { id: 'llama-3.3-70b', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: 'qwen-3-32b', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'] },
    { id: 'llama3.1-8b', contextLength: 131_072, capabilities: ['chat', 'streaming'] },
  ]),
  'cloudflare-workers-ai': entries([
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: '@cf/qwen/qwen3-30b-a3b-fp8', contextLength: 32_768, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: '@cf/baai/bge-m3', capabilities: ['embedding'] },
  ]),
  sambanova: entries([
    { id: 'Meta-Llama-3.3-70B-Instruct', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: 'Qwen2.5-72B-Instruct', contextLength: 131_072, capabilities: ['chat', 'streaming', 'code-generation'] },
    { id: 'DeepSeek-R1-Distill-Llama-70B', contextLength: 131_072, capabilities: ['chat', 'streaming', 'reasoning'] },
  ]),
  nvidia: entries([
    { id: 'meta/llama-3.3-70b-instruct', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: 'qwen/qwen3-235b-a22b', contextLength: 262_144, capabilities: ['chat', 'streaming', 'function-calling', 'reasoning'] },
    { id: 'deepseek-ai/deepseek-r1', contextLength: 163_840, capabilities: ['chat', 'streaming', 'reasoning'] },
  ]),
  huggingface: entries([
    { id: 'Qwen/Qwen3-32B', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling', 'code-generation'] },
    { id: 'meta-llama/Llama-3.3-70B-Instruct', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling'] },
    { id: 'BAAI/bge-m3', capabilities: ['embedding'] },
  ]),
  'github-models': entries([
    { id: 'openai/gpt-4o-mini', contextLength: 131_072, capabilities: ['chat', 'streaming', 'function-calling', 'vision'] },
    { id: 'microsoft/phi-4', contextLength: 16_384, capabilities: ['chat', 'streaming', 'reasoning'] },
  ]),
};

/** Official base URLs (kept in sync with AI_PROVIDER_PRESETS). */
export const FREE_PROVIDER_BASE_URLS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  cerebras: 'https://api.cerebras.ai/v1',
  sambanova: 'https://api.sambanova.ai/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  huggingface: 'https://router.huggingface.co/v1',
  githubModels: 'https://models.github.ai/inference',
} as const;

/** Cloudflare Workers AI embeds the account id in the path. */
export function cloudflareWorkersAIBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1`;
}

function value(input: string | undefined): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Free hosted-inference providers implied by the environment.
 *
 * Every credential must be present; a partially configured vendor (for example
 * Cloudflare without an account id) is skipped, never half-registered.
 */
export function freeProviderSpecsFromEnvironment(env: FreeProviderEnv = process.env): FreeProviderSpec[] {
  const timeoutMs = Number(env.AI_FREE_PROVIDER_TIMEOUT_MS) > 0 ? Number(env.AI_FREE_PROVIDER_TIMEOUT_MS) : 60_000;
  const specs: FreeProviderSpec[] = [];

  const push = (
    key: keyof typeof FREE_PROVIDER_CATALOGUES,
    routerId: string,
    label: string,
    baseUrl: string,
    apiKey: string,
    source: string,
  ) => {
    specs.push({
      id: routerId,
      label,
      baseUrl,
      apiKey,
      models: FREE_PROVIDER_CATALOGUES[key],
      source,
      timeoutMs,
    });
  };

  const gemini = value(env.GEMINI_API_KEY);
  if (gemini) push('gemini', 'gemini', 'Google Gemini (AI Studio)', FREE_PROVIDER_BASE_URLS.gemini, gemini, 'GEMINI_API_KEY');

  const cerebras = value(env.CEREBRAS_API_KEY);
  if (cerebras) push('cerebras', 'cerebras', 'Cerebras Inference', FREE_PROVIDER_BASE_URLS.cerebras, cerebras, 'CEREBRAS_API_KEY');

  const cloudflareToken = value(env.CLOUDFLARE_API_TOKEN);
  const cloudflareAccount = value(env.CLOUDFLARE_ACCOUNT_ID);
  if (cloudflareToken && cloudflareAccount) {
    push(
      'cloudflare-workers-ai',
      'cloudflare-workers-ai',
      'Cloudflare Workers AI',
      cloudflareWorkersAIBaseUrl(cloudflareAccount),
      cloudflareToken,
      'CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID',
    );
  }

  const sambanova = value(env.SAMBANOVA_API_KEY);
  if (sambanova) push('sambanova', 'sambanova', 'SambaNova Cloud', FREE_PROVIDER_BASE_URLS.sambanova, sambanova, 'SAMBANOVA_API_KEY');

  const nvidia = value(env.NVIDIA_API_KEY);
  if (nvidia) push('nvidia', 'nvidia', 'NVIDIA NIM', FREE_PROVIDER_BASE_URLS.nvidia, nvidia, 'NVIDIA_API_KEY');

  const huggingface = value(env.HF_TOKEN) ?? value(env.HUGGINGFACE_API_KEY);
  if (huggingface) push('huggingface', 'huggingface', 'Hugging Face Inference Providers', FREE_PROVIDER_BASE_URLS.huggingface, huggingface, 'HF_TOKEN');

  const githubModels = value(env.GITHUB_MODELS_TOKEN) ?? value(env.GITHUB_TOKEN);
  if (githubModels) push('github-models', 'github-models', 'GitHub Models', FREE_PROVIDER_BASE_URLS.githubModels, githubModels, 'GITHUB_MODELS_TOKEN');

  return specs;
}

/**
 * Env variable → provider kind map, for the admin UI to show "KEY IN ENV"
 * without exposing values. Ordered by recommended fallback priority.
 */
export const FREE_PROVIDER_ENV_MAP: ReadonlyArray<{ envVar: string; kind: string; label: string }> = [
  { envVar: 'GEMINI_API_KEY', kind: 'gemini', label: 'Google Gemini' },
  { envVar: 'CEREBRAS_API_KEY', kind: 'cerebras', label: 'Cerebras' },
  { envVar: 'GROQ_API_KEY', kind: 'groq', label: 'Groq' },
  { envVar: 'OPENROUTER_API_KEY', kind: 'openrouter-free', label: 'OpenRouter :free' },
  { envVar: 'CLOUDFLARE_API_TOKEN', kind: 'cloudflare-workers-ai', label: 'Cloudflare Workers AI' },
  { envVar: 'SAMBANOVA_API_KEY', kind: 'sambanova', label: 'SambaNova' },
  { envVar: 'NVIDIA_API_KEY', kind: 'nvidia', label: 'NVIDIA NIM' },
  { envVar: 'HF_TOKEN', kind: 'huggingface', label: 'Hugging Face' },
  { envVar: 'GITHUB_MODELS_TOKEN', kind: 'github-models', label: 'GitHub Models' },
  { envVar: 'UNOROUTER_API_KEY', kind: 'unorouter-free', label: 'UnoRouter :free' },
];
