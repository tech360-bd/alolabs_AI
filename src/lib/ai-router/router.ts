/**
 * AI Router
 * ALO Labs AIOS — Intelligent request routing, load balancing, and failover
 * across multiple AI providers with circuit-breaker protection.
 */

import type {
  AIProvider,
  AIModel,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderHealth,
  AITokenUsageRecord,
  AIRouteDecision,
  AILoadBalanceConfig,
  AICapability,
} from './types';
import {
  AIRouterError,
  AICircuitOpenError,
  AIProviderUnavailableError,
  AIModelNotFoundError,
} from './types';
import { BaseAIProvider } from './provider-base';

// ─── Constants ──────────────────────────────────────────────────────

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

// ─── Internal State ─────────────────────────────────────────────────

interface ProviderEntry {
  provider: BaseAIProvider;
  health: AIProviderHealth;
  /** Rolling window of request latencies (last 20) */
  latencies: number[];
  /** Rolling window of error booleans (last 20) */
  errors: boolean[];
  /** Current position for round-robin */
  rrIndex: number;
  /** Weight assigned to this provider for weighted strategy */
  weight: number;
  /** Tenant that owns this provider; undefined = shared/global. */
  companyId?: string;
  /** Last failed initialize() — retried only after INIT_RETRY_MS. */
  initFailedAt?: number;
  initError?: string;
}

export interface RegisterProviderOptions {
  weight?: number;
  /** Restrict the provider to one tenant. Requests from other tenants never see it. */
  companyId?: string;
}

/** Caller-supplied context so routing decisions can be tied to a run/task. */
export interface AIRequestContext {
  runId?: string;
  taskId?: string;
  taskType?: string;
}

/** One routing decision (success or failure), handed to the decision recorder. */
export interface RoutingDecisionRecord {
  requestedModel: string;
  selectedProvider: string | null;
  selectedModel: string | null;
  reason: string;
  candidates: string[];
  attempts: number;
  fallbackFrom: string | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  companyId?: string;
  agentId?: string;
  context?: AIRequestContext;
}

export type RoutingDecisionRecorder = (record: RoutingDecisionRecord) => void | Promise<void>;

const INIT_RETRY_MS = 60_000;

interface UsageRecordInternal {
  provider: AIProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  companyId: string | undefined;
  agentId: string | undefined;
  timestamp: Date;
}

// ─── Router ─────────────────────────────────────────────────────────

export class AIRouter {
  private providers = new Map<AIProvider, ProviderEntry>();
  private usageHistory: UsageRecordInternal[] = [];
  private loadBalanceConfig: AILoadBalanceConfig = {
    strategy: 'round-robin',
  };
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _destroyed = false;
  private decisionRecorder: RoutingDecisionRecorder | null = null;

  // ─── Provider Management ────────────────────────────────────────

  registerProvider(provider: BaseAIProvider, weightOrOptions?: number | RegisterProviderOptions): void {
    if (this.providers.has(provider.name)) {
      throw new AIRouterError(
        `Provider "${provider.name}" is already registered.`,
        provider.name,
      );
    }
    const options: RegisterProviderOptions =
      typeof weightOrOptions === 'number' ? { weight: weightOrOptions } : (weightOrOptions ?? {});
    const weight = options.weight;

    this.providers.set(provider.name, {
      provider,
      health: {
        provider: provider.name,
        isHealthy: true, // assumed healthy until first check
        latencyMs: 0,
        errorRate: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        circuitOpen: false,
      },
      latencies: [],
      errors: [],
      rrIndex: 0,
      weight: weight ?? 1,
      companyId: options.companyId,
    });
  }

  /** Install a sink for routing decisions (persisted by the application layer). */
  setDecisionRecorder(recorder: RoutingDecisionRecorder | null): void {
    this.decisionRecorder = recorder;
  }

  /** Tenant a provider is restricted to (undefined = shared). */
  getProviderTenant(name: AIProvider): string | undefined {
    return this.providers.get(name)?.companyId;
  }

  /** Last initialize() error for a provider, if any (secret-free message). */
  getProviderInitError(name: AIProvider): string | undefined {
    return this.providers.get(name)?.initError;
  }

  removeProvider(name: AIProvider): void {
    const entry = this.providers.get(name);
    if (!entry) return;
    entry.provider.disconnect().catch(() => { /* best-effort */ });
    this.providers.delete(name);
  }

  getProvider(name: AIProvider): BaseAIProvider | undefined {
    return this.providers.get(name)?.provider;
  }

  getRegisteredProviders(): AIProvider[] {
    return Array.from(this.providers.keys());
  }

  // ─── Load Balance Config ────────────────────────────────────────

  setLoadBalanceConfig(config: AILoadBalanceConfig): void {
    this.loadBalanceConfig = config;
    // Sync weights from config to entries
    if (config.weights) {
      config.weights.forEach((weight, provider) => {
        const entry = this.providers.get(provider);
        if (entry) entry.weight = weight;
      });
    }
  }

  getLoadBalanceConfig(): AILoadBalanceConfig {
    return { ...this.loadBalanceConfig };
  }

  // ─── Routing Decision ───────────────────────────────────────────

  /**
   * Pick the best provider and model for a given request.
   * Considers: explicit model → capability matching → strategy → cost.
   */
  route(request: AIRequest, companyId?: string): AIRouteDecision {
    const available = this.getAvailableProviders(companyId);

    if (available.length === 0) {
      throw new AIProviderUnavailableError(
        'ollama',
        'No providers are available. All circuits are open or no providers registered.',
      );
    }

    // If a specific model is requested, find the provider that has it
    if (request.model) {
      const direct = this.findProviderForModel(request.model, available);
      if (direct) {
        return { provider: direct.provider.name, model: request.model, reason: 'quality' };
      }
    }

    // Filter providers by capability matching (e.g., streaming, function-calling)
    const capable = this.filterByCapabilities(available, request);
    const candidates = capable.length > 0 ? capable : available;

    // Apply load-balance strategy
    const selected = this.selectProviderByStrategy(candidates);

    // Pick the best model from the selected provider
    const model = this.selectBestModel(selected.provider, request);

    // Determine route reason based on strategy
    let reason: AIRouteDecision['reason'] = 'quality';
    if (this.loadBalanceConfig.strategy === 'least-connections') reason = 'speed';
    if (model.costPerMillionTokens !== undefined) reason = 'cost';

    return {
      provider: selected.provider.name,
      model: model.id,
      reason,
    };
  }

  // ─── Chat Completion ────────────────────────────────────────────

  async chat(
    request: AIRequest,
    companyId?: string,
    agentId?: string,
    context?: AIRequestContext,
  ): Promise<AIResponse> {
    // Auto-initialize any registered but uninitialized providers
    await this.ensureProvidersInitialized();

    const startTime = Date.now();
    const candidates = this.getAvailableProviders(companyId).map((e) => e.provider.name as string);
    const base = {
      requestedModel: request.model,
      candidates,
      companyId,
      agentId,
      context,
    };

    let decision: AIRouteDecision;
    try {
      decision = this.route(request, companyId);
    } catch (err) {
      this.emitDecision({
        ...base,
        selectedProvider: null,
        selectedModel: null,
        reason: 'no-provider',
        attempts: 0,
        fallbackFrom: null,
        success: false,
        errorCode: errorCodeOf(err),
        errorMessage: errorMessageOf(err),
        latencyMs: Date.now() - startTime,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
      });
      throw err;
    }

    const entry = this.providers.get(decision.provider);

    if (!entry) {
      throw new AIProviderUnavailableError(decision.provider, 'Provider was removed during routing.');
    }

    // Circuit breaker check
    if (entry.health.circuitOpen) {
      throw new AICircuitOpenError(decision.provider, entry.health.circuitOpenUntil!);
    }

    try {
      // Build request with the routed model
      const routedRequest: AIRequest = { ...request, model: decision.model };

      const response = await entry.provider.chatCompletion(routedRequest);

      // Record success
      this.recordLatency(entry, Date.now() - startTime);
      this.recordSuccess(entry);
      this.recordUsage({
        provider: decision.provider,
        model: response.model,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        companyId,
        agentId,
        timestamp: new Date(),
      });
      this.emitDecision({
        ...base,
        selectedProvider: decision.provider,
        selectedModel: response.model || decision.model,
        reason: decision.reason,
        attempts: 1,
        fallbackFrom: null,
        success: true,
        errorCode: null,
        errorMessage: null,
        latencyMs: Date.now() - startTime,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        costUsd: this.estimateCost(entry, response.model || decision.model, response.usage.promptTokens, response.usage.completionTokens),
      });

      return { ...response, model: response.model || decision.model };
    } catch (err) {
      this.recordFailure(entry);
      this.handleCircuitBreaker(entry);

      // Attempt failover on circuit-open, provider-unavailable, or retryable errors
      const isRetryable = err instanceof AIRouterError && err.retryable;
      if (err instanceof AICircuitOpenError || err instanceof AIProviderUnavailableError || isRetryable) {
        const fallback = await this.attemptFailover(request, decision.provider, companyId, agentId);
        if (fallback) {
          this.emitDecision({
            ...base,
            selectedProvider: fallback.provider,
            selectedModel: fallback.response.model,
            reason: 'failover',
            attempts: fallback.attempts + 1,
            fallbackFrom: decision.provider,
            success: true,
            errorCode: errorCodeOf(err),
            errorMessage: errorMessageOf(err),
            latencyMs: Date.now() - startTime,
            promptTokens: fallback.response.usage.promptTokens,
            completionTokens: fallback.response.usage.completionTokens,
            costUsd: this.estimateCost(
              this.providers.get(fallback.provider),
              fallback.response.model,
              fallback.response.usage.promptTokens,
              fallback.response.usage.completionTokens,
            ),
          });
          return fallback.response;
        }
      }

      this.emitDecision({
        ...base,
        selectedProvider: decision.provider,
        selectedModel: decision.model,
        reason: decision.reason,
        attempts: 1,
        fallbackFrom: null,
        success: false,
        errorCode: errorCodeOf(err),
        errorMessage: errorMessageOf(err),
        latencyMs: Date.now() - startTime,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
      });

      // If error is from a different provider (e.g. AIModelNotFoundError), rethrow
      if (err instanceof AIModelNotFoundError) throw err;
      if (err instanceof AIRouterError) throw err;

      throw new AIRouterError(
        `All providers failed for model "${request.model}". Last error: ${err instanceof Error ? err.message : String(err)}`,
        decision.provider,
        undefined,
        false,
      );
    }
  }

  private emitDecision(record: RoutingDecisionRecord): void {
    if (!this.decisionRecorder) return;
    try {
      const result = this.decisionRecorder(record);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => { /* observability must never break routing */ });
      }
    } catch {
      // ignore recorder failures
    }
  }

  private estimateCost(
    entry: ProviderEntry | undefined,
    modelId: string,
    promptTokens: number,
    completionTokens: number,
  ): number | null {
    const model = entry?.provider.findModel(modelId);
    if (!model || model.costPerMillionTokens === undefined) return null;
    return ((promptTokens + completionTokens) / 1_000_000) * model.costPerMillionTokens;
  }

  // ─── Streaming Chat Completion ──────────────────────────────────

  async *streamChat(request: AIRequest, companyId?: string, agentId?: string): AsyncGenerator<AIStreamChunk> {
    // Auto-initialize any registered but uninitialized providers
    await this.ensureProvidersInitialized();

    const decision = this.route(request, companyId);
    const entry = this.providers.get(decision.provider);

    if (!entry) {
      throw new AIProviderUnavailableError(decision.provider);
    }

    if (entry.health.circuitOpen) {
      throw new AICircuitOpenError(decision.provider, entry.health.circuitOpenUntil!);
    }

    let promptTokens = this.estimatePromptTokens(request);

    try {
      const routedRequest: AIRequest = { ...request, model: decision.model };
      const startTime = Date.now();
      let completionTokens = 0;

      for await (const chunk of entry.provider.streamChatCompletion(routedRequest)) {
        if (chunk.content) {
          completionTokens += Math.ceil(chunk.content.length / 4);
        }
        yield chunk;

        if (chunk.finishReason) {
          this.recordUsage({
            provider: decision.provider,
            model: chunk.model || decision.model,
            promptTokens,
            completionTokens,
            companyId,
            agentId,
            timestamp: new Date(),
          });
        }
      }

      this.recordLatency(entry, Date.now() - startTime);
      this.recordSuccess(entry);
    } catch (err) {
      this.recordFailure(entry);
      this.handleCircuitBreaker(entry);

      // Attempt failover streaming
      if (err instanceof AICircuitOpenError || err instanceof AIProviderUnavailableError) {
        const fallbackStream = this.attemptStreamFailover(request, decision.provider, companyId, agentId);
        if (fallbackStream) {
          yield* fallbackStream;
          return;
        }
      }

      throw err;
    }
  }

  // ─── Health Status ──────────────────────────────────────────────

  async getHealthStatus(): Promise<Map<AIProvider, AIProviderHealth>> {
    const status = new Map<AIProvider, AIProviderHealth>();

    const checks = Array.from(this.providers.entries()).map(async ([name, entry]) => {
      try {
        const health = await entry.provider.healthCheck();
        // Merge with our internal circuit-breaker state
        health.circuitOpen = entry.health.circuitOpen;
        health.circuitOpenUntil = entry.health.circuitOpenUntil;
        health.consecutiveFailures = entry.health.consecutiveFailures;
        entry.health = health;
        status.set(name, health);
      } catch {
        status.set(name, entry.health);
      }
    });

    await Promise.all(checks);
    return status;
  }

  // ─── Usage Stats ────────────────────────────────────────────────

  getUsageStats(period: { start: Date; end: Date }): AITokenUsageRecord[] {
    return this.usageHistory
      .filter((r) => r.timestamp >= period.start && r.timestamp <= period.end)
      .map((r) => ({ ...r }));
  }

  // ─── Rebalance ──────────────────────────────────────────────────

  rebalance(): void {
    this.providers.forEach((entry) => {
      if (entry.health.circuitOpen) {
        // Check if cooldown has elapsed
        if (
          entry.health.circuitOpenUntil &&
          Date.now() >= entry.health.circuitOpenUntil.getTime()
        ) {
          entry.health.circuitOpen = false;
          entry.health.consecutiveFailures = 0;
          entry.health.circuitOpenUntil = undefined;
        }
      }
    });
  }

  // ─── Background Health Checks ───────────────────────────────────

  startHealthChecks(intervalMs: number = HEALTH_CHECK_INTERVAL_MS): void {
    this.stopHealthChecks();
    this.healthCheckTimer = setInterval(async () => {
      if (this._destroyed) return;
      this.rebalance();
      await this.getHealthStatus();
    }, intervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    this._destroyed = true;
    this.stopHealthChecks();
    const disconnects = Array.from(this.providers.values()).map((e) =>
      e.provider.disconnect().catch(() => {}),
    );
    await Promise.all(disconnects);
    this.providers.clear();
    this.usageHistory = [];
  }

  // ─── Private: Strategy Selection ────────────────────────────────

  private selectProviderByStrategy(available: ProviderEntry[]): ProviderEntry {
    switch (this.loadBalanceConfig.strategy) {
      case 'least-connections': {
        return available.reduce((best, curr) =>
          curr.provider.activeConnections < best.provider.activeConnections ? curr : best,
        );
      }

      case 'weighted': {
        const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
        let random = Math.random() * totalWeight;
        for (const entry of available) {
          random -= entry.weight;
          if (random <= 0) return entry;
        }
        return available[available.length - 1];
      }

      case 'random': {
        return available[Math.floor(Math.random() * available.length)];
      }

      case 'round-robin':
      default: {
        // Find the entry with the lowest rrIndex, then increment it
        const sorted = [...available].sort((a, b) => a.rrIndex - b.rrIndex);
        const selected = sorted[0];
        selected.rrIndex++;
        return selected;
      }
    }
  }

  private selectBestModel(provider: BaseAIProvider, request: AIRequest): AIModel {
    const models = provider.supportedModels;
    if (models.length === 0) {
      throw new AIModelNotFoundError('any', provider.name);
    }

    // Prefer models that fit in context
    const fitting = models.filter((m) => provider.fitsInContext(request, m));
    const candidates = fitting.length > 0 ? fitting : models;

    // Sort by: most capabilities first (quality), then lowest cost (cost-aware)
    const sorted = [...candidates].sort((a, b) => {
      // Prefer more capabilities
      const capDiff = b.capabilities.length - a.capabilities.length;
      if (capDiff !== 0) return capDiff;
      // Then prefer lower cost
      const aCost = a.costPerMillionTokens ?? Infinity;
      const bCost = b.costPerMillionTokens ?? Infinity;
      return aCost - bCost;
    });
    return sorted[0];
  }

  // ─── Private: Failover ──────────────────────────────────────────

  private async attemptFailover(
    request: AIRequest,
    failedProvider: AIProvider,
    companyId?: string,
    agentId?: string,
  ): Promise<{ response: AIResponse; provider: AIProvider; attempts: number } | null> {
    const available = this.getAvailableProviders(companyId).filter(
      (e) => e.provider.name !== failedProvider,
    );

    let attempts = 0;
    for (const entry of available) {
      attempts++;
      try {
        // Prefer the same model if the fallback provider serves it; otherwise its first model.
        const sameModel = entry.provider.findModel(request.model)?.id;
        const routedRequest: AIRequest = {
          ...request,
          model: sameModel ?? entry.provider.supportedModels[0]?.id ?? request.model,
        };
        const response = await entry.provider.chatCompletion(routedRequest);

        this.recordSuccess(entry);
        this.recordUsage({
          provider: entry.provider.name,
          model: response.model,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          companyId,
          agentId,
          timestamp: new Date(),
        });

        return {
          response: { ...response, model: response.model || routedRequest.model },
          provider: entry.provider.name,
          attempts,
        };
      } catch {
        this.recordFailure(entry);
        this.handleCircuitBreaker(entry);
        continue;
      }
    }

    return null;
  }

  private attemptStreamFailover(
    request: AIRequest,
    failedProvider: AIProvider,
    companyId?: string,
    agentId?: string,
  ): AsyncGenerator<AIStreamChunk> | null {
    const available = this.getAvailableProviders(companyId).filter(
      (e) => e.provider.name !== failedProvider,
    );

    if (available.length === 0) return null;

    // Return the first available provider's stream generator
    const entry = available[0];
    const modelId = entry.provider.supportedModels[0]?.id ?? request.model;
    // We need to return an async generator, so we create a wrapper
    // Using arrow function to preserve `this` context
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const router = this;
    const generate = async function* (this: void): AsyncGenerator<AIStreamChunk> {
      const routedRequest: AIRequest = { ...request, model: modelId };
      let completionTokens = 0;
      const promptTokens = router.estimatePromptTokens(request);

      try {
        for await (const chunk of entry.provider.streamChatCompletion(routedRequest)) {
          if (chunk.content) {
            completionTokens += Math.ceil(chunk.content.length / 4);
          }
          yield chunk;

          if (chunk.finishReason) {
            router.recordUsage({
              provider: entry.provider.name,
              model: chunk.model || modelId,
              promptTokens,
              completionTokens,
              companyId,
              agentId,
              timestamp: new Date(),
            });
          }
        }
        router.recordSuccess(entry);
      } catch {
        router.recordFailure(entry);
        router.handleCircuitBreaker(entry);
      }
    };

    return generate();
  }

  // ─── Private: Provider Helpers ──────────────────────────────────

  /**
   * Ensure all registered providers are initialized.
   * Called automatically before each chat/stream request.
   */
  private async ensureProvidersInitialized(): Promise<void> {
    const now = Date.now();
    const uninitialized = Array.from(this.providers.values()).filter(
      (e) => !e.provider.initialized && (!e.initFailedAt || now - e.initFailedAt > INIT_RETRY_MS),
    );
    await Promise.allSettled(
      uninitialized.map(async (e) => {
        try {
          await e.provider.initialize();
          e.initFailedAt = undefined;
          e.initError = undefined;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const firstFailure = !e.initFailedAt;
          e.initFailedAt = Date.now();
          e.initError = message;
          if (firstFailure) {
            console.warn(`[AI Router] Failed to initialize provider ${e.provider.name}: ${message}`);
          }
        }
      }),
    );
  }

  /** Providers usable for a request: shared ones plus the tenant's own. */
  private getAvailableProviders(companyId?: string): ProviderEntry[] {
    return Array.from(this.providers.values()).filter(
      (e) =>
        !e.health.circuitOpen &&
        e.provider.initialized &&
        (e.companyId === undefined || e.companyId === companyId),
    );
  }

  /** Public, read-only view used by health/settings endpoints. */
  getProviderSummaries(): Array<{
    provider: AIProvider;
    companyId?: string;
    initialized: boolean;
    circuitOpen: boolean;
    initError?: string;
    models: string[];
  }> {
    return Array.from(this.providers.values()).map((e) => ({
      provider: e.provider.name,
      companyId: e.companyId,
      initialized: e.provider.initialized,
      circuitOpen: e.health.circuitOpen,
      initError: e.initError,
      models: e.provider.supportedModels.map((m) => m.id),
    }));
  }

  private findProviderForModel(
    modelId: string,
    available: ProviderEntry[],
  ): ProviderEntry | undefined {
    return available.find((e) =>
      e.provider.supportedModels.some((m) => m.id === modelId),
    );
  }

  /**
   * Filter providers that support the capabilities implied by the request.
   * E.g., if the request asks for streaming, prefer providers with streaming capability.
   */
  private filterByCapabilities(
    available: ProviderEntry[],
    request: AIRequest,
  ): ProviderEntry[] {
    const requiredCapabilities: AICapability[] = ['chat'];
    if (request.stream) requiredCapabilities.push('streaming');
    if (request.tools && request.tools.length > 0) requiredCapabilities.push('function-calling');

    return available.filter((e) =>
      requiredCapabilities.every((cap) =>
        e.provider.supportedModels.some((m) => m.capabilities.includes(cap)),
      ),
    );
  }

  // ─── Private: Circuit Breaker ───────────────────────────────────

  private handleCircuitBreaker(entry: ProviderEntry): void {
    entry.health.consecutiveFailures++;

    if (entry.health.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      entry.health.circuitOpen = true;
      entry.health.circuitOpenUntil = new Date(Date.now() + CIRCUIT_COOLDOWN_MS);
    }
  }

  // ─── Private: Metrics ───────────────────────────────────────────

  private recordLatency(entry: ProviderEntry, latencyMs: number): void {
    entry.latencies.push(latencyMs);
    if (entry.latencies.length > 20) entry.latencies.shift();
    entry.health.latencyMs =
      entry.latencies.reduce((a, b) => a + b, 0) / entry.latencies.length;
  }

  private recordSuccess(entry: ProviderEntry): void {
    entry.errors.push(false);
    if (entry.errors.length > 20) entry.errors.shift();
    entry.health.errorRate =
      entry.errors.filter(Boolean).length / entry.errors.length;
    entry.health.consecutiveFailures = 0;
  }

  private recordFailure(entry: ProviderEntry): void {
    entry.errors.push(true);
    if (entry.errors.length > 20) entry.errors.shift();
    entry.health.errorRate =
      entry.errors.filter(Boolean).length / entry.errors.length;
  }

  private recordUsage(record: UsageRecordInternal): void {
    this.usageHistory.push(record);
    // Keep last 10,000 records in memory
    if (this.usageHistory.length > 10_000) {
      this.usageHistory = this.usageHistory.slice(-5_000);
    }
  }

  private estimatePromptTokens(request: AIRequest): number {
    // Re-use the base provider estimation logic
    const provider = this.providers.values().next().value?.provider;
    if (provider) return provider.estimateRequestTokens(request) - (request.maxTokens ?? 1024);
    return 0;
  }
}

// ─── Error classification helpers ───────────────────────────────────

function errorCodeOf(err: unknown): string {
  if (err instanceof AICircuitOpenError) return 'CIRCUIT_OPEN';
  if (err instanceof AIProviderUnavailableError) return 'PROVIDER_UNAVAILABLE';
  if (err instanceof AIModelNotFoundError) return 'MODEL_NOT_FOUND';
  if (err instanceof AIRouterError) {
    if (err.statusCode === 401 || err.statusCode === 403) return 'UNAUTHORIZED';
    if (err.statusCode === 429) return 'RATE_LIMITED';
    if (err.statusCode && err.statusCode >= 500) return 'UPSTREAM_ERROR';
    if (err.statusCode) return `HTTP_${err.statusCode}`;
    return err.retryable ? 'RETRYABLE_ERROR' : 'PROVIDER_ERROR';
  }
  if (err instanceof Error && /abort|timeout/i.test(err.message)) return 'TIMEOUT';
  return 'UNKNOWN';
}

function errorMessageOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // Never persist bearer tokens that a provider may echo back in error bodies.
  return message.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1…').slice(0, 1000);
}
