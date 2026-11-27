/**
 * ALO Open AI Platform — model registry and candidate selection.
 *
 * The registry describes *deployments*, not just models: the same weights can be
 * served by Ollama on a laptop, by vLLM on a GPU host, and by a free cloud lane.
 * Each is a separate candidate with its own health, cooldown and quota, which is
 * what makes "local-first, fall back to a compatible model, then to an approved
 * free lane" expressible as data rather than branching in the request handler.
 *
 * WHERE THE DATA COMES FROM
 * ------------------------
 *   1. `AIProviderConfig` rows (existing AgentOS table) — configured providers,
 *      with `isLocal`, `fallbackEligible`, `priority`, encrypted credentials.
 *   2. `OPEN_AI_PLATFORM_CATALOG` below — the default deployment catalogue for
 *      self-hosted stacks (Ollama, vLLM, LiteLLM) that the operator can enable
 *      per environment. Kept in code so a fresh install has a usable, honestly
 *      labelled model list before anything is configured.
 *
 * A deployment is only *available* when its provider is enabled AND its base
 * URL answers. `describeAvailability()` is the single function the UI and the
 * router both use, so the UI can never claim a model works while the router
 * skips it.
 *
 * CAPABILITY MATCHING
 * -------------------
 * Requirement O.11: "An ineligible model is not selected for an incompatible
 * task." Selection is a filter, not a preference: a task that needs `vision`
 * only ever sees deployments that declare `vision`, regardless of priority.
 */

import { db } from '@/lib/db';
import { getCooldown, getHealth, getQuota, type DeploymentHealth } from './routing-state';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ModelCapability =
  | 'chat' | 'streaming' | 'code' | 'reasoning' | 'vision'
  | 'embedding' | 'function-calling' | 'json-mode' | 'long-context';

export const MODEL_CAPABILITIES: readonly ModelCapability[] = [
  'chat',
  'streaming',
  'code',
  'reasoning',
  'vision',
  'embedding',
  'function-calling',
  'json-mode',
  'long-context',
];

export function isModelCapability(value: string): value is ModelCapability {
  return (MODEL_CAPABILITIES as readonly string[]).includes(value);
}

export type TaskType =
  | 'chat'
  | 'code'
  | 'vision'
  | 'reasoning'
  | 'embedding'
  | 'summarise'
  | 'translation';

export const TASK_REQUIREMENTS: Record<TaskType, ModelCapability[]> = {
  chat: ['chat'],
  code: ['code'],
  vision: ['vision'],
  reasoning: ['reasoning'],
  embedding: ['embedding'],
  summarise: ['chat'],
  translation: ['chat'],
};

export function isTaskType(value: string): value is TaskType {
  return Object.prototype.hasOwnProperty.call(TASK_REQUIREMENTS, value);
}

export type HostingType = 'local' | 'remote' | 'free-cloud';

export type ProviderKind = 'ollama' | 'vllm' | 'litellm' | 'openai-compatible' | 'platform-local';

export interface ModelDeployment {
  /** Stable id: `<provider>:<model>`. */
  id: string;
  provider: string;
  providerKind: ProviderKind;
  model: string;
  family: string;
  displayName: string;
  hostingType: HostingType;
  capabilities: ModelCapability[];
  contextLength: number;
  /** Notes shown to users: hardware, install state, licence. */
  notes?: string;
  /** Approximate weights size, for hardware requirement display. */
  approxSizeGb?: number;
  /** True when this deployment may be used as a fallback. */
  fallbackEligible: boolean;
  /** Lower runs first within the same tier. */
  priority: number;
  /** Requests/minute this deployment may serve before we prefer another. */
  rateLimit?: number;
  /** Free-tier window, when the provider has a documented one. */
  quota?: { limit: number; windowMs: number };
}

export interface AvailableDeployment extends ModelDeployment {
  /** Provider is enabled and its base URL is reachable. */
  reachable: boolean;
  /**
   * Live routing state. Optional because it is *advisory*: a candidate list can
   * be constructed without probing (tests, a fresh deployment, a caller that
   * builds its own list) and the engine must still route correctly. Consumers
   * default these rather than assuming they were populated.
   */
  health?: DeploymentHealth;
  cooldown?: { active: boolean; until?: number; reason?: string };
  /**
   * Live usage against the configured `quota` window.
   *
   * Deliberately NOT called `quota`: the inherited `quota` is the configured
   * limit (immutable, part of the deployment definition) that `consumeQuota`
   * needs, while this is the moving state. Sharing one name forced an override
   * the type system correctly rejected, and renaming the configured field
   * instead would have broken the routing-state call.
   */
  liveQuota?: { used: number; limit: number; exhausted: boolean; resetAt?: number } | null;
  /** Why this deployment is not selectable, when it is not. */
  blockedReason?: string;
  /** Can the router use it right now? */
  selectable: boolean;
}

export interface SelectOptions {
  /** Capability the task needs. Membership is a hard filter. */
  requires?: ModelCapability[];
  /** Tokens the prompt needs; candidates with smaller context are excluded. */
  needsContext?: number;
  /** Caller-pinned model id (or bare model name). Wins over ordering. */
  preferredModel?: string;
  /** Exclude remote paid providers unless explicitly allowed. */
  allowRemote?: boolean;
  /** Exclude free-cloud lanes (e.g. when the operator has disabled them). */
  allowFreeCloud?: boolean;
  /** Hard-exclude specific deployment ids (used while walking the chain). */
  exclude?: string[];
}

// ─── Default self-hosted catalogue ─────────────────────────────────────────

/**
 * Deployments a stock ALO Open AI Platform install can serve.
 *
 * These are *declarations*, not promises: an entry only becomes selectable once
 * `OLLAMA_BASE_URL` (or the vLLM/LiteLLM equivalent) actually answers. Sizes and
 * context lengths are the upstream published values for the quantised tags
 * shown; the operator pulls the tag they have RAM/VRAM for.
 */
export const OPEN_AI_PLATFORM_CATALOG: ModelDeployment[] = [
  // ── ALO built-in local runtime (scripts/local-model-runtime.mjs) ────────
  // Real HTTP + real generation, but a statistical (Markov) model, not a
  // neural LLM. It exists so a fresh install has a working local-first path on
  // hardware with no GPU, and so the platform's adapters and fallback chain are
  // verifiable end to end. Highest priority so it is tried first when present;
  // an operator who pulls real Ollama tags simply gets better answers from the
  // next candidate.
  {
    id: 'platform-local:alo-local-tiny', provider: 'platform-local', providerKind: 'platform-local',
    model: 'alo-local-tiny', family: 'markov', displayName: 'ALO Local Runtime (built-in)',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'embedding', 'json-mode', 'code'],
    contextLength: 4096, approxSizeGb: 0.02, fallbackEligible: true, priority: 5,
    notes: 'Built-in verification runtime: real generation, real embeddings, ~20 MB RAM, no GPU. '
      + 'Not a neural LLM — pull a real Ollama model for production-quality answers.',
  },
  // ── Ollama (local CPU/GPU) ──────────────────────────────────────────────
  {
    id: 'ollama:qwen2.5-coder:1.5b', provider: 'ollama', providerKind: 'ollama',
    model: 'qwen2.5-coder:1.5b', family: 'qwen', displayName: 'Qwen2.5 Coder 1.5B',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'code', 'json-mode'],
    contextLength: 32768, approxSizeGb: 1.0, fallbackEligible: true, priority: 10,
    notes: 'Runs on CPU with ~2 GB free RAM. Best default for a small VPS.',
  },
  {
    id: 'ollama:qwen2.5:3b', provider: 'ollama', providerKind: 'ollama',
    model: 'qwen2.5:3b', family: 'qwen', displayName: 'Qwen2.5 3B Instruct',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'json-mode', 'function-calling'],
    contextLength: 32768, approxSizeGb: 1.9, fallbackEligible: true, priority: 20,
    notes: 'General assistant. ~2 GB RAM on CPU.',
  },
  {
    id: 'ollama:llama3.2:3b', provider: 'ollama', providerKind: 'ollama',
    model: 'llama3.2:3b', family: 'llama', displayName: 'Llama 3.2 3B',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'],
    contextLength: 131072, approxSizeGb: 2.0, fallbackEligible: true, priority: 30,
    notes: 'Long context on modest hardware. ~2 GB RAM on CPU.',
  },
  {
    id: 'ollama:llama3.2-vision:11b', provider: 'ollama', providerKind: 'ollama',
    model: 'llama3.2-vision:11b', family: 'llama', displayName: 'Llama 3.2 Vision 11B',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'vision'],
    contextLength: 131072, approxSizeGb: 7.9, fallbackEligible: true, priority: 40,
    notes: 'Needs ~8 GB VRAM (GPU) or very slow CPU inference.',
  },
  {
    id: 'ollama:nomic-embed-text', provider: 'ollama', providerKind: 'ollama',
    model: 'nomic-embed-text', family: 'custom', displayName: 'Nomic Embed Text v1.5',
    hostingType: 'local', capabilities: ['embedding'],
    contextLength: 8192, approxSizeGb: 0.3, fallbackEligible: true, priority: 10,
    notes: 'Embeddings for RAG. ~300 MB.',
  },
  {
    id: 'ollama:deepseek-r1:1.5b', provider: 'ollama', providerKind: 'ollama',
    model: 'deepseek-r1:1.5b', family: 'deepseek', displayName: 'DeepSeek R1 Distill 1.5B',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'reasoning'],
    contextLength: 65536, approxSizeGb: 1.1, fallbackEligible: true, priority: 50,
    notes: 'Step-by-step reasoning on CPU. Slower token rate, better explanations.',
  },
  // ── vLLM (GPU, high throughput) ─────────────────────────────────────────
  {
    id: 'vllm:Qwen/Qwen2.5-7B-Instruct', provider: 'vllm', providerKind: 'vllm',
    model: 'Qwen/Qwen2.5-7B-Instruct', family: 'qwen', displayName: 'Qwen2.5 7B Instruct (vLLM)',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'json-mode', 'function-calling', 'long-context'],
    contextLength: 32768, approxSizeGb: 15.2, fallbackEligible: true, priority: 10,
    notes: 'Requires a GPU with >=16 GB VRAM. Served by vLLM with continuous batching.',
  },
  {
    id: 'vllm:Qwen/Qwen2.5-Coder-7B-Instruct', provider: 'vllm', providerKind: 'vllm',
    model: 'Qwen/Qwen2.5-Coder-7B-Instruct', family: 'qwen', displayName: 'Qwen2.5 Coder 7B (vLLM)',
    hostingType: 'local', capabilities: ['chat', 'streaming', 'code', 'long-context'],
    contextLength: 32768, approxSizeGb: 15.2, fallbackEligible: true, priority: 20,
    notes: 'Requires a GPU with >=16 GB VRAM.',
  },
  // ── LiteLLM proxy (routes to anything the operator configures) ──────────
  {
    id: 'litellm:gpt-4o-mini', provider: 'litellm', providerKind: 'litellm',
    model: 'gpt-4o-mini', family: 'custom', displayName: 'LiteLLM → gpt-4o-mini',
    hostingType: 'free-cloud', capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'],
    contextLength: 128000, fallbackEligible: true, priority: 100,
    notes: 'Only selectable when the admin adds a key in LiteLLM and enables free-cloud lanes.',
  },
];

// ─── Provider configuration ────────────────────────────────────────────────

export interface ProviderEndpoint {
  kind: ProviderKind;
  providerName: string;
  baseUrl: string | null;
  enabled: boolean;
  isLocal: boolean;
  priority: number;
  /** Declared per-deployment models, from AIProviderConfig.models JSON. */
  models: Array<{ id?: string; name?: string; capabilities?: string[]; contextLength?: number }>;
}

/**
 * Read the configured providers. The platform uses environment variables for
 * the self-hosted trio (the way a local-first install is actually configured)
 * and `AIProviderConfig` rows for anything added at runtime.
 */
export async function loadProviderEndpoints(): Promise<ProviderEndpoint[]> {
  const endpoints: ProviderEndpoint[] = [];

  const envEndpoint = (kind: ProviderKind, name: string, url: string | undefined, isLocal: boolean, priority: number): ProviderEndpoint | null => {
    if (!url) return null;
    return { kind, providerName: name, baseUrl: url.replace(/\/+$/, ''), enabled: true, isLocal, priority, models: [] };
  };

  const platformLocal = envEndpoint('platform-local', 'platform-local', process.env.ALO_PLATFORM_LOCAL_URL, true,
    Number(process.env.ALO_PLATFORM_LOCAL_PRIORITY ?? 5));
  if (platformLocal) endpoints.push(platformLocal);
  const ollama = envEndpoint('ollama', 'ollama', process.env.OLLAMA_BASE_URL, true, 10);
  if (ollama) endpoints.push(ollama);
  const vllm = envEndpoint('vllm', 'vllm', process.env.VLLM_BASE_URL, true, 20);
  if (vllm) endpoints.push(vllm);
  const litellm = envEndpoint('litellm', 'litellm', process.env.LITELLM_BASE_URL, (process.env.LITELLM_IS_LOCAL ?? 'true') === 'true', 60);
  if (litellm) endpoints.push(litellm);

  const configured = await db.aIProviderConfig.findMany({
    where: { companyId: null, isEnabled: true },
    select: { provider: true, name: true, baseUrl: true, isLocal: true, priority: true, models: true },
    orderBy: { priority: 'asc' },
  });
  for (const row of configured) {
    const kind: ProviderKind | null =
      row.provider === 'ollama' ? 'ollama'
      : row.provider === 'vllm' ? 'vllm'
      : row.provider === 'litellm' ? 'litellm'
      : row.provider === 'openai-compatible' ? 'openai-compatible'
      : null;
    if (!kind || !row.baseUrl) continue;
    let models: ProviderEndpoint['models'] = [];
    try {
      const parsed: unknown = JSON.parse(row.models || '[]');
      if (Array.isArray(parsed)) {
        models = parsed.filter((m): m is { id?: string; name?: string } => typeof m === 'object' && m !== null);
      }
    } catch {
      models = [];
    }
    endpoints.push({ kind, providerName: row.name, baseUrl: row.baseUrl.replace(/\/+$/, ''), enabled: true, isLocal: row.isLocal, priority: row.priority, models });
  }

  return endpoints;
}

// ─── Reachability ──────────────────────────────────────────────────────────

const REACHABILITY_TTL_MS = 20_000;
const reachability = new Map<string, { at: number; ok: boolean; detail?: string }>();

/**
 * Probe a provider's `/models` endpoint.
 *
 * This is what backs "Do not show a feature as available when the required
 * model, GPU, worker or storage is missing." A cached negative result keeps the
 * UI honest without hammering an offline service every poll.
 */
export async function probeProvider(baseUrl: string, kind: ProviderKind, timeoutMs = 2000): Promise<{ ok: boolean; detail?: string }> {
  const cacheKey = `${kind}:${baseUrl}`;
  const cached = reachability.get(cacheKey);
  if (cached && Date.now() - cached.at < REACHABILITY_TTL_MS) return { ok: cached.ok, ...(cached.detail ? { detail: cached.detail } : {}) };

  const path = kind === 'ollama' || kind === 'platform-local' ? '/api/tags' : '/v1/models';
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    const ok = response.ok;
    const detail = ok ? undefined : `HTTP ${response.status}`;
    reachability.set(cacheKey, { at: Date.now(), ok, ...(detail ? { detail } : {}) });
    return { ok, ...(detail ? { detail } : {}) };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 120) : 'unreachable';
    reachability.set(cacheKey, { at: Date.now(), ok: false, detail });
    return { ok: false, detail };
  }
}

/** Forget cached reachability (used by the Super Admin "re-check" action). */
export function invalidateReachability(): void {
  reachability.clear();
}

// ─── Catalogue assembly ────────────────────────────────────────────────────

/** Every deployment the operator could enable, configured or not. */
export function catalogueDeployments(): ModelDeployment[] {
  return [...OPEN_AI_PLATFORM_CATALOG];
}

/**
 * Every deployment, annotated with live availability.
 *
 * This is deliberately one function used by the router, the `/v1/models` API and
 * the UI, so the three can never disagree about whether a model works.
 */
export async function describeAvailability(): Promise<AvailableDeployment[]> {
  const endpoints = await loadProviderEndpoints();
  const byKind = new Map<ProviderKind, ProviderEndpoint[]>();
  for (const endpoint of endpoints) {
    byKind.set(endpoint.kind, [...(byKind.get(endpoint.kind) ?? []), endpoint]);
  }

  // Registry rows the operator registered explicitly (AgentOS ModelRegistry).
  const registered = await db.modelRegistry.findMany({
    where: { status: 'active' },
    select: { modelId: true, name: true, provider: true, maxContext: true, capabilities: true, endpoint: true },
  });

  const deployments: ModelDeployment[] = [...OPEN_AI_PLATFORM_CATALOG];

  // Add runtime-registered models that are not already in the catalogue.
  for (const row of registered) {
    const exists = deployments.some((d) => d.model === row.modelId);
    if (exists) continue;
    let capabilities: ModelCapability[] = ['chat'];
    try {
      const parsed: unknown = JSON.parse(row.capabilities || '[]');
      if (Array.isArray(parsed)) capabilities = parsed.filter((c): c is ModelCapability => typeof c === 'string') as ModelCapability[];
    } catch {
      // keep default
    }
    deployments.push({
      id: `${row.provider}:${row.modelId}`,
      provider: row.provider,
      providerKind: 'openai-compatible',
      model: row.modelId,
      family: 'custom',
      displayName: row.name,
      hostingType: 'local',
      capabilities: capabilities.length ? capabilities : ['chat'],
      contextLength: row.maxContext || 4096,
      fallbackEligible: true,
      priority: 80,
    });
  }

  const results: AvailableDeployment[] = [];
  for (const deployment of deployments) {
    const candidates = byKind.get(deployment.providerKind) ?? [];
    const endpoint = candidates.find((c) => c.providerName === deployment.provider) ?? candidates[0];
    const [health, cooldown, quota] = await Promise.all([
      getHealth(deployment.provider, deployment.model),
      getCooldown(deployment.provider, deployment.model),
      getQuota(deployment.provider, deployment.model),
    ]);

    let reachable = false;
    let blockedReason: string | undefined;
    if (!endpoint?.baseUrl) {
      blockedReason = notConfiguredReason(deployment);
    } else {
      const probe = await probeProvider(endpoint.baseUrl, endpoint.kind).catch(() => ({ ok: false, detail: 'probe failed' }));
      reachable = probe.ok;
      if (!reachable) {
        blockedReason = deployment.providerKind === 'ollama'
          ? `Ollama is not answering at ${endpoint.baseUrl} (${probe.detail ?? 'unreachable'})`
          : deployment.providerKind === 'platform-local'
          ? `The built-in local runtime is not answering at ${endpoint.baseUrl} (${probe.detail ?? 'unreachable'})`
          : `Provider ${deployment.provider} is not answering at ${endpoint.baseUrl} (${probe.detail ?? 'unreachable'})`;
      }
    }

    if (!blockedReason && cooldown.active) {
      blockedReason = `In cooldown until ${new Date(cooldown.until ?? 0).toISOString()}${cooldown.reason ? `: ${cooldown.reason}` : ''}`;
    }
    // Deliberately NOT blocking on `health.status === 'unreachable'`.
    //
    // Health is a record of past outcomes, not a statement about right now. It
    // has no decay timer and no recovery probe: once three consecutive failures
    // marked a deployment unreachable it stayed that way, and because
    // `selectCandidates` drops non-selectable deployments entirely, that
    // deployment was excluded from every future request — permanently, even
    // after the provider came back up. A transient provider outage would
    // therefore silently shrink the fallback chain for good, and a recovered
    // provider would never be tried again.
    //
    // Liveness is decided by the live probe above, which runs on every
    // availability check and reports the endpoint's state right now. Health
    // still orders candidates (success rate, then latency) and still drives
    // alerts; it must not be able to remove a deployment from routing.
    if (!blockedReason && quota?.exhausted) {
      blockedReason = `Local quota window exhausted (${quota.used}/${quota.limit}); resets ${quota.resetAt ? new Date(quota.resetAt).toISOString() : 'later'}`;
    }

    results.push({
      ...deployment,
      // A configured endpoint may override the catalogue's default ordering;
      // that is how an operator pins a specific backend as primary without
      // editing code.
      ...(endpoint ? { priority: endpoint.priority } : {}),
      reachable,
      health,
      cooldown,
      // The CONFIGURED window, copied onto the availability view. Without this
      // the fallback engine's `if (candidate.quota)` guard was always false on
      // this path, so a documented free-tier window was never consumed and the
      // engine would keep routing to a deployment past its limit.
      ...(deployment.quota ? { quota: deployment.quota } : {}),
      liveQuota: quota ? { used: quota.used, limit: quota.limit, exhausted: quota.exhausted, ...(quota.resetAt ? { resetAt: quota.resetAt } : {}) } : null,
      ...(blockedReason ? { blockedReason } : {}),
      selectable: !blockedReason,
    });
  }
  return results;
}

function notConfiguredReason(deployment: ModelDeployment): string {
  switch (deployment.providerKind) {
    case 'platform-local':
      return 'The built-in local runtime is not running (start `node scripts/local-model-runtime.mjs`)';
    case 'ollama':
      return 'Ollama is not configured (set OLLAMA_BASE_URL)';
    case 'vllm':
      return 'vLLM is not configured (set VLLM_BASE_URL)';
    case 'litellm':
      return 'LiteLLM is not configured (set LITELLM_BASE_URL)';
    default:
      return `Provider ${deployment.provider} is not configured`;
  }
}

// ─── Selection ─────────────────────────────────────────────────────────────

const TIER_ORDER: Record<HostingType, number> = { local: 0, 'free-cloud': 1, remote: 2 };

/**
 * Build the ordered candidate chain for a task.
 *
 * Ordering: capability filter → reachability/cooldown filter → local-first tier
 * → explicit priority → health (success rate, then latency) as the tie-break.
 *
 * Nothing here mutates state; the caller walks the list and reports outcomes.
 */
export async function selectCandidates(options: SelectOptions = {}): Promise<AvailableDeployment[]> {
  const available = await describeAvailability();
  const excluded = new Set(options.exclude ?? []);
  const requires = options.requires ?? [];

  const matches = available.filter((deployment) => {
    if (excluded.has(deployment.id)) return false;
    if (requires.length && !requires.every((cap) => deployment.capabilities.includes(cap))) return false;
    if (options.needsContext && deployment.contextLength < options.needsContext) return false;
    if (options.allowRemote === false && deployment.hostingType === 'remote') return false;
    if (options.allowFreeCloud === false && deployment.hostingType === 'free-cloud') return false;
    return true;
  });

  // A caller-pinned model is respected even if it is not selectable, so the
  // error message can say exactly why their choice failed instead of silently
  // switching models.
  if (options.preferredModel) {
    const pinned = matches.find(
      (d) => d.id === options.preferredModel || d.model === options.preferredModel,
    );
    if (pinned) {
      return [pinned, ...matches.filter((d) => d.id !== pinned.id && d.selectable)];
    }
    const configuredButBlocked = available.find((d) => d.id === options.preferredModel || d.model === options.preferredModel);
    if (configuredButBlocked) return [configuredButBlocked];
  }

  const selectable = matches.filter((d) => d.selectable);
  return selectable.sort((a, b) => {
    const tier = TIER_ORDER[a.hostingType] - TIER_ORDER[b.hostingType];
    if (tier !== 0) return tier;
    if (a.priority !== b.priority) return a.priority - b.priority;
    // `health` is optional: a candidate list may be built without probing (a
    // fresh deployment, or a test). An unprobed deployment sorts after a probed
    // one with equal tier and priority rather than throwing.
    const aRate = a.health?.successRate ?? a.health?.successRate ?? 0;
    const bRate = b.health?.successRate ?? 0;
    if (bRate !== aRate) return bRate - aRate;
    return (a.health?.avgLatencyMs ?? Number.MAX_SAFE_INTEGER) - (b.health?.avgLatencyMs ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Pick the best single deployment, or null. */
export async function selectDeployment(options: SelectOptions = {}): Promise<AvailableDeployment | null> {
  const candidates = await selectCandidates(options);
  return candidates.find((c) => c.selectable) ?? candidates[0] ?? null;
}
