/**
 * Ollama Provider
 * ALO Labs AIOS — Local LLM provider using the Ollama REST API.
 * Supports any model pulled locally: GLM, Qwen, DeepSeek, Llama, Gemma, Phi, Mistral, etc.
 */

import type {
  AIModel,
  AIModelFamily,
  AICapability,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIMessage,
} from './types';
import { AIModelNotFoundError, AIRouterError } from './types';
import { BaseAIProvider } from './provider-base';

// ─── Types ──────────────────────────────────────────────────────────

interface OllamaTag {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
  tools?: unknown[];
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function inferModelFamily(details: OllamaTag['details'], name: string): AIModelFamily {
  const n = name.toLowerCase();
  if (n.includes('glm') || details.family.toLowerCase().includes('glm')) return 'glm';
  if (n.includes('qwen') || details.family.toLowerCase().includes('qwen')) return 'qwen';
  if (n.includes('deepseek')) return 'deepseek';
  if (n.includes('llama') || details.family.toLowerCase().includes('llama')) return 'llama';
  if (n.includes('gemma')) return 'gemma';
  if (n.includes('phi')) return 'phi';
  if (n.includes('mistral') || n.includes('mixtral')) return 'mistral';
  return 'custom';
}

function parseContextLength(sizeBytes: number): number {
  // Rough heuristic: larger models tend to have larger context windows.
  // This is a safe lower-bound estimate; Ollama will enforce the real limit.
  if (sizeBytes > 20_000_000_000) return 128_000;
  if (sizeBytes > 10_000_000_000) return 32_000;
  if (sizeBytes > 4_000_000_000) return 16_000;
  return 8_000;
}

function inferCapabilities(family: AIModelFamily): AICapability[] {
  const base: AICapability[] = ['chat', 'streaming'];
  switch (family) {
    case 'glm':
      return [...base, 'function-calling', 'json-mode', 'code-generation'];
    case 'qwen':
      return [...base, 'function-calling', 'vision', 'json-mode', 'code-generation'];
    case 'deepseek':
      return [...base, 'function-calling', 'json-mode', 'code-generation'];
    case 'llama':
      return [...base, 'function-calling', 'json-mode', 'code-generation'];
    case 'gemma':
      return [...base, 'json-mode', 'code-generation'];
    case 'phi':
      return [...base, 'json-mode', 'code-generation'];
    case 'mistral':
      return [...base, 'function-calling', 'json-mode', 'code-generation'];
    default:
      return base;
  }
}

function mapFinishReason(done: boolean, _content: string): AIResponse['finishReason'] {
  if (!done) return 'length';
  return 'stop';
}

// ─── NDJSON Line Parser ─────────────────────────────────────────────

async function* parseNDJSONLines(
  response: Response,
): AsyncGenerator<OllamaChatResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIRouterError('Response body is not readable', 'ollama');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
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

  // Process any remaining buffer content
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as OllamaChatResponse;
    } catch {
      // Skip
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────

export class OllamaProvider extends BaseAIProvider {
  readonly name = 'ollama' as const;
  supportedModels: AIModel[] = [];

  private endpoint: string;
  private abortController: AbortController | null = null;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint ?? 'http://localhost:11434';
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const health = await this.healthCheck();
    if (!health.isHealthy) {
      throw new AIRouterError(
        `Ollama is not reachable at ${this.endpoint}`,
        'ollama',
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
      throw new AIRouterError(
        `Ollama /api/tags returned ${response.status}`,
        'ollama',
        response.status,
      );
    }

    const body = (await response.json()) as { models?: OllamaTag[] };
    const tags = body.models ?? [];

    return tags.map((tag) => {
      const family = inferModelFamily(tag.details, tag.name);
      const capabilities = inferCapabilities(family);

      return {
        id: tag.name,
        name: tag.name,
        provider: 'ollama' as const,
        family,
        parameters: {},
        contextLength: parseContextLength(tag.size),
        capabilities,
        endpoint: this.endpoint,
      };
    });
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

      if (request.tools) {
        ollamaReq.tools = request.tools as unknown[];
      }

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
            `Ollama chat error (${res.status}): ${errorBody}`,
            'ollama',
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
        finishReason: mapFinishReason(body.done, body.message?.content ?? ''),
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
          `Ollama stream error (${response.status})`,
          'ollama',
          response.status,
          this.isRetryableStatus(response.status),
        );
      }

      for await (const chunk of parseNDJSONLines(response)) {
        const streamChunk: AIStreamChunk = {
          id: responseId,
          content: chunk.message?.content ?? '',
          model: chunk.model ?? request.model,
          finishReason: chunk.done ? 'stop' : undefined,
        };
        yield streamChunk;
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
        provider: 'ollama',
        isHealthy: response.ok,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'ollama',
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
