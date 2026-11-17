import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_PRESETS,
  defaultProviderBaseUrl,
  isOfficialProviderDocsUrl,
  isTrustedLocalInferenceEndpoint,
  isTrustedLocalProviderConfig,
  providerPreset,
} from '@/lib/ai-provider-catalog';
import { FREE_PROVIDER_BASE_URLS } from '@/lib/ai-router/free-provider-specs';
import { freeProviderSpecsFromEnvironment } from '@/lib/ai-router/free-provider-specs';

describe('local inference endpoint trust boundary', () => {
  it('accepts loopback and private-network IP targets', () => {
    expect(isTrustedLocalInferenceEndpoint('http://localhost:11434/v1')).toBe(true);
    expect(isTrustedLocalInferenceEndpoint('http://127.0.0.1:8080/v1')).toBe(true);
    expect(isTrustedLocalInferenceEndpoint('http://10.10.0.5:8080/v1')).toBe(true);
    expect(isTrustedLocalInferenceEndpoint('http://[fd00::5]:8080/v1')).toBe(true);
  });

  it('rejects public hosts, link-local metadata targets, and URL credentials', () => {
    expect(isTrustedLocalInferenceEndpoint('https://api.example.com/v1')).toBe(false);
    expect(isTrustedLocalInferenceEndpoint('http://169.254.169.254/latest')).toBe(false);
    expect(isTrustedLocalInferenceEndpoint('http://user:pass@127.0.0.1:8080/v1')).toBe(false);
  });

  it('does not trust a provider kind or custom self-hosted label without a private endpoint', () => {
    expect(isTrustedLocalProviderConfig('ollama', 'https://public.example/v1')).toBe(false);
    expect(isTrustedLocalProviderConfig('custom-self-hosted', 'http://10.1.2.3:8080/v1', true)).toBe(true);
    expect(isTrustedLocalProviderConfig('custom-self-hosted', 'https://public.example/v1', true)).toBe(false);
    expect(isTrustedLocalProviderConfig('openai-compatible', 'http://127.0.0.1:8080/v1')).toBe(true);
    expect(isTrustedLocalProviderConfig('openai-compatible', 'https://public.example/v1', true)).toBe(false);
  });
});

describe('every runtime-supported free provider is configurable in the console', () => {
  /**
   * Regression guard for a real gap: `freeProviderSpecsFromEnvironment()`
   * auto-registers SambaNova and NVIDIA from their env vars, but neither had an
   * AI_PROVIDER_PRESETS entry. `defaultProviderBaseUrl()` therefore returned
   * undefined for a provider the router already handled, so the Super Admin
   * console could not select it even though `.env.example` advertised the key.
   */
  it('resolves a preset and default base URL for every env-driven free provider', () => {
    const env = {
      GEMINI_API_KEY: 'k',
      CEREBRAS_API_KEY: 'k',
      CLOUDFLARE_API_TOKEN: 'k',
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      SAMBANOVA_API_KEY: 'k',
      NVIDIA_API_KEY: 'k',
      HF_TOKEN: 'k',
      GITHUB_MODELS_TOKEN: 'k',
    };

    const specs = freeProviderSpecsFromEnvironment(env);
    // gemini, cerebras, cloudflare-workers-ai, sambanova, nvidia, huggingface,
    // github-models — one per credential pair documented in .env.example.
    expect(specs.map((s) => s.id).sort()).toEqual([
      'cerebras',
      'cloudflare-workers-ai',
      'gemini',
      'github-models',
      'huggingface',
      'nvidia',
      'sambanova',
    ]);

    for (const spec of specs) {
      expect(providerPreset(spec.id), `${spec.id} needs an AI_PROVIDER_PRESETS entry`).toBeDefined();
      // Cloudflare embeds the account id in the path, so only the host is fixed.
      if (spec.id !== 'cloudflare-workers-ai') {
        expect(defaultProviderBaseUrl(spec.id), `${spec.id} needs a default base URL`).toBe(spec.baseUrl);
      }
    }
  });

  it('keeps SambaNova and NVIDIA base URLs in sync with the router spec table', () => {
    expect(defaultProviderBaseUrl('sambanova')).toBe(FREE_PROVIDER_BASE_URLS.sambanova);
    expect(defaultProviderBaseUrl('nvidia')).toBe(FREE_PROVIDER_BASE_URLS.nvidia);
  });

  it('only accepts official documentation hosts for the newly added presets', () => {
    for (const preset of AI_PROVIDER_PRESETS) {
      if (!preset.docsUrl) continue;
      expect(
        isOfficialProviderDocsUrl(preset.kind, preset.docsUrl),
        `${preset.kind} has a docs URL that its own host allowlist rejects`,
      ).toBe(true);
    }
    expect(isOfficialProviderDocsUrl('nvidia', 'https://evil.example.com/nim')).toBe(false);
    expect(isOfficialProviderDocsUrl('sambanova', 'https://sambanova.ai.evil.test/docs')).toBe(false);
  });
});
