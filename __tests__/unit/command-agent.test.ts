import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_LLM_PROVIDERS,
  FREE_SERVICES,
  catalogStats,
  configuredFromEnvironment,
} from '@/lib/command-agent/free-catalog';
import {
  COMMAND_TOOLS,
  commandToolSchemas,
  getCommandTool,
  getWeather,
  pollinationsImageUrl,
  wikipediaSummary,
} from '@/lib/command-agent/tools';
import { AI_PROVIDER_PRESETS } from '@/lib/ai-provider-catalog';

const chatMock = vi.fn();
vi.mock('@/lib/multi-tenant-ai/service', () => ({
  executeCompanyAIChat: (...args: unknown[]) => chatMock(...args),
  CompanyAIError: class CompanyAIError extends Error {
    constructor(message: string, public status: number, public code: string, public requestId?: string) { super(message); }
  },
}));
vi.mock('@/lib/tools/execute', () => ({
  executeTool: vi.fn(async () => ({ toolName: 'calculate', ok: true, output: '{"result":4}', durationMs: 1 })),
}));
// The real registry imports the Prisma client at module load; keep unit tests DB-free.
vi.mock('@/lib/db', () => ({ db: {} }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Free AI catalogue', () => {
  it('lists free providers with usable Control Plane kinds and $0 positioning', () => {
    const kinds = new Set(AI_PROVIDER_PRESETS.map((p) => p.kind));
    expect(FREE_LLM_PROVIDERS.length).toBeGreaterThanOrEqual(10);
    for (const provider of FREE_LLM_PROVIDERS) {
      expect(kinds.has(provider.providerKind), `${provider.id} kind ${provider.providerKind}`).toBe(true);
      expect(provider.cardRequired).toBe(false);
      expect(provider.getKeyUrl.startsWith('https://')).toBe(true);
      expect(provider.models.length).toBeGreaterThan(0);
      for (const model of provider.models) {
        expect(model.id.length).toBeGreaterThan(0);
        expect(model.capabilities.length).toBeGreaterThan(0);
      }
    }
  });

  it('includes the headline free models and an offline local lane', () => {
    const allIds = FREE_LLM_PROVIDERS.flatMap((p) => p.models.map((m) => m.id));
    expect(allIds).toContain('qwen/qwen3-32b:free');
    expect(allIds).toContain('deepseek/deepseek-chat-v3-0324:free');
    expect(allIds).toContain('llama-3.3-70b-versatile');
    expect(allIds).toContain('qwen3:30b-a3b');
    const ollama = FREE_LLM_PROVIDERS.find((p) => p.id === 'ollama');
    expect(ollama?.local).toBe(true);
    expect(ollama?.apiKeyRequired).toBe(false);
  });

  it('covers embeddings, image, speech and search services', () => {
    const categories = new Set(FREE_SERVICES.map((s) => s.category));
    expect(categories.has('embedding')).toBe(true);
    expect(categories.has('image')).toBe(true);
    expect(categories.has('speech-to-text')).toBe(true);
    expect(categories.has('text-to-speech')).toBe(true);
    expect(categories.has('search')).toBe(true);
    const stats = catalogStats();
    expect(stats.services).toBe(FREE_SERVICES.length);
    expect(stats.models).toBeGreaterThan(40);
  });

  it('reports env configuration as booleans only (never key values)', () => {
    const configured = configuredFromEnvironment({ GROQ_API_KEY: 'secret-value' } as NodeJS.ProcessEnv);
    expect(configured.groq).toBe(true);
    expect(configured.cerebras).toBe(false);
    expect(JSON.stringify(configured)).not.toContain('secret-value');
    expect(configuredFromEnvironment({ OLLAMA_URL: 'http://localhost:11434' } as NodeJS.ProcessEnv).ollama).toBe(true);
  });
});

describe('Command Agent tools', () => {
  it('exposes OpenAI function schemas for every tool', () => {
    const schemas = commandToolSchemas();
    expect(schemas).toHaveLength(COMMAND_TOOLS.length);
    expect(schemas.map((s) => s.function.name)).toEqual(
      expect.arrayContaining(['get_weather', 'wikipedia_summary', 'web_search', 'generate_image', 'current_time']),
    );
    expect(getCommandTool('get_weather')).toBeDefined();
    expect(getCommandTool('rm_rf')).toBeUndefined();
  });

  it('builds a bounded Pollinations image URL from prompt text only', () => {
    const url = pollinationsImageUrl('a cat in Dhaka', { width: 99999, height: 10 });
    expect(url.startsWith('https://image.pollinations.ai/prompt/a%20cat%20in%20Dhaka')).toBe(true);
    expect(url).toContain('width=2048');
    expect(url).toContain('height=256');
  });

  it('fetches weather from fixed Open-Meteo hosts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ name: 'Dhaka', country: 'Bangladesh', latitude: 23.81, longitude: 90.41 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        timezone: 'Asia/Dhaka',
        current: { temperature_2m: 31, apparent_temperature: 36, relative_humidity_2m: 70, wind_speed_10m: 12, weather_code: 2 },
        daily: { time: ['2026-10-24'], temperature_2m_max: [33], temperature_2m_min: [26], precipitation_probability_max: [40] },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = (await getWeather({ city: 'Dhaka' })) as { location: string; current: { temperatureC: number } };
    expect(result.location).toContain('Dhaka');
    expect(result.current.temperatureC).toBe(31);
    const urls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls[0]).toContain('geocoding-api.open-meteo.com');
    expect(urls[1]).toContain('api.open-meteo.com');
  });

  it('requires tool arguments instead of guessing', async () => {
    await expect(getWeather({})).rejects.toThrow('city is required');
    await expect(wikipediaSummary({ topic: '' })).rejects.toThrow('topic is required');
  });

  it('returns a Wikipedia summary with a source URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: 'Mount Fuji',
      extract: 'Mount Fuji is the tallest mountain in Japan.',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Mount_Fuji' } },
    }), { status: 200 })));

    const result = (await wikipediaSummary({ topic: 'Mount Fuji' })) as { summary: string; url: string };
    expect(result.summary).toContain('tallest mountain');
    expect(result.url).toContain('wikipedia.org');
  });
});

describe('Command Agent loop', () => {
  it('runs the tool-calling loop through the company gateway and returns a trace', async () => {
    chatMock
      .mockResolvedValueOnce({
        requestId: 'req_1', provider: 'groq',
        response: {
          id: '1', content: '', model: 'qwen/qwen3-32b',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          finishReason: 'tool-calls', latencyMs: 10,
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'current_time', arguments: '{"timezone":"Asia/Dhaka"}' } }],
        },
      })
      .mockResolvedValueOnce({
        requestId: 'req_2', provider: 'groq',
        response: {
          id: '2', content: 'It is currently afternoon in Dhaka.', model: 'qwen/qwen3-32b',
          usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 },
          finishReason: 'stop', latencyMs: 10,
        },
      });

    const { runCommandAgent } = await import('@/lib/command-agent/agent');
    const result = await runCommandAgent({
      companyId: 'company_1', userId: 'user_1', role: 'super_admin',
      companyName: 'ALO Labs', message: 'What time is it in Dhaka?', sessionId: 'test-session',
    });

    expect(result.content).toContain('Dhaka');
    expect(result.provider).toBe('groq');
    expect(result.model).toBe('qwen/qwen3-32b');
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0].tool).toBe('current_time');
    expect(result.trace[0].ok).toBe(true);
    expect(result.trace[0].output).toContain('Asia/Dhaka');
    expect(result.requestIds).toEqual(['req_1', 'req_2']);
    // The second gateway call must carry the tool result back to the model.
    const secondMessages = (chatMock.mock.calls[1][1] as { messages: Array<{ role: string }> }).messages;
    expect(secondMessages.some((m) => m.role === 'tool')).toBe(true);
    // Tools were offered to the model.
    const firstRequest = chatMock.mock.calls[0][1] as { tools: Array<{ function: { name: string } }> };
    expect(firstRequest.tools.map((t) => t.function.name)).toContain('get_weather');
  });

  it('injects advisory skill guidance and rejects quarantined skills without granting tools', async () => {
    chatMock.mockResolvedValueOnce({
      requestId: 'req_skill', provider: 'groq',
      response: { id: 'skill', content: 'Review guidance ready.', model: 'qwen/qwen3-32b', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', latencyMs: 1 },
    });
    const { runCommandAgent } = await import('@/lib/command-agent/agent');
    const result = await runCommandAgent({
      companyId: 'company_1', userId: 'user_1', role: 'admin', companyName: 'ALO Labs',
      message: 'Review my TypeScript code', sessionId: 'skill-session',
      skillSlugs: ['mattpocock-code-review', 'rea-reverse-engineer-anything'],
    });
    expect(result.skillsUsed.some((skill) => skill.slug === 'mattpocock-code-review')).toBe(true);
    expect(result.skillsRejected.some((skill) => skill.slug === 'rea-reverse-engineer-anything')).toBe(true);
    const firstMessages = (chatMock.mock.calls.at(-1)![1] as { messages: Array<{ role: string; content: string }> }).messages;
    const system = firstMessages.find((message) => message.role === 'system')!.content;
    expect(system).toContain('TASK SKILL GUIDANCE');
    expect(system).toContain('tools granted: none');
    expect(system).not.toContain('Reverse Engineer Anything');
  });

  it('propagates the gateway "configuration required" failure instead of faking an answer', async () => {
    const { CompanyAIError } = await import('@/lib/multi-tenant-ai/service');
    chatMock.mockRejectedValueOnce(new CompanyAIError('Configuration required: no authorised route', 503, 'CONFIGURATION_REQUIRED', 'req_x'));
    const { runCommandAgent } = await import('@/lib/command-agent/agent');
    await expect(runCommandAgent({
      companyId: 'company_1', userId: 'user_1', role: 'admin',
      companyName: 'ALO Labs', message: 'Hello', sessionId: 'test-session-2',
    })).rejects.toThrow('Configuration required');
  });
});
