/**
 * Gemma AI Provider (via Ollama)
 * ALO Labs AIOS — Local LLM provider for Google's Gemma models via Ollama.
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

// ─── Model Definitions ──────────────────────────────────────────────

const GEMMA_MODELS: AIModel[] = [
  {
    id: 'gemma2',
    name: 'Gemma 2 (9B)',
    provider: 'ollama-gemma' as const,
    family: 'gemma' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'json-mode', 'code-generation'] as AICapability[],
  },
  {
    id: 'gemma2:9b',
    name: 'Gemma 2 9B (explicit)',
    provider: 'ollama-gemma' as const,
    family: 'gemma' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'json-mode', 'code-generation'] as AICapability[],
  },
  {
    id: 'gemma2:27b',
    name: 'Gemma 2 27B',
    provider: 'ollama-gemma' as const,
    family: 'gemma' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'json-mode', 'code-generation'] as AICapability[],
  },
];

// ─── Ollama API Types ──────────────────────────────────────────────

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

// ─── NDJSON Line Parser ────────────────────────────────────────────

async function* parseNDJSONLines(
  response: Response,
): AsyncGenerator<OllamaChatResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'ollama-gemma');

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
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as OllamaChatResponse;
      } catch {
        // Skip malformed lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as OllamaChatResponse;
    } catch {
      // Skip
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class GemmaProvider extends BaseAIProvider {
  readonly name = 'ollama-gemma' as const;
  supportedModels = GEMMA_MODELS;

  private endpoint: string;
  private abortController: AbortController | null = null;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint ?? process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(
        `Ollama is not reachable at ${this.endpoint}`,
        'ollama-gemma',
        undefined,
        false,
      );
    }
    this.supportedModels = await this.listModels();
    this._initialized = true;
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    await super.disconnect();
  }

  // ─── Models ─────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    const response = await fetch(`${this.endpoint}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return [...GEMMA_MODELS];
    }

    const body = await response.json() as { models?: { name: string; size: number }[] };
    const tags = body.models ?? [];

    const gemmaTags = tags.filter((t) => t.name.toLowerCase().includes('gemma'));

    if (gemmaTags.length === 0) return [...GEMMA_MODELS];

    return gemmaTags.map((tag) => ({
      id: tag.name,
      name: tag.name,
      provider: 'ollama-gemma' as const,
      family: 'gemma' as AIModelFamily,
      parameters: {},
      contextLength: tag.size > 20_000_000_000 ? 32_000 : 8_192,
      capabilities: ['chat', 'streaming', 'json-mode', 'code-generation'] as AICapability[],
      endpoint: this.endpoint,
    }));
  }

  // ─── Chat Completion (non-streaming) ────────────────────────────

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    const release = this.trackConnection();
    const responseId = this.generateResponseId();
    const startTime = Date.now();

    try {
      const ollamaReq: OllamaChatRequest = {
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      };

      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ollamaReq),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const errorBody = await res.text().catch(() => '');
          throw new AIRouterError(
            `Gemma/Ollama chat error (${res.status}): ${errorBody}`,
            'ollama-gemma',
            res.status,
            this.isRetryableStatus(res.status),
          );
        }
        return res;
      });

      const body = (await response.json()) as OllamaChatResponse;
      const latencyMs = Date.now() - startTime;

      return {
        id: responseId,
        content: body.message?.content ?? '',
        model: body.model ?? request.model,
        usage: {
          promptTokens: body.prompt_eval_count ?? this.estimateRequestTokens(request),
          completionTokens: body.eval_count ?? 0,
          totalTokens: (body.prompt_eval_count ?? 0) + (body.eval_count ?? 0),
        },
        finishReason: body.done ? 'stop' : 'length',
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
    const responseId = this.generateResponseId();

    try {
      const ollamaReq: OllamaChatRequest = {
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      };

      this.abortController = new AbortController();
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaReq),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new AIRouterError(
          `Gemma/Ollama stream error (${response.status})`,
          'ollama-gemma',
          response.status,
          this.isRetryableStatus(response.status),
        );
      }

      for await (const chunk of parseNDJSONLines(response)) {
        yield {
          id: responseId,
          content: chunk.message?.content ?? '',
          model: chunk.model ?? request.model,
          finishReason: chunk.done ? 'stop' : undefined,
        };
      }
    } finally {
      release();
      this.abortController = null;
    }
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck(): Promise<AIProviderHealth> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      const latencyMs = Date.now() - startTime;

      return {
        provider: 'ollama-gemma',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'ollama-gemma',
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