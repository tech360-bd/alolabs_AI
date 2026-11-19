import { useAppStore } from '@/store/app';

/** localStorage keys used by the existing sign-in flow. */
export const AUTH_TOKEN_KEY = 'alo_token';
const LEGACY_AUTH_TOKEN_KEY = 'token';

export interface ApiFetchOptions {
  /** Explicit token for surfaces whose session is provided by a server layout. */
  authToken?: string | null;
  /** Avoid leaking an internal workspace selection to another authenticated surface. */
  includeCompany?: boolean;
  /** Redirect target after a private API 401. Defaults to /login. */
  redirectTo?: string;
  /** Disable expiry handling for requests that perform their own cleanup. */
  handleUnauthorized?: boolean;
}

/**
 * These endpoints are intentionally public in src/proxy.ts. A 401 from one of
 * them is an endpoint-level response, not proof that a private session expired.
 */
const PUBLIC_API_EXACT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password-reset',
  '/api/auth/mfa/verify',
  '/api/auth/mfa/resend',
  '/api/auth/sso',
  '/api/auth/oauth',
  '/api/health/live',
  '/api/health/ready',
  '/api/health/ping',
  '/api/health',
  '/api/v1/health',
  '/api/v1/ai/health',
  '/api/ping',
  '/api/infra/ping',
  '/api/whatsapp/webhook',
  '/api/voice/telephony/webhook',
]);
const PUBLIC_API_PREFIXES = ['/api/auth/oauth/', '/api/public/'];

function isPublicApiRequest(path: string): boolean {
  const pathname = path.split('?', 1)[0];
  return PUBLIC_API_EXACT_PATHS.has(pathname)
    || PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Get the current bearer token from Zustand or localStorage. This client is
 * browser-facing; server-side API calls should use their server auth helper.
 */
export function getAuthToken(): string | null {
  try {
    const storeToken = useAppStore.getState().token;
    if (storeToken) return storeToken;
  } catch {
    // The store is unavailable during SSR and in isolated unit tests.
  }

  if (typeof window !== 'undefined') {
    return localStorage.getItem(LEGACY_AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  }
  return null;
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('Authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function redirectAfterUnauthorized(path: string, token: string | null, redirectTo: string): void {
  if (typeof window === 'undefined' || isPublicApiRequest(path)) return;

  try {
    useAppStore.getState().logout();
  } catch {
    // Still clear the persisted credentials if the store has not hydrated.
  }

  try {
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('user');
  } catch {
    // Storage may be disabled; still navigate away from the protected page.
  }

  if (window.location.pathname !== '/login') {
    // Best-effort server logout also clears the legacy session cookie. The API
    // call below is intentionally raw to avoid recursively entering this client.
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    void fetch('/api/auth/logout', { method: 'POST', headers, keepalive: true }).catch(() => undefined);
    // A full navigation forces the server-side session gate to re-check auth.
    window.location.assign(redirectTo);
  }
}

function requestUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function requestPath(input: RequestInfo | URL): string {
  const url = requestUrl(input);
  if (url) return `${url.pathname}${url.search}`;
  if (typeof input === 'string') return input;
  if (input instanceof URL) return `${input.pathname}${input.search}`;
  return input.url;
}

function buildHeaders(
  input: RequestInfo | URL,
  init: RequestInit,
  token: string | null,
  includeAuth: boolean,
  includeCompany: boolean,
): Headers {
  const requestHeaders = typeof Request !== 'undefined' && input instanceof Request
    ? input.headers
    : undefined;
  const headers = new Headers(requestHeaders);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (includeAuth && token) headers.set('Authorization', `Bearer ${token}`);
  if (includeAuth && includeCompany) {
    const selectedCompany = useAppStore.getState().selectedCompany;
    if (selectedCompany) headers.set('x-company-slug', selectedCompany);
  } else if (includeAuth) {
    headers.delete('x-company-slug');
  }

  const body = init.body ?? (typeof Request !== 'undefined' && input instanceof Request ? input.body : null);
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body != null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

/**
 * Central raw API fetch. It adds the local Bearer token and selected tenant to
 * same-origin API requests, does not opt into cookie credentials, and expires
 * the local session on a private API 401. It intentionally returns the
 * Response so callers can handle SSE, downloads, or route-specific errors.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiFetchOptions = {},
): Promise<Response> {
  const url = requestUrl(input);
  const isSameOriginApi = Boolean(
    typeof window !== 'undefined'
      && url
      && url.origin === window.location.origin
      && (url.pathname === '/api' || url.pathname.startsWith('/api/')),
  );
  const path = requestPath(input);
  const token = isSameOriginApi
    ? options.authToken !== undefined ? options.authToken : getAuthToken()
    : null;
  const headers = buildHeaders(
    input,
    init,
    token,
    isSameOriginApi,
    options.includeCompany !== false,
  );
  const tokenForCleanup = token || readBearerToken(headers);
  const response = await fetch(input, {
    ...init,
    headers,
    ...(isSameOriginApi ? { credentials: init.credentials ?? 'omit' } : {}),
  });

  if (
    response.status === 401
      && isSameOriginApi
      && options.handleUnauthorized !== false
      && !isPublicApiRequest(path)
  ) {
    redirectAfterUnauthorized(path, tokenForCleanup, options.redirectTo ?? '/login');
  }
  return response;
}

/** JSON convenience client for standard API routes. */
export async function fetchApi<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const text = await response.text().catch(() => 'Request failed');
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

/** Raw-response helper for SSE, file downloads, and blob responses. */
export async function fetchApiRaw(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const text = await response.text().catch(() => 'Request failed');
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response;
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

/**
 * Unwrap the { success, data } envelope used by /api/v1 routes while allowing
 * legacy routes that return their payload directly.
 */
export async function fetchApiV1<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const json = await fetchApi<{
    success?: boolean;
    data?: T;
    error?: { code: string; message: string };
  }>(path, options);
  if (json && json.success === false) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  return (json?.data ?? json) as T;
}

/** Backwards-compatible name for callers that prefer an explicit client API. */
export const apiClient = fetchApi;
