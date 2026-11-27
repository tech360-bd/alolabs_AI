/**
 * Command Agent tools — free, no-key external services + tool schemas.
 *
 * Security posture (matches `src/lib/tools`): every service handler talks only to
 * a fixed, allow-listed host and the model supplies *query text* (city, topic,
 * prompt) — never a URL — so there is no SSRF surface. `analyze_public_page` is
 * the one handler that accepts a URL, and it runs the full research policy first
 * (robots.txt, per-hop SSRF checks, byte/time caps, no auth or CAPTCHA bypass).
 * All calls are GET, time-boxed, and size-capped. Internal tenant tools
 * (knowledge, CRM, …) continue to run through `executeTool` and are recorded in
 * ToolRun; these external calls are recorded in the agent trace.
 */

import type { AITool } from '@/lib/ai-router/types';
import { analyzePublicPage, summariseAnalysis } from '@/lib/research/public-page';

const TIMEOUT_MS = 12_000;
const MAX_TEXT = 6_000;
const USER_AGENT = 'ALOLabs-AgentOS/1.0 (command-agent; +https://www.alolabs.net)';

function clamp(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 512_000) throw new Error('Upstream response too large');
  return JSON.parse(text) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ─── get_weather (Open-Meteo — no key) ───────────────────────────────────────

export async function getWeather(args: Record<string, unknown>): Promise<unknown> {
  const city = clamp(args.city, 120);
  if (!city) throw new Error('city is required');
  const geo = asRecord(
    await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`),
  );
  const results = Array.isArray(geo.results) ? geo.results : [];
  const loc = asRecord(results[0]);
  if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    return { city, found: false, message: `No location found for "${city}".` };
  }
  const forecast = asRecord(
    await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto',
    ),
  );
  const current = asRecord(forecast.current);
  const daily = asRecord(forecast.daily);
  return {
    location: `${String(loc.name ?? city)}, ${String(loc.country ?? '')}`.trim(),
    timezone: forecast.timezone ?? null,
    current: {
      temperatureC: current.temperature_2m ?? null,
      feelsLikeC: current.apparent_temperature ?? null,
      humidityPercent: current.relative_humidity_2m ?? null,
      windKmh: current.wind_speed_10m ?? null,
      weatherCode: current.weather_code ?? null,
    },
    next3Days: {
      dates: daily.time ?? [],
      maxC: daily.temperature_2m_max ?? [],
      minC: daily.temperature_2m_min ?? [],
      rainChancePercent: daily.precipitation_probability_max ?? [],
    },
    source: 'Open-Meteo (free, no key)',
  };
}

// ─── wikipedia_summary (no key) ──────────────────────────────────────────────

export async function wikipediaSummary(args: Record<string, unknown>): Promise<unknown> {
  const topic = clamp(args.topic, 200);
  if (!topic) throw new Error('topic is required');
  const data = asRecord(
    await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/\s+/g, '_'))}`),
  );
  const extract = typeof data.extract === 'string' ? data.extract.slice(0, MAX_TEXT) : '';
  if (!extract) return { topic, found: false, message: `No Wikipedia summary found for "${topic}".` };
  const contentUrls = asRecord(data.content_urls);
  const desktop = asRecord(contentUrls.desktop);
  return {
    topic,
    title: data.title ?? topic,
    summary: extract,
    url: typeof desktop.page === 'string' ? desktop.page : null,
    source: 'Wikipedia REST API (free, no key)',
  };
}

// ─── web_search (DuckDuckGo Instant Answers — no key) ───────────────────────

export async function webSearch(args: Record<string, unknown>): Promise<unknown> {
  const query = clamp(args.query, 300);
  if (!query) throw new Error('query is required');

  // Optional upgrade: Tavily (1,000 free credits/month) when a key exists.
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tavilyKey}` },
        body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const data = asRecord((await response.json()) as unknown);
        const results = (Array.isArray(data.results) ? data.results : []).slice(0, 5).map((item) => {
          const row = asRecord(item);
          return { title: row.title ?? '', url: row.url ?? '', snippet: String(row.content ?? '').slice(0, 500) };
        });
        return { query, answer: data.answer ?? null, results, source: 'Tavily (free tier)' };
      }
    } catch {
      // Fall through to the no-key provider.
    }
  }

  const data = asRecord(
    await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`),
  );
  const related = (Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [])
    .map((item) => asRecord(item))
    .filter((row) => typeof row.Text === 'string')
    .slice(0, 5)
    .map((row) => ({ text: String(row.Text).slice(0, 500), url: typeof row.FirstURL === 'string' ? row.FirstURL : null }));
  return {
    query,
    abstract: typeof data.AbstractText === 'string' && data.AbstractText ? data.AbstractText.slice(0, MAX_TEXT) : null,
    abstractUrl: typeof data.AbstractURL === 'string' ? data.AbstractURL : null,
    answer: typeof data.Answer === 'string' && data.Answer ? data.Answer : null,
    related,
    source: 'DuckDuckGo Instant Answers (free, no key)',
    note: related.length === 0 && !data.AbstractText
      ? 'No instant answer for this query. Add a free TAVILY_API_KEY (1,000/mo) for full web search.'
      : undefined,
  };
}

// ─── hackernews_top (no key) ─────────────────────────────────────────────────

export async function hackernewsTop(args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
  const ids = (await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json')) as unknown;
  const top = (Array.isArray(ids) ? ids : []).slice(0, limit) as number[];
  const stories = await Promise.all(
    top.map(async (id) => {
      try {
        const item = asRecord(await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
        return { title: item.title ?? '', url: item.url ?? `https://news.ycombinator.com/item?id=${id}`, score: item.score ?? 0, by: item.by ?? '' };
      } catch {
        return { title: '', url: `https://news.ycombinator.com/item?id=${id}`, score: 0, by: '' };
      }
    }),
  );
  return { stories: stories.filter((s) => s.title), source: 'Hacker News API (free, no key)' };
}

// ─── generate_image (Pollinations — no key) ─────────────────────────────────

export function pollinationsImageUrl(prompt: string, options: { width?: number; height?: number; seed?: number } = {}): string {
  const width = Math.min(2048, Math.max(256, options.width ?? 1024));
  const height = Math.min(2048, Math.max(256, options.height ?? 1024));
  const params = new URLSearchParams({ width: String(width), height: String(height), nologo: 'true', model: 'flux' });
  if (Number.isFinite(options.seed)) params.set('seed', String(Math.floor(options.seed as number)));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 500))}?${params.toString()}`;
}

export async function generateImage(args: Record<string, unknown>): Promise<unknown> {
  const prompt = clamp(args.prompt, 500);
  if (!prompt) throw new Error('prompt is required');
  const url = pollinationsImageUrl(prompt, {
    width: Number(args.width) || 1024,
    height: Number(args.height) || 1024,
    ...(Number.isFinite(Number(args.seed)) && args.seed !== undefined ? { seed: Number(args.seed) } : {}),
  });
  return {
    prompt,
    imageUrl: url,
    markdown: `![${prompt}](${url})`,
    note: 'Image renders on first open (generated on demand). Free via Pollinations.ai — no key.',
    source: 'Pollinations.ai (free, no key)',
  };
}

// ─── current_time (local, no network) ────────────────────────────────────────

export async function currentTime(args: Record<string, unknown>): Promise<unknown> {
  const timezone = clamp(args.timezone, 80) || 'UTC';
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, dateStyle: 'full', timeStyle: 'long',
    }).format(new Date());
    return { timezone, now: formatted, iso: new Date().toISOString() };
  } catch {
    return { timezone: 'UTC', now: new Date().toUTCString(), iso: new Date().toISOString(), note: `Unknown timezone "${timezone}"; returned UTC.` };
  }
}

// ─── Registry + OpenAI schemas ───────────────────────────────────────────────

// ─── stack_register (local knowledge, no network) ────────────────────────────

/**
 * Answer "do we already support X?" from the repository's own stack register.
 *
 * This is the tool that stops an agent (or a human) proposing an integration
 * this codebase already has — the register knows which of 88 upstream links are
 * implemented, in kind, reference-only, or a gap, and which of the 26 adapters
 * covers the system. Pure local data: no network, no tenant context.
 */
export async function stackRegisterLookup(args: Record<string, unknown>): Promise<unknown> {
  const { buildStack, filterStack, ENTRY_ADAPTER, VERDICT_META, VERDICT_ORDER } =
    await import('@/lib/ecosystem/stack');
  const q = clamp(args.query, 120);
  const verdict = typeof args.verdict === 'string' && VERDICT_ORDER.includes(args.verdict as never)
    ? (args.verdict as (typeof VERDICT_ORDER)[number])
    : 'all';
  const pillar = clamp(args.pillar, 40) || 'all';
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 12);

  const report = buildStack();
  const rows = filterStack(report.entries, { q, verdict, pillar });

  return {
    query: { text: q, verdict, pillar },
    stats: report.stats,
    total: rows.length,
    matches: rows.slice(0, limit).map((entry) => ({
      id: entry.id,
      name: entry.id,
      verdict: entry.verdict,
      verdictLabel: VERDICT_META[entry.verdict].label,
      pillar: entry.pillar.label,
      summary: entry.upstream,
      claim: entry.claim,
      ...(entry.gap ? { nextStep: entry.gap } : {}),
      ...(entry.brief ? { steps: entry.brief.steps, risks: entry.brief.risks } : {}),
      ...(ENTRY_ADAPTER[entry.id] ? { adapter: ENTRY_ADAPTER[entry.id] } : {}),
      evidence: entry.evidence.map((item) => item.path),
    })),
    guidance:
      'Use the verdict literally: "implemented" means an adapter or route exists here; "gap" means it does not and the nextStep is the work. Never claim a system is deployed just because it is listed.',
    register: '/site/stack',
  };
}

// ─── browser_verify (network, guarded) ──────────────────────────────────────

/**
 * Independent browser verification for the Command Agent.
 *
 * The agent does not get to assert that a page works: this tool opens it in a
 * headless browser (when one is installed), and returns measured evidence —
 * HTTP status, title, console errors, failed requests, a link audit and whether a
 * screenshot was captured. Destinations are checked by the SSRF policy first.
 *
 * When no browser is installed the tool returns `verdict: 'unavailable'` and the
 * reason. A caller that treats that as a pass is misreading it.
 */
export async function browserVerifyTool(args: Record<string, unknown>): Promise<unknown> {
  const url = clamp(args.url, 2_048);
  if (!url) throw new Error('url is required');
  const { withoutScreenshot, verifyPage } = await import('@/lib/browser/verify');
  const evidence = await verifyPage({
    url,
    captureScreenshot: args.captureScreenshot === true,
    ...(typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : {}),
  });
  return withoutScreenshot(evidence);
}

// ─── github_repository_assess (network, read-only) ──────────────────────────

/**
 * Repository intelligence for the Command Agent.
 *
 * A pasted GitHub link is a request to *inspect* the source, not permission to run
 * it. This tool reads the repository through the GitHub API and returns the
 * structured assessment — licence, activity, install scripts, structure,
 * advisories and the verdict rule — so the agent can report facts instead of a
 * summary it invented.
 */
export async function githubRepositoryAssessTool(args: Record<string, unknown>): Promise<unknown> {
  const repository = clamp(args.repository ?? args.url, 2_048);
  if (!repository) throw new Error('repository is required');
  const { assessRepository } = await import('@/lib/github/assess');
  const { LINK_COVERAGE } = await import('@/lib/link-coverage/registry');
  const knownCapabilities = LINK_COVERAGE.flatMap((entry) => {
    try {
      const segments = new URL(entry.url).pathname.split('/').filter(Boolean);
      const name = (segments[segments.length - 1] ?? '').replace(/\.git$/, '');
      return [name, ...(entry.id ? [entry.id] : [])];
    } catch {
      return [];
    }
  }).filter((name) => name.length >= 3);

  const assessment = await assessRepository(repository, {
    ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
    knownCapabilities,
  });

  return {
    repository: assessment.ref.fullName,
    verdict: assessment.verdict,
    verdictReason: assessment.verdictReason,
    licence: assessment.licence,
    activity: assessment.activity,
    advisories: assessment.advisories,
    findings: assessment.findings,
    unavailable: assessment.unavailable,
    duplication: assessment.duplication,
    guidance:
      'Report the verdict literally. "reject" covers an unreadable, archived, unlicensed or install-time-executing repository; "isolated_evaluation_only" means never run its install or build with credentials. Never describe a repository as safe because it is popular.',
  };
}

export interface CommandTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── analyze_public_page ─────────────────────────────────────────────────────

export async function analyzePublicPageTool(args: Record<string, unknown>): Promise<unknown> {
  const url = clamp(args.url, 2_048);
  if (!url) throw new Error('url is required');
  const analysis = await analyzePublicPage(url);
  return summariseAnalysis(analysis);
}

export const COMMAND_TOOLS: readonly CommandTool[] = [
  {
    name: 'get_weather',
    description: 'Get current weather + 3-day forecast for any city (Open-Meteo, free).',
    parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false },
    run: getWeather,
  },
  {
    name: 'wikipedia_summary',
    description: 'Look up a topic on Wikipedia and return a summary with source URL.',
    parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'], additionalProperties: false },
    run: wikipediaSummary,
  },
  {
    name: 'web_search',
    description: 'Search the web for current facts (Tavily free tier when configured, otherwise DuckDuckGo Instant Answers).',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    run: webSearch,
  },
  {
    name: 'analyze_public_page',
    description: 'Fetch and analyse a PUBLIC web page (HTTP only, obeys robots.txt, no login/CAPTCHA/paywall bypass, no JavaScript execution). Returns measured facts, issues and a citation with status, byte count and SHA-256.',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false },
    run: analyzePublicPageTool,
  },
  {
    name: 'hackernews_top',
    description: 'Get the current top stories from Hacker News (tech news).',
    parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } }, additionalProperties: false },
    run: hackernewsTop,
  },
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt (Pollinations/FLUX, free). Returns an image URL + markdown.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        width: { type: 'integer', minimum: 256, maximum: 2048 },
        height: { type: 'integer', minimum: 256, maximum: 2048 },
        seed: { type: 'integer' },
      },
      required: ['prompt'], additionalProperties: false,
    },
    run: generateImage,
  },
  {
    name: 'stack_register',
    description:
      'Check whether this platform already implements an upstream system (LiteLLM, Temporal, Activepieces, SignuDoc, vLLM, Postman, …). Returns the honest verdict (implemented / in_kind / reference / gap), the matching adapter, the files that prove it and the next step for a gap. Local data; no network.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'System name, capability ("e-signature", "browser"), or URL fragment.' },
        verdict: { type: 'string', enum: ['implemented', 'in_kind', 'reference', 'gap', 'not_applicable'] },
        pillar: { type: 'string', description: 'models | agents | automation | voice | media | ops | research | applied' },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
    run: stackRegisterLookup,
  },
  {
    name: 'github_repository_assess',
    description:
      'Inspect a GitHub repository (owner/repo or URL) through the GitHub API: licence, activity, manifest, install scripts, structure, advisories and a verdict (safe_to_integrate | safe_after_review | isolated_evaluation_only | reject). Read-only; it never clones or executes the repository.',
    parameters: {
      type: 'object',
      properties: { repository: { type: 'string', description: 'URL or owner/repo.' } },
      required: ['repository'],
      additionalProperties: false,
    },
    run: githubRepositoryAssessTool,
  },
  {
    name: 'browser_verify',
    description:
      'Open a URL in an isolated headless browser and return measured evidence: HTTP status, title, console errors, failed requests, a link audit and whether a screenshot was captured. Refuses loopback, private, link-local, CGNAT and cloud-metadata destinations. Returns verdict "unavailable" — never a pass — when no browser is installed.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL.' },
        captureScreenshot: { type: 'boolean' },
        timeoutMs: { type: 'integer', minimum: 2000, maximum: 60000 },
      },
      required: ['url'],
      additionalProperties: false,
    },
    run: browserVerifyTool,
  },
  {
    name: 'current_time',
    description: 'Get the current date/time, optionally in an IANA timezone like Asia/Dhaka.',
    parameters: { type: 'object', properties: { timezone: { type: 'string' } }, additionalProperties: false },
    run: currentTime,
  },
];

const BY_NAME = new Map(COMMAND_TOOLS.map((tool) => [tool.name, tool]));

export function getCommandTool(name: string): CommandTool | undefined {
  return BY_NAME.get(name);
}

export function commandToolSchemas(): AITool[] {
  return COMMAND_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}
