/**
 * Z-AI SDK Provider
 * ALO Labs AIOS — Wraps the z-ai-web-dev-sdk for AI completions.
 *
 * CRITICAL SDK API NOTES:
 * - System prompts MUST use role: 'assistant' (NOT 'system')
 * - Response is at choices[0]?.message?.content
 * - thinking: { type: 'disabled' } is REQUIRED for standard completions
 * - The SDK auto-selects the best model; 'model' param is optional
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

// ─── Types for SDK interface ────────────────────────────────────────

interface ZAIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ZAIChatCompletionOptions {
  model?: string;
  messages: ZAIChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  thinking?: { type: string };
  tools?: unknown[];
  [key: string]: unknown;
}

interface ZAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ZAIChoice {
  message: {
    content?: string;
    role?: string;
  };
  finish_reason?: string;
}

interface ZAIChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: ZAIChoice[];
  usage?: ZAIUsage;
  [key: string]: unknown;
}

interface ZAIStreamDelta {
  content?: string;
  finish_reason?: string;
}

interface ZAIChatStreamChunk {
  id: string;
  model?: string;
  delta: ZAIStreamDelta;
  [key: string]: unknown;
}

interface ZAIInstance {
  chat: {
    completions: {
      create: (options: ZAIChatCompletionOptions) => Promise<ZAIChatCompletionResponse | AsyncIterable<ZAIChatStreamChunk>>;
    };
  };
}

interface ZAIModelInfo {
  id: string;
  name: string;
  context_length?: number;
  capabilities?: string[];
}

// ─── Model Tier Registry ────────────────────────────────────────────

/**
 * Maps model tier names (from pipeline.ts classifyTask) to model IDs
 * recognized by the Z-AI SDK. The SDK may auto-select, but we register
 * these so the router can find them via findProviderForModel().
 */
const MODEL_TIER_MAP: Record<string, { id: string; name: string; capabilities: AICapability[] }> = {
  fast: {
    id: 'fast',
    name: 'Fast Model',
    capabilities: ['chat', 'streaming'],
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Model',
    capabilities: ['chat', 'streaming', 'json-mode'],
  },
  reasoning: {
    id: 'reasoning',
    name: 'Reasoning Model',
    capabilities: ['chat', 'streaming', 'json-mode', 'reasoning'],
  },
  coding: {
    id: 'coding',
    name: 'Coding Model',
    capabilities: ['chat', 'streaming', 'code-generation', 'json-mode'],
  },
  vision: {
    id: 'vision',
    name: 'Vision Model',
    capabilities: ['chat', 'streaming', 'vision'],
  },
  embedding: {
    id: 'embedding',
    name: 'Embedding Model',
    capabilities: ['chat', 'streaming'],
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function mapFinishReason(reason?: string): AIResponse['finishReason'] {
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

function inferFamilyFromId(modelId: string): AIModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes('glm')) return 'glm';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('llama')) return 'llama';
  if (id.includes('gemma')) return 'gemma';
  if (id.includes('phi')) return 'phi';
  if (id.includes('mistral') || id.includes('mixtral')) return 'mistral';
  return 'custom';
}

// ─── Provider ───────────────────────────────────────────────────────

export class ZAIProvider extends BaseAIProvider {
  readonly name = 'zai-sdk' as const;
  supportedModels: AIModel[] = [];

  private client: ZAIInstance | null = null;

  constructor() {
    super();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      // Dynamic import — handle ESM default export
      const imported = await import('z-ai-web-dev-sdk');
      const ZAI = (imported.default || imported) as unknown as {
        create: (config?: Record<string, unknown>) => Promise<ZAIInstance>;
      };
      // The SDK provides a static factory method
      this.client = await ZAI.create();

      // Register tier-based models so the router can find them
      this.registerTierModels();
      this._initialized = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AIRouterError(
        `Failed to initialize Z-AI SDK: ${message}`,
        'zai-sdk',
        undefined,
        false,
      );
    }
  }

  /**
   * Register model tier entries so the AI Router's findProviderForModel()
   * can resolve 'fast', 'balanced', 'reasoning', 'coding', 'vision', 'embedding'
   * to actual model entries on this provider.
   */
  private registerTierModels(): void {
    this.supportedModels = Object.entries(MODEL_TIER_MAP).map(([tier, info]) => ({
      id: tier,
      name: info.name,
      provider: 'zai-sdk' as const,
      family: inferFamilyFromId(tier),
      parameters: {},
      contextLength: 128_000,
      capabilities: info.capabilities,
    }));
  }

  async disconnect(): Promise<void> {
    this.client = null;
    await super.disconnect();
  }

  // ─── Models ─────────────────────────────────────────────────────

  async listModels(): Promise<AIModel[]> {
    if (this.supportedModels.length > 0) {
      return this.supportedModels;
    }
    return this.supportedModels;
  }

  // ─── Message Conversion ─────────────────────────────────────────

  /**
   * Convert router messages to ZAI SDK format.
   * CRITICAL: The SDK uses role 'assistant' for what we call 'system' prompts.
   */
  private convertMessages(messages: Array<{ role: string; content: string }>): ZAIChatMessage[] {
    return messages.map((m) => ({
      role: m.role === 'system' ? 'assistant' as const : ('user' as const),
      content: m.content,
    }));
  }

  // ─── Chat Completion (non-streaming) ────────────────────────────

  async chatCompletion(request: AIRequest): Promise<AIResponse> {
    this.requireInitialized();
    if (!this.client) {
      throw new AIRouterError('Z-AI SDK client not initialized', 'zai-sdk');
    }

    const release = this.trackConnection();
    const startTime = Date.now();

    try {
      const sdkMessages = this.convertMessages(request.messages);

      const options: ZAIChatCompletionOptions = {
        messages: sdkMessages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
        thinking: { type: 'disabled' },
      };

      // Only pass model if it's a real model ID (not a tier alias)
      // The SDK auto-selects the best model when no model is specified
      const realModelIds = this.getRealModelIds();
      if (request.model && realModelIds.has(request.model)) {
        options.model = request.model;
      }

      if (request.tools) {
        options.tools = request.tools;
      }

      const result = await this.withRetry(async () => {
        const response = await this.client!.chat.completions.create(options);
        return response as ZAIChatCompletionResponse;
      });

      const latencyMs = Date.now() - startTime;

      // Extract response content from the choices array
      const content = result.choices?.[0]?.message?.content
        ?? (result as Record<string, unknown>).content as string
        ?? '';

      const finishReason = result.choices?.[0]?.finish_reason
        ?? (result as Record<string, unknown>).finish_reason as string
        ?? 'stop';

      const model = result.model
        ?? (result as Record<string, unknown>).model as string
        ?? request.model;

      // Estimate tokens if usage not provided
      const promptTokens = result.usage?.prompt_tokens
        ?? this.estimateRequestTokens(request);
      const completionTokens = result.usage?.completion_tokens ?? Math.ceil(content.length / 4);
      const totalTokens = result.usage?.total_tokens ?? (promptTokens + completionTokens);

      return {
        id: (result.id as string) || `zai_${Date.now()}`,
        content,
        model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        finishReason: mapFinishReason(finishReason),
        latencyMs,
      };
    } finally {
      release();
    }
  }

  // ─── Chat Completion (streaming) ────────────────────────────────

  async *streamChatCompletion(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    this.requireInitialized();
    if (!this.client) {
      throw new AIRouterError('Z-AI SDK client not initialized', 'zai-sdk');
    }

    const release = this.trackConnection();

    try {
      const sdkMessages = this.convertMessages(request.messages);

      const options: ZAIChatCompletionOptions = {
        messages: sdkMessages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
        thinking: { type: 'disabled' },
      };

      const stream = await this.client.chat.completions.create(options);

      // The SDK returns an AsyncIterable when streaming
      if (typeof (stream as AsyncIterable<ZAIChatStreamChunk>)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of stream as AsyncIterable<ZAIChatStreamChunk>) {
          yield {
            id: chunk.id,
            content: chunk.delta?.content ?? '',
            model: chunk.model ?? request.model,
            finishReason: chunk.delta?.finish_reason
              ? mapFinishReason(chunk.delta.finish_reason)
              : undefined,
          };
        }
      }
    } finally {
      release();
    }
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck(): Promise<AIProviderHealth> {
    const startTime = Date.now();

    try {
      if (!this.client) {
        await this.initialize();
      }

      const latencyMs = Date.now() - startTime;

      return {
        provider: 'zai-sdk',
        isHealthy: true,
        latencyMs,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    } catch {
      return {
        provider: 'zai-sdk',
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        errorRate: 1,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      };
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────

  /** Get model IDs that are actual SDK models (not tier aliases) */
  private getRealModelIds(): Set<string> {
    // The SDK auto-selects models, so tier aliases are not real model IDs.
    // We return empty set so the provider doesn't send tier names to the SDK.
    return new Set();
  }
}
