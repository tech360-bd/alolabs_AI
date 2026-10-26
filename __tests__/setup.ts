import '@testing-library/jest-dom/vitest';
import { guardFetchAgainstPaidHosts, paidServicesSkipped } from './helpers/paid-services';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Keep the real fetch reachable for node-environment tests that talk to a
// local HTTP server (see __tests__/helpers/real-fetch.ts).
//
// While SKIP_PAID_SERVICES is active the real fetch is wrapped so that any
// non-loopback request throws. Loopback stays reachable, so the local
// http.createServer-based provider/webhook tests are unaffected, but an
// accidental call to a billed third-party API fails loudly instead of spending
// money on a runner. Policy lives in __tests__/helpers/paid-services.ts and
// scripts/ci-paid-services.sh.
(globalThis as unknown as { __realFetch?: typeof fetch }).__realFetch =
  paidServicesSkipped() && globalThis.fetch
    ? guardFetchAgainstPaidHosts(globalThis.fetch)
    : globalThis.fetch;

// Mock fetch for API calls
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    headers: new Headers(),
  } as Response)
);

// Mock crypto.randomUUID
if (!global.crypto?.randomUUID) {
  Object.defineProperty(global, 'crypto', {
    value: {
      ...global.crypto,
      randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
    },
  });
}

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Suppress console.error in tests (optional, for noisy components)
// const originalError = console.error;
// console.error = (...args: unknown[]) => {
//   if (typeof args[0] === 'string' && args[0].includes('Warning:')) return;
//   originalError.call(console, ...args);
// };