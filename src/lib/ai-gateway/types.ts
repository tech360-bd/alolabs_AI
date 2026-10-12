/**
 * AI Gateway Type Definitions
 * ALO Labs AIOS — Unified types for the AI Gateway layer.
 */

export interface AIGatewayRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  agentId?: string;
  departmentId?: string;
  companyId?: string;
  userId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: unknown[];
  taskType?: 'fast' | 'balanced' | 'reasoning' | 'coding' | 'vision';
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  metadata?: Record<string, unknown>;
}

export interface AIGatewayResponse {
  id: string;
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  latencyMs: number;
  costUsd: number;
  routedBy: string;
  fallbackUsed: boolean;
  originalModel?: string;
}

export interface AIGatewayRouteResult {
  provider: string;
  model: string;
  reason: string;
  estimatedLatencyMs: number;
  estimatedCostPerMillion: number;
}

export interface AIGatewayBatchRequest {
  requests: AIGatewayRequest[];
}

export interface AIGatewayParallelRequest {
  requests: AIGatewayRequest[];
  aggregationStrategy?: 'first' | 'voting' | 'consensus' | 'all';
}

/** Internal structured error returned to clients. */
export interface AIGatewayError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Standard API envelope. */
export interface AIGatewayAPIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: AIGatewayError;
  timestamp: string;
  requestId: string;
}
