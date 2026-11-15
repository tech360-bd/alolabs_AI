import { describe, expect, it } from 'vitest';
import {
  FREE_PROVIDER_BASE_URLS,
  FREE_PROVIDER_CATALOGUES,
  FREE_PROVIDER_ENV_MAP,
  cloudflareWorkersAIBaseUrl,
  freeProviderSpecsFromEnvironment,
} from '@/lib/ai-router/free-provider-specs';

const EMPTY_ENV = {} as NodeJS.ProcessEnv;

describe('free provider specs from environment', () => {
  it('returns nothing when no credential is present', () => {
    expect(freeProviderSpecsFromEnvironment(EMPTY_ENV)).toEqual([]);
  });

  it('ignores blank and whitespace-only credentials', () => {
    expect(freeProviderSpecsFromEnvironment({ GEMINI_API_KEY: '', CEREBRAS_API_KEY: '   ' } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('registers every documented free vendor when its key is set', () => {
    const specs = freeProviderSpecsFromEnvironment({
      GEMINI_API_KEY: 'g-key',
      CEREBRAS_API_KEY: 'c-key',
      CLOUDFLARE_API_TOKEN: 'cf-token',
      CLOUDFLARE_ACCOUNT_ID: 'acct123',
      SAMBANOVA_API_KEY: 's-key',
      NVIDIA_API_KEY: 'n-key',
      HF_TOKEN: 'hf-key',
      GITHUB_MODELS_TOKEN: 'gh-key',
    } as NodeJS.ProcessEnv);

    expect(specs.map((spec) => spec.id).sort()).toEqual([
      'cerebras',
      'cloudflare-workers-ai',
      'gemini',
      'github-models',
      'huggingface',
      'nvidia',
      'sambanova',
    ]);
    for (const spec of specs) {
      expect(spec.baseUrl.startsWith('https://')).toBe(true);
      expect(spec.apiKey.length).toBeGreaterThan(0);
      expect(spec.models.length).toBeGreaterThan(0);
      // Secrets are never leaked into the human-readable source field.
      expect(spec.source).not.toContain(spec.apiKey);
    }
  });

  it('requires both Cloudflare values rather than half-registering', () => {
    expect(freeProviderSpecsFromEnvironment({ CLOUDFLARE_API_TOKEN: 'token' } as NodeJS.ProcessEnv)).toEqual([]);
    expect(freeProviderSpecsFromEnvironment({ CLOUDFLARE_ACCOUNT_ID: 'acct' } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('builds the Cloudflare account-scoped base URL and encodes the account id', () => {
    expect(cloudflareWorkersAIBaseUrl('abc123')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1',
    );
    expect(cloudflareWorkersAIBaseUrl('a/b')).not.toContain('/accounts/a/b/');
  });

  it('accepts the HF_TOKEN and HUGGINGFACE_API_KEY aliases, and GITHUB_TOKEN fallback', () => {
    const viaAlias = freeProviderSpecsFromEnvironment({ HUGGINGFACE_API_KEY: 'hf' } as NodeJS.ProcessEnv);
    expect(viaAlias.map((spec) => spec.id)).toEqual(['huggingface']);
    const viaGithubToken = freeProviderSpecsFromEnvironment({ GITHUB_TOKEN: 'gh' } as NodeJS.ProcessEnv);
    expect(viaGithubToken.map((spec) => spec.id)).toEqual(['github-models']);
  });

  it('uses official https endpoints that match the catalogued presets', () => {
    expect(FREE_PROVIDER_BASE_URLS.gemini).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(FREE_PROVIDER_BASE_URLS.cerebras).toBe('https://api.cerebras.ai/v1');
    expect(FREE_PROVIDER_BASE_URLS.sambanova).toBe('https://api.sambanova.ai/v1');
    expect(FREE_PROVIDER_BASE_URLS.nvidia).toBe('https://integrate.api.nvidia.com/v1');
    expect(FREE_PROVIDER_BASE_URLS.huggingface).toBe('https://router.huggingface.co/v1');
  });

  it('ships a non-empty model catalogue for every configurable vendor', () => {
    for (const [vendor, models] of Object.entries(FREE_PROVIDER_CATALOGUES)) {
      expect(models.length, vendor).toBeGreaterThan(0);
      for (const model of models) expect(model.id.length, vendor).toBeGreaterThan(0);
    }
  });

  it('does not claim free-only pricing for quota-metered vendors', () => {
    const specs = freeProviderSpecsFromEnvironment({ GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(specs[0]).not.toHaveProperty('freeOnly', true);
  });

  it('publishes an env map for the admin UI covering all documented keys', () => {
    const envVars = FREE_PROVIDER_ENV_MAP.map((entry) => entry.envVar);
    for (const key of ['GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'CLOUDFLARE_API_TOKEN', 'SAMBANOVA_API_KEY', 'NVIDIA_API_KEY', 'HF_TOKEN', 'GITHUB_MODELS_TOKEN']) {
      expect(envVars).toContain(key);
    }
  });
});
