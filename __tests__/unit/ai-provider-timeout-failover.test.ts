// @vitest-environment node
/**
 * Provider timeout and failover behaviour, over real HTTP.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `AbortSignal.timeout()` rejects with a DOMException whose name is
 * 'TimeoutError' — NOT an AIRouterError. The router's failover condition was
 *
 *     err instanceof AICircuitOpenError
 *   || err instanceof AIProviderUnavailableError
 *   || (err instanceof AIRouterError && err.retryable)
 *
 * so a hung provider fell through every branch and the request failed outright
 * even though a healthy provider was registered and willing to serve it. For a
 * paid platform whose selling point is provider-independent routing, a slow
 * vendor turning into a hard user-facing error is the exact failure the router
 * exists to absorb.
 *
 * The streaming path was narrower still: it tested only the two custom error
 * classes, so it did not fail over even on a retryable HTTP 503 that the
 * non-streaming path would have retried.
 *
 * A local server with a never-responding route reproduces the hang
 * deterministically; no external egress is required.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAICompatibleProvider } from '@/lib/ai-router/openai-compatible-provider';
import { AIRouter } from '@/lib/ai-router/router';
import type { RoutingDecisionRecord } from '@/lib/ai-router/router';
import { useRealFetch } from '../helpers/real-fetch';

const API_KEY = 'sk-test-secret-key-timeout';
/** Short enough to keep the suite fast, long enough to be unambiguous. */
const TIMEOUT_MS = 200;

let server: http.Server;
let healthyUrl = '';
let hangUrl = '';
let brokenUrl = '';
let restoreFetch: () => void = () => undefined;

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  restoreFetch = useRealFetch();

  server = http.createServer((req, res) => {
    // If the client aborts (which is the whole point of the hang route), tear
    // the socket down so server.close() is not left waiting on it.
    res.on('close', () => {
      if (!res.writableEnded) res.destroy();
    });

    const url = req.url ?? '';
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.headers.authorization !== `Bearer ${API_KEY}`) {
        return json(res, 401, { error: { message: 'bad key' } });
      }

      // Never respond: forces AbortSignal.timeout() to fire.
      if (url.startsWith('/hang/')) return;

      if (url.startsWith('/broken/')) {
        return json(res, 503, { error: { message: 'service unavailable' } });
      }

      const body = raw ? JSON.parse(raw) : undefined;
      if (url === '/v1/chat/completions') {
        const b = body as { model: string; messages: Array<{ content: string }>; stream?: boolean };
        if (b.stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const chunk = (content: string, finish: string | null) =>
            `data: ${JSON.stringify({ id: 'c1', model: b.model, choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
          res.write(chunk('streamed', null));
          res.write(chunk('', 'stop'));
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        return json(res, 200, {
          id: 'chatcmpl-timeout',
          model: b.model,
          choices: [{ index: 0, message: { role: 'assistant', content: `echo:${b.messages.at(-1)?.content}` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        });
      }
      json(res, 404, { error: { message: 'not found' } });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  healthyUrl = `http://127.0.0.1:${port}/v1`;
  hangUrl = `http://127.0.0.1:${port}/hang/v1`;
  brokenUrl = `http://127.0.0.1:${port}/broken/v1`;
});

afterAll(async () => {
  restoreFetch();
  // The hang route leaves sockets open by design; force them closed.
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// Each test constructs its own AIRouter, so circuit-breaker and round-robin
// state never leaks between cases.

const hungProvider = (id = 'hung') =>
  new OpenAICompatibleProvider({
    id,
    baseUrl: hangUrl,
    apiKey: API_KEY,
    models: [{ id: 'model-x' }],
    timeoutMs: TIMEOUT_MS,
  });

const healthyProvider = (id = 'healthy') =>
  new OpenAICompatibleProvider({
    id,
    baseUrl: healthyUrl,
    apiKey: API_KEY,
    models: [{ id: 'model-x' }],
    timeoutMs: 5_000,
  });

const brokenProvider = (id = 'broken') =>
  new OpenAICompatibleProvider({
    id,
    baseUrl: brokenUrl,
    apiKey: API_KEY,
    models: [{ id: 'model-x' }],
    timeoutMs: 5_000,
  });

const request = { model: 'model-x', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('provider timeout', () => {
  it('aborts a hung provider instead of waiting forever', async () => {
    const provider = hungProvider();
    await provider.initialize();

    const started = Date.now();
    const err = await provider.chatCompletion(request).then(
      () => null,
      (e: unknown) => e as Error,
    );
    const elapsed = Date.now() - started;

    expect(err).not.toBeNull();
    expect(err!.name).toBe('TimeoutError');
    // Bounded by the configured timeout, not by the vendor's willingness.
    expect(elapsed).toBeLessThan(TIMEOUT_MS * 3 + 1000);
  }, 15_000);

  it('does not retry a timeout three times (a hang is not a transient blip)', async () => {
    const provider = hungProvider();
    await provider.initialize();
    const started = Date.now();
    await provider.chatCompletion(request).catch(() => undefined);
    // withRetry uses MAX_RETRIES=3; retrying a timeout would triple the wait.
    expect(Date.now() - started).toBeLessThan(TIMEOUT_MS * 3 + 1000);
  }, 15_000);
});

describe('router failover on provider timeout', () => {
  it('serves the request from a healthy provider when another hangs', async () => {
    const router = new AIRouter();
    const decisions: RoutingDecisionRecord[] = [];
    router.setDecisionRecorder((d) => decisions.push(d));
    // isLocal: these providers are loopback test servers; the merged router
    // billing-gates non-local providers unless the caller context allows paid use.
    router.registerProvider(hungProvider(), { isLocal: true });
    router.registerProvider(healthyProvider(), { isLocal: true });
    router.setLoadBalanceConfig({ strategy: 'round-robin' });

    // Round-robin alternates, so across four calls the hung provider is
    // selected first at least once. Every call must still succeed: if timeout
    // does not trigger failover, the call that lands on `hung` throws.
    const contents: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await router.chat({ ...request, messages: [{ role: 'user', content: `m${i}` }] }, 'company-t');
      contents.push(res.content);
    }

    expect(contents).toEqual(['echo:m0', 'echo:m1', 'echo:m2', 'echo:m3']);
    expect(decisions.every((d) => d.success)).toBe(true);
  }, 30_000);

  it('records the timeout as the failover reason', async () => {
    const router = new AIRouter();
    const decisions: RoutingDecisionRecord[] = [];
    router.setDecisionRecorder((d) => decisions.push(d));
    router.registerProvider(hungProvider('hung-2'), { isLocal: true });
    router.registerProvider(healthyProvider('healthy-2'), { isLocal: true });
    router.setLoadBalanceConfig({ strategy: 'round-robin' });

    for (let i = 0; i < 4; i++) {
      await router.chat({ ...request, messages: [{ role: 'user', content: `r${i}` }] }, 'company-t');
    }

    const failovers = decisions.filter((d) => d.fallbackFrom === 'openai-compatible:hung-2');
    expect(failovers.length).toBeGreaterThan(0);
    for (const d of failovers) {
      expect(d.reason).toBe('failover');
      expect(d.success).toBe(true);
      expect(d.errorCode).toBe('TIMEOUT');
      expect(d.selectedProvider).toBe('openai-compatible:healthy-2');
    }
  }, 30_000);

  it('still fails cleanly when every provider hangs', async () => {
    const router = new AIRouter();
    router.registerProvider(hungProvider('hung-a'), { isLocal: true });
    router.registerProvider(hungProvider('hung-b'), { isLocal: true });
    router.setLoadBalanceConfig({ strategy: 'round-robin' });

    await expect(router.chat(request, 'company-t')).rejects.toThrow();
  }, 30_000);
});

describe('streaming failover', () => {
  async function collect(gen: AsyncGenerator<{ content?: string }>): Promise<string> {
    let out = '';
    for await (const chunk of gen) out += chunk.content ?? '';
    return out;
  }

  it('fails over to a healthy provider when the selected one hangs mid-stream', async () => {
    const router = new AIRouter();
    router.registerProvider(hungProvider('shung'), { isLocal: true });
    router.registerProvider(healthyProvider('shealthy'), { isLocal: true });
    router.setLoadBalanceConfig({ strategy: 'round-robin' });

    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await collect(router.streamChat(request, 'company-t')));
    }
    expect(results.every((r) => r === 'streamed')).toBe(true);
  }, 40_000);

  it('fails over on a retryable HTTP 503, matching the non-streaming path', async () => {
    // The streaming catch previously tested only the two custom error classes,
    // so a 503 — which non-streaming treats as retryable — did not fail over.
    const router = new AIRouter();
    router.registerProvider(brokenProvider('sbroken'), { isLocal: true });
    router.registerProvider(healthyProvider('shealthy-2'), { isLocal: true });
    router.setLoadBalanceConfig({ strategy: 'round-robin' });

    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await collect(router.streamChat(request, 'company-t')));
    }
    expect(results.every((r) => r === 'streamed')).toBe(true);
  }, 40_000);
});
