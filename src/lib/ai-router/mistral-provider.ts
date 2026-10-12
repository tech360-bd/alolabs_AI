/**
 * Mistral AI Provider
 * ALO Labs AIOS — Cloud LLM provider using the Mistral API.
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

interface MistralMessage {
  role: string;
  content: string;
}

interface MistralChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string | null;
}

interface MistralUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface MistralChatResponse {
  id: string;
  model: string;
  choices: MistralChoice[];
  usage?: MistralUsage;
}

interface MistralStreamChoice {
  index: number;
  delta: { role?: string; content?: string };
  finish_reason: string | null;
}

interface MistralStreamResponse {
  id: string;
  model: string;
  choices: MistralStreamChoice[];
}

// ─── Model Definitions ──────────────────────────────────────────────

const MISTRAL_MODELS: AIModel[] = [
  {
    id: 'mistral-tiny',
    name: 'Mistral Tiny',
    provider: 'mistral' as const,
    family: 'mistral' as AIModelFamily,
    parameters: {},
    contextLength: 32_000,
    capabilities: ['chat', 'streaming'] as AICapability[],
    costPerMillionTokens: 0.25,
  },
  {
    id: 'mistral-small',
    name: 'Mistral Small',
    provider: 'mistral' as const,
    family: 'mistral' as AIModelFamily,
    parameters: {},
    contextLength: 32_000,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'] as AICapability[],
    costPerMillionTokens: 2.00,
  },
  {
    id: 'mistral-medium',
    name: 'Mistral Medium',
    provider: 'mistral' as const,
    family: 'mistral' as AIModelFamily,
    parameters: {},
    contextLength: 32_000,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode', 'code-generation'] as AICapability[],
    costPerMillionTokens: 2.70,
  },
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    provider: 'mistral' as const,
    family: 'mistral' as AIModelFamily,
    parameters: {},
    contextLength: 128_000,
    capabilities: ['chat', 'streaming', 'function-calling', 'vision', 'json-mode', 'code-generation'] as AICapability[],
    costPerMillionTokens: 8.00,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────

const DEFAULT_ENDPOINT = 'https://api.mistral.ai/v1';

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
): AsyncGenerator<MistralStreamResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'mistral');

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
          yield JSON.parse(trimmed.slice(6)) as MistralStreamResponse;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class MistralProvider extends BaseAIProvider {
  readonly name = 'mistral' as const;
  supportedModels = MISTRAL_MODELS;

  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(config?: { endpoint?: string; apiKey?: string }) {
    super();
    this.endpoint = config?.endpoint ?? DEFAULT_ENDPOINT;
    this.apiKey = config?.apiKey ?? process.env.MISTRAL_API_KEY ?? '';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AIRouterError(
        'Mistral API key is required. Set MISTRAL_API_KEY env var.',
        'mistral',
        undefined,
        false,
      );
    }

    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(
        `Mistral API is not reachable at ${this.endpoint}`,
        'mistral',
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
      const messages: MistralMessage[] = request.messages.map((m) => ({
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
            `Mistral chat error (${res.status}): ${errorBody}`,
            'mistral',
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const data = (await response.json()) as MistralChatResponse;
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
      const messages: MistralMessage[] = request.messages.map((m) => ({
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
          `Mistral stream error (${response.status})`,
          'mistral',
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
        provider: 'mistral',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'mistral',
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
