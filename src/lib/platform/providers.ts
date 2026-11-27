/**
 * ALO Open AI Platform — inference adapters.
 *
 * Three wire protocols cover every self-hosted stack the platform targets:
 *
 *   Ollama      POST /api/chat        (native; also /api/embeddings, /api/tags)
 *   vLLM        POST /v1/chat/completions   (OpenAI-compatible)
 *   LiteLLM     POST /v1/chat/completions   (OpenAI-compatible; routes onward)
 *
 * They share one `complete()` signature so `fallback-engine.ts` never branches
 * on provider kind. Everything provider-specific — system-prompt folding, token
 * accounting, error shapes — is confined to this file.
 *
 * HONESTY RULE
 * ------------
 * These adapters never fabricate a response. If the endpoint is down, the fetch
 * fails and the error propagates to the classifier, which decides whether
 * another model is worth trying. There is no "echo" or "mock" mode anywhere in
 * the production path; test doubles live in the test files.
 */

import { probeProvider, type AvailableDeployment } from './model-registry';
import type { CompleteFn, CompletionRequest, CompletionResult } from './fallback-engine';

interface ProviderEndpointConfig {
  baseUrl: string;
  apiKey?: string;
}

/**
 * Resolve the endpoint for a deployment from the environment.
 *
 * Kept separate from `model-registry` on purpose: the registry decides *which*
 * deployment to use, this decides *how to talk to it*. A single place to add
 * mTLS or a corporate proxy later.
 */
export function endpointFor(deployment: AvailableDeployment): ProviderEndpointConfig | null {
  switch (deployment.providerKind) {
    case 'platform-local':
      return process.env.ALO_PLATFORM_LOCAL_URL
        ? { baseUrl: process.env.ALO_PLATFORM_LOCAL_URL.replace(/\/+$/, '') }
        : null;
    case 'ollama':
      return process.env.OLLAMA_BASE_URL ? { baseUrl: process.env.OLLAMA_BASE_URL.replace(/\/+$/, '') } : null;
    case 'vllm':
      return process.env.VLLM_BASE_URL
        ? { baseUrl: process.env.VLLM_BASE_URL.replace(/\/+$/, ''), ...(process.env.VLLM_API_KEY ? { apiKey: process.env.VLLM_API_KEY } : {}) }
        : null;
    case 'litellm':
      return process.env.LITELLM_BASE_URL
        ? { baseUrl: process.env.LITELLM_BASE_URL.replace(/\/+$/, ''), ...(process.env.LITELLM_API_KEY ? { apiKey: process.env.LITELLM_API_KEY } : {}) }
        : null;
    case 'openai-compatible':
      return process.env.OPENAI_COMPATIBLE_BASE_URL
        ? {
            baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/+$/, ''),
            ...(process.env.OPENAI_COMPATIBLE_API_KEY ? { apiKey: process.env.OPENAI_COMPATIBLE_API_KEY } : {}),
          }
        : null;
    default:
      return null;
  }
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Build an error carrying the HTTP status so the classifier can read it. */
function httpError(status: number, message: string, headers?: Headers): Error {
  const error = new Error(message) as Error & { statusCode?: number; retryAfter?: string };
  error.statusCode = status;
  const retryAfter = headers?.get('retry-after');
  if (retryAfter) error.retryAfter = retryAfter;
  return error;
}

/** Never leak a key or a full prompt into an error message. */
function safeBody(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

// ─── Ollama (native protocol) ──────────────────────────────────────────────

async function ollamaChat(
  deployment: AvailableDeployment,
  request: CompletionRequest,
  endpoint: ProviderEndpointConfig,
): Promise<CompletionResult> {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120_000);
  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  const response = await fetch(`${endpoint.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}) },
    body: JSON.stringify({
      model: deployment.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
        ...(request.extra ?? {}),
      },
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw httpError(response.status, `${deployment.provider} ${deployment.model}: ${safeBody(body) || response.statusText}`, response.headers);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
    response?: string;
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const content = data.message?.content ?? data.response ?? '';
  if (!content) {
    throw httpError(502, `${deployment.provider} returned an empty completion for ${deployment.model}`);
  }
  const promptTokens = data.prompt_eval_count ?? estimateTokens(request.messages.map((m) => m.content).join(' '));
  const completionTokens = data.eval_count ?? estimateTokens(content);
  return {
    content,
    model: deployment.model,
    provider: deployment.provider,
    hostingType: deployment.hostingType,
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    latencyMs: Date.now() - startedAt,
    ...(data.done_reason ? { finishReason: data.done_reason } : {}),
  };
}

async function ollamaEmbed(
  deployment: AvailableDeployment,
  input: string[],
  endpoint: ProviderEndpointConfig,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of input) {
    const response = await fetch(`${endpoint.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: deployment.model, prompt: text }),
      signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS ?? 120_000)),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw httpError(response.status, `${deployment.provider} embeddings: ${safeBody(body) || response.statusText}`, response.headers);
    }
    const data = (await response.json()) as { embedding?: number[] };
    if (!data.embedding?.length) throw httpError(502, `${deployment.provider} returned an empty embedding`);
    vectors.push(data.embedding);
  }
  return vectors;
}

// ─── OpenAI-compatible (vLLM, LiteLLM, generic) ────────────────────────────

async function openAiChat(
  deployment: AvailableDeployment,
  request: CompletionRequest,
  endpoint: ProviderEndpointConfig,
): Promise<CompletionResult> {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.VLLM_TIMEOUT_MS ?? process.env.LITELLM_TIMEOUT_MS ?? 120_000);
  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  const response = await fetch(`${endpoint.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: deployment.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.extra ?? {}),
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw httpError(response.status, `${deployment.provider} ${deployment.model}: ${safeBody(body) || response.statusText}`, response.headers);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw httpError(502, `${deployment.provider} returned an empty completion for ${deployment.model}`);
  }
  const promptTokens = data.usage?.prompt_tokens ?? estimateTokens(request.messages.map((m) => m.content).join(' '));
  const completionTokens = data.usage?.completion_tokens ?? estimateTokens(content);
  return {
    content,
    model: data.model ?? deployment.model,
    provider: deployment.provider,
    hostingType: deployment.hostingType,
    usage: { promptTokens, completionTokens, totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens },
    latencyMs: Date.now() - startedAt,
    ...(data.choices?.[0]?.finish_reason ? { finishReason: data.choices[0].finish_reason } : {}),
  };
}

async function openAiEmbed(
  deployment: AvailableDeployment,
  input: string[],
  endpoint: ProviderEndpointConfig,
): Promise<number[][]> {
  const response = await fetch(`${endpoint.baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}) },
    body: JSON.stringify({ model: deployment.model, input }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw httpError(response.status, `${deployment.provider} embeddings: ${safeBody(body) || response.statusText}`, response.headers);
  }
  const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  return (data.data ?? []).map((row) => row.embedding ?? []);
}

// ─── Public adapter surface ────────────────────────────────────────────────

/** The `CompleteFn` the fallback engine calls. Bound to real HTTP. */
export const completeWithProvider: CompleteFn = async (deployment, request) => {
  const endpoint = endpointFor(deployment);
  if (!endpoint) {
    throw Object.assign(new Error(`Provider ${deployment.provider} is not configured`), { statusCode: 503 });
  }
  switch (deployment.providerKind) {
    case 'platform-local':
    case 'ollama':
      return ollamaChat(deployment, request, endpoint);
    case 'vllm':
    case 'litellm':
    case 'openai-compatible':
      return openAiChat(deployment, request, endpoint);
    default:
      throw Object.assign(new Error(`Unsupported provider kind: ${deployment.providerKind}`), { statusCode: 503 });
  }
};

export async function embedWithProvider(deployment: AvailableDeployment, input: string[]): Promise<number[][]> {
  const endpoint = endpointFor(deployment);
  if (!endpoint) {
    throw Object.assign(new Error(`Provider ${deployment.provider} is not configured`), { statusCode: 503 });
  }
  if (deployment.providerKind === 'ollama' || deployment.providerKind === 'platform-local') return ollamaEmbed(deployment, input, endpoint);
  return openAiEmbed(deployment, input, endpoint);
}

/** List models a live Ollama/vLLM host actually has, for the admin UI. */
export async function listProviderModels(kind: string, baseUrl: string, apiKey?: string): Promise<string[]> {
  const path = kind === 'ollama' ? '/api/tags' : '/v1/models';
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { models?: Array<{ name?: string }>; data?: Array<{ id?: string }> };
  if (kind === 'ollama') return (data.models ?? []).map((m) => m.name ?? '').filter(Boolean);
  return (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
}

/** True when at least one provider endpoint is configured in the environment. */
export function anyProviderConfigured(): boolean {
  return Boolean(
    process.env.ALO_PLATFORM_LOCAL_URL || process.env.OLLAMA_BASE_URL
      || process.env.VLLM_BASE_URL || process.env.LITELLM_BASE_URL,
  );
}

export { probeProvider };
