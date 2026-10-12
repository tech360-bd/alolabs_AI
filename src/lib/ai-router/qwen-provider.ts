/**
 * Qwen (Alibaba Cloud) AI Provider
 * ALO Labs AIOS — Cloud LLM provider using Qwen's OpenAI-compatible API.
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

interface QwenMessage {
  role: string;
  content: string;
}

interface QwenChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string | null;
}

interface QwenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface QwenChatResponse {
  id: string;
  model: string;
  choices: QwenChoice[];
  usage?: QwenUsage;
}

interface QwenStreamChoice {
  index: number;
  delta: { role?: string; content?: string };
  finish_reason: string | null;
}

interface QwenStreamResponse {
  id: string;
  model: string;
  choices: QwenStreamChoice[];
}

// ─── Model Definitions ──────────────────────────────────────────────

const QWEN_MODELS: AIModel[] = [
  {
    id: 'qwen-turbo',
    name: 'Qwen Turbo',
    provider: 'qwen' as const,
    family: 'qwen' as AIModelFamily,
    parameters: {},
    contextLength: 1_300_000,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'] as AICapability[],
    costPerMillionTokens: 0.40,
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    provider: 'qwen' as const,
    family: 'qwen' as AIModelFamily,
    parameters: {},
    contextLength: 131_072,
    capabilities: ['chat', 'streaming', 'function-calling', 'vision', 'json-mode'] as AICapability[],
    costPerMillionTokens: 1.60,
  },
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'qwen' as const,
    family: 'qwen' as AIModelFamily,
    parameters: {},
    contextLength: 32_768,
    capabilities: ['chat', 'streaming', 'function-calling', 'vision', 'json-mode', 'code-generation'] as AICapability[],
    costPerMillionTokens: 4.00,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────

const DEFAULT_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function mapFinishReason(reason: string | null): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'tool-calls';
    default: return 'stop';
  }
}

// ─── SSE Stream Parser ──────────────────────────────────────────────

async function* parseSSEStream(
  response: Response,
): AsyncGenerator<QwenStreamResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'qwen');

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
          yield JSON.parse(trimmed.slice(6)) as QwenStreamResponse;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class QwenProvider extends BaseAIProvider {
  readonly name = 'qwen' as const;
  supportedModels = QWEN_MODELS;

  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(config?: { endpoint?: string; apiKey?: string }) {
    super();
    this.endpoint = config?.endpoint ?? process.env.QWEN_API_URL ?? DEFAULT_ENDPOINT;
    this.apiKey = config?.apiKey ?? process.env.QWEN_API_KEY ?? '';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AIRouterError(
        'Qwen API key is required. Set QWEN_API_KEY env var.',
        'qwen',
        undefined,
        false,
      );
    }

    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(
        `Qwen API is not reachable at ${this.endpoint}`,
        'qwen',
        undefined,
        false,
      );
    }

    this._initialized = true;
  }

  // ─── Models ─────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    return [...this.supportedModels];
  }

  // ─── Chat Completion (non-streaming) ────────────────────────────

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    const release = this.trackConnection();
    const startTime = Date.now();

    try {
      const messages: QwenMessage[] = request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: Record<string, unknown> = {
        model: request.model,
        messages,
        stream: false,
      };

      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
      if (request.tools) body.tools = request.tools;

      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const errorBody = await res.text().catch(() => '');
          throw new AIRouterError(
            `Qwen chat error (${res.status}): ${errorBody}`,
            'qwen',
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const data = (await response.json()) as QwenChatResponse;
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
      const messages: QwenMessage[] = request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: Record<string, unknown> = {
        model: request.model,
        messages,
        stream: true,
      };

      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });

      if (!response.ok) {
        throw new AIRouterError(
          `Qwen stream error (${response.status})`,
          'qwen',
          response.status,
          this.isRetryableStatus(response.status),
        );
      }

      for await (const chunk of parseSSEStream(response)) {
        const choice = chunk.choices?.[0];
        yield {
          id: chunk.id,
          content: choice?.delta?.content ?? '',
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
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - startTime;

      return {
        provider: 'qwen',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'qwen',
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