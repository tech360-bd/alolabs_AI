/**
 * Command Agent tools — free, no-key external services + tool schemas.
 *
 * Security posture (matches `src/lib/tools`): every handler talks to a fixed,
 * allow-listed host. The model can only supply *query text* (city, topic,
 * prompt) — never a URL — so there is no SSRF surface. All calls are GET,
 * time-boxed, and size-capped. Internal tenant tools (knowledge, CRM, …)
 * continue to run through `executeTool` and are recorded in ToolRun; these
 * external calls are recorded in the agent trace returned to the operator.
 */

import type { AITool } from '@/lib/ai-router/types';

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

export interface CommandTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
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
