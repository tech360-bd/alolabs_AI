/**
 * AI Router — Public API
 * ALO Labs AIOS
 *
 * Re-exports all types, base classes, providers, and the singleton router.
 */

// ─── Types ──────────────────────────────────────────────────────────
export type {
  AIProvider,
  AIModel,
  AIModelFamily,
  AIModelParameters,
  AICapability,
  AIMessage,
  AITool,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AITokenUsage,
  AITokenUsageRecord,
  AIRouteDecision,
  AIRouteReason,
  AILoadBalanceStrategy,
  AILoadBalanceConfig,
  AIProviderHealth,
} from './types';

export {
  AIRouterError,
  AIProviderUnavailableError,
  AIModelNotFoundError,
  AICircuitOpenError,
} from './types';

// ─── Base ───────────────────────────────────────────────────────────
export { BaseAIProvider } from './provider-base';

// ─── Providers ──────────────────────────────────────────────────────
export { OllamaProvider } from './ollama-provider';
export { OpenRouterProvider } from './openrouter-provider';
export { ZAIProvider } from './zai-provider';
export { GroqProvider } from './groq-provider';
export { DeepSeekProvider } from './deepseek-provider';
export { MistralProvider } from './mistral-provider';
export { QwenProvider } from './qwen-provider';
export { LlamaProvider } from './llama-provider';
export { PhiProvider } from './phi-provider';
export { GemmaProvider } from './gemma-provider';

// ─── Router ─────────────────────────────────────────────────────────
export { AIRouter } from './router';

// ─── Singleton ──────────────────────────────────────────────────────
import { AIRouter } from './router';
import type { RoutingDecisionRecord } from './router';
import {
  registerEnvironmentProviders,
  syncRouterWithProviderConfigs,
} from './provider-registry';
import type { ProviderConfigDb } from './provider-registry';

export { OpenAICompatibleProvider, openAICompatibleProviderName } from './openai-compatible-provider';
export type { OpenAICompatibleProviderConfig, OpenAICompatibleModelConfig } from './openai-compatible-provider';
export {
  CONFIGURABLE_PROVIDER_KINDS,
  buildProviderFromConfig,
  describeProviderConfig,
  parseModelCatalogue,
  providersFromEnvironment,
  registerEnvironmentProviders,
  routerNameForConfig,
  sealApiKey,
  syncRouterWithProviderConfigs,
  resetProviderRegistryState,
} from './provider-registry';
export type { ProviderConfigRecord, ProviderConfigView, ConfigurableProviderKind } from './provider-registry';
export type { AIRequestContext, RoutingDecisionRecord, RoutingDecisionRecorder, RegisterProviderOptions } from './router';

export const aiRouter = new AIRouter();

let environmentRegistered = false;
let decisionRecorderInstalled = false;
let lastDbSyncAt = 0;
let dbSyncInFlight: Promise<void> | null = null;

/** How often the router re-reads AIProviderConfig (ms). */
const DB_SYNC_INTERVAL_MS = Number(process.env.AI_PROVIDER_SYNC_MS) || 30_000;

/**
 * Persist every routing decision to ModelRoutingDecision. Loaded lazily so
 * the pure router module can be used without a database (unit tests, CLI).
 */
function installDecisionRecorder(): void {
  if (decisionRecorderInstalled) return;
  decisionRecorderInstalled = true;
  aiRouter.setDecisionRecorder(async (record: RoutingDecisionRecord) => {
    try {
      const { db } = await import('../db');
      await db.modelRoutingDecision.create({
        data: {
          runId: record.context?.runId ?? null,
          taskId: record.context?.taskId ?? null,
          companyId: record.companyId ?? null,
          agentId: record.agentId ?? null,
          requestedModel: record.requestedModel,
          taskType: record.context?.taskType ?? null,
          selectedProvider: record.selectedProvider,
          selectedModel: record.selectedModel,
          reason: record.reason,
          candidates: JSON.stringify(record.candidates),
          attempts: record.attempts,
          fallbackFrom: record.fallbackFrom,
          success: record.success,
          errorCode: record.errorCode,
          errorMessage: record.errorMessage,
          latencyMs: Math.round(record.latencyMs),
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          costUsd: record.costUsd,
        },
      });
    } catch {
      // Observability must never break a request.
    }
  });
}

/**
 * Synchronous accessor for the process-wide AI Router.
 *
 * On first use it registers every provider whose credentials exist in the
 * environment (see providersFromEnvironment) and installs the routing
 * decision recorder. Database-configured providers are merged in by
 * ensureRouterSynced(); the worker and the gateway call it before use.
 */
export function getRouter(): AIRouter {
  if (!environmentRegistered) {
    environmentRegistered = true;
    registerEnvironmentProviders(aiRouter);
    installDecisionRecorder();
  }
  return aiRouter;
}

/**
 * Merge AIProviderConfig rows into the router (throttled to
 * DB_SYNC_INTERVAL_MS unless `force`). Safe to call on every request.
 */
export async function ensureRouterSynced(options: { force?: boolean; db?: ProviderConfigDb } = {}): Promise<AIRouter> {
  const router = getRouter();
  const now = Date.now();
  if (!options.force && now - lastDbSyncAt < DB_SYNC_INTERVAL_MS) return router;
  if (dbSyncInFlight) {
    await dbSyncInFlight;
    return router;
  }
  dbSyncInFlight = (async () => {
    try {
      const database = options.db ?? ((await import('../db')).db as unknown as ProviderConfigDb);
      await syncRouterWithProviderConfigs(router, database, { force: options.force });
      lastDbSyncAt = Date.now();
    } catch (err) {
      console.warn('[AI Router] provider config sync failed:', err instanceof Error ? err.message : String(err));
    } finally {
      dbSyncInFlight = null;
    }
  })();
  await dbSyncInFlight;
  return router;
}

/** Test hook. */
export function __resetRouterBootstrapForTests(): void {
  environmentRegistered = false;
  decisionRecorderInstalled = false;
  lastDbSyncAt = 0;
  for (const name of aiRouter.getRegisteredProviders()) aiRouter.removeProvider(name);
  aiRouter.setDecisionRecorder(null);
}
