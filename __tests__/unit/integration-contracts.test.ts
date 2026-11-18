// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMetricsScrape } from '@/lib/access/metrics-scrape';
import { gaugeLines } from '@/lib/prometheus-text';
import { createLinkState, readLinkState, linkTtlSeconds } from '@/lib/social/link-state';
import { readSocialCredential, storeSocialCredential } from '@/lib/social/credentials';

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('scraper and metric series', () => {
  it('a configured scrape token authorizes only the exact read-only metrics endpoint', () => {
    const value = 'q'.repeat(64), auth = `Bearer ${value}`, path = '/api/metrics/prometheus';
    vi.stubEnv('METRICS_SCRAPE_TOKEN', value);
    expect(isMetricsScrape(path, 'GET', auth)).toBe(true);
    for (const [p, m, a] of [[path, 'PUT', auth], [path + '/other', 'GET', auth], ['/api/workers', 'GET', auth], [path, 'GET', 'Bearer other']] as const) expect(isMetricsScrape(p, m, a)).toBe(false);
    vi.stubEnv('METRICS_SCRAPE_TOKEN', '');
    expect(isMetricsScrape(path, 'GET', 'Bearer ')).toBe(false);
  });
  it('emits one TYPE per family and one newest point per normalized label set in milliseconds', () => {
    const recent = new Date('2026-11-18T12:00:00Z');
    const row = { name: 'queue.depth', value: 2, createdAt: recent, labels: JSON.stringify({ z: 'a|b', a: 'a\nb' }) };
    expect(gaugeLines([row, { ...row, createdAt: new Date(1), labels: JSON.stringify({ a: 'a\nb', z: 'a|b' }) }])).toEqual(['# TYPE queue_depth gauge', `queue_depth{a="a\\nb",z="a|b"} 2 ${recent.getTime()}`]);
  });
});
describe('social credentials and linking', () => {
  it('reads legacy records but writes authenticated ciphertext only', () => {
    vi.stubEnv('ENCRYPTION_KEY', 's'.repeat(40));
    const record = { accessToken: 'private-fixture' }, encrypted = storeSocialCredential(record);
    expect(encrypted).not.toContain(record.accessToken);
    expect(JSON.parse(readSocialCredential(encrypted))).toEqual(record);
    expect(JSON.parse(readSocialCredential(JSON.stringify(record)))).toEqual(record);
    vi.stubEnv('ENCRYPTION_KEY', 'another-key');
    expect(() => readSocialCredential(encrypted)).toThrow();
  });
  it('binds OAuth state to user, provider, browser cookie, challenge and expiry', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 's'.repeat(40));
    vi.useFakeTimers();
    const { state, challenge, cookie } = createLinkState('operator', 'twitter');
    const verifier = readLinkState(cookie, state, 'operator', 'twitter');
    expect(verifier).toBeTruthy();
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update(verifier!).digest('base64url')).toBe(challenge);
    expect(readLinkState(cookie, state, 'other', 'twitter')).toBeNull();
    expect(readLinkState(cookie, state, 'operator', 'facebook')).toBeNull();
    expect(readLinkState(undefined, state, 'operator', 'twitter')).toBeNull();
    expect(readLinkState(cookie, 'old', 'operator', 'twitter')).toBeNull();
    vi.advanceTimersByTime(linkTtlSeconds * 1000 + 1);
    expect(readLinkState(cookie, state, 'operator', 'twitter')).toBeNull();
  });
});
