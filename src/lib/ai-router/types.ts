/**
 * AI Router Type Definitions
 * ALO Labs AIOS — Unified types for multi-provider AI routing.
 */

// ─── Provider & Model ───────────────────────────────────────────────

export type AIProvider =
  | 'ollama'
  | 'ollama-llama'
  | 'ollama-phi'
  | 'ollama-gemma'
  | 'openrouter'
  | 'zai-sdk'
  | 'openai-compatible'
  /** Additional OpenAI-compatible endpoints configured at runtime (AIProviderConfig). */
  | `openai-compatible:${string}`
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'qwen';

export type AIModelFamily = 'glm' | 'qwen' | 'deepseek' | 'llama' | 'gemma' | 'phi' | 'mistral' | 'codestral' | 'command-r' | 'yi' | 'starcoder' | 'custom';

export type AICapability = 'chat' | 'streaming' | 'function-calling' | 'vision' | 'json-mode' | 'embedding' | 'code-generation' | 'reasoning' | 'audio';

export interface AIModelParameters {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  [key: string]: unknown;
}

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  family: AIModelFamily;
  parameters: AIModelParameters;
  contextLength: number;
  capabilities: AICapability[];
  endpoint?: string;
  costPerMillionTokens?: number;
}

// ─── Request / Response ─────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface AIRequest {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: AITool[];
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIResponse {
  id: string;
  content: string;
  model: string;
  usage: AITokenUsage;
  finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error';
  latencyMs: number;
}

export interface AIStreamChunk {
  id: string;
  content: string;
  model: string;
  finishReason?: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error';
}

// ─── Usage Tracking ─────────────────────────────────────────────────

export interface AITokenUsageRecord {
  provider: AIProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  companyId?: string;
  agentId?: string;
  timestamp: Date;
}

// ─── Routing ────────────────────────────────────────────────────────

export type AIRouteReason = 'cost' | 'speed' | 'quality' | 'fallback';

export interface AIRouteDecision {
  provider: AIProvider;
  model: string;
  reason: AIRouteReason;
}

// ─── Load Balancing ─────────────────────────────────────────────────

export type AILoadBalanceStrategy = 'round-robin' | 'least-connections' | 'random' | 'weighted';

export interface AILoadBalanceConfig {
  strategy: AILoadBalanceStrategy;
  weights?: Map<AIProvider, number>;
}

// ─── Health ─────────────────────────────────────────────────────────

export interface AIProviderHealth {
  provider: AIProvider;
  isHealthy: boolean;
  latencyMs: number;
  errorRate: number;
  lastCheck: Date;
  consecutiveFailures: number;
  circuitOpen: boolean;
  circuitOpenUntil?: Date;
}

// ─── Errors ─────────────────────────────────────────────────────────

export class AIRouterError extends Error {
  constructor(
    message: string,
    public readonly provider?: AIProvider,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'AIRouterError';
  }
}

export class AIProviderUnavailableError extends AIRouterError {
  constructor(provider: AIProvider, reason?: string) {
    super(
      `Provider "${provider}" is unavailable${reason ? `: ${reason}` : ''}`,
      provider,
      503,
      true,
    );
    this.name = 'AIProviderUnavailableError';
  }
}

export class AIModelNotFoundError extends AIRouterError {
  constructor(model: string, provider?: AIProvider) {
    super(
      `Model "${model}" not found${provider ? ` on provider "${provider}"` : ''}`,
      provider,
      404,
      false,
    );
    this.name = 'AIModelNotFoundError';
  }
}

export class AICircuitOpenError extends AIRouterError {
  constructor(provider: AIProvider, reopensAt: Date) {
    super(
      `Circuit breaker open for provider "${provider}". Retries after ${reopensAt.toISOString()}.`,
      provider,
      503,
      true,
    );
    this.name = 'AICircuitOpenError';
  }
}