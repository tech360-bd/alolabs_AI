// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_POLICY,
  assertNavigableUrl,
  isNavigable,
  parseIpv4,
  resolveAndGuardLink,
} from '@/lib/browser/navigation-guard';

/**
 * The browser tool makes outbound requests from inside the infrastructure, so
 * this policy is the SSRF boundary. The matrix below is the part of the guard
 * that must never regress: loopback, private, link-local, CGNAT, cloud metadata,
 * and the encodings browsers accept but string comparisons do not.
 */

describe('assertNavigableUrl — allowed', () => {
  it('accepts ordinary public URLs', () => {
    for (const url of [
      'https://www.alolabs.net/site/stack',
      'https://github.com/tech360-bd/alolabs_AI',
      'http://example.com/',
      'https://sub.domain.co.uk/path?query=1#hash',
    ]) {
      const decision = assertNavigableUrl(url);
      expect(decision.ok, url).toBe(true);
    }
  });

  it('normalises the URL it returns', () => {
    const decision = assertNavigableUrl('  https://Example.COM/Path  ');
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.hostname).toBe('example.com');
      expect(decision.url).toBe('https://example.com/Path');
    }
  });

  it('honours an operator allow-list entry for an otherwise blocked host', () => {
    const decision = assertNavigableUrl('http://127.0.0.1:3117/site/stack', {
      allowPrivateNetworks: false,
      allowedHosts: ['127.0.0.1'],
    });
    expect(decision.ok).toBe(true);
  });
});

describe('assertNavigableUrl — refused', () => {
  const refused: [string, string][] = [
    ['not a url', 'invalid_url'],
    ['ftp://example.com/file', 'unsupported_scheme'],
    ['file:///etc/passwd', 'unsupported_scheme'],
    ['javascript:alert(1)', 'unsupported_scheme'],
    ['data:text/html,<script>alert(1)</script>', 'unsupported_scheme'],
    ['https://user:pass@example.com/', 'credentials_in_url'],
    ['http://127.0.0.1/', 'private_network'],
    ['http://127.0.0.1:6379/', 'private_network'],
    ['http://localhost/', 'blocked_host'],
    ['http://localhost./', 'blocked_host'],
    ['http://LOCALHOST/admin', 'blocked_host'],
    ['http://0.0.0.0/', 'private_network'],
    ['http://10.1.2.3/', 'private_network'],
    ['http://172.16.0.1/', 'private_network'],
    ['http://172.31.255.255/', 'private_network'],
    ['http://192.168.1.1/', 'private_network'],
    ['http://169.254.169.254/latest/meta-data/', 'cloud_metadata'],
    ['http://100.64.0.1/', 'private_network'],
    ['http://[::1]/', 'private_network'],
    ['http://[::ffff:127.0.0.1]/', 'private_network'],
    ['http://[fe80::1]/', 'private_network'],
    ['http://[fd00::1]/', 'private_network'],
    ['http://2130706433/', 'private_network'],
    ['http://0x7f000001/', 'private_network'],
    ['http://0177.0.0.1/', 'private_network'],
    ['http://metadata.google.internal/computeMetadata/v1/', 'cloud_metadata'],
    ['http://metadata/', 'cloud_metadata'],
    ['http://redis.internal:6379/', 'blocked_host'],
    ['http://db.local/', 'blocked_host'],
    ['http://svc.cluster.local/', 'blocked_host'],
  ];

  for (const [url, code] of refused) {
    it(`refuses ${url} as ${code}`, () => {
      const decision = assertNavigableUrl(url);
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        expect(decision.code).toBe(code);
        expect(decision.reason.length).toBeGreaterThan(10);
      }
    });
  }

  it('refuses an empty or over-long URL', () => {
    expect(assertNavigableUrl('').ok).toBe(false);
    expect(assertNavigableUrl(`https://example.com/${'a'.repeat(3_000)}`).ok).toBe(false);
  });

  it('refuses an operator-blocked host', () => {
    const decision = assertNavigableUrl('https://example.com/', {
      allowPrivateNetworks: false,
      blockedHosts: ['example.com'],
    });
    expect(decision.ok).toBe(false);
  });
});

describe('parseIpv4', () => {
  it('decodes the encodings a browser accepts', () => {
    expect(parseIpv4('127.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('2130706433')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('0x7f000001')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('0x7f.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('127.1')).toEqual([127, 0, 0, 1]);
    expect(parseIpv4('0177.0.0.1')).toEqual([127, 0, 0, 1]);
  });

  it('returns null for hostnames and malformed literals', () => {
    expect(parseIpv4('example.com')).toBeNull();
    expect(parseIpv4('192.168.1')).toEqual([192, 168, 0, 1]);
    expect(parseIpv4('256.0.0.1')).toBeNull();
    expect(parseIpv4('1.2.3.4.5')).toBeNull();
  });
});

describe('link auditing', () => {
  it('resolves relative links against the page before guarding them', () => {
    const safe = resolveAndGuardLink('https://example.com/a/b', '../c');
    expect(safe.href).toBe('https://example.com/c');
    expect(safe.decision.ok).toBe(true);

    const blocked = resolveAndGuardLink('https://example.com/', 'http://127.0.0.1/secret');
    expect(blocked.decision.ok).toBe(false);
  });

  it('refuses javascript: hrefs without throwing', () => {
    const decision = resolveAndGuardLink('https://example.com/', 'javascript:alert(1)');
    expect(decision.decision.ok).toBe(false);
  });

  it('exposes a boolean predicate', () => {
    expect(isNavigable('https://example.com')).toBe(true);
    expect(isNavigable('http://10.0.0.1')).toBe(false);
    expect(isNavigable('http://10.0.0.1', { allowPrivateNetworks: true })).toBe(true);
    expect(DEFAULT_BROWSER_POLICY.allowPrivateNetworks).toBe(false);
  });
});
