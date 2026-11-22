// @vitest-environment node
/**
 * SSRF guard regression tests.
 *
 * These lock in the fixes for three bypasses that existed in the guard:
 *  1. the private-IPv4 regex was double-escaped, so `https://10.0.0.1` and
 *     `https://169.254.169.254` were treated as public targets;
 *  2. bracketed IPv6 literals (`[::1]`, `[::ffff:7f00:1]`) were not matched by
 *     the string checks;
 *  3. a trailing dot (`localhost.`) and `0.0.0.0` bypassed the host checks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardedFetch, isAllowedIntegrationUrl } from '@/lib/integrations/types';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS;
});

describe('isAllowedIntegrationUrl', () => {
  it('allows ordinary public HTTPS endpoints', () => {
    for (const url of ['https://crm.example.com', 'https://crm.example.com/api/v1/leads?limit=5', 'https://8.8.8.8/']) {
      expect(isAllowedIntegrationUrl(url).allowed, url).toBe(true);
    }
  });

  it.each([
    'https://127.0.0.1/',
    'https://127.1.2.3:8443/',
    'https://10.0.0.5/',
    'https://192.168.1.10/',
    'https://172.16.0.1/',
    'https://172.31.255.255/',
    'https://169.254.169.254/latest/meta-data/',
    'https://100.64.0.1/',
    'https://0.0.0.0/',
    'https://0/',
    'https://224.0.0.1/',
    'https://239.255.255.250/',
    'https://240.0.0.1/',
    'https://255.255.255.255/',
    'https://localhost/',
    'https://localhost./',
    'https://api.localhost/',
    'https://metadata.google.internal/',
    'https://printer.local/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::]/',
    'https://[fe80::1]/',
  ])('blocks private, loopback or metadata target %s even over HTTPS', (url) => {
    const result = isAllowedIntegrationUrl(url);
    expect(result.allowed, url).toBe(false);
    expect(result.reason).toMatch(/SSRF guard/);
  });

  it('blocks plain HTTP public targets unless the operator explicitly allows insecure targets', () => {
    expect(isAllowedIntegrationUrl('http://crm.example.com').allowed).toBe(false);
    expect(isAllowedIntegrationUrl('http://127.0.0.1:8080', { allowInsecure: true }).allowed).toBe(true);
  });

  it('rejects malformed URLs without throwing', () => {
    const result = isAllowedIntegrationUrl('not-a-url');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid URL');
  });
});

describe('guardedFetch', () => {
  it('never opens a socket for a blocked target', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await expect(guardedFetch('crm.test', 'https://169.254.169.254/latest')).rejects.toThrow(/blocked target/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forces redirect: error even when the caller asks to follow redirects', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await guardedFetch('crm.test', 'https://crm.example.com/api/v1/leads', { redirect: 'follow' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('does not leak the credential into the request URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await guardedFetch('crm.test', 'https://crm.example.com/api/v1/leads', {
      headers: { Authorization: 'Bearer secret-value' },
    });
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://crm.example.com/api/v1/leads');
    expect(calledUrl).not.toContain('secret-value');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-value');
  });
});
