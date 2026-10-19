/**
 * AI Gateway
 * ALO Labs AIOS — Gateway adapter that validates requests and delegates all
 * model execution, policy enforcement, usage tracking and auditing to the
 * company-scoped multi-tenant AI service.
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
import type { AIRequest, AIMessage, AIModel } from '@/lib/ai-router';
import {
  AIRouterError,
  AIProviderUnavailableError,
  AIModelNotFoundError,
  AICircuitOpenError,
} from '@/lib/ai-router';
import {
  CompanyAIError,
  executeCompanyAIChat,
  streamCompanyAIChat,
  previewCompanyAIRoute,
} from '@/lib/multi-tenant-ai/service';
import type { CompanyAIActor, CompanyAIRequestOptions } from '@/lib/multi-tenant-ai/service';

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
  if (err instanceof CompanyAIError) {
    return makeErrorResult(requestId, err.code, err.message);
  }
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
    stream: req.stream,
    tools: req.tools as AIRequest['tools'],
  };
}

function authorizedActor(req: AIGatewayRequest, actor: CompanyAIActor): CompanyAIActor {
  if (!actor?.companyId || !actor.userId || !actor.role) throw new CompanyAIError('An authenticated company actor is required.', 401, 'UNAUTHENTICATED');
  if (req.companyId && req.companyId !== actor.companyId) {
    throw new CompanyAIError('Request company does not match the authenticated company.', 403, 'FORBIDDEN');
  }
  if (req.userId && req.userId !== actor.userId) {
    throw new CompanyAIError('Request user does not match the authenticated user.', 403, 'FORBIDDEN');
  }
  return actor;
}

function routingProfile(req: AIGatewayRequest): CompanyAIRequestOptions['profile'] {
  switch (req.taskType) {
    case 'fast': return 'local_fast';
    case 'coding': return 'free_coding';
    case 'reasoning': return 'free_reasoning';
    case 'vision': return 'free_vision';
    case 'balanced':
    default: return 'free_general';
  }
}

function companyAIOptions(req: AIGatewayRequest, requestId: string): CompanyAIRequestOptions {
  return {
    profile: routingProfile(req),
    dataClassification: 'confidential',
    ...(req.agentId ? { agentId: req.agentId } : {}),
    ...(req.departmentId ? { departmentId: req.departmentId } : {}),
    maxTokens: req.maxTokens,
    requestId,
  };
}

// ─── AI Gateway ────────────────────────────────────────────────────

export class AIGateway {
  /** Non-streaming completion through the company-scoped, audited AI service. */
  static async chat(
    req: AIGatewayRequest,
    actor: CompanyAIActor,
  ): Promise<AIGatewayAPIResult<AIGatewayResponse>> {
    const requestId = generateRequestId();

    try {
      validateGatewayRequest(req);
      const trustedActor = authorizedActor(req, actor);
      const startedAt = Date.now();
      const result = await executeCompanyAIChat(
        trustedActor,
        toAIRequest(req),
        companyAIOptions(req, requestId),
      );
      const response = result.response;
      const gatewayResponse: AIGatewayResponse = {
        id: response.id,
        content: response.content,
        model: response.model,
        provider: result.provider,
        usage: response.usage,
        finishReason: response.finishReason,
        latencyMs: Date.now() - startedAt,
        costUsd: result.estimatedCostUsd,
        routedBy: 'company-ai-service',
        fallbackUsed: result.fallbackUsed,
        originalModel: req.model,
      };
      return makeResult(gatewayResponse, result.requestId || requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** Streaming completion through the company-scoped AI service. */
  static async *stream(
    req: AIGatewayRequest,
    actor: CompanyAIActor,
  ): AsyncGenerator<string> {
    const requestId = generateRequestId();
    let totalContent = '';
    const startTime = Date.now();

    try {
      validateGatewayRequest(req);
      const trustedActor = authorizedActor(req, actor);
      yield `event: metadata\ndata: ${JSON.stringify({ requestId, model: req.model || 'auto', profile: routingProfile(req) })}\n\n`;
      for await (const chunk of streamCompanyAIChat(
        trustedActor,
        toAIRequest(req),
        { ...companyAIOptions(req, requestId), maxTokens: req.maxTokens },
      )) {
        if (chunk.content) totalContent += chunk.content;
        const payload = JSON.stringify({
          id: chunk.id,
          content: chunk.content || '',
          model: chunk.model || req.model || 'auto',
          finishReason: chunk.finishReason || null,
        });
        yield `data: ${payload}\n\n`;
      }
      yield `event: done\ndata: ${JSON.stringify({ latencyMs: Date.now() - startTime, estimatedCompletionTokens: Math.ceil(totalContent.length / 4), estimatedCostUsd: null, usageSource: 'locally_estimated' })}\n\n`;
    } catch (err) {
      let code = 'INTERNAL_ERROR';
      let message = 'An unexpected error occurred during streaming.';
      if (err instanceof CompanyAIError) {
        code = err.code;
        message = err.message;
      } else if (err instanceof AIModelNotFoundError) {
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
    actor: CompanyAIActor,
  ): Promise<AIGatewayAPIResult<AIGatewayRouteResult>> {
    const requestId = generateRequestId();

    try {
      validateGatewayRequest(req);
      const trustedActor = authorizedActor(req, actor);
      const preview = await previewCompanyAIRoute(
        trustedActor,
        toAIRequest(req),
        companyAIOptions(req, requestId),
      );
      if (!preview.available || !preview.selected) {
        throw new CompanyAIError(preview.reason || 'No authorized model is currently available.', 503, 'NO_AUTHORIZED_MODEL', preview.requestId);
      }
      const result: AIGatewayRouteResult = {
        provider: preview.selected.provider,
        model: preview.selected.model,
        reason: preview.selected.routeKind,
        ...(preview.selected.estimatedCostPerMillion !== undefined
          ? { estimatedCostPerMillion: preview.selected.estimatedCostPerMillion }
          : {}),
      };
      return makeResult(result, preview.requestId || requestId);
    } catch (err) {
      return safeError(err, requestId);
    }
  }

  /** Batch — execute multiple requests sequentially, return all results. */
  static async batch(
    batchReq: AIGatewayBatchRequest,
    actor: CompanyAIActor,
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
        const result = await AIGateway.chat(req, actor);
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
    actor: CompanyAIActor,
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
        parReq.requests.map((req) => AIGateway.chat(req, actor)),
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
