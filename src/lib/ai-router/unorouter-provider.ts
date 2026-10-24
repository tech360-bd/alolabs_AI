/**
 * UnoRouter Provider
 * ALO Labs AgentOS — free-lane-only adapter for https://unorouter.com
 * (OpenAI-compatible gateway at https://api.unorouter.com/v1, Bearer auth).
 *
 * **Free models only, by construction.** UnoRouter's free lanes carry a `:free`
 * model-id suffix and cost $0 input and $0 output; paid lanes bill per token
 * from $1 and never carry the suffix. This adapter cannot serve a paid lane:
 *
 *   1. Discovery keeps only rows that pass `isUnoRouterFreeModel` — the `:free`
 *      suffix plus, when the catalog reports pricing, explicit $0 on both sides.
 *   2. Every request is refused up front unless its model id ends in `:free`.
 *   3. Immediately before a chat/stream call the live catalog is re-checked and
 *      the call is refused if upstream no longer confirms the model as free.
 *
 * Free-lane operating notes (upstream "free-models-aggregated"): roughly
 * 1 request/minute per model per user — the cap answers HTTP 429 with
 * `Retry-After`, and rotating between free models is the intended pattern;
 * free output is capped at 8K tokens; drained pools return an explicit
 * "all providers busy" error and recover automatically.
 */

import { extractToolCalls } from './tool-calls';
import type {
  AIModel,
  AIModelFamily,
  AIProvider,
  AICapability,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
} from './types';
import { AIRouterError } from './types';
import { BaseAIProvider, requestAbortSignal } from './provider-base';
import { hasFreeModelIdSuffix, isUnoRouterFreeModel } from './free-models';

// ─── Types ──────────────────────────────────────────────────────────

interface UnoRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string };
  capabilities?: string[];
}

interface UnoRouterChatMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
}

interface UnoRouterToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface UnoRouterWireMessage {
  role: string;
  content: string | null;
  tool_calls?: UnoRouterToolCall[];
}

interface UnoRouterChoice {
  index: number;
  message: UnoRouterWireMessage;
  delta?: Partial<UnoRouterWireMessage>;
  finish_reason: string | null;
}

interface UnoRouterChatResponse {
  id: string;
  model: string;
  choices: UnoRouterChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── Constants ──────────────────────────────────────────────────────

/** The API host — unorouter.com itself is the web app, not the inference endpoint. */
export const UNOROUTER_ENDPOINT = 'https://api.unorouter.com/v1';
/** Free lanes cap completion output at 8K tokens (upstream contract). */
export const UNOROUTER_FREE_MAX_OUTPUT_TOKENS = 8_192;

// ─── Helpers ────────────────────────────────────────────────────────

function inferFamily(modelId: string): AIModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('glm')) return 'glm';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('llama')) return 'llama';
  if (id.includes('gemma')) return 'gemma';
  if (id.includes('phi')) return 'phi';
  if (id.includes('mistral') || id.includes('mixtral') || id.includes('codestral') || id.includes('kimi')) return 'mistral';
  return 'custom';
}

function parseCapabilities(model: UnoRouterModel): AICapability[] {
  const caps: AICapability[] = ['chat', 'streaming'];
  const id = model.id.toLowerCase();
  if (model.capabilities?.includes('vision') || model.architecture?.modality?.includes('image')) caps.push('vision');
  if (model.capabilities?.includes('function_calling') || model.capabilities?.includes('tools')) caps.push('function-calling');
  if (model.capabilities?.includes('json_schema') || id.includes('json')) caps.push('json-mode');
  if (id.includes('coder') || id.includes('code')) caps.push('code-generation');
  return caps;
}

function mapFinishReason(reason: string | null): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
    case 'max_tokens':
      return 'length';
    case 'tool_calls':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    default:
      return 'stop';
  }
}

async function* parseSSEStream(response: Response): AsyncGenerator<UnoRouterChatResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'unorouter-free');

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
          yield JSON.parse(trimmed.slice(6)) as UnoRouterChatResponse;
        } catch {
          // Skip malformed chunks.
        }
      }
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class UnoRouterProvider extends BaseAIProvider {
  readonly name: AIProvider;
  supportedModels: AIModel[] = [];
  /** Free-only is a product rule here, not an option: paid lanes never serve. */
  override readonly freeOnly = true;

  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(config?: { endpoint?: string; apiKey?: string; configName?: string }) {
    super();
    this.name = config?.configName ? `unorouter-free:${config.configName}` : 'unorouter-free';
    this.endpoint = (config?.endpoint ?? UNOROUTER_ENDPOINT).replace(/\/+$/, '');
    this.apiKey = config?.apiKey ?? process.env.UNOROUTER_API_KEY ?? '';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AIRouterError(
        'UnoRouter API key is required. Set UNOROUTER_API_KEY or configure a key in AI Providers. Get one at https://unorouter.com — no card required.',
        this.name,
        undefined,
        false,
      );
    }

    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(`UnoRouter is not reachable at ${this.endpoint}`, this.name, undefined, false);
    }

    this.supportedModels = await this.listModels();
    if (this.supportedModels.length === 0) {
      throw new AIRouterError(
        'UnoRouter returned no free (:free) models with confirmed $0 pricing in its current catalog.',
        this.name,
        undefined,
        false,
      );
    }
    this._initialized = true;
  }

  // ─── Models ─────────────────────────────────────────────────────

  /** Live free lanes only — paid lanes are filtered out at discovery. */
  async listModels(signal?: AbortSignal): Promise<AIModel[]> {
    const response = await fetch(`${this.endpoint}/models`, {
      headers: this.buildHeaders(),
      signal: requestAbortSignal({ signal }, 15_000),
    });

    if (!response.ok) {
      throw new AIRouterError(`UnoRouter /models returned ${response.status}`, this.name, response.status);
    }

    const body = (await response.json()) as { data?: unknown[] };
    return (body.data ?? []).flatMap((item): AIModel[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || row.id.trim() === '') return [];
      if (!isUnoRouterFreeModel(row)) return [];
      const model = item as UnoRouterModel;
      return [
        {
          id: model.id,
          name: model.name ?? model.id,
          provider: this.name,
          family: inferFamily(model.id),
          parameters: {},
          contextLength:
            typeof model.context_length === 'number' && model.context_length > 0
              ? Math.floor(model.context_length)
              : 32_768,
          capabilities: parseCapabilities(model),
          endpoint: this.endpoint,
          costPerMillionTokens: 0,
        },
      ];
    });
  }

  // ─── Chat Completion (non-streaming) ────────────────────────────

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    await this.guardFreeRequest(request);
    const release = this.trackConnection();
    const startTime = Date.now();

    try {
      const body = this.buildChatBody(request, false);

      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: requestAbortSignal(request, 120_000),
        });
        if (!res.ok) {
          const errorBody = await res.text().catch(() => '');
          throw new AIRouterError(
            `UnoRouter chat error (${res.status})${res.status === 429 ? ' — free lanes cap at ~1 request/minute per model; rotate to another :free model' : ''}: ${errorBody}`,
            this.name,
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const data = (await response.json()) as UnoRouterChatResponse;
      const choice = data.choices?.[0];

      return {
        id: data.id,
        content: choice?.message?.content ?? '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? this.estimateRequestTokens(request),
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        finishReason: mapFinishReason(choice?.finish_reason ?? null),
        toolCalls: extractToolCalls(choice?.message),
        latencyMs: Date.now() - startTime,
      };
    } finally {
      release();
    }
  }

  // ─── Chat Completion (streaming) ────────────────────────────────

  async *streamChatCompletion(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    this.requireInitialized();
    await this.guardFreeRequest(request);
    const release = this.trackConnection();

    try {
      const body = this.buildChatBody(request, true);

      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: requestAbortSignal(request, 300_000),
      });

      if (!response.ok) {
        throw new AIRouterError(
          `UnoRouter stream error (${response.status})${response.status === 429 ? ' — free lanes cap at ~1 request/minute per model; rotate to another :free model' : ''}`,
          this.name,
          response.status,
          this.isRetryableStatus(response.status),
        );
      }

      for await (const chunk of parseSSEStream(response)) {
        const choice = chunk.choices?.[0];
        const content = choice?.delta?.content ?? '';
        yield {
          id: chunk.id,
          content: typeof content === 'string' ? content : '',
          model: chunk.model,
          finishReason: choice?.finish_reason ? mapFinishReason(choice.finish_reason) : undefined,
        };
      }
    } finally {
      release();
    }
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck(): Promise<AIProviderHealth> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        provider: this.name,
        isHealthy: response.ok,
        latencyMs: Date.now() - startTime,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
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

  // ─── Private Helpers ────────────────────────────────────────────

  /**
   * Free-only request guard. The id suffix is checked up front (a paid lane is
   * refused before any bytes leave), then the live catalog is re-checked so an
   * upstream change to pricing or lane status refuses the call rather than
   * silently serving a paid model.
   */
  private async guardFreeRequest(request: AIRequest): Promise<void> {
    if (!hasFreeModelIdSuffix(request.model)) {
      throw new AIRouterError(
        `UnoRouter serves free models only: refusing "${request.model}" — free lanes carry a ":free" model-id suffix (e.g. deepseek-v4-flash:free).`,
        this.name,
        undefined,
        false,
      );
    }
    const current = await this.listModels(request.signal);
    this.supportedModels = current;
    if (!current.some((model) => model.id === request.model)) {
      throw new AIRouterError(
        `UnoRouter is refusing model "${request.model}": its live catalog no longer confirms this lane as free (:free with $0 input and output).`,
        this.name,
        undefined,
        false,
      );
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private buildChatBody(request: AIRequest, stream: boolean): Record<string, unknown> {
    const messages: UnoRouterChatMessage[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    }));

    // Free lanes cap output at 8K tokens — clamp rather than let upstream
    // silently truncate past the documented contract.
    const maxTokens = request.maxTokens !== undefined
      ? Math.min(request.maxTokens, UNOROUTER_FREE_MAX_OUTPUT_TOKENS)
      : undefined;

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    if (request.tools) body.tools = request.tools;

    return body;
  }
}
