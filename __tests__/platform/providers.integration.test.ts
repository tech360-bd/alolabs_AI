// @vitest-environment node
/**
 * Provider adapter integration test — real sockets, no mocks.
 *
 * These tests start `scripts/local-model-runtime.mjs` on an ephemeral port and
 * drive the production adapter (`completeWithProvider`) and the full fallback
 * engine against it over HTTP. What this proves that a mocked unit test cannot:
 *
 *   · the request body the adapter actually puts on the wire is understood by a
 *     server implementing the Ollama and OpenAI-compatible protocols
 *   · tokens, model name and provider come back from a real response body
 *   · an HTTP 429 with `Retry-After` is classified from the *real* status and
 *     header, not from a constructed Error
 *   · the chain genuinely recovers through a second live deployment
 *   · embeddings round-trip and are normalised
 *
 * If the runtime cannot start (no node, sandbox restriction) the suite skips
 * with a visible reason rather than silently passing.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { useRealFetch } from '../helpers/real-fetch';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeScript = path.join(repoRoot, 'scripts/local-model-runtime.mjs');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('could not allocate a port')));
      }
    });
  });
}

async function waitForHealth(port: number, timeoutMs = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

/** Diagnostic helper: describe exactly why the probe is failing. */
async function diagnose(port: number): Promise<string> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    return `status=${response.status}`;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    return `fetch failed: ${(error as Error).message}${cause ? ` / ${cause.code ?? cause.message}` : ''}`;
  }
}

const children: ChildProcess[] = [];
let healthyPort = 0;
let faultingPort = 0;
let runtimeAvailable = false;

async function startRuntime(env: Record<string, string> = {}): Promise<number> {
  const port = await freePort();
  const child = spawn(process.execPath, [runtimeScript, '--port', String(port)], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...env },
    stdio: 'ignore',
  });
  children.push(child);
  const up = await waitForHealth(port);
  if (!up) throw new Error(`runtime on ${port} did not become healthy (${await diagnose(port)})`);
  return port;
}

// Startup happens at module scope, not in `beforeAll`: `describe.skipIf()` is
// evaluated when the suite is *collected*, which is before any hook runs, so a
// flag set in `beforeAll` would always be false and the suite would silently
// skip forever.
const restoreForStartup = useRealFetch();
try {
  healthyPort = await startRuntime();
  // A second instance that answers every chat request with 429 + Retry-After.
  faultingPort = await startRuntime({ ALO_RUNTIME_FAIL_MODE: '429', ALO_RUNTIME_RETRY_AFTER: '3' });
  runtimeAvailable = true;
} catch (error) {
  console.error('[providers.integration] local runtime unavailable, skipping suite:', (error as Error).message);
  runtimeAvailable = false;
} finally {
  restoreForStartup();
}

afterAll(() => {
  for (const child of children) {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
});

describe.skipIf(!runtimeAvailable)('provider adapters over real HTTP', () => {
  // The shared test setup replaces global fetch with a stub returning `{}` — the
  // whole point of this file is to prove the adapters work over a real socket,
  // so every case swaps the real implementation back in.
  let restoreFetch: () => void;
  beforeEach(() => {
    restoreFetch = useRealFetch();
  });
  afterEach(() => {
    restoreFetch();
  });

  it('completes a chat turn against the Ollama protocol and reports real token counts', async () => {
    process.env.ALO_PLATFORM_LOCAL_URL = `http://127.0.0.1:${healthyPort}`;
    const { completeWithProvider } = await import('@/lib/platform/providers');

    const deployment = {
      id: 'platform-local:alo-local-tiny', provider: 'platform-local', providerKind: 'platform-local' as const,
      model: 'alo-local-tiny', family: 'markov', displayName: 'Local', hostingType: 'local' as const,
      capabilities: ['chat' as const], contextLength: 4096, approxSizeGb: 0.02,
      fallbackEligible: true, priority: 5, selectable: true, reachable: true,
    };

    const result = await completeWithProvider(deployment, {
      messages: [{ role: 'user', content: 'Explain how the fallback chain works.' }],
      maxTokens: 40,
      temperature: 0,
    });

    expect(result.content.length).toBeGreaterThan(20);
    expect(result.model).toBe('alo-local-tiny');
    expect(result.provider).toBe('platform-local');
    expect(result.hostingType).toBe('local');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBe(result.usage.promptTokens + result.usage.completionTokens);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('surfaces a real 429 with its status so the classifier can act on it', async () => {
    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${faultingPort}`;
    const { completeWithProvider } = await import('@/lib/platform/providers');
    const { classifyProviderError } = await import('@/lib/platform/error-classifier');

    const deployment = {
      id: 'ollama:fault', provider: 'ollama', providerKind: 'ollama' as const,
      model: 'alo-local-tiny', family: 'markov', displayName: 'Fault', hostingType: 'local' as const,
      capabilities: ['chat' as const], contextLength: 4096, approxSizeGb: 0.02,
      fallbackEligible: true, priority: 10, selectable: true, reachable: true,
    };

    let caught: unknown;
    try {
      await completeWithProvider(deployment, { messages: [{ role: 'user', content: 'hello' }], maxTokens: 8 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    const classified = classifyProviderError(caught, 'ollama');
    expect(classified.class).toBe('rate_limit');
    expect(classified.httpStatus).toBe(429);
    // The server sent Retry-After: 3, and the adapter must have kept it.
    expect(classified.retryAfterMs).toBe(3000);
    expect(classified.coolDownMs).toBeGreaterThanOrEqual(3000);
  }, 20_000);

  it('recovers through a second live deployment in the real fallback chain', async () => {
    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${faultingPort}`;
    process.env.ALO_PLATFORM_LOCAL_URL = `http://127.0.0.1:${healthyPort}`;
    process.env.ALO_PLATFORM_LOCAL_PRIORITY = '50';

    const { runWithFallback } = await import('@/lib/platform/fallback-engine');
    const { completeWithProvider } = await import('@/lib/platform/providers');
    const { clearCooldown } = await import('@/lib/platform/routing-state');

    // The previous case deliberately produced a real 429 with Retry-After: 3,
    // which correctly set a cooldown in shared routing state. Clear it: this
    // test is about the *chain*, not about cooldown persistence (which has its
    // own case in the engine suite). Without this, the faulting provider would
    // be skipped and there would be no 429 attempt to assert on.
    for (const provider of ['ollama', 'platform-local']) {
      await clearCooldown(provider, 'alo-local-tiny');
    }

    const outcome = await runWithFallback(
      { messages: [{ role: 'user', content: 'Which model answers this request?' }], maxTokens: 24, temperature: 0 },
      completeWithProvider,
      { requires: ['chat'], maxAttemptsPerDeployment: 1 },
    );

    // Include the chain in the failure message. This assertion failed in CI and
    // not locally, and without the attempt list there is nothing to reason from:
    // every candidate is either a real HTTP attempt or a documented skip.
    expect(
      outcome.ok,
      `chain did not recover: ${JSON.stringify({
        ok: outcome.ok,
        usedFallback: outcome.usedFallback,
        error: outcome.error,
        attempts: outcome.attempts.map((a) => ({
          id: a.deploymentId,
          provider: a.provider,
          model: a.model,
          ok: a.ok,
          errorClass: a.errorClass,
          httpStatus: a.httpStatus,
          latencyMs: a.latencyMs,
          message: a.message?.slice(0, 200),
        })),
      })}`,
    ).toBe(true);
    expect(outcome.usedFallback).toBe(true);
    // The faulting provider must appear first and fail with a real 429...
    const failed = outcome.attempts.filter((a) => !a.ok && a.errorClass === 'rate_limit');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]?.httpStatus).toBe(429);
    // ...and the request must still be served, by a real model.
    expect(outcome.result?.model).toBe('alo-local-tiny');
    expect(outcome.result?.provider).toBe('platform-local');
    expect(outcome.result?.content.length).toBeGreaterThan(10);
  }, 30_000);

  it('returns real normalised embeddings', async () => {
    process.env.ALO_PLATFORM_LOCAL_URL = `http://127.0.0.1:${healthyPort}`;
    const { embedWithProvider } = await import('@/lib/platform/providers');

    const deployment = {
      id: 'platform-local:alo-local-tiny', provider: 'platform-local', providerKind: 'platform-local' as const,
      model: 'alo-local-tiny', family: 'markov', displayName: 'Local', hostingType: 'local' as const,
      capabilities: ['embedding' as const], contextLength: 4096, approxSizeGb: 0.02,
      fallbackEligible: true, priority: 5, selectable: true, reachable: true,
    };

    const [a, b, c] = await embedWithProvider(deployment, [
      'local model routing and fallback',
      'local model routing and cooldowns',
      'a completely unrelated sentence about gardening',
    ]);

    expect(a?.length).toBe(256);
    const dot = (x: number[], y: number[]) => x.reduce((sum, value, i) => sum + value * (y[i] ?? 0), 0);
    const norm = (x: number[]) => Math.sqrt(dot(x, x));

    // Normalised: self-similarity is 1.
    expect(norm(a!)).toBeCloseTo(1, 2);
    // Semantically close sentences must beat an unrelated one.
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!));
  }, 20_000);

  it('reports a clear error when the provider endpoint is not configured', async () => {
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    const { completeWithProvider } = await import('@/lib/platform/providers');

    const deployment = {
      id: 'cloud:none', provider: 'cloud', providerKind: 'openai-compatible' as const,
      model: 'ghost-model', family: 'x', displayName: 'Ghost', hostingType: 'remote' as const,
      capabilities: ['chat' as const], contextLength: 4096, approxSizeGb: 0,
      fallbackEligible: true, priority: 100, selectable: true, reachable: true,
    };

    await expect(
      completeWithProvider(deployment, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/not configured/i);
  });
});
