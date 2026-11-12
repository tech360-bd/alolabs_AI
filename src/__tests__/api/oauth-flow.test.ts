import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * OAuth flow repair tests.
 *
 * Covers:
 *  - `sanitizeOAuthNextPath` (open-redirect defense)
 *  - `resolveAppBaseUrl` / `buildOAuthCallbackUrl` (absolute redirect_uri)
 *  - GET initiation: absolute redirect_uri + JSON state blob `{provider, next}`
 *  - GET callback branch: code exchange, httpOnly cookie, sanitized redirect
 *  - Single-use + TTL state consumption (incl. legacy plain-provider states)
 *  - POST JSON contract preserved for programmatic clients
 *
 * All network and DB layers are mocked — no real provider is contacted.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const storedStates: Record<string, { value: string; updatedAt: Date }> = {};

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      upsert: vi.fn(async ({ where, create }: any) => {
        storedStates[where.key] = { value: create.value, updatedAt: new Date() };
        return { key: where.key, ...storedStates[where.key] };
      }),
      findUnique: vi.fn(async ({ where }: any) => storedStates[where.key] || null),
      delete: vi.fn(async ({ where }: any) => {
        delete storedStates[where.key];
        return {};
      }),
    },
    oAuthProvider: { findUnique: vi.fn() },
    oAuthAccount: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({
  createSessionToken: vi.fn(async () => 'session-token-abc123'),
  hashPassword: vi.fn(async () => 'hashed-password'),
}));

// Minimal next/server mock: json() + redirect() with an isolated cookie jar
// per response, so we can assert httpOnly cookie setting on redirects.
vi.mock('next/server', () => {
  const makeCookies = () => {
    const jar: Record<string, string> = {};
    return Object.assign(jar, {
      set: (name: string, value: string) => {
        jar[name] = value;
      },
    });
  };
  return {
    NextResponse: {
      json: (data: unknown, init?: { status?: number }) => ({
        kind: 'json',
        status: init?.status ?? 200,
        body: data,
        cookies: makeCookies(),
      }),
      redirect: (url: string | URL) => ({
        kind: 'redirect',
        status: 302,
        url: String(url),
        headers: { location: String(url) },
        cookies: makeCookies(),
      }),
    },
  };
});

import { GET, POST } from '@/app/api/auth/oauth/[provider]/route';
import {
  sanitizeOAuthNextPath,
  resolveAppBaseUrl,
  buildOAuthCallbackUrl,
} from '@/lib/oauth-next-path';
import { db } from '@/lib/db';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PROVIDER_CONFIG = {
  id: 'prov1',
  provider: 'github',
  isActive: true,
  clientId: 'client-id-1',
  clientSecret: 'client-secret-1',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userInfoUrl: 'https://api.github.com/user',
  scopes: '["read:user","user:email"]',
};

const EXISTING_USER = {
  id: 'user-1',
  email: 'dev@example.com',
  name: 'Dev User',
  role: 'viewer',
  lastLoginAt: null,
};

function routeUrl(path: string, query = '') {
  return `http://localhost:3000${path}${query ? `?${query}` : ''}`;
}

function routeContext(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

function mockFetchForTokenExchange() {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/access_token')) {
      return {
        ok: true,
        status: 200,
        text: async () => 'ok',
        json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 }),
      };
    }
    if (url.includes('api.github.com/user')) {
      return {
        ok: true,
        status: 200,
        text: async () => 'ok',
        json: async () => ({ id: 123456, email: 'dev@example.com', name: 'Dev User' }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function armHappyPathDb() {
  (db.oAuthProvider.findUnique as any).mockResolvedValue(PROVIDER_CONFIG);
  (db.oAuthAccount.findFirst as any).mockResolvedValue(null);
  (db.user.findUnique as any).mockResolvedValue(EXISTING_USER);
  (db.user.update as any).mockResolvedValue({});
}

beforeEach(() => {
  for (const key of Object.keys(storedStates)) delete storedStates[key];
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ════════════════════════════════════════════════════════════════════════════
// sanitizeOAuthNextPath
// ════════════════════════════════════════════════════════════════════════════

describe('sanitizeOAuthNextPath', () => {
  it('accepts a plain in-app path', () => {
    expect(sanitizeOAuthNextPath('/dashboard')).toBe('/dashboard');
  });

  it('accepts a nested path with query string', () => {
    expect(sanitizeOAuthNextPath('/agents/12?tab=logs')).toBe('/agents/12?tab=logs');
  });

  it('rejects protocol-relative //evil.com (open redirect)', () => {
    expect(sanitizeOAuthNextPath('//evil.com')).toBe('');
  });

  it('rejects ///multi-slash protocol-relative URLs', () => {
    expect(sanitizeOAuthNextPath('///evil.com')).toBe('');
  });

  it('rejects absolute http(s) URLs', () => {
    expect(sanitizeOAuthNextPath('https://evil.com')).toBe('');
    expect(sanitizeOAuthNextPath('http://evil.com/path')).toBe('');
  });

  it('rejects javascript: URLs', () => {
    expect(sanitizeOAuthNextPath('javascript:alert(1)')).toBe('');
  });

  it('rejects data: URLs', () => {
    expect(sanitizeOAuthNextPath('data:text/html,<script>1</script>')).toBe('');
  });

  it('rejects control characters (newline smuggling)', () => {
    expect(sanitizeOAuthNextPath('/dashboard\r\nSet-Cookie: x=1')).toBe('');
    expect(sanitizeOAuthNextPath('/dashboard\n')).toBe('');
  });

  it('rejects backslash paths (browsers treat /\\ like //)', () => {
    expect(sanitizeOAuthNextPath('/\\evil.com')).toBe('');
    expect(sanitizeOAuthNextPath('/back\\slash')).toBe('');
  });

  it('rejects relative paths not starting with /', () => {
    expect(sanitizeOAuthNextPath('dashboard')).toBe('');
    expect(sanitizeOAuthNextPath('./dashboard')).toBe('');
  });

  it('rejects empty, null and undefined input', () => {
    expect(sanitizeOAuthNextPath('')).toBe('');
    expect(sanitizeOAuthNextPath(null)).toBe('');
    expect(sanitizeOAuthNextPath(undefined)).toBe('');
  });

  it('rejects oversized payloads (header-smuggling vector)', () => {
    expect(sanitizeOAuthNextPath(`/${'a'.repeat(3000)}`)).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// resolveAppBaseUrl / buildOAuthCallbackUrl
// ════════════════════════════════════════════════════════════════════════════

describe('resolveAppBaseUrl / buildOAuthCallbackUrl', () => {
  it('prefers NEXT_PUBLIC_APP_URL when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://alolabs.net');
    expect(resolveAppBaseUrl('http://localhost:3000')).toBe('https://alolabs.net');
    expect(buildOAuthCallbackUrl('github', 'http://localhost:3000')).toBe(
      'https://alolabs.net/api/auth/oauth/github'
    );
  });

  it('falls back to the request origin when env is unset', () => {
    expect(resolveAppBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(buildOAuthCallbackUrl('github', 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/auth/oauth/github'
    );
  });

  it('strips trailing slashes from both env and origin inputs', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://alolabs.net/');
    expect(resolveAppBaseUrl('http://localhost:3000/')).toBe('https://alolabs.net');
    vi.unstubAllEnvs();
    expect(resolveAppBaseUrl('http://localhost:3000///')).toBe('http://localhost:3000');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET initiation (no code/state params)
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/auth/oauth/[provider] — initiation', () => {
  it('returns an authorizationUrl whose redirect_uri is ABSOLUTE', async () => {
    armHappyPathDb();
    const res = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'next=%2Fagents%2F12') } as any,
      routeContext('github')
    );
    expect(res.kind).toBe('json');
    expect(res.status).toBe(200);
    expect(res.body.authorizationUrl).toContain('https://github.com/login/oauth/authorize');
    expect(res.body.authorizationUrl).toContain(
      `redirect_uri=${encodeURIComponent('http://localhost:3000/api/auth/oauth/github')}`
    );
  });

  it('never emits a relative redirect_uri (the original defect)', async () => {
    armHappyPathDb();
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    const authUrl = new URL(res.body.authorizationUrl);
    const redirectUri = authUrl.searchParams.get('redirect_uri') || '';
    expect(redirectUri.startsWith('/')).toBe(false);
    expect(new URL(redirectUri).protocol).toBe('http:');
  });

  it('persists the state as a single-use JSON blob {provider, next}', async () => {
    armHappyPathDb();
    const res = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'next=%2Fagents%2F12') } as any,
      routeContext('github')
    );
    const stateKey = `oauth_state:${res.body.state}`;
    expect(storedStates[stateKey]).toBeDefined();
    expect(JSON.parse(storedStates[stateKey].value)).toEqual({
      provider: 'github',
      next: '/agents/12',
    });
  });

  it('returns 404 for an unconfigured provider', async () => {
    (db.oAuthProvider.findUnique as any).mockResolvedValue(null);
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for a disabled provider', async () => {
    (db.oAuthProvider.findUnique as any).mockResolvedValue({ ...PROVIDER_CONFIG, isActive: false });
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET callback branch (code + state present)
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/auth/oauth/[provider] — browser callback', () => {
  it('exchanges the code and redirects to the sanitized next path with the session cookie', async () => {
    armHappyPathDb();
    mockFetchForTokenExchange();
    const res = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'next=%2Fagents%2F12') } as any,
      routeContext('github')
    );
    const state = res.body.state;

    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${state}`) } as any,
      routeContext('github')
    );

    expect(callback.kind).toBe('redirect');
    expect(callback.url).toBe('http://localhost:3000/agents/12');
    expect(callback.cookies['session-token']).toBe('session-token-abc123');
    expect(db.user.update).toHaveBeenCalled();
  });

  it('redirect_uri sent to the token endpoint matches the initiation redirect_uri (absolute)', async () => {
    armHappyPathDb();
    const fetchMock = mockFetchForTokenExchange();
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${res.body.state}`) } as any,
      routeContext('github')
    );
    const tokenCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/access_token'))!;
    const body = String(tokenCall[1].body) as string;
    const redirectUri = new URLSearchParams(body).get('redirect_uri') || '';
    expect(redirectUri.startsWith('/')).toBe(false);
    expect(redirectUri).toBe('http://localhost:3000/api/auth/oauth/github');
  });

  it('defaults the redirect to /dashboard when next is absent', async () => {
    armHappyPathDb();
    mockFetchForTokenExchange();
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${res.body.state}`) } as any,
      routeContext('github')
    );
    expect(callback.url).toBe('http://localhost:3000/dashboard');
  });

  it('open-redirect via next is neutralized at callback time', async () => {
    armHappyPathDb();
    mockFetchForTokenExchange();
    const res = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'next=%2F%2Fevil.com') } as any,
      routeContext('github')
    );
    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${res.body.state}`) } as any,
      routeContext('github')
    );
    expect(callback.url).toBe('http://localhost:3000/dashboard');
    expect(callback.url).not.toContain('evil.com');
  });

  it('consumes state single-use: a replayed state redirects to /login?error', async () => {
    armHappyPathDb();
    mockFetchForTokenExchange();
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    const first = await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${res.body.state}`) } as any,
      routeContext('github')
    );
    expect(first.kind).toBe('redirect');
    expect(first.cookies['session-token']).toBeDefined();

    const replay = await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${res.body.state}`) } as any,
      routeContext('github')
    );
    expect(replay.kind).toBe('redirect');
    expect(replay.url).toContain('/login?error=oauth_failed');
    expect(replay.cookies['session-token']).toBeUndefined();
  });

  it('rejects a foreign state value', async () => {
    storedStates['oauth_state:unknown'] = {
      value: JSON.stringify({ provider: 'google', next: '' }),
      updatedAt: new Date(),
    };
    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'code=auth-code&state=unknown') } as any,
      routeContext('github')
    );
    expect(callback.url).toContain('/login?error=oauth_failed');
  });

  it('rejects an expired state (>10 minutes old)', async () => {
    storedStates['oauth_state:stale'] = {
      value: JSON.stringify({ provider: 'github', next: '' }),
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
    };
    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'code=auth-code&state=stale') } as any,
      routeContext('github')
    );
    expect(callback.url).toContain('/login?error=oauth_failed');
  });

  it('accepts LEGACY plain-provider state rows (backward compatibility)', async () => {
    armHappyPathDb();
    mockFetchForTokenExchange();
    storedStates['oauth_state:legacy'] = { value: 'github', updatedAt: new Date() };
    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'code=auth-code&state=legacy') } as any,
      routeContext('github')
    );
    expect(callback.kind).toBe('redirect');
    expect(callback.url).toBe('http://localhost:3000/dashboard');
    expect(callback.cookies['session-token']).toBe('session-token-abc123');
  });

  it('redirects to /login?error when the provider token exchange fails', async () => {
    armHappyPathDb();
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    const callback = await GET(
      { url: routeUrl('/api/auth/oauth/github', `code=auth-code&state=${res.body.state}`) } as any,
      routeContext('github')
    );
    expect(callback.url).toContain('/login?error=oauth_failed&provider=github');
    expect(callback.cookies['session-token']).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST JSON callback (programmatic clients — unchanged contract)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/oauth/[provider] — JSON callback', () => {
  it('returns { user, token, redirectTo } for a valid code+state', async () => {
    armHappyPathDb();
    mockFetchForTokenExchange();
    const res = await GET(
      { url: routeUrl('/api/auth/oauth/github', 'next=%2Fagents%2F12') } as any,
      routeContext('github')
    );
    const post = await POST(
      {
        url: routeUrl('/api/auth/oauth/github'),
        json: async () => ({ code: 'auth-code', state: res.body.state }),
      } as any,
      routeContext('github')
    );
    expect(post.status).toBe(200);
    expect(post.body.user.email).toBe('dev@example.com');
    expect(post.body.token).toBe('session-token-abc123');
    expect(post.body.redirectTo).toBe('/agents/12');
  });

  it('returns 400 when code or state is missing', async () => {
    const post = await POST(
      { url: routeUrl('/api/auth/oauth/github'), json: async () => ({ code: 'x' }) } as any,
      routeContext('github')
    );
    expect(post.status).toBe(400);
  });

  it('returns 400 for an invalid state', async () => {
    const post = await POST(
      {
        url: routeUrl('/api/auth/oauth/github'),
        json: async () => ({ code: 'auth-code', state: 'bogus' }),
      } as any,
      routeContext('github')
    );
    expect(post.status).toBe(400);
    expect(post.body.error).toMatch(/Invalid or expired OAuth state/);
  });

  it('maps provider-side failures to 502', async () => {
    armHappyPathDb();
    global.fetch = vi.fn(async () => {
      throw new Error('Failed to reach OAuth provider token endpoint: network down');
    }) as unknown as typeof fetch;
    const res = await GET({ url: routeUrl('/api/auth/oauth/github') } as any, routeContext('github'));
    const post = await POST(
      {
        url: routeUrl('/api/auth/oauth/github'),
        json: async () => ({ code: 'auth-code', state: res.body.state }),
      } as any,
      routeContext('github')
    );
    expect(post.status).toBe(502);
  });
});
