/**
 * Public-page research (Phase D).
 *
 * The contract that matters: risky or disallowed pages are refused *before* the
 * fetch, successful analyses carry real evidence (final URL, status, time, hash),
 * and access problems are reported as signals instead of being worked around.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ssrf = vi.hoisted(() => ({ allowed: true, reason: 'private address' }));

vi.mock('@/lib/webhooks/ssrf-guard', () => ({
  // robots.txt is fetched from every host as part of normal discovery; only the
  // page destination is what this test blocks.
  checkSsrf: async (url: string) =>
    url.endsWith('/robots.txt')
      ? { allowed: true }
      : { allowed: ssrf.allowed, ...(ssrf.allowed ? {} : { reason: ssrf.reason }) },
}));

import {
  MAX_RESEARCH_BYTES,
  _resetResearchCacheForTests,
  analyzePublicPage,
  extractPage,
  parseRobotsForPath,
  validateResearchUrl,
} from '@/lib/research/public-page';

const HTML = `<!doctype html>
<html lang="en">
<head>
  <title>ALO Labs — AI operating system</title>
  <meta name="description" content="A governed multi-agent operating system." />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="Next.js" />
  <link rel="canonical" href="/home" />
  <meta name="robots" content="index,follow" />
  <script>var secret = "not page text";</script>
</head>
<body>
  <h1>Build agents that do real work</h1>
  <h2>Governed by policy</h2>
  <h3>Audited</h3>
  <p>We run free-tier models and record evidence.</p>
  <img src="/a.png" alt="Dashboard" />
  <img src="/b.png" />
  <a href="/pricing">Pricing</a>
  <a href="https://example.org/docs">Docs</a>
  <a href="#top">Top</a>
  <form><input /></form>
</body>
</html>`;

type FetchCall = { url: string; redirect?: string };
const calls: FetchCall[] = [];
let pageResponse: () => Response = () => new Response(HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
let robotsResponse: () => Response = () => new Response('', { status: 404 });

beforeEach(() => {
  calls.length = 0;
  ssrf.allowed = true;
  _resetResearchCacheForTests();
  robotsResponse = () => new Response('', { status: 404 });
  pageResponse = () => new Response(HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    calls.push({ url, redirect: init?.redirect });
    if (url.endsWith('/robots.txt')) return robotsResponse();
    return pageResponse();
  });
});

describe('validateResearchUrl', () => {
  it('accepts public http(s) URLs and strips fragments', () => {
    expect(validateResearchUrl('https://alolabs.net/pricing#anchor')).toEqual({ ok: true, url: 'https://alolabs.net/pricing' });
    expect(validateResearchUrl('http://example.com').ok).toBe(true);
  });

  it('rejects non-http schemes, credentials and unusual ports', () => {
    expect(validateResearchUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateResearchUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateResearchUrl('https://user:pass@example.com').ok).toBe(false);
    expect(validateResearchUrl('https://example.com:8080').ok).toBe(false);
    expect(validateResearchUrl('not a url').ok).toBe(false);
  });
});

describe('parseRobotsForPath', () => {
  it('applies the longest matching rule and lets Allow win a tie', () => {
    const robots = ['User-agent: *', 'Disallow: /private', 'Allow: /private/public'].join('\n');
    expect(parseRobotsForPath(robots, '/private/secret').allowed).toBe(false);
    expect(parseRobotsForPath(robots, '/private/public/page').allowed).toBe(true);
    expect(parseRobotsForPath(robots, '/blog').allowed).toBe(true);
  });

  it('supports wildcards and an empty robots.txt means allowed', () => {
    const robots = ['User-agent: *', 'Disallow: /*.pdf$'].join('\n');
    expect(parseRobotsForPath(robots, '/docs/report.pdf').allowed).toBe(false);
    expect(parseRobotsForPath(robots, '/docs/report.html').allowed).toBe(true);
    expect(parseRobotsForPath('', '/anything').allowed).toBe(true);
  });
});

describe('extractPage', () => {
  const page = extractPage(HTML, 'https://alolabs.net');

  it('extracts measured metadata', () => {
    expect(page.title).toBe('ALO Labs — AI operating system');
    expect(page.description).toContain('governed multi-agent');
    expect(page.lang).toBe('en');
    expect(page.canonical).toBe('https://alolabs.net/home');
    expect(page.robotsMeta).toBe('index,follow');
    expect(page.headings.h1).toEqual(['Build agents that do real work']);
    expect(page.images).toEqual({ total: 2, missingAlt: 1 });
    expect(page.links).toMatchObject({ total: 2, internal: 1, external: 1 });
    expect(page.forms).toBe(1);
    expect(page.stack).toContain('Next.js');
    expect(page.textExcerpt).toContain('We run free-tier models');
    expect(page.textExcerpt).not.toContain('not page text');
    expect(page.issues).toContain('1 image(s) without alt text');
  });
});

describe('analyzePublicPage', () => {
  it('obeys robots.txt without fetching the page', async () => {
    robotsResponse = () => new Response('User-agent: *\nDisallow: /', { status: 200 });
    const analysis = await analyzePublicPage('https://alolabs.net/pricing');

    expect(analysis.access.robots).toBe('disallowed');
    expect(analysis.access.restricted).toBe(true);
    expect(analysis.status).toBe(0);
    expect(calls.map((call) => call.url)).toEqual(['https://alolabs.net/robots.txt']);
  });

  it('returns evidence for a readable public page', async () => {
    const analysis = await analyzePublicPage('https://alolabs.net/pricing');

    expect(analysis.status).toBe(200);
    expect(analysis.finalUrl).toBe('https://alolabs.net/pricing');
    expect(analysis.access).toMatchObject({ robots: 'allowed', restricted: false });
    expect(analysis.bytes).toBeGreaterThan(0);
    expect(analysis.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(analysis.citations).toHaveLength(1);
    expect(analysis.citations[0]).toMatchObject({ status: 200, finalUrl: 'https://alolabs.net/pricing' });
    expect(analysis.javascriptRendered).toBe(false);
    expect(calls.every((call) => call.redirect === 'manual')).toBe(true);
  });

  it('re-checks SSRF on redirect and records the final URL', async () => {
    let first = true;
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = input.toString();
      calls.push({ url });
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      if (first) {
        first = false;
        return new Response(null, { status: 302, headers: { location: 'https://www.alolabs.net/' } });
      }
      return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    });

    const analysis = await analyzePublicPage('https://alolabs.net');
    expect(analysis.finalUrl).toBe('https://www.alolabs.net/');
    expect(analysis.status).toBe(200);
  });

  it('reports a 403 as restricted evidence, not as success', async () => {
    pageResponse = () => new Response('<html><body>Access denied</body></html>', { status: 403, headers: { 'content-type': 'text/html' } });
    const analysis = await analyzePublicPage('https://alolabs.net/private');

    expect(analysis.status).toBe(403);
    expect(analysis.access.restricted).toBe(true);
    expect(analysis.access.signals).toContain('http_403_forbidden');
    expect(analysis.citations).toHaveLength(0);
  });

  it('refuses a destination the SSRF guard blocks', async () => {
    ssrf.allowed = false;
    await expect(analyzePublicPage('https://internal.example/admin')).rejects.toThrow(/network safety policy/i);
  });

  it('caps the analysed body', async () => {
    const huge = HTML + `<p>${'x'.repeat(MAX_RESEARCH_BYTES + 10_000)}</p>`;
    pageResponse = () => new Response(huge, { status: 200, headers: { 'content-type': 'text/html' } });
    const analysis = await analyzePublicPage('https://alolabs.net/huge');
    expect(analysis.truncated).toBe(true);
    expect(analysis.bytes).toBeLessThanOrEqual(MAX_RESEARCH_BYTES);
    expect(analysis.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
