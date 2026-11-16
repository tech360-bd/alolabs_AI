import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { useAppStore } from '@/store/app';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ token: 'session-token-for-test', selectedCompany: 'tenant-one' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  useAppStore.setState({ token: null, selectedCompany: null });
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('sends the bearer token and tenant header without cookie credentials', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer session-token-for-test');
    expect(headers.get('x-company-slug')).toBe('tenant-one');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.credentials).toBe('omit');
  });

  it('does not forward the app token to an external origin', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('https://provider.example/v1/chat/completions');

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.credentials).toBeUndefined();
  });

  it('supports a surface-provided token without forwarding the selected internal company', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/portal/projects', {}, {
      authToken: 'portal-session-token',
      includeCompany: false,
    });

    const [, init] = mockFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer portal-session-token');
    expect(headers.has('x-company-slug')).toBe(false);
    expect(init.credentials).toBe('omit');
  });

  it('does not expire auth for public API 401 responses', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost', pathname: '/site/contact', assign },
      dispatchEvent: vi.fn(),
    });
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/public/contact', { method: 'POST' });

    expect(useAppStore.getState().token).toBe('session-token-for-test');
    expect(assign).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('clears client auth and redirects to /login on a private API 401', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost', pathname: '/dashboard', assign },
      dispatchEvent: vi.fn(),
    });
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    localStorage.setItem('token', 'stale-token');
    useAppStore.setState({ token: 'stale-token' });

    await apiFetch('/api/tasks');

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('alo_token')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
    expect(mockFetch).toHaveBeenCalledTimes(2); // request + best-effort logout
  });
});
