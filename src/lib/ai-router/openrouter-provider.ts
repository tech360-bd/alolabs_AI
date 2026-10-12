/**
 * OpenRouter Provider
 * ALO Labs AIOS — Cloud LLM provider using the OpenRouter API.
 * Uses an OpenAI-compatible API format with SSE streaming.
 */

import type {
  AIModel,
  AIModelFamily,
  AICapability,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
} from './types';
import { AIRouterError } from './types';
import { BaseAIProvider } from './provider-base';

// ─── Types ──────────────────────────────────────────────────────────

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
  top_provider: {
    max_completion_tokens: number | null;
  } | null;
  capabilities?: string[];
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface OpenRouterChatMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
}

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenRouterMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
}

interface OpenRouterChoice {
  index: number;
  message: OpenRouterMessage;
  delta?: Partial<OpenRouterMessage>;
  finish_reason: string | null;
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenRouterChatResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

// ─── Helpers ────────────────────────────────────────────────────────

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1';

function parseCostPerMillion(pricing: string): number {
  const num = parseFloat(pricing);
  return isNaN(num) ? 0 : num * 1_000_000;
}

function inferFamily(modelId: string): AIModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('glm')) return 'glm';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('llama')) return 'llama';
  if (id.includes('gemma')) return 'gemma';
  if (id.includes('phi')) return 'phi';
  if (id.includes('mistral') || id.includes('mixtral') || id.includes('codestral')) return 'mistral';
  return 'custom';
}

function parseCapabilities(model: OpenRouterModel): AICapability[] {
  const caps: AICapability[] = ['chat', 'streaming'];
  const id = model.id.toLowerCase();

  if (model.capabilities?.includes('vision') || model.architecture.modality.includes('image')) {
    caps.push('vision');
  }
  if (model.capabilities?.includes('function_calling') || model.capabilities?.includes('tools')) {
    caps.push('function-calling');
  }
  if (model.capabilities?.includes('json_schema') || id.includes('json')) {
    caps.push('json-mode');
  }
  if (
    id.includes('coder') ||
    id.includes('deepseek-coder') ||
    id.includes('code') ||
    id.includes('starcoder')
  ) {
    caps.push('code-generation');
  }

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

function isOpenRouterModel(obj: unknown): obj is OpenRouterModel {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'context_length' in obj &&
    'pricing' in obj
  );
}

// ─── SSE Stream Parser ──────────────────────────────────────────────

async function* parseSSEStream(
  response: Response,
): AsyncGenerator<OpenRouterChatResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'openrouter');

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
      if (!trimmed || trimmed.startsWith(':')) continue; // skip empty / comments
      if (trimmed === 'data: [DONE]') return;
      if (trimmed.startsWith('data: ')) {
        const json = trimmed.slice(6);
        try {
          yield JSON.parse(json) as OpenRouterChatResponse;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class OpenRouterProvider extends BaseAIProvider {
  readonly name = 'openrouter' as const;
  supportedModels: AIModel[] = [];

  private endpoint: string;
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;

  constructor(config?: { endpoint?: string; apiKey?: string; siteUrl?: string; siteName?: string }) {
    super();
    this.endpoint = config?.endpoint ?? DEFAULT_ENDPOINT;
    this.apiKey = config?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
    this.siteUrl = config?.siteUrl ?? process.env.SITE_URL ?? 'https://alolabs.ai';
    this.siteName = config?.siteName ?? process.env.SITE_NAME ?? 'ALO Labs AIOS';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AIRouterError(
        'OpenRouter API key is required. Set OPENROUTER_API_KEY env var.',
        'openrouter',
        undefined,
        false,
      );
    }

    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(
        `OpenRouter is not reachable at ${this.endpoint}`,
        'openrouter',
        undefined,
        false,
      );
    }

    this.supportedModels = await this.listModels();
    this._initialized = true;
  }

  // ─── Models ─────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    const response = await fetch(`${this.endpoint}/models`, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new AIRouterError(
        `OpenRouter /models returned ${response.status}`,
        'openrouter',
        response.status,
      );
    }

    const body = (await response.json()) as OpenRouterModelsResponse;
    const models = (body.data ?? []).filter(isOpenRouterModel);

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: 'openrouter' as const,
      family: inferFamily(m.id),
      parameters: {},
      contextLength: m.context_length,
      capabilities: parseCapabilities(m),
      endpoint: this.endpoint,
      costPerMillionTokens: parseCostPerMillion(m.pricing.prompt),
    }));
  }

  // ─── Chat Completion (non-streaming) ────────────────────────────

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    const release = this.trackConnection();
    const startTime = Date.now();

    try {
      const body = this.buildChatBody(request, false);

      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const errorBody = await res.text().catch(() => '');
          throw new AIRouterError(
            `OpenRouter chat error (${res.status}): ${errorBody}`,
            'openrouter',
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const data = (await response.json()) as OpenRouterChatResponse;
      const latencyMs = Date.now() - startTime;
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
        latencyMs,
      };
    } finally {
      release();
    }
  }

  // ─── Chat Completion (streaming) ────────────────────────────────

  async *streamChatCompletion(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    this.requireInitialized();
    const release = this.trackConnection();

    try {
      const body = this.buildChatBody(request, true);

      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });

      if (!response.ok) {
        throw new AIRouterError(
          `OpenRouter stream error (${response.status})`,
          'openrouter',
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
          finishReason: choice?.finish_reason
            ? mapFinishReason(choice.finish_reason)
            : undefined,
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
      const latencyMs = Date.now() - startTime;

      return {
        provider: 'openrouter',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'openrouter',
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

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
    };
    return headers;
  }

  private buildChatBody(request: AIRequest, stream: boolean): Record<string, unknown> {
    const messages: OpenRouterChatMessage[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    }));

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.tools) body.tools = request.tools;

    return body;
  }
}