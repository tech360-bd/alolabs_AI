/**
 * The global test setup stubs `fetch` for UI tests. Transport-level tests
 * (providers, webhooks) need the real implementation against a local server.
 *
 * Named `enableRealFetch` so ESLint's `react-hooks/rules-of-hooks` rule does
 * not mistake a test transport utility for a React Hook when called at module
 * scope; `useRealFetch` is kept as an alias for existing callers inside hooks.
 */
export function enableRealFetch(): () => void {
  const g = globalThis as unknown as { __realFetch?: typeof fetch; fetch: typeof fetch };
  const stub = g.fetch;
  const real = g.__realFetch;
  if (!real) throw new Error('real fetch was not captured by the test setup');
  g.fetch = real;
  return () => {
    g.fetch = stub;
  };
}

export const useRealFetch = enableRealFetch;
