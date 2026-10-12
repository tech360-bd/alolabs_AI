/**
 * Groq AI Provider
 * ALO Labs AIOS — Ultra-fast cloud LLM provider using the Groq API.
 * OpenAI-compatible API format with SSE streaming.
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

interface GroqMessage {
  role: string;
  content: string;
}

interface GroqChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string | null;
}

interface GroqUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface GroqChatResponse {
  id: string;
  model: string;
  choices: GroqChoice[];
  usage?: GroqUsage;
}

interface GroqStreamChoice {
  index: number;
  delta: { role?: string; content?: string };
  finish_reason: string | null;
}

interface GroqStreamResponse {
  id: string;
  model: string;
  choices: GroqStreamChoice[];
}

// ─── Model Definitions ──────────────────────────────────────────────

const GROQ_MODELS: AIModel[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq' as const,
    family: 'llama' as AIModelFamily,
    parameters: {},
    contextLength: 128_000,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode', 'reasoning'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.59,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'groq' as const,
    family: 'llama' as AIModelFamily,
    parameters: {},
    contextLength: 128_000,
    capabilities: ['chat', 'streaming', 'json-mode'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.05,
  },
  {
    id: 'llama3-70b-8192',
    name: 'Llama 3 70B',
    provider: 'groq' as const,
    family: 'llama' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.59,
  },
  {
    id: 'llama3-8b-8192',
    name: 'Llama 3 8B',
    provider: 'groq' as const,
    family: 'llama' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'json-mode'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.05,
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B Instruct',
    provider: 'groq' as const,
    family: 'mistral' as AIModelFamily,
    parameters: {},
    contextLength: 32_000,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.24,
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B IT',
    provider: 'groq' as const,
    family: 'gemma' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'json-mode'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.05,
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    provider: 'groq' as const,
    family: 'deepseek' as AIModelFamily,
    parameters: {},
    contextLength: 128_000,
    capabilities: ['chat', 'streaming', 'json-mode', 'reasoning'] as AICapability[],
    endpoint: 'https://api.groq.com/openai/v1',
    costPerMillionTokens: 0.59,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────

const DEFAULT_ENDPOINT = 'https://api.groq.com/openai/v1';

function mapFinishReason(reason: string | null): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'tool-calls';
    case 'content_filter': return 'content-filter';
    default: return 'stop';
  }
}

// ─── SSE Stream Parser ──────────────────────────────────────────────

async function* parseSSEStream(
  response: Response,
): AsyncGenerator<GroqStreamResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'groq');

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
          yield JSON.parse(trimmed.slice(6)) as GroqStreamResponse;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class GroqProvider extends BaseAIProvider {
  readonly name = 'groq' as const;
  supportedModels = GROQ_MODELS;

  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(config?: { endpoint?: string; apiKey?: string }) {
    super();
    this.endpoint = config?.endpoint ?? DEFAULT_ENDPOINT;
    this.apiKey = config?.apiKey ?? process.env.GROQ_API_KEY ?? '';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new AIRouterError(
        'Groq API key is required. Set GROQ_API_KEY env var.',
        'groq',
        undefined,
        false,
      );
    }

    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(
        `Groq API is not reachable at ${this.endpoint}`,
        'groq',
        undefined,
        false,
      );
    }

    this._initialized = true;
  }

  // ─── Models ─────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    this.requireInitialized();
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [...this.supportedModels];

      const data = (await res.json()) as { data: Array<{ id: string }> };
      const remoteIds = new Set(data.data.map((m) => m.id));

      // Return static models that also exist on the remote endpoint
      return this.supportedModels.filter((m) => remoteIds.has(m.id));
    } catch {
      return [...this.supportedModels];
    }
  }

  // ─── Chat Completion (non-streaming) ────────────────────────────

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    const release = this.trackConnection();
    const startTime = Date.now();

    try {
      const messages: GroqMessage[] = request.messages.map((m) => ({
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
            `Groq chat error (${res.status}): ${errorBody}`,
            'groq',
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const data = (await response.json()) as GroqChatResponse;
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
      const messages: GroqMessage[] = request.messages.map((m) => ({
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
          `Groq stream error (${response.status})`,
          'groq',
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
        provider: 'groq',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'groq',
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
