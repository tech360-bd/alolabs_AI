import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIER_MODELS,
  MODEL_TIERS,
  TIER_ENV_KEYS,
  gatewayModelCatalog,
  isLocalInferenceConfigured,
  isLocalProviderName,
  localGatewayBaseUrl,
  localOnlyEnabled,
  resolveModelForTier,
  tierModelSpec,
} from '@/lib/ai-router/model-tiers';

/** ProcessEnv-shaped object; tests never read the real environment. */
const env = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ ...overrides }) as NodeJS.ProcessEnv;

describe('tier → model resolution', () => {
  it('maps every policy tier to a concrete model with no environment set', () => {
    for (const tier of MODEL_TIERS) {
      expect(resolveModelForTier(tier, env())).toBe(DEFAULT_TIER_MODELS[tier].id);
      expect(resolveModelForTier(tier, env()).length).toBeGreaterThan(0);
    }
  });

  it('follows the specification tiers: 72B reasoning, 32B departmental, 1–3B speed', () => {
    expect(DEFAULT_TIER_MODELS.reasoning.tier).toBe(1);
    expect(DEFAULT_TIER_MODELS.reasoning.id).toContain('72b');
    expect(DEFAULT_TIER_MODELS.balanced.tier).toBe(2);
    expect(DEFAULT_TIER_MODELS.balanced.id).toContain('32b');
    expect(DEFAULT_TIER_MODELS.fast.tier).toBe(3);
    expect(DEFAULT_TIER_MODELS.coding.id).toContain('coder');
    expect(DEFAULT_TIER_MODELS.embedding.capabilities).toContain('embedding');
  });

  it('lets an operator override any tier through its environment variable', () => {
    for (const tier of MODEL_TIERS) {
      const key = TIER_ENV_KEYS[tier];
      expect(resolveModelForTier(tier, env({ [key]: 'custom-model:q4' }))).toBe('custom-model:q4');
    }
  });

  it('ignores blank overrides instead of routing to an empty model id', () => {
    expect(resolveModelForTier('reasoning', env({ LOCAL_MODEL_REASONING: '   ' }))).toBe(
      DEFAULT_TIER_MODELS.reasoning.id,
    );
  });

  it('falls back to the balanced tier for unknown tier names', () => {
    expect(resolveModelForTier('turbo-ultra', env())).toBe(DEFAULT_TIER_MODELS.balanced.id);
    expect(resolveModelForTier(undefined, env())).toBe(DEFAULT_TIER_MODELS.balanced.id);
  });

  it('reports overridden ids through the catalog the gateway advertises', () => {
    const catalog = gatewayModelCatalog(env({ LOCAL_MODEL_FAST: 'tiny:1b' }));
    expect(catalog).toHaveLength(MODEL_TIERS.length);
    expect(catalog.map((m) => m.id)).toContain('tiny:1b');
    expect(catalog.every((m) => m.costPerMillionTokens === 0)).toBe(true);
    expect(catalog.find((m) => m.id === 'tiny:1b')?.capabilities).toContain('chat');
  });

  it('keeps tier metadata alongside the resolved id', () => {
    const spec = tierModelSpec('coding', env({ LOCAL_MODEL_CODING: 'qwen2.5-coder:7b' }));
    expect(spec.id).toBe('qwen2.5-coder:7b');
    expect(spec.tier).toBe(2);
    expect(spec.capabilities).toContain('code-generation');
  });
});

describe('local inference configuration', () => {
  it('is not configured by default', () => {
    expect(isLocalInferenceConfigured(env())).toBe(false);
    expect(localOnlyEnabled(env())).toBe(false);
  });

  it('defaults the gateway to the local proxy port when only enabled by flag', () => {
    expect(localGatewayBaseUrl(env({ LOCAL_INFERENCE_ENABLED: 'true' }))).toBe(
      'http://localhost:20128/v1',
    );
    expect(isLocalInferenceConfigured(env({ LOCAL_INFERENCE_ENABLED: 'true' }))).toBe(true);
  });

  it('normalises an explicit URL and honours a custom port', () => {
    expect(localGatewayBaseUrl(env({ LOCAL_INFERENCE_URL: 'http://10.0.0.5:8000/v1/' }))).toBe(
      'http://10.0.0.5:8000/v1',
    );
    expect(localGatewayBaseUrl(env({ LOCAL_INFERENCE_PORT: '20129' }))).toBe(
      'http://localhost:20129/v1',
    );
  });

  it('enables local-only routing implicitly, and lets LOCAL_ONLY override it', () => {
    expect(localOnlyEnabled(env({ LOCAL_INFERENCE_URL: 'http://localhost:20128/v1' }))).toBe(true);
    expect(
      localOnlyEnabled(env({ LOCAL_INFERENCE_URL: 'http://localhost:20128/v1', LOCAL_ONLY: 'false' })),
    ).toBe(false);
    expect(localOnlyEnabled(env({ LOCAL_ONLY: 'true' }))).toBe(true);
  });

  it('classifies local providers without matching paid ones', () => {
    expect(isLocalProviderName('ollama', env())).toBe(true);
    expect(isLocalProviderName('openai-compatible:local-gateway', env({ LOCAL_INFERENCE_ENABLED: 'true' }))).toBe(true);
    expect(isLocalProviderName('qwen', env())).toBe(false);
    expect(isLocalProviderName('openrouter', env())).toBe(false);
    expect(isLocalProviderName('openai-compatible:default', env())).toBe(false);
  });

  it('accepts extra local provider names for self-hosted proxies', () => {
    const custom = env({ LOCAL_INFERENCE_URL: 'http://127.0.0.1:20128/v1', LOCAL_PROVIDER_NAMES: 'litellm, my-vllm' });
    expect(isLocalProviderName('litellm', custom)).toBe(true);
    expect(isLocalProviderName('my-vllm', custom)).toBe(true);
    expect(isLocalProviderName('groq', custom)).toBe(false);
  });
});
