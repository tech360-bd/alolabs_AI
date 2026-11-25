import { describe, expect, it } from 'vitest';
import { providersFromEnvironment } from '@/lib/ai-router/provider-registry';
import { localProviderNames } from '@/lib/ai-router/model-tiers';

/**
 * Regression tests for the Ollama endpoint normalisation.
 *
 * `OllamaProvider` speaks Ollama's *native* API and appends `/api/tags` and
 * `/api/chat` to whatever endpoint it is given. Operators commonly write the
 * OpenAI-compatible spelling (`http://host:11434/v1`) into `.env`, because
 * that is the URL every other tool in the ecosystem uses. Passing it through
 * unchanged produced `http://host:11434/v1/api/tags`, which 404s, so
 * `initialize()` threw "Ollama is not reachable", the provider never joined
 * the registry, the router found no authorized route, and every request
 * returned HTTP 503 `AI_DEFERRED / AUTHORIZED_ROUTE_FAILED`.
 *
 * The endpoint was always correct; only the appended suffix was wrong.
 */

function ollamaEndpointFor(value: string): string | undefined {
  const specs = providersFromEnvironment({ OLLAMA_BASE_URL: value } as NodeJS.ProcessEnv);
  const spec = specs.find((candidate) => candidate.name === 'ollama');
  if (!spec) return undefined;
  // `endpoint` is private in the provider; read it the way the provider itself
  // uses it, without widening the public surface just for a test.
  return (spec.create() as unknown as { endpoint?: string }).endpoint;
}

describe('Ollama endpoint normalisation', () => {
  it('strips the OpenAI-compatible /v1 suffix so /api/tags resolves', () => {
    const endpoint = ollamaEndpointFor('http://localhost:11434/v1');
    expect(endpoint).toBe('http://localhost:11434');
    // The URL the provider actually requests must be the native API root.
    expect(`${endpoint}/api/tags`).toBe('http://localhost:11434/api/tags');
  });

  it('accepts the native spelling unchanged', () => {
    expect(ollamaEndpointFor('http://localhost:11434')).toBe('http://localhost:11434');
  });

  it('tolerates a trailing slash and a /v1/ combination', () => {
    expect(ollamaEndpointFor('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(ollamaEndpointFor('http://localhost:11434/v1/')).toBe('http://localhost:11434');
  });

  it('adds a scheme to a bare host:port', () => {
    expect(ollamaEndpointFor('localhost:11434')).toBe('http://localhost:11434');
    expect(ollamaEndpointFor('127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434');
  });

  it('preserves a proxy path prefix instead of guessing', () => {
    // An operator fronting Ollama behind /ollama must keep that prefix: only a
    // trailing /v1 is OpenAI-specific, and only when it is the final segment.
    expect(ollamaEndpointFor('http://10.0.0.5:11434/ollama')).toBe('http://10.0.0.5:11434/ollama');
  });

  it('still registers when OLLAMA_HOST is used instead of OLLAMA_BASE_URL', () => {
    const specs = providersFromEnvironment({ OLLAMA_HOST: 'http://localhost:11434/v1' } as NodeJS.ProcessEnv);
    const spec = specs.find((candidate) => candidate.name === 'ollama');
    expect(spec).toBeDefined();
    expect((spec!.create() as unknown as { endpoint?: string }).endpoint).toBe('http://localhost:11434');
  });

  it('classifies the /v1 spelling as a local provider, matching the registry', () => {
    // model-tiers.ts decides local-vs-external for the same env value. If it
    // disagreed with provider-registry the provider would register but be
    // excluded from routing as "external", which is the same outage with a
    // different error message.
    expect(localProviderNames({ OLLAMA_BASE_URL: 'http://localhost:11434/v1' } as NodeJS.ProcessEnv)).toContain(
      'ollama',
    );
    expect(localProviderNames({ OLLAMA_BASE_URL: 'http://localhost:11434' } as NodeJS.ProcessEnv)).toContain('ollama');
  });

  it('never registers a non-local Ollama endpoint', () => {
    expect(ollamaEndpointFor('https://api.example.com/v1')).toBeUndefined();
  });
});
