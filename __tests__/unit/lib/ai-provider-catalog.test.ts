import { describe, expect, it } from 'vitest';
import { isTrustedLocalInferenceEndpoint, isTrustedLocalProviderConfig } from '@/lib/ai-provider-catalog';

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
