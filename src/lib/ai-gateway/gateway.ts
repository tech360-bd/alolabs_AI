/**
 * AI Gateway
 * ALO Labs AIOS — Production gateway that wraps the AI Router with
 * validation, cost tracking, latency measurement, usage persistence,
 * and structured error handling.
 */

import type {
  AIGatewayRequest,
  AIGatewayResponse,
  AIGatewayRouteResult,
  AIGatewayBatchRequest,
  AIGatewayParallelRequest,
  AIGatewayAPIResult,
  AIGatewayError,
} from './types';
import { getRouter, ensureRouterSynced } from '@/lib/ai-router';
import type { AIRequest, AIMessage, AIRouteDecision, AIModel, AIProviderHealth } from '@/lib/ai-router';
import {
  AIRouterError,
  AIProviderUnavailableError,
  AIModelNotFoundError,
  AICircuitOpenError,
} from '@/lib/ai-router';

// ─── Helpers ──────────────────────────────────────────────────────

function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `gw-${ts}-${rand}`;
}

function makeError(code: string, message: string): AIGatewayError {
  return { code, message };
}

function makeResult<T>(data: T, requestId: string): AIGatewayAPIResult<T> {
  return { success: true, data, timestamp: new Date().toISOString(), requestId };
}

function makeErrorResult<T = never>(requestId: string, code: string, message: string): AIGatewayAPIResult<T> {
  return {
    success: false,
    error: makeError(code, message),
    timestamp: new Date().toISOString(),
    requestId,
  };
}

/** Convert an unknown error into a safe, non-exposing error object. */
function safeError<T = never>(err: unknown, requestId: string): AIGatewayAPIResult<T> {
  if (err instanceof AIModelNotFoundError) {
    return makeErrorResult(requestId, 'MODEL_NOT_FOUND', `Requested model is not available.`);
  }
  if (err instanceof AICircuitOpenError) {
    return makeErrorResult(requestId, 'SERVICE_UNAVAILABLE', `AI service is temporarily unavailable. Please retry shortly.`);
  }
  if (err instanceof AIProviderUnavailableError) {
    return makeErrorResult(requestId, 'SERVICE_UNAVAILABLE', `No AI providers are currently available.`);
  }
  if (err instanceof AIRouterError) {
    return makeErrorResult(requestId, 'GATEWAY_ERROR', `An AI routing error occurred.`);
  }
  if (err instanceof Error && err.message.includes('Validation')) {
    return makeErrorResult(requestId, 'VALIDATION_ERROR', err.message);
  }
  return makeErrorResult(requestId, 'INTERNAL_ERROR', `An unexpected error occurred. Please try again.`);
}

// ─── Provider Detection ────────────────────────────────────────────

/** Determine the provider name from a model ID by checking the router's registered providers. */
function determineProvider(modelId: string, router: ReturnType<typeof getRouter>): string {
  for (const providerName of router.getRegisteredProviders()) {
    const provider = router.getProvider(providerName);
    if (provider?.supportedModels.some((m) => m.id === modelId)) {
      return providerName;
    }
  }
  // Fallback: infer from model name
  const id = modelId.toLowerCase();
  if (id.includes('glm')) return 'zai-sdk';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('mistral') || id.includes('mixtral')) return 'mistral';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('llama') || id.includes('codellama')) return 'ollama-llama';
  if (id.includes('gemma')) return 'ollama-gemma';
  if (id.includes('phi')) return 'ollama-phi';
  if (id.includes('groq')) return 'groq';
  return 'unknown';
}

// ─── Cost Estimation ───────────────────────────────────────────────

/** Approximate cost per million tokens by model family. */
const COST_PER_MILLION: Record<string, number> = {
  'glm-4-plus': 1.4,
  'glm-4-flash': 0.1,
  'glm-4-air': 0.5,
  'glm-4-airx': 1.0,
  'glm-4-long': 0.5,
  'glm-4v-plus': 1.4,
  'gpt-4o': 5.0,
  'gpt-4o-mini': 0.6,
  'gpt-3.5-turbo': 0.5,
  'claude-3-opus': 15.0,
  'claude-3-sonnet': 3.0,
  'claude-3-haiku': 0.25,
  'deepseek-chat': 0.27,
  'deepseek-reasoner': 0.55,
  'llama-3.1-405b': 0.8,
  'llama-3.1-70b': 0.39,
  'llama-3.1-8b': 0.06,
  'mixtral-8x7b': 0.24,
  'gemini-1.5-pro': 3.5,
  'gemini-1.5-flash': 0.075,
};

function getCostPerMillion(modelId: string): number {
  const id = modelId.toLowerCase();
  for (const [key, cost] of Object.entries(COST_PER_MILLION)) {
    if (id.includes(key)) return cost;
  }
  return 2.0; // default estimate
}

function estimateCostUsd(model: string, totalTokens: number): number {
  const cpm = getCostPerMillion(model);
  return (totalTokens / 1_000_000) * cpm;
}

// ─── Validation ────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Validation';
  }
}

function validateGatewayRequest(req: AIGatewayRequest): void {
  if (!req.messages || !Array.isArray(req.messages) || req.messages.length === 0) {
    throw new ValidationError('messages must be a non-empty array.');
  }
  for (let i = 0; i < req.messages.length; i++) {
    const msg = req.messages[i];
    if (!msg.role || typeof msg.role !== 'string') {
      throw new ValidationError(`messages[${i}].role is required and must be a string.`);
    }
    if (!msg.content || typeof msg.content !== 'string') {
      throw new ValidationError(`messages[${i}].content is required and must be a string.`);
    }
  }
  if (req.temperature !== undefined && (req.temperature < 0 || req.temperature > 2)) {
    throw new ValidationError('temperature must be between 0 and 2.');
  }
  if (req.maxTokens !== undefined && (req.maxTokens < 1 || req.maxTokens > 128000)) {
    throw new ValidationError('maxTokens must be between 1 and 128000.');
  }
  if (req.model && typeof req.model !== 'string') {
    throw new ValidationError('model must be a string if provided.');
  }
}

function toAIMessages(messages: AIGatewayRequest['messages']): AIMessage[] {
  return messages.map((m) => ({
    role: m.role as AIMessage['role'],
    content: m.content,
  }));
}

function toAIRequest(req: AIGatewayRequest, modelOverride?: string): AIRequest {
  return {
    model: modelOverride || req.model || '',
    messages: toAIMessages(req.messages),
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    tools: req.tools as AIRequest['tools'],
  };
}

// ─── Best-effort DB usage tracking ─────────────────────────────────

async function persistUsageToDb(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  costUsd: number,
  companyId?: string,
  agentId?: string,
  userId?: string,
  requestId?: string,
): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    // Use dynamic model access — will no-op if table doesn't exist
    const prisma = db as unknown as Record<string, unknown>;
    const createFn = (prisma as Record<string, unknown>).aiUsage as
      | ((args: Record<string, unknown>) => Promise<unknown>)
      | undefined;
    if (typeof createFn === 'function') {
      await createFn({
        data: {
          provider,
          model,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          costUsd,
          companyId,
          agentId,
          userId,
          requestId,
          createdAt: new Date(),
        },
      });
    }
  } catch {
    // Best-effort — do not let DB errors affect the response
  }
}

// ─── AI Gateway ────────────────────────────────────────────────────

export class AIGateway {
  /** Non-streaming chat completion through the AI Router. */
  static async chat(
    req: AIGatewayRequest,
  ): Promise<AIGatewayAPIResult<AIGatewayResponse>> {
    const requestId = generateRequestId();

    try {
      validateGatewayRequest(req);
      const router = await ensureRouterSynced();
      const aiReq = toAIRequest(req);

      const startTime = Date.now();
      const response = await router.chat(aiReq, req.companyId, req.agentId, { taskType: 'gateway.chat' });
      const latencyMs = Date.now() - startTime;

      const totalTokens = response.usage.promptTokens + response.usage.completionTokens;
      const costUsd = estimateCostUsd(response.model, totalTokens);

      // Determine actual provider from the model name or router state
      const decisionProvider = determineProvider(response.model, router);

      // Best-effort DB persistence
      persistUsageToDb(
        decisionProvider,
        response.model,
        response.usage.promptTokens,
        response.usage.completionTokens,
        costUsd,
        req.companyId,
        req.agentId,
        req.userId,
        requestId,
      ).catch(() => {});

      const gatewayResponse: AIGatewayResponse = {
        id: response.id,
        content: response.content,
        model: response.model,
        provider: decisionProvider,
        usage: response.usage,
        finishReason: response.finishReason,
        latencyMs,
        costUsd,
        routedBy: 'ai-router',
        fallbackUsed: false,
        originalModel: req.model,
      };

      return makeResult(gatewayResponse, requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** Streaming chat completion — returns an async generator of SSE-formatted strings. */
  static async *stream(
    req: AIGatewayRequest,
  ): AsyncGenerator<string> {
    const requestId = generateRequestId();

    // Send initial metadata event
    yield `event: metadata\ndata: ${JSON.stringify({ requestId, model: req.model || 'auto' })}\n\n`;

    try {
      validateGatewayRequest(req);
      const router = await ensureRouterSynced();
      const aiReq = toAIRequest(req);

      const startTime = Date.now();
      let totalContent = '';
      let finishReason = '';
      let model = req.model || 'auto';

      for await (const chunk of router.streamChat(aiReq, req.companyId, req.agentId)) {
        if (chunk.content) {
          totalContent += chunk.content;
        }
        if (chunk.model) {
          model = chunk.model;
        }
        if (chunk.finishReason) {
          finishReason = chunk.finishReason;
        }

        const payload = JSON.stringify({
          id: chunk.id,
          content: chunk.content || '',
          model: chunk.model || model,
          finishReason: chunk.finishReason || null,
        });
        yield `data: ${payload}\n\n`;
      }

      const latencyMs = Date.now() - startTime;
      const estimatedTokens = Math.ceil(totalContent.length / 4);
      const costUsd = estimateCostUsd(model, estimatedTokens);

      // Final usage event
      yield `event: done\ndata: ${JSON.stringify({ latencyMs, estimatedCompletionTokens: estimatedTokens, costUsd, finishReason })}\n\n`;
    } catch (err) {
      let code = 'INTERNAL_ERROR';
      let message = 'An unexpected error occurred during streaming.';

      if (err instanceof AIModelNotFoundError) {
        code = 'MODEL_NOT_FOUND';
        message = 'Requested model is not available.';
      } else if (err instanceof AICircuitOpenError || err instanceof AIProviderUnavailableError) {
        code = 'SERVICE_UNAVAILABLE';
        message = 'AI service is temporarily unavailable.';
      } else if (err instanceof AIRouterError) {
        code = 'GATEWAY_ERROR';
        message = 'A routing error occurred.';
      } else if (err instanceof ValidationError) {
        code = 'VALIDATION_ERROR';
        message = err.message;
      }

      yield `event: error\ndata: ${JSON.stringify({ requestId, code, message })}\n\n`;
    }
  }

  /** Dry-run routing — returns the routing decision without executing. */
  static async route(
    req: AIGatewayRequest,
  ): Promise<AIGatewayAPIResult<AIGatewayRouteResult>> {
    const requestId = generateRequestId();

    try {
      validateGatewayRequest(req);
      const router = await ensureRouterSynced();
      const aiReq = toAIRequest(req);

      const decision: AIRouteDecision = router.route(aiReq, req.companyId);

      // Find the model details for cost/latency estimates
      const provider = router.getProvider(decision.provider);
      const modelInfo: AIModel | undefined = provider?.supportedModels.find(
        (m) => m.id === decision.model,
      );

      const result: AIGatewayRouteResult = {
        provider: decision.provider,
        model: decision.model,
        reason: decision.reason,
        estimatedLatencyMs: 800,
        estimatedCostPerMillion: modelInfo?.costPerMillionTokens ?? getCostPerMillion(decision.model),
      };

      return makeResult(result, requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** Batch — execute multiple requests sequentially, return all results. */
  static async batch(
    batchReq: AIGatewayBatchRequest,
  ): Promise<AIGatewayAPIResult<AIGatewayResponse[]>> {
    const requestId = generateRequestId();

    try {
      if (!batchReq.requests || !Array.isArray(batchReq.requests) || batchReq.requests.length === 0) {
        return makeErrorResult(requestId, 'VALIDATION_ERROR', 'requests must be a non-empty array.');
      }
      if (batchReq.requests.length > 50) {
        return makeErrorResult(requestId, 'VALIDATION_ERROR', 'Batch size cannot exceed 50 requests.');
      }

      const results: AIGatewayResponse[] = [];

      for (const req of batchReq.requests) {
        const result = await AIGateway.chat(req);
        if (!result.success || !result.data) {
          return makeErrorResult(
            requestId,
            result.error?.code || 'BATCH_ITEM_FAILED',
            `Batch execution failed at index ${results.length}: ${result.error?.message || 'unknown error'}`,
          );
        }
        results.push(result.data);
      }

      return makeResult(results, requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** Parallel — execute multiple requests concurrently, aggregate results. */
  static async parallel(
    parReq: AIGatewayParallelRequest,
  ): Promise<AIGatewayAPIResult<AIGatewayResponse[]>> {
    const requestId = generateRequestId();

    try {
      if (!parReq.requests || !Array.isArray(parReq.requests) || parReq.requests.length === 0) {
        return makeErrorResult(requestId, 'VALIDATION_ERROR', 'requests must be a non-empty array.');
      }
      if (parReq.requests.length > 10) {
        return makeErrorResult(requestId, 'VALIDATION_ERROR', 'Parallel execution cannot exceed 10 requests.');
      }

      const strategy = parReq.aggregationStrategy || 'all';

      // Execute all requests concurrently
      const results = await Promise.all(
        parReq.requests.map((req) => AIGateway.chat(req)),
      );

      // Filter successful results
      const successful = results
        .filter((r): r is AIGatewayAPIResult<AIGatewayResponse> => r.success && !!r.data)
        .map((r) => r.data!);

      if (successful.length === 0) {
        return makeErrorResult(requestId, 'ALL_REQUESTS_FAILED', 'All parallel requests failed.');
      }

      // Apply aggregation strategy
      let aggregated: AIGatewayResponse[];

      switch (strategy) {
        case 'first':
          aggregated = [successful[0]];
          break;

        case 'voting': {
          // Group by content similarity — use the most common response
          const contentCounts = new Map<string, AIGatewayResponse[]>();
          for (const resp of successful) {
            const key = resp.content.trim().slice(0, 200);
            const existing = contentCounts.get(key) || [];
            existing.push(resp);
            contentCounts.set(key, existing);
          }
          // Return the response with the most votes
          const sorted = [...contentCounts.values()].sort((a, b) => b.length - a.length);
          aggregated = [sorted[0][0]];
          break;
        }

        case 'consensus': {
          // Return only responses where content matches the majority
          const contentCounts = new Map<string, number>();
          for (const resp of successful) {
            const key = resp.content.trim().slice(0, 200);
            contentCounts.set(key, (contentCounts.get(key) || 0) + 1);
          }
          const majorityKey = [...contentCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
          aggregated = successful.filter((r) => r.content.trim().slice(0, 200) === majorityKey);
          break;
        }

        case 'all':
        default:
          aggregated = successful;
          break;
      }

      return makeResult(aggregated, requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** List all available models across all registered providers. */
  static async listModels(): Promise<
    AIGatewayAPIResult<Array<{ id: string; name: string; provider: string; family: string; capabilities: string[]; contextLength: number; costPerMillionTokens?: number }>>
  > {
    const requestId = generateRequestId();

    try {
      const router = await ensureRouterSynced();
      const providers = router.getRegisteredProviders();
      const allModels: Array<{
        id: string;
        name: string;
        provider: string;
        family: string;
        capabilities: string[];
        contextLength: number;
        costPerMillionTokens?: number;
      }> = [];

      for (const providerName of providers) {
        const provider = router.getProvider(providerName);
        if (!provider) continue;
        for (const model of provider.supportedModels) {
          allModels.push({
            id: model.id,
            name: model.name,
            provider: model.provider,
            family: model.family,
            capabilities: model.capabilities,
            contextLength: model.contextLength,
            costPerMillionTokens: model.costPerMillionTokens,
          });
        }
      }

      return makeResult(allModels, requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** Get provider health status. */
  static async getProviders(): Promise<
    AIGatewayAPIResult<{
      registered: string[];
      health: Array<{
        provider: string;
        isHealthy: boolean;
        latencyMs: number;
        errorRate: number;
        circuitOpen: boolean;
        consecutiveFailures: number;
        lastCheck: string;
      }>;
    }>
  > {
    const requestId = generateRequestId();

    try {
      const router = await ensureRouterSynced();
      const registered = router.getRegisteredProviders();
      const healthMap = await router.getHealthStatus();

      const healthList = Array.from(healthMap.entries()).map(([name, h]) => ({
        provider: name,
        isHealthy: h.isHealthy,
        latencyMs: h.latencyMs,
        errorRate: h.errorRate,
        circuitOpen: h.circuitOpen,
        consecutiveFailures: h.consecutiveFailures,
        lastCheck: h.lastCheck.toISOString(),
      }));

      return makeResult({ registered, health: healthList }, requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }
}

export { generateRequestId, safeError, makeErrorResult };
