import { isIP } from 'node:net';

/**
 * Provider connection presets used by the admin UI and server-side validation.
 * The listed documentation URLs are pointers for a human verification workflow,
 * not proof that a tier, quota, endpoint, or commercial license is current.
 */

export interface AIProviderPreset {
  kind: string;
  label: string;
  defaultBaseUrl: string;
  docsUrl: string;
  apiKeyRequired: boolean;
  local: boolean;
  documentationHosts: string[];
  documentationPathPrefix?: string;
}

export const AI_PROVIDER_PRESETS: readonly AIProviderPreset[] = [
  { kind: 'ollama', label: 'Ollama local', defaultBaseUrl: 'http://localhost:11434/v1', docsUrl: 'https://docs.ollama.com/api/openai-compatibility', apiKeyRequired: false, local: true, documentationHosts: ['ollama.com'] },
  { kind: 'llama-cpp', label: 'llama.cpp server', defaultBaseUrl: 'http://localhost:8080/v1', docsUrl: 'https://github.com/ggml-org/llama.cpp/tree/master/examples/server', apiKeyRequired: false, local: true, documentationHosts: ['github.com'], documentationPathPrefix: '/ggml-org/llama.cpp/' },
  { kind: 'openrouter', label: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', docsUrl: 'https://openrouter.ai/docs/quickstart', apiKeyRequired: true, local: false, documentationHosts: ['openrouter.ai'] },
  { kind: 'groq', label: 'Groq', defaultBaseUrl: 'https://api.groq.com/openai/v1', docsUrl: 'https://console.groq.com/docs/openai', apiKeyRequired: true, local: false, documentationHosts: ['groq.com'] },
  { kind: 'huggingface', label: 'Hugging Face Inference Providers', defaultBaseUrl: 'https://router.huggingface.co/v1', docsUrl: 'https://huggingface.co/docs/inference-providers/en/index', apiKeyRequired: true, local: false, documentationHosts: ['huggingface.co'] },
  { kind: 'github-models', label: 'GitHub Models', defaultBaseUrl: 'https://models.github.ai/inference', docsUrl: 'https://docs.github.com/en/github-models', apiKeyRequired: true, local: false, documentationHosts: ['github.com'] },
  { kind: 'cerebras', label: 'Cerebras', defaultBaseUrl: 'https://api.cerebras.ai/v1', docsUrl: 'https://inference-docs.cerebras.ai/', apiKeyRequired: true, local: false, documentationHosts: ['cerebras.ai'] },
  { kind: 'mistral', label: 'Mistral', defaultBaseUrl: 'https://api.mistral.ai/v1', docsUrl: 'https://docs.mistral.ai/api/', apiKeyRequired: true, local: false, documentationHosts: ['mistral.ai'] },
  { kind: 'gemini', label: 'Google Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', docsUrl: 'https://ai.google.dev/gemini-api/docs/openai', apiKeyRequired: true, local: false, documentationHosts: ['google.dev', 'googleapis.com'] },
  { kind: 'cloudflare-workers-ai', label: 'Cloudflare Workers AI', defaultBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', docsUrl: 'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/', apiKeyRequired: true, local: false, documentationHosts: ['cloudflare.com'] },
  { kind: 'cohere', label: 'Cohere', defaultBaseUrl: 'https://api.cohere.com/compatibility/v1', docsUrl: 'https://docs.cohere.com/v2/docs/compatibility-api', apiKeyRequired: true, local: false, documentationHosts: ['cohere.com'] },
  { kind: 'openai-compatible', label: 'Other OpenAI-compatible API', defaultBaseUrl: '', docsUrl: '', apiKeyRequired: true, local: false, documentationHosts: [] },
  { kind: 'custom-self-hosted', label: 'Custom self-hosted endpoint', defaultBaseUrl: '', docsUrl: '', apiKeyRequired: false, local: false, documentationHosts: [] },
  // Backwards-compatible provider kinds already supported by the project.
  { kind: 'openai-compatible-free', label: 'OpenAI-compatible (upstream $0 pricing gate)', defaultBaseUrl: '', docsUrl: '', apiKeyRequired: true, local: false, documentationHosts: [] },
  { kind: 'openrouter-free', label: 'OpenRouter (upstream $0 pricing gate)', defaultBaseUrl: 'https://openrouter.ai/api/v1', docsUrl: 'https://openrouter.ai/docs/quickstart', apiKeyRequired: true, local: false, documentationHosts: ['openrouter.ai'] },
  // UnoRouter — free models only. Free lanes carry the `:free` model-id suffix
  // and report $0 input and $0 output; paid lanes are refused by the adapter.
  { kind: 'unorouter-free', label: 'UnoRouter (free :free models only)', defaultBaseUrl: 'https://api.unorouter.com/v1', docsUrl: 'https://unorouter.com/en/models', apiKeyRequired: true, local: false, documentationHosts: ['unorouter.com'] },
  { kind: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', docsUrl: 'https://api-docs.deepseek.com/', apiKeyRequired: true, local: false, documentationHosts: ['deepseek.com'] },
  { kind: 'qwen', label: 'Qwen', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', docsUrl: '', apiKeyRequired: true, local: false, documentationHosts: [] },
  { kind: 'zai-sdk', label: 'Z-AI SDK', defaultBaseUrl: '', docsUrl: '', apiKeyRequired: false, local: false, documentationHosts: [] },
] as const;

export function providerPreset(kind: string): AIProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((preset) => preset.kind === kind);
}

export function isLocalProviderKind(kind: string): boolean {
  return providerPreset(kind)?.local === true;
}

export function defaultProviderBaseUrl(kind: string): string | undefined {
  const value = providerPreset(kind)?.defaultBaseUrl;
  return value ? value : undefined;
}

/**
 * A self-declared local endpoint must be a literal loopback or RFC1918/ULA IP.
 * Arbitrary hostnames/public IPs are not treated as local, preventing a tenant
 * admin from using an external SaaS endpoint to bypass external-data approval.
 */
export function isTrustedLocalInferenceEndpoint(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false;
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    const version = isIP(host);
    if (version === 4) {
      const parts = host.split('.').map(Number);
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
      const [first, second] = parts;
      return first === 10 || first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168);
    }
    if (version === 6) {
      const normalized = host.split('%')[0];
      return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
    }
    return false;
  } catch {
    return false;
  }
}

export function isTrustedLocalProviderConfig(
  kind: string,
  baseUrl: string | null | undefined,
  explicitlyLocal = false,
): boolean {
  const endpoint = baseUrl ?? defaultProviderBaseUrl(kind);
  const endpointIsPrivate = isTrustedLocalInferenceEndpoint(endpoint);
  const claimsLocal = isLocalProviderKind(kind) ||
    (kind === 'custom-self-hosted' && explicitlyLocal) ||
    (kind === 'openai-compatible' && endpointIsPrivate);
  return claimsLocal && endpointIsPrivate;
}

/** Accept only HTTPS official-document hosts recorded in the provider catalogue. */
export function isOfficialProviderDocsUrl(kind: string, value: string, endpoint?: string | null): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const preset = providerPreset(kind);
    if (preset?.documentationHosts.length) {
      const officialHost = preset.documentationHosts.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
      if (!officialHost) return false;
      return !preset.documentationPathPrefix || url.pathname.startsWith(preset.documentationPathPrefix);
    }
    if (kind === 'custom-self-hosted' && endpoint) {
      const endpointHost = new URL(endpoint).hostname;
      return url.hostname === endpointHost;
    }
    return false;
  } catch {
    return false;
  }
}
