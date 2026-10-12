/**
 * Abstract Base AI Provider
 * ALO Labs AIOS — Common interface for all AI providers.
 */

import type {
  AIProvider,
  AIModel,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderHealth,
  AIMessage,
} from './types';
import { AIRouterError } from './types';

// ─── Constants ──────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_JITTER_MAX_MS = 300;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ─── Token Estimation ───────────────────────────────────────────────

/** Rough token estimation (~4 chars per token for English text). */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(messages: AIMessage[]): number {
  // Every message has ~4 tokens of overhead (role, delimiters)
  const perMessageOverhead = 4;
  const messageTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content) + perMessageOverhead,
    0,
  );
  // System prompt usually gets a small additional overhead
  return messageTokens + 3;
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(attempt: number): number {
  const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * RETRY_JITTER_MAX_MS;
  return base + jitter;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof AIRouterError) {
    return error.retryable;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('etimedout')) {
      return true;
    }
  }
  return false;
}

// ─── Abstract Base Class ────────────────────────────────────────────

export abstract class BaseAIProvider {
  abstract readonly name: AIProvider;
  abstract supportedModels: AIModel[];

  protected _initialized = false;
  protected _activeConnections = 0;

  /** Provider-specific initialization (validate credentials, test connectivity, etc.). */
  abstract initialize(): Promise<void>;

  /** Execute a non-streaming chat completion. */
  abstract chatCompletion(request: AIRequest): Promise<AIResponse>;

  /** Execute a streaming chat completion. */
  abstract streamChatCompletion(request: AIRequest): AsyncGenerator<AIStreamChunk>;

  /** Run a health check against this provider. */
  abstract healthCheck(): Promise<AIProviderHealth>;

  /** List all models available on this provider. */
  abstract listModels(): Promise<AIModel[]>;

  /** Graceful teardown. Override for provider-specific cleanup. */
  async disconnect(): Promise<void> {
    this._initialized = false;
  }

  // ─── Common utilities available to all providers ────────────────

  get initialized(): boolean {
    return this._initialized;
  }

  get activeConnections(): number {
    return this._activeConnections;
  }

  /** Estimate token count for an AIRequest. */
  estimateRequestTokens(request: AIRequest): number {
    let tokens = estimateMessagesTokens(request.messages);
    // Reserve tokens for the completion
    tokens += request.maxTokens ?? 1024;
    return tokens;
  }

  /** Check whether a model's context window can handle the request. */
  fitsInContext(request: AIRequest, model: AIModel): boolean {
    const estimated = this.estimateRequestTokens(request);
    return estimated <= model.contextLength;
  }

  /** Generate a unique response ID. */
  generateResponseId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${this.name}-${timestamp}-${random}`;
  }

  /** Wrap a provider call with retry + jitter logic. */
  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt === MAX_RETRIES - 1) break;
        if (!isRetryableError(err)) throw err;
        await sleep(jitteredDelay(attempt));
      }
    }
    throw lastError;
  }

  /** Parse an HTTP status code to determine retryability. */
  protected isRetryableStatus(status: number): boolean {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  /** Track an active connection (increment on start, decrement on end). */
  protected trackConnection(): () => void {
    this._activeConnections++;
    return () => {
      this._activeConnections = Math.max(0, this._activeConnections - 1);
    };
  }

  /** Guard: throw if not initialized. */
  protected requireInitialized(): void {
    if (!this._initialized) {
      throw new AIRouterError(
        `Provider "${this.name}" has not been initialized. Call initialize() first.`,
        this.name,
      );
    }
  }

  /** Find a supported model by its ID. */
  findModel(modelId: string): AIModel | undefined {
    return this.supportedModels.find((m) => m.id === modelId);
  }
}