/**
 * Microsoft Phi AI Provider (via Ollama)
 * ALO Labs AIOS — Local LLM provider for Microsoft's Phi models via Ollama.
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

const PHI_MODELS: AIModel[] = [
  {
    id: 'phi3',
    name: 'Phi 3 (3.8B)',
    provider: 'ollama-phi' as const,
    family: 'phi' as AIModelFamily,
    parameters: {},
    contextLength: 8_192,
    capabilities: ['chat', 'streaming', 'json-mode', 'code-generation'] as AICapability[],
  },
  {
    id: 'phi3:mini',
    name: 'Phi 3 Mini (3.8B)',
    provider: 'ollama-phi' as const,
    family: 'phi' as AIModelFamily,
    parameters: {},
    contextLength: 131_072,
    capabilities: ['chat', 'streaming', 'json-mode', 'code-generation'] as AICapability[],
  },
  {
    id: 'phi3:medium',
    name: 'Phi 3 Medium (14B)',
    provider: 'ollama-phi' as const,
    family: 'phi' as AIModelFamily,
    parameters: {},
    contextLength: 131_072,
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
  if (!reader) throw new AIRouterError('Response body is not readable', 'ollama-phi');

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

export class PhiProvider extends BaseAIProvider {
  readonly name = 'ollama-phi' as const;
  supportedModels = PHI_MODELS;

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
        'ollama-phi',
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
      return [...PHI_MODELS];
    }

    const body = await response.json() as { models?: { name: string; size: number }[] };
    const tags = body.models ?? [];

    const phiTags = tags.filter((t) => t.name.toLowerCase().includes('phi'));

    if (phiTags.length === 0) return [...PHI_MODELS];

    return phiTags.map((tag) => ({
      id: tag.name,
      name: tag.name,
      provider: 'ollama-phi' as const,
      family: 'phi' as AIModelFamily,
      parameters: {},
      contextLength: tag.size > 10_000_000_000 ? 131_072 : 8_192,
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
            `Phi/Ollama chat error (${res.status}): ${errorBody}`,
            'ollama-phi',
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
          `Phi/Ollama stream error (${response.status})`,
          'ollama-phi',
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
        provider: 'ollama-phi',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'ollama-phi',
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