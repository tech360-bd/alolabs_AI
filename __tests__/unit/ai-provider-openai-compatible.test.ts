// @vitest-environment node
/**
 * OpenAI-compatible provider + router integration over real HTTP.
 *
 * A local HTTP server speaks the OpenAI chat-completions protocol so the
 * provider's request/response/streaming/error handling is exercised end to
 * end (no fetch mocks). Egress to external vendors is not available in CI,
 * so this is the strongest possible verification of the transport layer;
 * `POST /api/v1/providers/:id/test` runs the same code against a real vendor.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAICompatibleProvider, openAICompatibleProviderName } from '@/lib/ai-router/openai-compatible-provider';
import { AIRouter } from '@/lib/ai-router/router';
import type { RoutingDecisionRecord } from '@/lib/ai-router/router';
import { AIRouterError } from '@/lib/ai-router/types';
import { useRealFetch } from '../helpers/real-fetch';

interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  body: unknown;
}

const seen: Seen[] = [];
let failNext: { status: number; times: number } | null = null;
let freeOnlyCatalog = false;
let server: http.Server;
let baseUrl = '';
let restoreFetch: () => void = () => undefined;
const API_KEY = 'sk-test-secret-key-000111';

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  restoreFetch = useRealFetch();
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body });

      if (req.headers.authorization !== `Bearer ${API_KEY}`) {
        return json(res, 401, { error: { message: `Incorrect API key provided: ${req.headers.authorization}` } });
      }
      if (req.url?.startsWith('/broken/')) {
        return json(res, 503, { error: { message: 'service unavailable' } });
      }
      if (failNext && failNext.times > 0) {
        failNext.times--;
        return json(res, failNext.status, { error: { message: 'upstream hiccup' } });
      }
      if (req.url === '/v1/models') {
        if (freeOnlyCatalog) {
          return json(res, 200, {
            object: 'list',
            data: [
              { id: 'free-model', pricing: { prompt: '0', completion: '0' } },
              { id: 'paid-model', pricing: { prompt: '0.000001', completion: '0.000002' } },
              { id: 'unknown-price-model' },
            ],
          });
        }
        return json(res, 200, { object: 'list', data: [{ id: 'test-model-a' }, { id: 'test-model-b' }] });
      }
      if (req.url === '/v1/chat/completions') {
        const b = body as { model: string; messages: Array<{ content: string }>; stream?: boolean };
        if (b.stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const chunk = (content: string, finish: string | null) =>
            `data: ${JSON.stringify({ id: 'c1', model: b.model, choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
          res.write(chunk('Hel', null));
          res.write(chunk('lo', null));
          res.write(chunk('', 'stop'));
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        return json(res, 200, {
          id: 'chatcmpl-1',
          model: b.model,
          choices: [{ index: 0, message: { role: 'assistant', content: `echo:${b.messages.at(-1)?.content}` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
        });
      }
      json(res, 404, { error: { message: 'not found' } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  restoreFetch();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen.length = 0;
  failNext = null;
  freeOnlyCatalog = false;
});

describe('OpenAICompatibleProvider over HTTP', () => {
  it('derives unique router names per configured endpoint', () => {
    expect(openAICompatibleProviderName()).toBe('openai-compatible');
    expect(openAICompatibleProviderName('Acme Prod')).toBe('openai-compatible:acme-prod');
  });

  it('discovers models from /models when no catalogue is configured', async () => {
    const provider = new OpenAICompatibleProvider({ id: 'disc', baseUrl, apiKey: API_KEY });
    await provider.initialize();
    expect(provider.initialized).toBe(true);
    expect(provider.supportedModels.map((m) => m.id)).toEqual(['test-model-a', 'test-model-b']);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/v1/models', auth: `Bearer ${API_KEY}` });
  });

  it('free-only mode requires explicit upstream zero pricing and rechecks before every call', async () => {
    freeOnlyCatalog = true;
    const provider = new OpenAICompatibleProvider({
      id: 'free-catalog',
      label: 'Strict free catalog',
      baseUrl,
      apiKey: API_KEY,
      freeOnly: true,
      // A user-entered zero estimate is deliberately ignored in free-only mode.
      models: [{ id: 'manual-zero-model', costPerMillionTokens: 0 }],
    });
    await provider.initialize();

    expect(provider.freeOnly).toBe(true);
    expect(provider.supportedModels.map((model) => model.id)).toEqual(['free-model']);
    expect(provider.supportedModels[0].costPerMillionTokens).toBe(0);

    await expect(provider.chatCompletion({
      model: 'paid-model',
      messages: [{ role: 'user', content: 'must not route' }],
    })).rejects.toThrow(/does not confirm \$0 input and output pricing/);
    expect(seen.some((request) => request.url === '/v1/chat/completions')).toBe(false);

    const response = await provider.chatCompletion({
      model: 'free-model',
      messages: [{ role: 'user', content: 'free route' }],
    });
    expect(response.content).toBe('echo:free route');
    expect(seen.filter((request) => request.url === '/v1/models')).toHaveLength(3);
  });

  it('performs a chat completion with the OpenAI wire format', async () => {
    const provider = new OpenAICompatibleProvider({ id: 'chat', baseUrl, apiKey: API_KEY, models: [{ id: 'test-model-a' }] });
    await provider.initialize();
    const response = await provider.chatCompletion({
      model: 'test-model-a',
      messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'ping' }],
      maxTokens: 16,
      temperature: 0,
    });
    expect(response.content).toBe('echo:ping');
    expect(response.model).toBe('test-model-a');
    expect(response.usage).toEqual({ promptTokens: 7, completionTokens: 3, totalTokens: 10 });
    expect(response.finishReason).toBe('stop');
    expect(seen[0].body).toMatchObject({ model: 'test-model-a', max_tokens: 16, temperature: 0, stream: false });
  });

  it('streams server-sent events into chunks', async () => {
    const provider = new OpenAICompatibleProvider({ id: 'stream', baseUrl, apiKey: API_KEY, models: [{ id: 'test-model-a' }] });
    await provider.initialize();
    const parts: string[] = [];
    let finish: string | undefined;
    for await (const chunk of provider.streamChatCompletion({ model: 'test-model-a', messages: [{ role: 'user', content: 'hi' }] })) {
      parts.push(chunk.content);
      if (chunk.finishReason) finish = chunk.finishReason;
    }
    expect(parts.join('')).toBe('Hello');
    expect(finish).toBe('stop');
  });

  it('reports unauthorized credentials without leaking the key', async () => {
    const provider = new OpenAICompatibleProvider({ id: 'bad', baseUrl, apiKey: 'REDACTED_EXAMPLE_CREDENTIAL', models: [{ id: 'test-model-a' }] });
    await provider.initialize();
    const health = await provider.healthCheck();
    expect(health.isHealthy).toBe(false);
    expect(provider.lastError).toMatch(/unauthorized \(401\)/);

    const err = await provider.chatCompletion({ model: 'test-model-a', messages: [{ role: 'user', content: 'x' }] }).catch((e) => e);
    expect(err).toBeInstanceOf(AIRouterError);
    expect((err as AIRouterError).statusCode).toBe(401);
    expect((err as AIRouterError).retryable).toBe(false);
    expect((err as Error).message).not.toContain('REDACTED_EXAMPLE_CREDENTIAL');
    expect((err as Error).message).toContain('[redacted]');
  });

  it('retries retryable upstream failures and then succeeds', async () => {
    const provider = new OpenAICompatibleProvider({ id: 'retry', baseUrl, apiKey: API_KEY, models: [{ id: 'test-model-a' }] });
    await provider.initialize();
    failNext = { status: 503, times: 2 };
    const response = await provider.chatCompletion({ model: 'test-model-a', messages: [{ role: 'user', content: 'again' }] });
    expect(response.content).toBe('echo:again');
    expect(seen.filter((s) => s.url === '/v1/chat/completions')).toHaveLength(3);
  }, 15_000);
});

describe('AIRouter with configured providers', () => {
  it('records every routing decision and fails over to another provider', async () => {
    const router = new AIRouter();
    const decisions: RoutingDecisionRecord[] = [];
    router.setDecisionRecorder((d) => {
      decisions.push(d);
    });

    const broken = new OpenAICompatibleProvider({
      id: 'broken',
      baseUrl: baseUrl.replace('/v1', '/broken/v1'),
      apiKey: API_KEY,
      models: [{ id: 'test-model-a' }],
    });
    const healthy = new OpenAICompatibleProvider({ id: 'healthy', baseUrl, apiKey: API_KEY, models: [{ id: 'test-model-a', costPerMillionTokens: 2 }] });
    router.registerProvider(broken);
    router.registerProvider(healthy);
    router.setLoadBalanceConfig({ strategy: 'round-robin' });

    const response = await router.chat(
      { model: 'test-model-a', messages: [{ role: 'user', content: 'route me' }] },
      'company-a',
      'agent-1',
      { runId: 'run-1', taskType: 'unit' },
    );
    expect(response.content).toBe('echo:route me');

    expect(decisions).toHaveLength(1);
    const d = decisions[0];
    expect(d.success).toBe(true);
    expect(d.requestedModel).toBe('test-model-a');
    expect(d.companyId).toBe('company-a');
    expect(d.context).toEqual({ runId: 'run-1', taskType: 'unit' });
    expect(d.candidates).toEqual(expect.arrayContaining(['openai-compatible:broken', 'openai-compatible:healthy']));
    if (d.fallbackFrom) {
      expect(d.fallbackFrom).toBe('openai-compatible:broken');
      expect(d.reason).toBe('failover');
      expect(d.selectedProvider).toBe('openai-compatible:healthy');
    } else {
      expect(d.selectedProvider).toBe('openai-compatible:healthy');
    }
    expect(d.promptTokens).toBe(7);
    expect(d.costUsd).toBeCloseTo((10 / 1_000_000) * 2, 12);
  }, 20_000);

  it('never routes one tenant to another tenant\'s provider', async () => {
    const router = new AIRouter();
    const decisions: RoutingDecisionRecord[] = [];
    router.setDecisionRecorder((d) => {
      decisions.push(d);
    });
    const tenantB = new OpenAICompatibleProvider({ id: 'b-only', baseUrl, apiKey: API_KEY, models: [{ id: 'test-model-a' }] });
    router.registerProvider(tenantB, { companyId: 'company-b' });

    await expect(
      router.chat({ model: 'test-model-a', messages: [{ role: 'user', content: 'x' }] }, 'company-a'),
    ).rejects.toThrow(/No providers are available/);
    expect(decisions[0]).toMatchObject({ success: false, errorCode: 'PROVIDER_UNAVAILABLE', selectedProvider: null, companyId: 'company-a' });

    const ok = await router.chat({ model: 'test-model-a', messages: [{ role: 'user', content: 'y' }] }, 'company-b');
    expect(ok.content).toBe('echo:y');
    expect(router.getProviderTenant('openai-compatible:b-only')).toBe('company-b');
  });
});
