/**
 * The global test setup stubs `fetch` for UI tests. Transport-level tests
 * (providers, webhooks) need the real implementation against a local server.
 */
export function useRealFetch(): () => void {
  const g = globalThis as unknown as { __realFetch?: typeof fetch; fetch: typeof fetch };
  const stub = g.fetch;
  const real = g.__realFetch;
  if (!real) throw new Error('real fetch was not captured by the test setup');
  g.fetch = real;
  return () => {
    g.fetch = stub;
  };
}
