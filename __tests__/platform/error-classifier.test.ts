/**
 * Error classification is the heart of the fallback policy, and the policy is
 * explicit: only *capacity* faults may be retried elsewhere. Retrying a
 * malformed request or a content-policy refusal against another model is how a
 * platform hides bugs, burns quota and produces inconsistent answers — so those
 * classes must be terminal.
 */

import { describe, expect, it } from 'vitest';
import { classifyProviderError, isTerminalFailure, unavailableStatus } from '@/lib/platform/error-classifier';
import type { ClassifiedError } from '@/lib/platform/error-classifier';

function httpError(status: number, message: string, retryAfter?: string) {
  return Object.assign(new Error(message), {
    statusCode: status,
    ...(retryAfter ? { retryAfter } : {}),
  });
}

describe('classifyProviderError', () => {
  it('classifies HTTP 429 as rate_limit: cooldown + fallback, never an immediate same-model retry', () => {
    const result = classifyProviderError(httpError(429, 'rate limit reached'), 'ollama');
    expect(result.class).toBe('rate_limit');
    // `retryable` means "retry this same deployment right now". For a closed
    // rate-limit window that is exactly the wrong move, so it is false — the
    // engine must move on and honour coolDownMs instead.
    expect(result.retryable).toBe(false);
    expect(result.fallbackEligible).toBe(true);
    expect(result.coolDownMs).toBeGreaterThan(0);
    expect(result.httpStatus).toBe(429);
    expect(result.countsAgainstHealth).toBe(false);
  });

  it('classifies HTTP 503 as overloaded', () => {
    expect(classifyProviderError(httpError(503, 'model loading'), 'vllm').class).toBe('overloaded');
  });

  it('classifies HTTP 500 as server_error and still allows fallback', () => {
    const result = classifyProviderError(httpError(500, 'boom'), 'vllm');
    expect(result.class).toBe('server_error');
    expect(result.fallbackEligible).toBe(true);
  });

  it('classifies HTTP 401/403 as auth: no retry on this provider, but another one may work', () => {
    for (const status of [401, 403]) {
      const result = classifyProviderError(httpError(status, 'invalid api key'), 'litellm');
      expect(result.class).toBe('auth');
      // Never retry the *same* model with the same bad credentials.
      expect(result.retryable).toBe(false);
      // But a differently-configured provider is worth trying, so a single
      // misconfigured key cannot take the whole platform down.
      expect(result.fallbackEligible).toBe(true);
      expect(isTerminalFailure(result)).toBe(false);
      // The user-facing message must not echo the provider's raw text.
      expect(result.message).toContain('credentials');
    }
  });

  it('classifies HTTP 404 as not_found, cooldown for a while, still fallback-eligible', () => {
    const result = classifyProviderError(httpError(404, 'model not found'), 'ollama');
    expect(result.class).toBe('not_found');
    expect(result.coolDownMs).toBeGreaterThan(0);
    expect(result.fallbackEligible).toBe(true);
    expect(isTerminalFailure(result)).toBe(false);
  });

  it('treats a malformed request as invalid_request and never falls back', () => {
    const result = classifyProviderError(httpError(400, 'messages: required'), 'ollama');
    expect(result.class).toBe('invalid_request');
    expect(result.fallbackEligible).toBe(false);
    expect(isTerminalFailure(result)).toBe(true);
  });

  it('treats a content-policy refusal as terminal', () => {
    const result = classifyProviderError(
      httpError(400, 'Your request was rejected as a result of our safety system. content_policy_violation'),
      'litellm',
    );
    expect(result.class).toBe('content_policy');
    expect(isTerminalFailure(result)).toBe(true);
    expect(result.fallbackEligible).toBe(false);
  });

  it('treats a client cancellation as terminal and does not blame the provider', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const result = classifyProviderError(abort, 'ollama');
    expect(result.class).toBe('cancelled');
    expect(isTerminalFailure(result)).toBe(true);
    // A cancellation is the caller's choice; it must not mark the model sick.
    expect(result.countsAgainstHealth).toBe(false);
  });

  it('detects context overflow separately from a plain bad request', () => {
    const result = classifyProviderError(
      httpError(400, 'the request exceeds the available context size (4096 tokens)'),
      'ollama',
    );
    expect(result.class).toBe('context_overflow');
    expect(result.fallbackEligible).toBe(true);
  });

  it('distinguishes our deadline expiring (timeout) from the user hanging up (cancelled)', () => {
    // AbortSignal.timeout() surfaces as TimeoutError in undici; a caller abort
    // surfaces as AbortError. They must not be conflated: one is a capacity
    // signal worth falling back on, the other is wasted work.
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const aborted = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

    expect(classifyProviderError(timeout, 'ollama').class).toBe('timeout');
    expect(classifyProviderError(timeout, 'ollama').fallbackEligible).toBe(true);

    expect(classifyProviderError(aborted, 'ollama').class).toBe('cancelled');
    expect(classifyProviderError(aborted, 'ollama').fallbackEligible).toBe(false);
  });

  it('classifies a DNS failure as network and retries elsewhere', () => {
    const result = classifyProviderError(new Error('fetch failed: getaddrinfo ENOTFOUND ollama.local'), 'ollama');
    expect(result.class).toBe('network');
    expect(result.fallbackEligible).toBe(true);
  });

  it('detects an explicit quota exhaustion', () => {
    const result = classifyProviderError(
      httpError(429, 'You exceeded your current quota, please check your plan and billing details'),
      'litellm',
    );
    expect(result.class).toBe('quota_exhausted');
    expect(result.fallbackEligible).toBe(true);
  });

  it('honours Retry-After in seconds, as milliseconds', () => {
    const result = classifyProviderError(httpError(429, 'slow down', '7'), 'ollama');
    expect(result.retryAfterMs).toBe(7000);
    expect(result.coolDownMs).toBeGreaterThanOrEqual(7000);
  });

  it('honours Retry-After as an HTTP-date', () => {
    const when = new Date(Date.now() + 12_000).toUTCString();
    const result = classifyProviderError(httpError(503, 'loading', when), 'ollama');
    expect(result.retryAfterMs).toBeGreaterThan(9000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(13_000);
  });

  it('caps an absurd Retry-After so one bad header cannot disable a model for a day', () => {
    const result = classifyProviderError(httpError(429, 'wait', '86400'), 'ollama');
    expect(result.coolDownMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('falls back to a sane default cooldown when no header is present', () => {
    const result = classifyProviderError(httpError(429, 'slow down'), 'ollama');
    expect(result.coolDownMs).toBeGreaterThan(0);
    expect(result.coolDownMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('keeps an oversized upstream body out of what the engine stores per attempt', () => {
    // The classifier may pass a message through, so the *engine* truncates it;
    // this test pins the classifier's own behaviour: it never invents detail,
    // and an unknown shape is still classifiable without throwing.
    const huge = 'x'.repeat(5000);
    const result = classifyProviderError(httpError(500, huge), 'vllm');
    expect(result.class).toBe('server_error');
    expect(typeof result.message).toBe('string');
  });

  it('is safe on non-Error throws', () => {
    const result = classifyProviderError('a string was thrown', 'ollama');
    expect(result.class).toBe('unknown');
    expect(result.message).toBeTruthy();
  });
});

describe('unavailableStatus', () => {
  const of = (cls: ClassifiedError['class']): ClassifiedError => ({
    class: cls,
    message: 'x',
    httpStatus: 500,
    retryable: false,
    fallbackEligible: false,
    coolDownMs: 0,
    countsAgainstHealth: false,
  });

  it('returns 429 when every failure was a capacity signal', () => {
    expect(unavailableStatus([of('rate_limit')])).toBe(429);
    expect(unavailableStatus([of('quota_exhausted'), of('rate_limit')])).toBe(429);
  });

  it('returns 503 when every failure was infrastructure', () => {
    expect(unavailableStatus([of('overloaded'), of('timeout')])).toBe(503);
    expect(unavailableStatus([])).toBe(503);
  });

  it('returns 400 when the request itself was bad — never 429', () => {
    expect(unavailableStatus([of('invalid_request')])).toBe(400);
    expect(unavailableStatus([of('content_policy')])).toBe(400);
  });
});
