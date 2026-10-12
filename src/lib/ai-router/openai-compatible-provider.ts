/**
 * Generic OpenAI-compatible provider
 * ALO Labs AgentOS — one implementation for every endpoint that speaks the
 * OpenAI chat-completions protocol (OpenAI, Azure OpenAI gateways, vLLM,
 * LM Studio, Together, Fireworks, LiteLLM proxies, …).
 *
 * Unlike the vendor-specific providers this one is fully data-driven: the
 * endpoint, credentials and model catalogue come from an `AIProviderConfig`
 * row (or environment variables) so operators can add a real provider
 * without a code change. Several instances may be registered side by side —
 * each gets a unique router name (`openai-compatible:<config name>`).
 */

import type {
  AIModel,
  AIProvider,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AICapability,
} from './types';
import { AIRouterError } from './types';
import { BaseAIProvider } from './provider-base';

// ─── Config ─────────────────────────────────────────────────────────

export interface OpenAICompatibleModelConfig {
  id: string;
  name?: string;
  contextLength?: number;
  capabilities?: AICapability[];
  costPerMillionTokens?: number;
}

export interface OpenAICompatibleProviderConfig {
  /** Stable identifier; becomes part of the router name. Defaults to "default". */
  id?: string;
  /** Human-readable label (settings UI, health output). */
  label?: string;
  /** Base URL including the version prefix, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  apiKey?: string;
  /** Extra headers (e.g. Azure `api-key`, OpenRouter attribution). */
  headers?: Record<string, string>;
  /** Static model catalogue. When empty, `/models` is queried on initialize(). */
  models?: OpenAICompatibleModelConfig[];
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Health-check timeout. */
  healthTimeoutMs?: number;
  /** Optional provider-level default for unknown model context windows. */
  defaultContextLength?: number;
}

// ─── Wire types ─────────────────────────────────────────────────────

interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface WireChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string | null };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface WireStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string | null };
    finish_reason: string | null;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function mapFinishReason(reason: string | null | undefined): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'tool-calls';
    case 'content_filter': return 'content-filter';
    default: return 'stop';
  }
}

export function openAICompatibleProviderName(id?: string): AIProvider {
  const clean = (id ?? 'default').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  return clean === 'default' ? 'openai-compatible' : (`openai-compatible:${clean}` as AIProvider);
}

async function* parseSSEStream(response: Response, provider: AIProvider): AsyncGenerator<WireStreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', provider);

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') return;
      if (trimmed.startsWith('data: ')) {
        try {
          yield JSON.parse(trimmed.slice(6)) as WireStreamChunk;
        } catch {
          // skip malformed chunk
        }
      }
    }
  }
}

/** Never put the secret in an error message or log line. */
function redactSecrets(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join('[redacted]');
}

// ─── Provider ───────────────────────────────────────────────────────

export class OpenAICompatibleProvider extends BaseAIProvider {
  readonly name: AIProvider;
  readonly label: string;
  supportedModels: AIModel[] = [];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly healthTimeoutMs: number;
  private readonly defaultContextLength: number;
  private readonly staticModels: OpenAICompatibleModelConfig[];
  private lastHealthError: string | null = null;

  constructor(config: OpenAICompatibleProviderConfig) {
    super();
    if (!config.baseUrl) {
      throw new AIRouterError('OpenAI-compatible provider requires a baseUrl', 'openai-compatible');
    }
    this.name = openAICompatibleProviderName(config.id);
    this.label = config.label ?? config.id ?? 'openai-compatible';
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey ?? '';
    this.extraHeaders = { ...(config.headers ?? {}) };
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.healthTimeoutMs = config.healthTimeoutMs ?? 10_000;
    this.defaultContextLength = config.defaultContextLength ?? 32_000;
    this.staticModels = config.models ?? [];
    this.supportedModels = this.staticModels.map((m) => this.toModel(m));
  }

  /** The last health-check failure (secret-free), for operator diagnostics. */
  get lastError(): string | null {
    return this.lastHealthError;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.supportedModels.length === 0) {
      // No static catalogue: discover it. A provider without any model is unusable.
      const discovered = await this.fetchRemoteModels();
      if (discovered.length === 0) {
        throw new AIRouterError(
          `${this.label}: no models configured and /models discovery returned nothing`,
          this.name,
          undefined,
          false,
        );
      }
      this.supportedModels = discovered;
    }
    this._initialized = true;
  }

  // ─── Models ─────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    this.requireInitialized();
    if (this.staticModels.length > 0) return [...this.supportedModels];
    const remote = await this.fetchRemoteModels().catch(() => []);
    return remote.length > 0 ? remote : [...this.supportedModels];
  }

  private toModel(m: OpenAICompatibleModelConfig): AIModel {
    return {
      id: m.id,
      name: m.name ?? m.id,
      provider: this.name,
      family: 'custom',
      parameters: {},
      contextLength: m.contextLength ?? this.defaultContextLength,
      capabilities: m.capabilities ?? ['chat', 'streaming'],
      costPerMillionTokens: m.costPerMillionTokens,
    };
  }

  private async fetchRemoteModels(): Promise<AIModel[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(false),
      signal: AbortSignal.timeout(this.healthTimeoutMs),
    });
    if (!res.ok) {
      throw new AIRouterError(
        `${this.label}: /models returned ${res.status}`,
        this.name,
        res.status,
        this.isRetryableStatus(res.status),
      );
    }
    const data = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }> };
    return (data.data ?? []).filter((m) => typeof m.id === 'string').map((m) => this.toModel({ id: m.id }));
  }

  // ─── Requests ───────────────────────────────────────────────────

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = { ...this.extraHeaders };
    if (json) h['Content-Type'] = 'application/json';
    if (this.apiKey && !h.Authorization && !h['api-key']) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  private buildBody(request: AIRequest, stream: boolean): Record<string, unknown> {
    const messages: WireMessage[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.name ? { name: m.name } : {}),
    }));
    const body: Record<string, unknown> = { model: request.model, messages, stream };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.tools && request.tools.length > 0) body.tools = request.tools;
    return body;
  }

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    const release = this.trackConnection();
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers(true),
          body: JSON.stringify(this.buildBody(request, false)),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          const errorBody = await res.text().catch(() => '');
          throw new AIRouterError(
            `${this.label} chat error (${res.status}): ${redactSecrets(errorBody.slice(0, 500), this.apiKey)}`,
            this.name,
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const data = (await response.json()) as WireChatResponse;
      const choice = data.choices?.[0];
      return {
        id: data.id ?? this.generateResponseId(),
        content: choice?.message?.content ?? '',
        model: data.model ?? request.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? this.estimateRequestTokens(request),
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        finishReason: mapFinishReason(choice?.finish_reason),
        latencyMs: Date.now() - startTime,
      };
    } finally {
      release();
    }
  }

  async *streamChatCompletion(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    this.requireInitialized();
    const release = this.trackConnection();
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(this.buildBody(request, true)),
        signal: AbortSignal.timeout(this.timeoutMs * 2),
      });
      if (!response.ok) {
        throw new AIRouterError(
          `${this.label} stream error (${response.status})`,
          this.name,
          response.status,
          this.isRetryableStatus(response.status),
        );
      }
      for await (const chunk of parseSSEStream(response, this.name)) {
        const choice = chunk.choices?.[0];
        yield {
          id: chunk.id,
          content: choice?.delta?.content ?? '',
          model: chunk.model ?? request.model,
          finishReason: choice?.finish_reason ? mapFinishReason(choice.finish_reason) : undefined,
        };
      }
    } finally {
      release();
    }
  }

  // ─── Health ─────────────────────────────────────────────────────

  async healthCheck(): Promise<AIProviderHealth> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(false),
        signal: AbortSignal.timeout(this.healthTimeoutMs),
      });
      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        this.lastHealthError = response.status === 401 || response.status === 403
          ? `unauthorized (${response.status})`
          : `http ${response.status}`;
      } else {
        this.lastHealthError = null;
      }
      return {
        provider: this.name,
        isHealthy: response.ok,
        latencyMs,
        errorRate: response.ok ? 0 : 1,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch (err) {
      this.lastHealthError = redactSecrets(err instanceof Error ? err.message : String(err), this.apiKey);
      return {
        provider: this.name,
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        errorRate: 1,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    }
  }
}
