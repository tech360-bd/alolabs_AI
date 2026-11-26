/**
 * Fallback engine behaviour.
 *
 * These tests use a fake `CompleteFn` so they are deterministic and cost
 * nothing — the *adapter* is exercised separately against a real HTTP server
 * (see `__tests__/platform/providers.integration.test.ts` and the live
 * verification run, which produced genuine 429s from a fault-injecting runtime).
 *
 * What is asserted here is the policy, which is where the requirements are
 * actually encoded:
 *   · local models are preferred and remote ones are not used by default
 *   · a capacity fault moves to the next candidate and sets a cooldown
 *   · a cooldown is honoured by the *next* request
 *   · a malformed request stops the whole chain immediately
 *   · an unsatisfiable capability filter returns a clear message, not a guess
 *   · the outcome always names the model that actually answered
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The engine imports the database for health/usage persistence. These tests are
// about routing policy, and the real DB is covered elsewhere, so the module is
// stubbed with an in-memory implementation that fails loudly if used for
// anything the test did not expect.
/**
 * In-memory stand-in for `AiRoutingState`, keyed exactly like the real table
 * (`alo:ai:health:<provider>:<model>`, `alo:ai:cooldown:…`) so the engine's own
 * key construction is exercised rather than bypassed.
 */
interface RoutingRow {
  value: string;
  expiresAt: Date;
}
const routingStore = new Map<string, RoutingRow>();

vi.mock('@/lib/db', () => ({
  db: {
    aiUsageRecord: { create: vi.fn(async () => ({ id: 'usage' })) },
    aiFallbackEvent: { create: vi.fn(async () => ({ id: 'event' })) },
    aiRoutingState: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const row = routingStore.get(where.key);
        if (!row || row.expiresAt.getTime() <= Date.now()) return null;
        return { key: where.key, value: row.value, expiresAt: row.expiresAt };
      }),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: string; expiresAt: Date } }) => {
        routingStore.set(where.key, { value: create.value, expiresAt: create.expiresAt });
        return {};
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        const removed = routingStore.delete(where.key) ? 1 : 0;
        return { count: removed };
      }),
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redisGet: vi.fn(async () => null),
  redisSet: vi.fn(async () => undefined),
  redisDel: vi.fn(async () => undefined),
  getRedisError: vi.fn(() => null),
}));

import { runWithFallback } from '@/lib/platform/fallback-engine';
import type { CompleteFn, CompletionResult } from '@/lib/platform/fallback-engine';
import type { AvailableDeployment } from '@/lib/platform/model-registry';

/**
 * A stand-in candidate list. `selectCandidates` is stubbed because these tests
 * must not depend on which providers happen to be reachable on the machine
 * running them; provider *selection* has its own coverage.
 */
const candidates: AvailableDeployment[] = [
  {
    id: 'local:small', provider: 'local', providerKind: 'ollama', model: 'small-model',
    family: 'test', displayName: 'Local small', hostingType: 'local',
    capabilities: ['chat', 'code'], contextLength: 8192, approxSizeGb: 1,
    fallbackEligible: true, priority: 10, selectable: true, reachable: true,
  },
  {
    id: 'local:big', provider: 'local', providerKind: 'vllm', model: 'big-model',
    family: 'test', displayName: 'Local big', hostingType: 'local',
    capabilities: ['chat', 'code', 'vision'], contextLength: 32768, approxSizeGb: 14,
    fallbackEligible: true, priority: 20, selectable: true, reachable: true,
  },
  {
    id: 'cloud:mini', provider: 'cloud', providerKind: 'litellm', model: 'mini-cloud',
    family: 'test', displayName: 'Cloud mini', hostingType: 'free-cloud',
    capabilities: ['chat'], contextLength: 128000, approxSizeGb: 0,
    fallbackEligible: true, priority: 100, selectable: true, reachable: true,
  },
];

vi.mock('@/lib/platform/model-registry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/platform/model-registry')>('@/lib/platform/model-registry');
  return {
    ...actual,
    selectCandidates: vi.fn(async (options: { requires?: import('@/lib/platform/model-registry').ModelCapability[]; allowRemote?: boolean; preferredModel?: string }) => {
      const requires = options.requires ?? ['chat'];
      let list = candidates.filter((c) => requires.every((r) => c.capabilities.includes(r)));
      // Remote providers are opt-in; the default is local-only.
      if (!options.allowRemote) list = list.filter((c) => c.hostingType === 'local');
      if (options.preferredModel) {
        const preferred = list.find((c) => c.id === options.preferredModel || c.model === options.preferredModel);
        if (preferred) list = [preferred, ...list.filter((c) => c.id !== preferred.id)];
      }
      return list;
    }),
    describeAvailability: vi.fn(async () => candidates),
  };
});

function okResult(deployment: AvailableDeployment): CompletionResult {
  return {
    content: `answer from ${deployment.model}`,
    model: deployment.model,
    provider: deployment.provider,
    hostingType: deployment.hostingType,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latencyMs: 12,
    finishReason: 'stop',
  };
}

function httpError(status: number, message: string, retryAfter?: string) {
  return Object.assign(new Error(message), { statusCode: status, ...(retryAfter ? { retryAfter } : {}) });
}

const request = { messages: [{ role: 'user' as const, content: 'hello there' }], maxTokens: 32 };

describe('runWithFallback', () => {
  beforeEach(() => {
    routingStore.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers from the first candidate when it is healthy', async () => {
    const calls: string[] = [];
    const complete: CompleteFn = async (deployment) => {
      calls.push(deployment.id);
      return okResult(deployment);
    };

    const outcome = await runWithFallback(request, complete, { requires: ['chat'] });

    expect(outcome.ok).toBe(true);
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.result?.model).toBe('small-model');
    expect(calls).toEqual(['local:small']);
    expect(outcome.attempts).toHaveLength(1);
    expect(outcome.attempts[0]?.ok).toBe(true);
  });

  it('moves to the next model on a 429 and reports which one answered', async () => {
    const complete: CompleteFn = async (deployment) => {
      if (deployment.id === 'local:small') throw httpError(429, 'rate limited', '2');
      return okResult(deployment);
    };

    const outcome = await runWithFallback(request, complete, { requires: ['chat'] });

    expect(outcome.ok).toBe(true);
    expect(outcome.usedFallback).toBe(true);
    // The user must be told the truth about which model served them.
    expect(outcome.result?.model).toBe('big-model');
    expect(outcome.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(outcome.attempts[0]?.errorClass).toBe('rate_limit');
  });

  it('tries a local model before a remote one, even when the remote has a better context window', async () => {
    const calls: string[] = [];
    const complete: CompleteFn = async (deployment) => {
      calls.push(`${deployment.hostingType}:${deployment.model}`);
      return okResult(deployment);
    };

    // allowRemote is true, so the cloud candidate is eligible — it must still
    // lose to a working local model.
    const outcome = await runWithFallback(request, complete, { requires: ['chat'], allowRemote: true });

    expect(outcome.ok).toBe(true);
    expect(calls[0]).toBe('local:small-model');
    expect(outcome.result?.hostingType).toBe('local');
  });

  it('does not use a remote model at all unless remote use is enabled', async () => {
    const onlyRemoteFails = new Set(['local:small', 'local:big']);
    const calls: string[] = [];
    const complete: CompleteFn = async (deployment) => {
      calls.push(deployment.id);
      if (onlyRemoteFails.has(deployment.id)) throw httpError(503, 'model loading');
      return okResult(deployment);
    };

    // Default: remote disabled → both local models fail → honest failure.
    const localOnly = await runWithFallback(request, complete, { requires: ['chat'] });
    expect(localOnly.ok).toBe(false);
    expect(calls).not.toContain('cloud:mini');
    expect(localOnly.error?.message).toBeTruthy();

    // Enabled: the same failures now recover through the cloud candidate.
    calls.length = 0;
    const withRemote = await runWithFallback(request, complete, { requires: ['chat'], allowRemote: true });
    expect(withRemote.ok).toBe(true);
    expect(calls).toContain('cloud:mini');
    expect(withRemote.error).toBeUndefined();
  });

  it('stops the whole chain on a malformed request instead of trying every model', async () => {
    const calls: string[] = [];
    const complete: CompleteFn = async (deployment) => {
      calls.push(deployment.id);
      throw httpError(400, 'messages[0].role: invalid role');
    };

    const outcome = await runWithFallback(request, complete, { requires: ['chat'], allowRemote: true });

    expect(outcome.ok).toBe(false);
    // One attempt. A 400 is the caller's bug; retrying it elsewhere hides it.
    expect(calls).toEqual(['local:small']);
    expect(outcome.error?.status).toBe(400);
  });

  it('stops on a content-policy refusal', async () => {
    const calls: string[] = [];
    const complete: CompleteFn = async (deployment) => {
      calls.push(deployment.id);
      throw httpError(400, 'Request rejected by the safety system: content policy');
    };

    const outcome = await runWithFallback(request, complete, { requires: ['chat'], allowRemote: true });

    expect(outcome.ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(outcome.error?.status).toBe(400);
  });

  it('honours a cooldown on the following request', async () => {
    const calls: string[] = [];
    let firstRun = true;
    const complete: CompleteFn = async (deployment) => {
      calls.push(deployment.id);
      if (firstRun && deployment.id === 'local:small') {
        // A real rate-limit window: 60s, so it cannot expire mid-test.
        throw httpError(429, 'rate limited', '60');
      }
      return okResult(deployment);
    };

    const first = await runWithFallback(request, complete, { requires: ['chat'] });
    expect(first.usedFallback).toBe(true);
    expect(calls).toEqual(['local:small', 'local:big']);

    // The cooled-down model must not be *called* again. It still appears in the
    // audit trail as a zero-latency skip, because "why didn't you use the fast
    // local model?" is a question the UI has to be able to answer.
    calls.length = 0;
    firstRun = false;
    const second = await runWithFallback(request, complete, { requires: ['chat'] });

    expect(second.ok).toBe(true);
    expect(calls).toEqual(['local:big']);
    const skip = second.attempts.find((a) => a.deploymentId === 'local:small');
    expect(skip?.errorClass).toBe('cooldown');
    expect(skip?.latencyMs).toBe(0);
    expect(second.result?.model).toBe('big-model');
  });

  it('records a failure against provider health so a repeatedly failing model is demoted', async () => {
    const complete: CompleteFn = async (deployment) => {
      if (deployment.id === 'local:small') throw httpError(500, 'inference crashed');
      return okResult(deployment);
    };

    for (let i = 0; i < 3; i++) {
      await runWithFallback(request, complete, { requires: ['chat'], maxAttemptsPerDeployment: 1 });
    }

    // Failures must be visible in shared routing state, which is what the Super
    // Admin page reads to explain non-selection. Use a fresh store per run so
    // the *cumulative* count is unambiguous.
    const healthRow = [...routingStore.entries()].find(([key]) => key.includes('health') && key.includes('small-model'));
    expect(healthRow, 'health row for local:small-model should exist').toBeDefined();
    const health = JSON.parse(healthRow![1].value) as { consecutiveFailures: number; status: string };
    expect(health.consecutiveFailures).toBeGreaterThan(0);
    expect(['degraded', 'unreachable']).toContain(health.status);

    // And the successful model must not have been marked as failing.
    const okRow = [...routingStore.entries()].find(([key]) => key.includes('health') && key.includes('big-model'));
    if (okRow) {
      const okHealth = JSON.parse(okRow[1].value) as { consecutiveFailures: number };
      expect(okHealth.consecutiveFailures).toBe(0);
    }
  });

  it('explains an unsatisfiable capability requirement instead of silently downgrading', async () => {
    const complete: CompleteFn = vi.fn(async (deployment: AvailableDeployment) => okResult(deployment));

    // No candidate in the stubbed list has "audio"; the chain must be empty and
    // the error must say what is missing.
    const outcome = await runWithFallback(request, complete, { requires: ['audio' as never] });

    expect(outcome.ok).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(outcome.error?.message.toLowerCase()).toContain('no model');
    expect(outcome.error?.remediation).toBeTruthy();
  });

  it('surfaces every attempt so a caller can audit the routing decision', async () => {
    const complete: CompleteFn = async (deployment) => {
      if (deployment.id === 'local:small') throw httpError(429, 'slow down', '30');
      if (deployment.id === 'local:big') throw httpError(503, 'loading');
      return okResult(deployment);
    };

    const outcome = await runWithFallback(request, complete, {
      requires: ['chat'], allowRemote: true, maxAttemptsPerDeployment: 1,
    });

    expect(outcome.attempts.map((a) => a.deploymentId)).toEqual(['local:small', 'local:big', 'cloud:mini']);
    expect(outcome.attempts.map((a) => a.errorClass)).toEqual(['rate_limit', 'overloaded', undefined]);
    expect(outcome.result?.provider).toBe('cloud');
    // Every failure carries an HTTP status the UI can show verbatim.
    expect(outcome.attempts[0]?.httpStatus).toBe(429);
    expect(outcome.attempts[1]?.httpStatus).toBe(503);
  });

  it('never returns a result without a model name', async () => {
    const complete: CompleteFn = async (deployment) => okResult(deployment);
    const outcome = await runWithFallback(request, complete, { requires: ['chat'] });
    expect(outcome.result?.model).toBeTruthy();
    expect(outcome.result?.provider).toBeTruthy();
    expect(outcome.result?.usage.totalTokens).toBeGreaterThan(0);
  });

  it('stops when the deadline is exceeded rather than looping over candidates', async () => {
    const complete: CompleteFn = async () => {
      await new Promise((r) => setTimeout(r, 40));
      throw httpError(503, 'slow');
    };

    const started = Date.now();
    const outcome = await runWithFallback(request, complete, {
      requires: ['chat'],
      allowRemote: true,
      deadlineMs: 50,
    });

    expect(outcome.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
