/**
 * Tests for the platform route wrapper: the security boundary that every
 * `/api/v1/platform/**` handler sits behind.
 *
 * These run the real wrapper against a real `NextRequest`. Only the principal
 * resolution and rate limiter are controlled, because those are the two inputs
 * that would otherwise need a database and a browser session; everything else —
 * scope checks, tenancy checks, validation, error envelopes — is the production
 * code path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const principalState: {
  value: {
    kind: 'session' | 'api-key';
    userId: string;
    workspaceId: string;
    projectId?: string;
    apiKeyId?: string;
    scopes: string[];
    rateLimitPerMinute: number;
  } | null;
} = { value: null };

const limitState = { calls: [] as Array<{ limit: number; windowMs: number }>, allowed: true };

// Deliberately NOT `importActual`: the real principal module imports the Prisma
// client, which imports the node:sqlite driver — a Node built-in that cannot be
// bundled into the jsdom environment the rest of the suite uses. Only the two
// functions the wrapper calls are needed, and stubbing them keeps this test
// about the wrapper rather than about Prisma.
vi.mock('@/lib/platform/principal', () => ({
  resolvePrincipal: vi.fn(async () => principalState.value),
  principalOwnsProject: vi.fn(async (principal: { workspaceId: string }, projectId: string) =>
    projectId.startsWith(principal.workspaceId)),
  hasScope: (principal: { scopes: string[] }, scope: string) =>
    principal.scopes.includes(scope) || principal.scopes.includes('admin:all'),
}));

vi.mock('@/lib/security/rate-limiter', () => ({
  checkLimit: vi.fn(async (_key: string, limit: number, windowMs: number) => {
    limitState.calls.push({ limit, windowMs });
    return limitState.allowed
      ? { allowed: true, remaining: 1, resetAt: Date.now() + windowMs, limit }
      : { allowed: false, remaining: 0, resetAt: Date.now() + windowMs, limit };
  }),
}));

import { platformRoute, PlatformError, badRequest } from '@/lib/platform/http';
import { z } from 'zod';

function request(url = 'http://localhost:3011/api/v1/platform/test', init?: RequestInit) {
  return new NextRequest(url, init);
}

const sessionPrincipal = {
  kind: 'session' as const,
  userId: 'user-1',
  workspaceId: 'ws-1',
  scopes: ['ai:chat', 'models:read', 'admin:all'],
  rateLimitPerMinute: 60,
};

const keyPrincipal = {
  kind: 'api-key' as const,
  userId: 'user-1',
  workspaceId: 'ws-1',
  projectId: 'ws-1-proj',
  apiKeyId: 'key-1',
  scopes: ['ai:chat'],
  rateLimitPerMinute: 5,
};

describe('platformRoute', () => {
  beforeEach(() => {
    principalState.value = sessionPrincipal;
    limitState.allowed = true;
    limitState.calls = [];
  });

  it('rejects an unauthenticated request with 401 and a single error envelope', async () => {
    principalState.value = null;
    const handler = vi.fn(async () => Response.json({}) as never);
    const response = await platformRoute({}, handler)(request());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; message: string }; requestId: string };
    expect(body.error.code).toBe('unauthorized');
    expect(body.requestId).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it('distinguishes a bad credential from no credential, without revealing which check failed', async () => {
    principalState.value = null;
    const response = await platformRoute({}, async () => Response.json({}) as never)(
      request('http://localhost:3011/x', { headers: { 'x-api-key': 'alo_pk_bogus' } }),
    );
    const body = (await response.json()) as { error: { message: string; remediation?: string } };
    expect(response.status).toBe(401);
    expect(body.error.message).toMatch(/invalid, revoked or expired/i);
    expect(body.error.remediation).toBeTruthy();
    // It must not say "unknown key" vs "revoked key" — that is an oracle.
    expect(body.error.message.toLowerCase()).not.toContain('not found');
  });

  it('refuses a credential that lacks the required scope, before running the handler', async () => {
    principalState.value = { ...keyPrincipal, scopes: ['models:read'] };
    const handler = vi.fn(async () => Response.json({}) as never);

    const response = await platformRoute({ scope: 'ai:chat' }, handler)(request());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('ai:chat');
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses the principal's own rate limit and never lets a route relax it", async () => {
    // A key minted with 5/min must be capped at 5 even though the route declares 120.
    principalState.value = keyPrincipal;
    await platformRoute({ rateLimit: { limit: 120, windowMs: 60_000 } }, async () => Response.json({}) as never)(
      request('http://localhost:3011/x', { headers: { 'x-api-key': 'alo_pk_x' } }),
    );
    expect(limitState.calls[0]?.limit).toBe(5);

    // A route may tighten below the principal's ceiling.
    limitState.calls = [];
    await platformRoute({ rateLimit: { limit: 2 } }, async () => Response.json({}) as never)(
      request('http://localhost:3011/x', { headers: { 'x-api-key': 'alo_pk_x' } }),
    );
    expect(limitState.calls[0]?.limit).toBe(2);
  });

  it('returns 429 with a retry hint when the limit is exceeded', async () => {
    limitState.allowed = false;
    const response = await platformRoute({}, async () => Response.json({}) as never)(request());

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string; remediation?: string } };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.remediation).toMatch(/retry after/i);
  });

  it('keys the limit on the credential, not on a header or an address', async () => {
    const { checkLimit } = await import('@/lib/security/rate-limiter');
    principalState.value = keyPrincipal;
    await platformRoute({}, async () => Response.json({}) as never)(
      request('http://localhost:3011/x', {
        headers: { 'x-api-key': 'alo_pk_x', 'x-forwarded-for': '203.0.113.9' },
      }),
    );
    expect(vi.mocked(checkLimit).mock.calls[0]?.[0]).toBe('platform:key:key-1');

    vi.mocked(checkLimit).mockClear();
    principalState.value = sessionPrincipal;
    await platformRoute({}, async () => Response.json({}) as never)(
      request('http://localhost:3011/x', { headers: { cookie: 'session-token=abc' } }),
    );
    expect(vi.mocked(checkLimit).mock.calls[0]?.[0]).toBe('platform:user:user-1');
  });

  it('validates the body and reports which field failed', async () => {
    const response = await platformRoute(
      { body: z.object({ name: z.string().min(3), count: z.number().int() }) },
      async () => Response.json({}) as never,
    )(request('http://localhost:3011/x', { method: 'POST', body: JSON.stringify({ name: 'ab', count: 1.5 }) }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('name');
    expect(body.error.message).toContain('count');
  });

  it('rejects malformed JSON as a 400 rather than a 500', async () => {
    const response = await platformRoute(
      { body: z.object({ a: z.string() }) },
      async () => Response.json({}) as never,
    )(request('http://localhost:3011/x', { method: 'POST', body: '{not json' }));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('invalid_request');
  });

  it('hides another tenant\'s project behind a 404, not a 403', async () => {
    principalState.value = keyPrincipal;
    const response = await platformRoute({ projectScoped: true }, async () => Response.json({}) as never)(
      request('http://localhost:3011/x', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'someone-elses-project' }),
      }),
    );

    // 403 would confirm the id exists. 404 says nothing.
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('not_found');
  });

  it('accepts a project id that belongs to the principal\'s workspace', async () => {
    principalState.value = keyPrincipal;
    const handler = vi.fn(async () => Response.json({ ok: true }) as never);
    const response = await platformRoute({ projectScoped: true }, handler)(
      request('http://localhost:3011/x', { method: 'POST', body: JSON.stringify({ projectId: 'ws-1-project-7' }) }),
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('maps a PlatformError to its declared status and code', async () => {
    const response = await platformRoute({}, async () => {
      throw new PlatformError(409, 'conflict', 'Name already taken', 'Choose another name.');
    })(request());

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; remediation?: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.remediation).toBe('Choose another name.');
  });

  it('turns an unexpected throw into a 500 without leaking the stack', async () => {
    const response = await platformRoute({}, async () => {
      throw new Error('connection string postgres://user:hunter2@db/prod');
    })(request());

    expect(response.status).toBe(500);
    const textual = await response.text();
    expect(textual).not.toContain('hunter2');
    expect(textual).not.toContain('at ');
    expect(textual).toContain('Internal server error');
  });

  it('reports a Prisma unique violation as 409 rather than 500', async () => {
    const response = await platformRoute({}, async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    })(request());

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('conflict');
  });

  it('never caches a response and always carries a request id', async () => {
    const { json } = await import('@/lib/platform/http');
    const response = await platformRoute({}, async ({ requestId }) => json({ ok: true }, requestId))(request());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('exposes the principal\'s workspace to the handler so queries cannot wander', async () => {
    const handler = vi.fn(async ({ workspaceId }: { workspaceId: string }) =>
      Response.json({ workspaceId }) as never);
    const response = await platformRoute({}, handler as never)(request());
    const body = (await response.json()) as { workspaceId: string };
    expect(body.workspaceId).toBe('ws-1');
  });

  it('rejects a bad query parameter with 400', async () => {
    const response = await platformRoute(
      { query: z.object({ days: z.coerce.number().int().min(1).max(30) }) },
      async () => Response.json({}) as never,
    )(request('http://localhost:3011/x?days=9999'));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain('days');
  });

  it('builds PlatformErrors through helpers so status and code stay paired', () => {
    // The helpers *return* an error for the handler to throw; they do not throw
    // themselves, so a handler can build one conditionally.
    const error = badRequest('projectId is required');
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_request');
  });
});
