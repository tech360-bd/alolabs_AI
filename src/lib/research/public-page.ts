/**
 * Public-page research and verification (Phase D).
 *
 * This is a **public HTTP analysis** capability, not a browser:
 *
 *   - it fetches a URL over HTTP(S) with a fixed identifying user agent;
 *   - it obeys `robots.txt` for our bot before fetching;
 *   - it re-checks every redirect against the SSRF guard (`checkSsrf`);
 *   - it caps time, bytes and content types;
 *   - it never sends credentials, never solves CAPTCHAs, never retries around a
 *     login wall or paywall, and reports those as *signals*, not obstacles to work
 *     around.
 *
 * It cannot execute JavaScript, and therefore cannot verify anything that only
 * exists after client-side rendering. That limitation is stated in the result
 * (`javascriptRendered: false`) rather than hidden.
 *
 * Everything returned is evidence: the exact final URL, HTTP status, byte count,
 * SHA-256 of the body and the fetch time. Inferences (stack hints, suspected
 * CAPTCHA/paywall) are returned separately and labelled as signals.
 */

import { createHash } from 'node:crypto';
import { checkSsrf } from '@/lib/webhooks/ssrf-guard';

export const RESEARCH_USER_AGENT =
  'ALOLabsResearchBot/1.0 (+https://alolabs.net/research-bot; public analysis only)';
export const MAX_RESEARCH_BYTES = 512 * 1024;
export const MAX_RESEARCH_REDIRECTS = 3;
export const RESEARCH_TIMEOUT_MS = 10_000;
export const MAX_RESEARCH_URL_LENGTH = 2_048;

export interface ResearchCitation {
  url: string;
  finalUrl: string;
  title: string;
  status: number;
  fetchedAt: string;
  sha256: string;
  bytes: number;
}

export interface ResearchAccess {
  /** robots.txt verdict for this path. */
  robots: 'allowed' | 'disallowed' | 'unknown';
  /** True when the page could not be read as public content (auth/CAPTCHA/rate limit/unsupported). */
  restricted: boolean;
  /** Heuristic markers. Never treated as permission to bypass anything. */
  signals: string[];
}

export interface ResearchLink {
  href: string;
  text: string;
  external: boolean;
}

export interface PageAnalysis {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  fetchedAt: string;
  bytes: number;
  truncated: boolean;
  sha256: string;
  contentType: string;
  title: string;
  description: string;
  lang: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  links: { total: number; internal: number; external: number; sample: ResearchLink[] };
  images: { total: number; missingAlt: number };
  forms: number;
  scripts: number;
  stack: string[];
  issues: string[];
  textExcerpt: string;
  access: ResearchAccess;
  citations: ResearchCitation[];
  timings: { fetchMs: number; totalMs: number };
  javascriptRendered: false;
}

export interface UrlValidation {
  ok: boolean;
  url?: string;
  reason?: string;
}

/** Validate a URL before any network activity. */
export function validateResearchUrl(input: string): UrlValidation {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, reason: 'url is required' };
  if (raw.length > MAX_RESEARCH_URL_LENGTH) return { ok: false, reason: 'url is too long' };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'url is not a valid absolute URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: `unsupported protocol: ${parsed.protocol}` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'url must not contain credentials' };
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    return { ok: false, reason: 'only ports 80 and 443 are allowed for public analysis' };
  }
  parsed.hash = '';
  return { ok: true, url: parsed.toString() };
}

// ─── robots.txt ──────────────────────────────────────────────────────────────

interface RobotsRule {
  allow: boolean;
  path: string;
}

/**
 * Minimal, conservative robots parser for one path.
 *
 * Rules for the `*` group and for our own agent group apply. The longest matching
 * path wins; `Allow` wins a tie. Wildcards (`*`, `$`) are supported. Anything we
 * cannot parse is ignored, and 5xx/unreachable robots are handled by the caller.
 */
export function parseRobotsForPath(
  robotsTxt: string,
  pathWithQuery: string,
  userAgent = RESEARCH_USER_AGENT,
): { allowed: boolean; rule?: string } {
  const agentToken = userAgent.split('/')[0].toLowerCase();
  const lines = robotsTxt.split(/\r?\n/);
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    }
  }

  const applicable = groups.filter((group) =>
    group.agents.some((agent) => agent === '*' || agent === agentToken || agentToken.startsWith(agent)),
  );
  if (applicable.length === 0) return { allowed: true };

  const matches = applicable.flatMap((group) => group.rules).filter((rule) => {
    const pattern = rule.path
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\\\$$/, '$');
    try {
      return new RegExp(`^${pattern}`).test(pathWithQuery);
    } catch {
      return false;
    }
  });

  if (matches.length === 0) return { allowed: true };

  matches.sort((a, b) => {
    if (b.path.length !== a.path.length) return b.path.length - a.path.length;
    return a.allow === b.allow ? 0 : a.allow ? -1 : 1;
  });
  const winner = matches[0];
  return { allowed: winner.allow, rule: winner.path };
}

const robotsCache = new Map<string, { allowed: boolean; fetchedAt: number; rule?: string }>();
const ROBOTS_TTL_MS = 10 * 60 * 1000;

export function _resetResearchCacheForTests(): void {
  robotsCache.clear();
}

async function robotsAllows(target: URL): Promise<{ allowed: boolean; known: boolean; rule?: string }> {
  const key = target.origin;
  const cached = robotsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
    return { allowed: cached.allowed, known: true, rule: cached.rule };
  }

  const robotsUrl = `${target.origin}/robots.txt`;
  const guard = await checkSsrf(robotsUrl);
  if (!guard.allowed) return { allowed: false, known: true, rule: `ssrf: ${guard.reason}` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(RESEARCH_TIMEOUT_MS, 5_000));
  try {
    const response = await fetch(robotsUrl, {
      headers: { 'user-agent': RESEARCH_USER_AGENT, accept: 'text/plain' },
      redirect: 'manual',
      signal: controller.signal,
    });
    // 404/410 means "no rules published"; that is an allow, not an error.
    if (response.status === 404 || response.status === 410) {
      robotsCache.set(key, { allowed: true, fetchedAt: Date.now() });
      return { allowed: true, known: true };
    }
    // 401/403 (hidden robots) and 429/5xx are conservatively treated as disallow.
    if (!response.ok) {
      const allowed = false;
      robotsCache.set(key, { allowed, fetchedAt: Date.now(), rule: `robots http ${response.status}` });
      return { allowed, known: true, rule: `robots http ${response.status}` };
    }
    const text = (await response.text()).slice(0, 100_000);
    const verdict = parseRobotsForPath(text, `${target.pathname}${target.search}`);
    robotsCache.set(key, { allowed: verdict.allowed, fetchedAt: Date.now(), rule: verdict.rule });
    return { allowed: verdict.allowed, known: true, rule: verdict.rule };
  } catch {
    return { allowed: false, known: false, rule: 'robots.txt unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// ─── HTML extraction ─────────────────────────────────────────────────────────

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) && value > 0 && value < 0x10ffff ? String.fromCodePoint(value) : '';
    });
}

function plainText(fragment: string): string {
  return decodeEntities(
    fragment
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function collect(markup: string, pattern: RegExp, limit = 10): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  while ((match = regex.exec(markup)) !== null && out.length < limit) {
    const value = plainText(match[1] ?? '');
    if (value) out.push(value.slice(0, 200));
  }
  return out;
}

function attribute(tag: string, name: string): string | null {
  const regex = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(regex);
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
}

export interface ExtractedPage {
  title: string;
  description: string;
  lang: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  links: { total: number; internal: number; external: number; sample: ResearchLink[] };
  images: { total: number; missingAlt: number };
  forms: number;
  scripts: number;
  stack: string[];
  issues: string[];
  textExcerpt: string;
  hasViewport: boolean;
}

/** Pure HTML → facts extraction. No network, no JavaScript execution. */
export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const head = html.slice(0, Math.min(html.length, 200_000));
  const base = new URL(baseUrl);

  const title = collect(head, /<title[^>]*>([\s\S]*?)<\/title>/i, 1)[0] ?? '';
  const descriptionTag = head.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i)?.[0] ?? '';
  const description = (descriptionTag ? attribute(descriptionTag, 'content') : '')?.slice(0, 500) ?? '';

  const generator = head.match(/<meta[^>]+name\s*=\s*["']generator["'][^>]*>/i)?.[0] ?? '';
  const generatorValue = generator ? attribute(generator, 'content') : null;

  const langMatch = html.match(/<html[^>]*>/i)?.[0] ?? '';
  const lang = langMatch ? attribute(langMatch, 'lang') : null;

  const canonicalTag = head.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i)?.[0] ?? '';
  const canonicalHref = canonicalTag ? attribute(canonicalTag, 'href') : null;
  let canonical: string | null = null;
  if (canonicalHref) {
    try {
      canonical = new URL(canonicalHref, base).toString();
    } catch {
      canonical = canonicalHref;
    }
  }

  const robotsTag = head.match(/<meta[^>]+name\s*=\s*["']robots["'][^>]*>/i)?.[0] ?? '';
  const robotsMeta = robotsTag ? attribute(robotsTag, 'content') : null;

  const headings = {
    h1: collect(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i, 10),
    h2: collect(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i, 10),
    h3: collect(html, /<h3[^>]*>([\s\S]*?)<\/h3>/i, 10),
  };

  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 500);
  let internal = 0;
  let external = 0;
  const sample: ResearchLink[] = [];
  for (const anchor of anchors) {
    const href = attribute(anchor[1], 'href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    let absolute: URL;
    try {
      absolute = new URL(href, base);
    } catch {
      continue;
    }
    const isExternal = absolute.host !== base.host;
    if (isExternal) external += 1;
    else internal += 1;
    if (sample.length < 8) {
      sample.push({ href: absolute.toString(), text: plainText(anchor[2]).slice(0, 100), external: isExternal });
    }
  }

  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)];
  let missingAlt = 0;
  for (const tag of imageTags) {
    const alt = attribute(tag[0], 'alt');
    if (alt === null || alt.trim() === '') missingAlt += 1;
  }

  const forms = (html.match(/<form\b/gi) ?? []).length;
  const scripts = (html.match(/<script\b/gi) ?? []).length;

  const stack = new Set<string>();
  if (generatorValue) {
    stack.add(`generator: ${generatorValue.slice(0, 80)}`);
    if (/next\.js/i.test(generatorValue)) stack.add('Next.js');
  }
  if (/__NEXT_DATA__/.test(html)) stack.add('Next.js');
  if (/__NUXT__/.test(html)) stack.add('Nuxt');
  if (/wp-content|wp-includes/.test(html)) stack.add('WordPress');
  if (/cdn\.shopify|shopify-section/.test(html)) stack.add('Shopify');
  if (/__NEXT_DATA__|id=["']__next["']/.test(html)) stack.add('React-based');
  if (/csrfmiddlewaretoken/.test(html)) stack.add('Django');
  if (/id=["']app["'][^>]*data-v-/.test(html)) stack.add('Vue');

  const hasViewport = /<meta[^>]+name\s*=\s*["']viewport["']/i.test(head);
  const issues: string[] = [];
  if (!title) issues.push('missing <title>');
  if (!description) issues.push('missing meta description');
  if (!lang) issues.push('missing <html lang>');
  if (headings.h1.length === 0) issues.push('no <h1>');
  if (headings.h1.length > 1) issues.push(`multiple <h1> (${headings.h1.length})`);
  if (missingAlt > 0) issues.push(`${missingAlt} image(s) without alt text`);
  if (!hasViewport) issues.push('missing viewport meta (mobile layout risk)');
  if (robotsMeta && /noindex/i.test(robotsMeta)) issues.push('page is marked noindex');

  return {
    title,
    description,
    lang,
    canonical,
    robotsMeta,
    headings,
    links: { total: internal + external, internal, external, sample },
    images: { total: imageTags.length, missingAlt },
    forms,
    scripts,
    stack: [...stack],
    issues,
    textExcerpt: plainText(html).slice(0, 1_500),
    hasViewport,
  };
}

// ─── Fetch + analyse ─────────────────────────────────────────────────────────

async function readCapped(response: Response): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    const buffer = Buffer.from(text, 'utf-8');
    return {
      text: buffer.subarray(0, MAX_RESEARCH_BYTES).toString('utf-8'),
      bytes: buffer.byteLength,
      truncated: buffer.byteLength > MAX_RESEARCH_BYTES,
    };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESEARCH_BYTES) {
        const remaining = MAX_RESEARCH_BYTES - (total - value.byteLength);
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    if (truncated) await reader.cancel().catch(() => undefined);
  }
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: merged.toString('utf-8'), bytes: Math.min(total, MAX_RESEARCH_BYTES), truncated };
}

function detectedSignals(status: number, html: string): string[] {
  const signals: string[] = [];
  if (status === 401) signals.push('http_401_auth_required');
  if (status === 403) signals.push('http_403_forbidden');
  if (status === 429) signals.push('http_429_rate_limited');
  if (status >= 500) signals.push(`http_${status}_server_error`);
  const lower = html.slice(0, 60_000).toLowerCase();
  if (/captcha|cf-challenge|hcaptcha|recaptcha/.test(lower)) signals.push('captcha_suspected');
  if (/enable javascript|javascript is required/.test(lower)) signals.push('javascript_required_suspected');
  if (/subscribe to continue|paywall|premium content/.test(lower)) signals.push('paywall_suspected');
  if (/sign in to continue|log in to continue/.test(lower)) signals.push('login_wall_suspected');
  return signals;
}

/**
 * Analyse a public page. Never throws for a normal HTTP failure: the failure is
 * part of the returned evidence (`status`, `access.restricted`, `signals`).
 */
export async function analyzePublicPage(
  input: string,
  options: { timeoutMs?: number; skipRobots?: boolean } = {},
): Promise<PageAnalysis> {
  const started = Date.now();
  const validated = validateResearchUrl(input);
  if (!validated.ok || !validated.url) {
    throw new Error(`Invalid research URL: ${validated.reason}`);
  }

  let target = new URL(validated.url);
  const requestedUrl = target.toString();
  const robots = options.skipRobots
    ? { allowed: true, known: true as const }
    : await robotsAllows(target);

  if (!robots.allowed) {
    return {
      requestedUrl,
      finalUrl: target.toString(),
      status: 0,
      fetchedAt: new Date().toISOString(),
      bytes: 0,
      truncated: false,
      sha256: '',
      contentType: '',
      title: '',
      description: '',
      lang: null,
      canonical: null,
      robotsMeta: null,
      headings: { h1: [], h2: [], h3: [] },
      links: { total: 0, internal: 0, external: 0, sample: [] },
      images: { total: 0, missingAlt: 0 },
      forms: 0,
      scripts: 0,
      stack: [],
      issues: ['robots.txt does not permit this path for the research bot'],
      textExcerpt: '',
      access: {
        robots: robots.known ? 'disallowed' : 'unknown',
        restricted: true,
        signals: [robots.rule ? `robots: ${robots.rule}` : 'robots_unavailable'],
      },
      citations: [],
      timings: { fetchMs: 0, totalMs: Date.now() - started },
      javascriptRendered: false,
    };
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? RESEARCH_TIMEOUT_MS, 1_000), 30_000);
  const deadline = Date.now() + timeoutMs;
  let response: Response | null = null;
  let fetchMs = 0;
  let redirects = 0;

  for (;;) {
    const guard = await checkSsrf(target.toString());
    if (!guard.allowed) {
      throw new Error(`Blocked by network safety policy: ${guard.reason ?? 'unsafe destination'}`);
    }

    const controller = new AbortController();
    const remaining = Math.max(500, deadline - Date.now());
    const timer = setTimeout(() => controller.abort(), remaining);
    const hopStart = Date.now();
    try {
      response = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': RESEARCH_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'accept-language': 'en',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      fetchMs += Date.now() - hopStart;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      redirects += 1;
      if (redirects > MAX_RESEARCH_REDIRECTS) {
        throw new Error(`Too many redirects (max ${MAX_RESEARCH_REDIRECTS})`);
      }
      const next = new URL(location, target);
      const nextValidation = validateResearchUrl(next.toString());
      if (!nextValidation.ok || !nextValidation.url) {
        throw new Error(`Redirect to an unsupported destination: ${nextValidation.reason}`);
      }
      target = new URL(nextValidation.url);
      continue;
    }
    break;
  }

  if (!response) throw new Error('No response received');

  const contentType = response.headers.get('content-type') ?? '';
  const isReadable = /text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType);
  const { text, bytes, truncated } = await readCapped(response);
  const signals = detectedSignals(response.status, text);
  const restricted = response.status !== 200 || !isReadable || signals.some((signal) =>
    /auth_required|forbidden|rate_limited|captcha|login_wall|paywall|javascript_required/.test(signal),
  );

  const extracted = isReadable
    ? extractPage(text, target.toString())
    : {
        title: '',
        description: '',
        lang: null,
        canonical: null,
        robotsMeta: null,
        headings: { h1: [], h2: [], h3: [] },
        links: { total: 0, internal: 0, external: 0, sample: [] },
        images: { total: 0, missingAlt: 0 },
        forms: 0,
        scripts: 0,
        stack: [],
        issues: [`unsupported content type: ${contentType || 'unknown'}`],
        textExcerpt: '',
        hasViewport: false,
      };

  const sha256 = createHash('sha256').update(text).digest('hex');
  const fetchedAt = new Date().toISOString();

  return {
    requestedUrl,
    finalUrl: target.toString(),
    status: response.status,
    fetchedAt,
    bytes,
    truncated,
    sha256,
    contentType,
    title: extracted.title,
    description: extracted.description,
    lang: extracted.lang,
    canonical: extracted.canonical,
    robotsMeta: extracted.robotsMeta,
    headings: extracted.headings,
    links: extracted.links,
    images: extracted.images,
    forms: extracted.forms,
    scripts: extracted.scripts,
    stack: extracted.stack,
    issues: extracted.issues,
    textExcerpt: extracted.textExcerpt,
    access: {
      robots: robots.known ? (robots.allowed ? 'allowed' : 'disallowed') : 'unknown',
      restricted,
      signals,
    },
    citations: response.status === 200 && isReadable
      ? [{ url: requestedUrl, finalUrl: target.toString(), title: extracted.title, status: response.status, fetchedAt, sha256, bytes }]
      : [],
    timings: { fetchMs, totalMs: Date.now() - started },
    javascriptRendered: false,
  };
}

/** Compact form for tool output and chat traces (keeps citations intact). */
export function summariseAnalysis(analysis: PageAnalysis) {
  return {
    url: analysis.finalUrl,
    status: analysis.status,
    title: analysis.title,
    description: analysis.description,
    stack: analysis.stack,
    issues: analysis.issues,
    headings: analysis.headings,
    links: { total: analysis.links.total, external: analysis.links.external },
    images: analysis.images,
    access: analysis.access,
    citations: analysis.citations,
    javascriptRendered: analysis.javascriptRendered,
    truncated: analysis.truncated,
    bytes: analysis.bytes,
  };
}
