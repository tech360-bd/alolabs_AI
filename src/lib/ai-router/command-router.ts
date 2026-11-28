/**
 * ALO Labs Command Router Engine (inspired by Alishahryar1/free-claude-code).
 *
 * Central orchestration over ALO Labs' real AIProviderConfig + AIRouter runtime:
 *  - Routing strategies: capability | free-first | local-first | lowest-cost |
 *    lowest-latency | priority | manual | fallback
 *  - Privacy enforcement: standard | guarded (credential redaction) | strict (local only)
 *  - Capability matching: chat, reasoning, coding, tool-calling, structured-output,
 *    image-input, image-gen, audio-input, audio-output, video-input, embedding, long-context
 *  - Real connection & model discovery for Ollama, vLLM, llama.cpp, LocalAI,
 *    OpenRouter, Groq, and OpenAI-compatible endpoints (SSRF-guarded)
 *  - Transparent routing telemetry & admin runtime policy override in Settings DB
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import {
  aiRouter,
  ensureRouterSynced,
  isFreeOnlyMode,
  type AICapability,
  type AIRequest,
  type AIResponse,
  type AIStreamChunk,
} from './index';
import { applyGuardedRedaction } from './protocol-gateway';
import { isProviderAvailable } from './free-tier-quota-tracker';
import { AIGateway } from '@/lib/ai-gateway/gateway';
import type { AIGatewayRequest } from '@/lib/ai-gateway/types';
import { CompanyAIError, type CompanyAIActor } from '@/lib/multi-tenant-ai/service';
import type { ModelRoutingProfile } from '@/lib/multi-tenant-ai/policy';
import { isTrustedLocalInferenceEndpoint } from '@/lib/ai-provider-catalog';
import { assertSafeExternalUrl } from '@/lib/security/ssrf';

export type RoutingStrategy =
  | 'capability'
  | 'free-first'
  | 'local-first'
  | 'lowest-cost'
  | 'lowest-latency'
  | 'priority'
  | 'manual'
  | 'fallback';

export type PrivacyGuardMode = 'standard' | 'guarded' | 'strict';

export type ExtendedCapability =
  | 'chat'
  | 'reasoning'
  | 'coding'
  | 'tool-calling'
  | 'structured-output'
  | 'image-input'
  | 'image-gen'
  | 'audio-input'
  | 'audio-output'
  | 'video-input'
  | 'embedding'
  | 'long-context';

export interface CommandRouterConfig {
  strategy: RoutingStrategy;
  privacyMode: PrivacyGuardMode;
  preferFreeFirst: boolean;
  preferLocalFirst: boolean;
  maxRetries: number;
  timeoutMs: number;
  maxConcurrencyPerTenant: number;
  pinnedProvider?: string | null;
  pinnedModel?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
}

const DEFAULT_ROUTER_CONFIG: CommandRouterConfig = {
  strategy: 'free-first',
  privacyMode: 'guarded',
  preferFreeFirst: true,
  preferLocalFirst: true,
  maxRetries: 2,
  timeoutMs: 60_000,
  maxConcurrencyPerTenant: 20,
  pinnedProvider: null,
  pinnedModel: null,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

const SETTINGS_KEY = 'command_router:config';

/** In-memory active concurrency counter per tenant (process-scoped guard). */
const activeTenantRequests = new Map<string, number>();

export function acquireTenantSlot(
  companyId: string,
  maxConcurrency: number,
): { allowed: boolean; release: () => void } {
  const active = activeTenantRequests.get(companyId) ?? 0;
  if (active >= maxConcurrency) {
    return { allowed: false, release: () => {} };
  }
  activeTenantRequests.set(companyId, active + 1);
  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      const cur = activeTenantRequests.get(companyId) ?? 1;
      if (cur <= 1) activeTenantRequests.delete(companyId);
      else activeTenantRequests.set(companyId, cur - 1);
    },
  };
}

export function normalizeCapabilityToRouter(cap: ExtendedCapability): AICapability | null {
  switch (cap) {
    case 'chat':
      return 'chat';
    case 'reasoning':
      return 'reasoning';
    case 'coding':
      return 'code-generation';
    case 'tool-calling':
      return 'function-calling';
    case 'structured-output':
      return 'json-mode';
    case 'image-input':
      return 'vision';
    case 'audio-input':
    case 'audio-output':
      return 'audio';
    case 'embedding':
      return 'embedding';
    default:
      return null;
  }
}

export async function getCommandRouterConfig(): Promise<CommandRouterConfig> {
  try {
    const row = await db.settings.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.value) return DEFAULT_ROUTER_CONFIG;
    const parsed = JSON.parse(row.value) as Partial<CommandRouterConfig>;
    return { ...DEFAULT_ROUTER_CONFIG, ...parsed };
  } catch {
    return DEFAULT_ROUTER_CONFIG;
  }
}

export async function saveCommandRouterConfig(
  patch: Partial<CommandRouterConfig>,
  actorUserId: string,
): Promise<CommandRouterConfig> {
  const current = await getCommandRouterConfig();
  const next: CommandRouterConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUserId,
  };
  await db.settings.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next), type: 'json' },
    create: { id: randomUUID(), key: SETTINGS_KEY, value: JSON.stringify(next), type: 'json' },
  });
  return next;
}

export interface RankedRouteCandidate {
  provider: string;
  model: string;
  isLocal: boolean;
  isHealthy: boolean;
  circuitOpen: boolean;
  latencyMs: number;
  costPerMillionTokens: number;
  contextLength: number;
  capabilities: string[];
  score: number;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface RouteSelectionPlan {
  strategy: RoutingStrategy;
  privacyMode: PrivacyGuardMode;
  freeOnlyActive: boolean;
  requiredCapabilities: string[];
  candidates: RankedRouteCandidate[];
  selected: RankedRouteCandidate | null;
}

/**
 * Computes a deterministic, transparent candidate ranking over live registered
 * providers and models without touching external providers.
 */
export async function planCommandRoute(options: {
  companyId?: string;
  requestedModel?: string;
  requiredCapabilities?: ExtendedCapability[];
  strategy?: RoutingStrategy;
  privacyMode?: PrivacyGuardMode;
}): Promise<RouteSelectionPlan> {
  await ensureRouterSynced();
  const config = await getCommandRouterConfig();
  const strategy = options.strategy ?? config.strategy;
  const privacyMode = options.privacyMode ?? config.privacyMode;
  const freeOnlyActive = isFreeOnlyMode();
  const reqCaps = (options.requiredCapabilities ?? ['chat']).map((c) => c);
  const routerCaps = reqCaps
    .map(normalizeCapabilityToRouter)
    .filter((c): c is AICapability => c !== null);

  const dbProviders = await db.aIProviderConfig.findMany({
    where: {
      isEnabled: true,
      ...(options.companyId ? { OR: [{ companyId: null }, { companyId: options.companyId }] } : {}),
    },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
  });
  const priorityByRouter = new Map<string, number>();
  for (const p of dbProviders) {
    priorityByRouter.set(p.provider, p.priority);
    priorityByRouter.set(`openai-compatible:${p.id}`, p.priority);
    priorityByRouter.set(`unorouter-free:${p.id}`, p.priority);
  }

  const summaries = aiRouter.getProviderSummaries();
  const summaryByProvider = new Map(summaries.map((s) => [s.provider, s]));
  const registeredProviders = aiRouter.getRegisteredProviders();
  for (const name of registeredProviders) {
    const provider = aiRouter.getProvider(name);
    if (provider && !provider.initialized && provider.supportedModels.length === 0) {
      try {
        await provider.initialize();
      } catch {
        // unreachable providers stay uninitialized and rank ineligible
      }
    }
  }
  const models = registeredProviders.flatMap((name) => aiRouter.getProvider(name)?.supportedModels ?? []);

  const candidates: RankedRouteCandidate[] = [];
  for (const m of models) {
    const summary = summaryByProvider.get(m.provider);
    const dbMatch = dbProviders.find((p) => p.provider === m.provider || `openai-compatible:${p.id}` === m.provider);
    const isLocal =
      summary?.isLocal ||
      m.provider.startsWith('ollama') ||
      m.provider === 'vllm' ||
      m.provider === 'localai' ||
      m.provider === 'lm-studio' ||
      m.provider === 'jan';
    const cost = typeof m.costPerMillionTokens === 'number' ? m.costPerMillionTokens : isLocal ? 0 : 0.5;
    const isFree = isLocal || cost === 0 || m.id.endsWith(':free') || m.provider.includes('free');
    const isHealthy = summary ? !summary.circuitOpen && !summary.initError : true;
    const quotaOk = isLocal ? true : await isProviderAvailable(m.provider, m.provider);

    let eligible = true;
    let ineligibleReason: string | undefined;

    if (privacyMode === 'strict' && !isLocal) {
      eligible = false;
      ineligibleReason = 'Strict privacy mode permits local inference only';
    } else if (freeOnlyActive && !isLocal && !isFree) {
      eligible = false;
      ineligibleReason = 'Blocked by FREE_ONLY_MODE';
    } else if (summary?.circuitOpen) {
      eligible = false;
      ineligibleReason = 'Circuit breaker open';
    } else if (!quotaOk) {
      eligible = false;
      ineligibleReason = 'Rate-limit cooldown active';
    } else if (routerCaps.length > 0 && !routerCaps.every((cap) => m.capabilities.includes(cap))) {
      eligible = false;
      ineligibleReason = `Missing required capabilities (${routerCaps.filter((c) => !m.capabilities.includes(c)).join(', ')})`;
    } else if (reqCaps.includes('long-context') && m.contextLength < 65_536) {
      eligible = false;
      ineligibleReason = `Context ${m.contextLength} below long-context threshold (65536)`;
    } else if (
      strategy === 'manual' &&
      options.requestedModel &&
      options.requestedModel !== 'auto' &&
      m.id !== options.requestedModel &&
      `${m.provider}:${m.id}` !== options.requestedModel
    ) {
      eligible = false;
      ineligibleReason = `Manual mode pinned to ${options.requestedModel}`;
    }

    const dbPriority = priorityByRouter.get(m.provider) ?? 100;
    const latencyMs = dbMatch?.lastHealthLatencyMs ?? 500;
    let score = 1000;
    if (!eligible) {
      score = -1000;
    } else {
      switch (strategy) {
        case 'local-first':
          score += (isLocal ? 500 : 0) + (isFree ? 100 : 0) - dbPriority;
          break;
        case 'free-first':
          score += (isFree ? 500 : 0) + (isLocal ? 200 : 0) - cost * 100 - dbPriority;
          break;
        case 'lowest-cost':
          score += (isFree ? 400 : 0) - cost * 1000 - dbPriority * 0.5;
          break;
        case 'lowest-latency':
          score += 500 - Math.min(490, latencyMs / 10);
          break;
        case 'priority':
          score += 500 - dbPriority;
          break;
        case 'manual':
          score += m.id === options.requestedModel ? 900 : 100 - dbPriority;
          break;
        case 'capability':
          score += m.capabilities.length * 40 + (m.contextLength >= 128_000 ? 100 : 0) - dbPriority;
          break;
        case 'fallback':
        default:
          score += (!isHealthy ? -200 : 200) - dbPriority;
          break;
      }
      if (options.requestedModel && options.requestedModel !== 'auto' && m.id === options.requestedModel) {
        score += 350;
      }
    }

    candidates.push({
      provider: m.provider,
      model: m.id,
      isLocal,
      isHealthy,
      circuitOpen: summary?.circuitOpen ?? false,
      latencyMs,
      costPerMillionTokens: cost,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      score: Math.round(score * 100) / 100,
      eligible,
      ...(ineligibleReason ? { ineligibleReason } : {}),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.find((c) => c.eligible) ?? null;

  return {
    strategy,
    privacyMode,
    freeOnlyActive,
    requiredCapabilities: reqCaps,
    candidates,
    selected,
  };
}

function resolveCommandRoutingProfile(
  strategy: RoutingStrategy,
  privacyMode: PrivacyGuardMode,
  caps: ExtendedCapability[],
  freeOnlyActive: boolean,
): ModelRoutingProfile {
  if (privacyMode === 'strict' || strategy === 'local-first') {
    return 'local_general';
  }
  if (caps.includes('coding')) return 'free_coding';
  if (caps.includes('reasoning')) return 'free_reasoning';
  if (caps.includes('image-input')) return 'free_vision';
  void freeOnlyActive;
  return 'free_general';
}

function mapCapsToTaskType(caps: ExtendedCapability[], profile: ModelRoutingProfile): AIGatewayRequest['taskType'] {
  if (profile === 'local_fast') return 'fast';
  if (caps.includes('coding')) return 'coding';
  if (caps.includes('reasoning')) return 'reasoning';
  if (caps.includes('image-input')) return 'vision';
  return 'balanced';
}

async function prepareGatewayDispatch(params: {
  companyId: string;
  userId: string;
  role?: string;
  requestId?: string;
  request: AIRequest;
  strategy?: RoutingStrategy;
  privacyMode?: PrivacyGuardMode;
  requiredCapabilities?: ExtendedCapability[];
}): Promise<{
  actor: CompanyAIActor;
  gatewayRequest: AIGatewayRequest;
  plan: RouteSelectionPlan;
  redactedSecrets: number;
  config: CommandRouterConfig;
  releaseSlot: () => void;
}> {
  const config = await getCommandRouterConfig();
  const slot = acquireTenantSlot(params.companyId, config.maxConcurrencyPerTenant);
  if (!slot.allowed) {
    throw new CompanyAIError(
      `Tenant concurrency limit reached (${config.maxConcurrencyPerTenant} concurrent calls)`,
      429,
      'CONCURRENCY_LIMIT_EXCEEDED',
      params.requestId,
    );
  }

  try {
    const plan = await planCommandRoute({
      companyId: params.companyId,
      requestedModel: params.request.model,
      requiredCapabilities: params.requiredCapabilities,
      strategy: params.strategy ?? config.strategy,
      privacyMode: params.privacyMode ?? config.privacyMode,
    });

    if (plan.strategy === 'manual' && !plan.selected) {
      throw new CompanyAIError(
        `No eligible provider/model matches pinned manual target "${params.request.model || 'auto'}"`,
        503,
        'NO_AUTHORIZED_MODEL',
        params.requestId,
      );
    }

    const willRunExternal = plan.selected ? !plan.selected.isLocal : plan.privacyMode !== 'strict';
    let messages = params.request.messages;
    let redactedSecrets = 0;
    if (plan.privacyMode === 'guarded' && willRunExternal) {
      const redacted = applyGuardedRedaction(messages);
      messages = redacted.messages;
      redactedSecrets = redacted.redactedCount;
    }

    const reqCaps = params.requiredCapabilities ?? ['chat'];
    const profile = resolveCommandRoutingProfile(
      plan.strategy,
      plan.privacyMode,
      reqCaps,
      plan.freeOnlyActive,
    );

    const requested = params.request.model?.trim() ?? '';
    const exactMatchInPlan =
      requested &&
      requested !== 'auto' &&
      plan.candidates.some((c) => c.eligible && c.model === requested);
    const resolvedModel =
      plan.strategy === 'manual'
        ? requested
        : exactMatchInPlan
          ? requested
          : plan.selected?.model ?? '';

    const gatewayRequest: AIGatewayRequest = {
      model: resolvedModel || undefined,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
        ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
        ...(m.imageUrls?.length ? { imageUrls: m.imageUrls } : {}),
      })),
      companyId: params.companyId,
      userId: params.userId,
      temperature: params.request.temperature,
      maxTokens: params.request.maxTokens,
      stream: params.request.stream,
      tools: params.request.tools,
      taskType: mapCapsToTaskType(reqCaps, profile),
      routingProfile: profile,
      metadata: {
        requestId: params.requestId,
        requestedModel: params.request.model,
        commandRouterStrategy: plan.strategy,
        privacyMode: plan.privacyMode,
        redactedSecrets,
      },
    };

    return {
      actor: {
        companyId: params.companyId,
        userId: params.userId,
        role: params.role ?? 'admin',
      },
      gatewayRequest,
      plan,
      redactedSecrets,
      config,
      releaseSlot: slot.release,
    };
  } catch (err) {
    slot.release();
    throw err;
  }
}

/**
 * Executes a normalized AIRequest through Command Router -> AIGateway ->
 * executeCompanyAIChat -> AIRouter -> real provider, preserving tenant budgets,
 * RBAC, FREE_ONLY_MODE, ModelUsageRecord, and AuditEvent persistence.
 */
export async function executeCommandRoute(params: {
  companyId: string;
  userId: string;
  role?: string;
  requestId?: string;
  request: AIRequest;
  strategy?: RoutingStrategy;
  privacyMode?: PrivacyGuardMode;
  requiredCapabilities?: ExtendedCapability[];
}): Promise<{
  response: AIResponse;
  selectedProvider: string;
  strategy: RoutingStrategy;
  privacyMode: PrivacyGuardMode;
  redactedSecrets: number;
  plan: RouteSelectionPlan;
}> {
  const prepared = await prepareGatewayDispatch(params);
  try {
    const gatewayResult = await AIGateway.chat(prepared.gatewayRequest, prepared.actor);
    if (!gatewayResult.success || !gatewayResult.data) {
      const code = gatewayResult.error?.code ?? 'GATEWAY_ERROR';
      const status =
        code === 'TOKEN_BUDGET_EXHAUSTED' || code === 'AI_EMPLOYEE_DAILY_BUDGET_EXHAUSTED' || code === 'RATE_LIMITED'
          ? 429
          : code === 'FORBIDDEN'
            ? 403
            : code === 'UNAUTHENTICATED'
              ? 401
              : code === 'VALIDATION_ERROR'
                ? 400
                : 503;
      throw new CompanyAIError(
        gatewayResult.error?.message || 'Authorized route unavailable',
        status,
        code,
        gatewayResult.requestId,
      );
    }

    const d = gatewayResult.data;
    const response: AIResponse = {
      id: d.id,
      content: d.content,
      model: d.model,
      usage: d.usage,
      finishReason: (d.finishReason as AIResponse['finishReason']) || 'stop',
      ...(d.toolCalls?.length ? { toolCalls: d.toolCalls } : {}),
      latencyMs: d.latencyMs,
    };

    return {
      response,
      selectedProvider: d.provider,
      strategy: prepared.plan.strategy,
      privacyMode: prepared.plan.privacyMode,
      redactedSecrets: prepared.redactedSecrets,
      plan: prepared.plan,
    };
  } finally {
    prepared.releaseSlot();
  }
}

/**
 * Streams real tokens through Command Router -> AIGateway.streamChunks ->
 * streamCompanyAIChat -> AIRouter -> real provider.
 */
export async function streamCommandRoute(params: {
  companyId: string;
  userId: string;
  role?: string;
  requestId?: string;
  request: AIRequest;
  strategy?: RoutingStrategy;
  privacyMode?: PrivacyGuardMode;
  requiredCapabilities?: ExtendedCapability[];
}): Promise<{
  stream: AsyncGenerator<AIStreamChunk>;
  strategy: RoutingStrategy;
  privacyMode: PrivacyGuardMode;
  redactedSecrets: number;
  plan: RouteSelectionPlan;
}> {
  const prepared = await prepareGatewayDispatch({
    ...params,
    request: { ...params.request, stream: true },
  });

  const wrappedGenerator = (async function* () {
    try {
      yield* AIGateway.streamChunks(prepared.gatewayRequest, prepared.actor);
    } finally {
      prepared.releaseSlot();
    }
  })();

  return {
    stream: wrappedGenerator,
    strategy: prepared.plan.strategy,
    privacyMode: prepared.plan.privacyMode,
    redactedSecrets: prepared.redactedSecrets,
    plan: prepared.plan,
  };
}

async function assertSafeDiscoveryUrl(urlStr: string): Promise<URL> {
  const trustedLocal = isTrustedLocalInferenceEndpoint(urlStr);
  return assertSafeExternalUrl(urlStr, { allowHttp: trustedLocal });
}

export interface DiscoveredModelEntry {
  id: string;
  name: string;
  contextLength?: number;
  sizeBytes?: number;
  isFree?: boolean;
}

/**
 * Probes an endpoint's real `/api/tags` (Ollama) or `/v1/models` (OpenAI-compatible /
 * vLLM / llama.cpp / LocalAI / OpenRouter) without fabricating models if unreachable.
 */
export async function discoverLiveProviderModels(params: {
  providerKind: string;
  baseUrl: string;
  apiKey?: string;
}): Promise<{
  reachable: boolean;
  latencyMs: number;
  models: DiscoveredModelEntry[];
  error?: string;
}> {
  const startedAt = Date.now();
  try {
    const parsed = await assertSafeDiscoveryUrl(params.baseUrl);
    const base = parsed.toString().replace(/\/+$/, '');
    const isOllamaNative = params.providerKind === 'ollama' && !base.endsWith('/v1');
    const url = isOllamaNative ? `${base}/api/tags` : base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (params.apiKey) headers.Authorization = `Bearer ${params.apiKey}`;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return { reachable: false, latencyMs, models: [], error: `HTTP ${res.status} from ${url}` };
    }
    const json = (await res.json()) as {
      models?: Array<{ name?: string; model?: string; size?: number }>;
      data?: Array<{
        id?: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };

    const models: DiscoveredModelEntry[] = [];
    if (Array.isArray(json.models)) {
      for (const m of json.models) {
        const id = m.model || m.name || '';
        if (id) models.push({ id, name: m.name || id, sizeBytes: m.size, isFree: true });
      }
    } else if (Array.isArray(json.data)) {
      for (const m of json.data) {
        const id = m.id || '';
        if (!id) continue;
        const promptCost = Number(m.pricing?.prompt ?? NaN);
        const completionCost = Number(m.pricing?.completion ?? NaN);
        const isFree =
          id.endsWith(':free') ||
          (Number.isFinite(promptCost) && promptCost === 0 && Number.isFinite(completionCost) && completionCost === 0);
        models.push({
          id,
          name: m.name || id,
          ...(typeof m.context_length === 'number' ? { contextLength: m.context_length } : {}),
          isFree,
        });
      }
    }

    return { reachable: true, latencyMs, models };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      models: [],
      error: error instanceof Error ? error.message : 'Discovery failed',
    };
  }
}
