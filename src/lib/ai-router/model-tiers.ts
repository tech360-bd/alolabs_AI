/**
 * Model tier policy → concrete local model identifiers.
 *
 * The task classifier emits a *tier* (`reasoning`, `balanced`, `fast`, …), not a
 * model. Before this module that tier string was passed to the router as if it
 * were a model id; no provider advertises a model called "reasoning", so the
 * router silently fell back to "best model of whichever provider won the
 * load-balance draw" — including paid providers. Here the tier is resolved to a
 * real model on the local inference gateway (Ollama / vLLM / any
 * OpenAI-compatible proxy), and every id is overridable by environment.
 *
 * Tiering follows the platform specification:
 *   Tier 1 — complex executive/counselling reasoning (72B class)
 *   Tier 2 — departmental workflows, CRM automation (32B class)
 *   Tier 3 — high-speed classification and tagging (1–3B class)
 */

import type { AICapability } from './types';

export type ModelTier = 'reasoning' | 'balanced' | 'fast' | 'coding' | 'vision' | 'embedding';

export const MODEL_TIERS: readonly ModelTier[] = [
  'reasoning',
  'balanced',
  'fast',
  'coding',
  'vision',
  'embedding',
];

/** Which specification tier a policy tier belongs to. */
export type SpecTier = 1 | 2 | 3;

export interface TierModelSpec {
  /** Default model id as served by the local runtime. */
  id: string;
  tier: SpecTier;
  contextLength: number;
  capabilities: AICapability[];
}

export const DEFAULT_TIER_MODELS: Readonly<Record<ModelTier, TierModelSpec>> = {
  reasoning: {
    id: 'qwen2.5:72b-instruct',
    tier: 1,
    contextLength: 32_768,
    capabilities: ['chat', 'streaming', 'reasoning', 'function-calling', 'json-mode'],
  },
  balanced: {
    id: 'qwen2.5:32b-instruct',
    tier: 2,
    contextLength: 32_768,
    capabilities: ['chat', 'streaming', 'function-calling', 'json-mode'],
  },
  fast: {
    id: 'qwen2.5:1.5b-instruct',
    tier: 3,
    contextLength: 32_768,
    capabilities: ['chat', 'streaming', 'json-mode'],
  },
  coding: {
    id: 'qwen2.5-coder:32b-instruct',
    tier: 2,
    contextLength: 32_768,
    capabilities: ['chat', 'streaming', 'code-generation', 'function-calling'],
  },
  vision: {
    id: 'qwen2.5vl:7b',
    tier: 2,
    contextLength: 32_768,
    capabilities: ['chat', 'streaming', 'vision'],
  },
  embedding: {
    id: 'embeddinggemma:300m',
    tier: 3,
    contextLength: 2_048,
    capabilities: ['embedding'],
  },
};

/** Environment variable that overrides each tier's model id. */
export const TIER_ENV_KEYS: Readonly<Record<ModelTier, string>> = {
  reasoning: 'LOCAL_MODEL_REASONING',
  balanced: 'LOCAL_MODEL_BALANCED',
  fast: 'LOCAL_MODEL_FAST',
  coding: 'LOCAL_MODEL_CODING',
  vision: 'LOCAL_MODEL_VISION',
  embedding: 'LOCAL_MODEL_EMBEDDING',
};

/** Provider id used for the OpenAI-compatible local gateway. */
export const LOCAL_GATEWAY_PROVIDER_ID = 'local-gateway';

export function isModelTier(value: string): value is ModelTier {
  return (MODEL_TIERS as readonly string[]).includes(value);
}

/**
 * Concrete model id for a tier. Unknown tiers fall back to `balanced` rather
 * than to whatever provider happens to be cheapest.
 */
export function resolveModelForTier(
  tier: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const resolved: ModelTier = tier && isModelTier(tier) ? tier : 'balanced';
  const override = env[TIER_ENV_KEYS[resolved]]?.trim();
  return override && override.length > 0 ? override : DEFAULT_TIER_MODELS[resolved].id;
}

/** Full descriptor for a tier (id after overrides, plus routing metadata). */
export function tierModelSpec(
  tier: ModelTier,
  env: NodeJS.ProcessEnv = process.env,
): TierModelSpec {
  return { ...DEFAULT_TIER_MODELS[tier], id: resolveModelForTier(tier, env) };
}

/**
 * Static catalogue for the local gateway. Declaring it up front means the
 * router can route by exact model id without a `/models` round-trip, and that
 * an unavailable model produces a clear provider error instead of a silent
 * fallback to a different (possibly paid) provider.
 */
export function gatewayModelCatalog(
  env: NodeJS.ProcessEnv = process.env,
): Array<{
  id: string;
  name: string;
  contextLength: number;
  capabilities: AICapability[];
  costPerMillionTokens: number;
}> {
  return MODEL_TIERS.map((tier) => {
    const spec = tierModelSpec(tier, env);
    return {
      id: spec.id,
      name: `${tier} (tier ${spec.tier})`,
      contextLength: spec.contextLength,
      capabilities: spec.capabilities,
      // Local compute is free at the margin; 0 also wins the router's cost tie-break.
      costPerMillionTokens: 0,
    };
  });
}

function envFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

/** True when a local inference endpoint has been configured. */
export function isLocalInferenceConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LOCAL_INFERENCE_URL?.trim()) return true;
  return envFlag(env.LOCAL_INFERENCE_ENABLED) === true;
}

/** Base URL of the local gateway, always ending in a version prefix. */
export function localGatewayBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.LOCAL_INFERENCE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const port = env.LOCAL_INFERENCE_PORT?.trim() || '20128';
  return `http://localhost:${port}/v1`;
}

/**
 * Local-only routing. Enabled explicitly with `LOCAL_ONLY=true`, or implicitly
 * as soon as a local endpoint is configured (`LOCAL_ONLY=false` opts out).
 *
 * When it is on, the router refuses to select a provider outside the local set,
 * so a task cannot silently bill a commercial API.
 */
export function localOnlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = envFlag(env.LOCAL_ONLY);
  if (explicit !== undefined) return explicit;
  return isLocalInferenceConfigured(env);
}

const BUILT_IN_LOCAL_PROVIDERS = ['ollama', `openai-compatible:${LOCAL_GATEWAY_PROVIDER_ID}`];

/** Extra local provider names, comma-separated, for self-hosted proxies. */
export function localProviderNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.LOCAL_PROVIDER_NAMES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set([...BUILT_IN_LOCAL_PROVIDERS, ...extra])];
}

export function isLocalProviderName(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = name.trim();
  return localProviderNames(env).some(
    (local) => normalized === local || normalized.startsWith(`${local}:`),
  );
}
