import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * Security regression tests for the central API guard.
 *
 * Authentication, rate limiting and persistence are mocked so the suite
 * exercises the guard's decision logic deterministically: which request is
 * refused, with which status, and which security event is recorded.
 */

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  authenticateV1: vi.fn(),
  checkRateLimit: vi.fn(),
  securityEventCreate: vi.fn(),
  auditLogCreate: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock('@/lib/v1-auth', () => ({ authenticateV1: mocks.authenticateV1 }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db', () => ({
  db: {
    securityEvent: { create: mocks.securityEventCreate },
    auditLog: { create: mocks.auditLogCreate },
  },
}));

import {
  ApiHttpError,
  ADMIN_ROLES,
  redact,
  secureRoute,
  tenantTarget,
  type Principal,
  type SecureContext,
} from '@/lib/api/secure-route';

const TENANT_A = 'company-a';
const TENANT_B = 'company-b';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    kind: 'session',
    userId: 'user-1',
    role: 'operator',
    email: 'operator@example.test',
    name: 'Operator',
    companyId: TENANT_A,
    companyRole: 'member',
    scopes: ['*'],
    ...overrides,
  };
}

interface TestRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  search?: Record<string, string>;
  url?: string;
}

function request(options: TestRequestOptions = {}): NextRequest {
  const headers = new Map(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const searchParams = new URLSearchParams(options.search ?? {});
  return {
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    nextUrl: { searchParams },
    url: options.url ?? 'https://alolabs.net/api/test',
    json: async () => {
      if (options.body === undefined) throw new Error('no body');
      return options.body;
    },
  } as unknown as NextRequest;
}

async function read(response: Response): Promise<Record<string, any>> {
  return (await (response as unknown as Response).json()) as Record<string, any>;
}

const allow = { allowed: true, remaining: 10, resetAt: new Date(Date.now() + 60_000), totalInWindow: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUser.mockResolvedValue(null);
  mocks.authenticateV1.mockResolvedValue(null);
  mocks.checkRateLimit.mockResolvedValue(allow);
  mocks.securityEventCreate.mockResolvedValue({ id: 'se-1' });
  mocks.auditLogCreate.mockResolvedValue({ id: 'al-1' });
});

describe('secureRoute — authentication', () => {
  it('rejects unauthenticated requests with 401 and records a security event', async () => {
    const handler = vi.fn();
    const route = secureRoute({ resource: 'test.resource', action: 'create' }, handler);

    const response = await route(request({ body: {} }));

    expect(response.status).toBe(401);
    const body = await read(response);
    expect(body).toMatchObject({
      success: false,
      error: { code: 'unauthorized', message: 'Authentication required' },
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.securityEventCreate).toHaveBeenCalledTimes(1);
    const event = mocks.securityEventCreate.mock.calls[0][0].data;
    expect(event.type).toBe('authentication_failed');
    expect(event.severity).toBe('medium');
    // No credentials or personal data are persisted.
    expect(JSON.stringify(event)).not.toMatch(/example\.test|Bearer|password/i);
  });

  it('accepts a session principal resolved by the legacy authenticator', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test.resource' }, (ctx: SecureContext) => ({
      tenant: ctx.companyId,
      user: ctx.principal.userId,
    }));

    const response = await route(request());

    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ tenant: TENANT_A, user: 'user-1' });
  });

  it('accepts a company API key through the v1 authenticator', async () => {
    mocks.authenticateV1.mockResolvedValue({ ...principal(), kind: 'apiKey', keyId: 'key-1', scopes: ['test:read'] });
    const route = secureRoute({ resource: 'test', scope: 'test:read' }, (ctx: SecureContext) => ({
      kind: ctx.principal.kind,
    }));

    const response = await route(request());

    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ kind: 'apiKey' });
  });

  it('prefers tenant-scoped session resolution (x-company-id) over the v1 fallback', async () => {
    mocks.getAuthUser.mockResolvedValue(principal({ companyId: TENANT_B, companyRole: 'admin' }));
    mocks.authenticateV1.mockResolvedValue(principal({ companyId: TENANT_A }));
    const route = secureRoute({ resource: 'test' }, (ctx: SecureContext) => ({ tenant: ctx.companyId }));

    const response = await route(request({ headers: { 'x-company-id': TENANT_B } }));

    expect(await read(response)).toEqual({ tenant: TENANT_B });
  });
});

describe('secureRoute — tenant isolation', () => {
  it('refuses a principal without a tenant when the route requires one', async () => {
    mocks.getAuthUser.mockResolvedValue(principal({ companyId: undefined, companyRole: undefined }));
    const handler = vi.fn();
    const route = secureRoute({ resource: 'test.resource', action: 'create' }, handler);

    const response = await route(request());

    expect(response.status).toBe(403);
    expect((await read(response)).error.code).toBe('tenant_required');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a body companyId that belongs to another tenant (403) and records a critical event', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const handler = vi.fn();
    const route = secureRoute(
      { resource: 'crm.contacts', action: 'create', body: z.object({ companyId: z.string().optional(), name: z.string() }) },
      handler,
    );

    const response = await route(request({ body: { companyId: TENANT_B, name: 'x' } }));

    expect(response.status).toBe(403);
    expect((await read(response)).error.code).toBe('tenant_mismatch');
    expect(handler).not.toHaveBeenCalled();
    const event = mocks.securityEventCreate.mock.calls.at(-1)[0].data;
    expect(event.type).toBe('tenant_isolation_violation');
    expect(event.severity).toBe('critical');
  });

  it('strips a body companyId even when it matches the principal, so handlers cannot trust the client', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute(
      {
        resource: 'crm.contacts',
        action: 'create',
        body: z.object({ companyId: z.string().optional(), name: z.string() }),
      },
      (ctx: SecureContext<{ companyId?: string; name: string }>) => ({
        clientTenant: ctx.body.companyId ?? null,
        authoritativeTenant: ctx.companyId,
      }),
    );

    const response = await route(request({ body: { companyId: TENANT_A, name: 'x' } }));

    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ clientTenant: null, authoritativeTenant: TENANT_A });
  });

  it('rejects a tenant switch attempted through the query string', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const handler = vi.fn();
    const route = secureRoute(
      { resource: 'test', query: z.object({ companyId: z.string().optional() }) },
      handler,
    );

    const response = await route(request({ search: { companyId: TENANT_B } }));

    expect(response.status).toBe(403);
    expect((await read(response)).error.code).toBe('tenant_mismatch');
  });

  it('assertTenant hides another tenant’s record behind 404', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test', action: 'update' }, (ctx: SecureContext) => {
      ctx.assertTenant(TENANT_B);
      return { ok: true };
    });

    const response = await request();

    const result = await route(response);
    expect(result.status).toBe(404);
    expect((await read(result)).error.code).toBe('not_found');
  });

  it('tenantWhere always injects the principal tenant into Prisma filters', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test' }, (ctx: SecureContext) => ctx.tenantWhere({ status: 'active' }));

    const response = await route(request());

    expect(await read(response)).toEqual({ status: 'active', companyId: TENANT_A });
  });
});

describe('secureRoute — authorisation', () => {
  it('returns 403 for an insufficient global role', async () => {
    mocks.getAuthUser.mockResolvedValue(principal({ role: 'viewer' }));
    const handler = vi.fn();
    const route = secureRoute({ resource: 'admin.settings', action: 'update', roles: ['manager'] }, handler);

    const response = await route(request());

    expect(response.status).toBe(403);
    expect((await read(response)).error.code).toBe('forbidden');
    const event = mocks.securityEventCreate.mock.calls.at(-1)[0].data;
    expect(event.type).toBe('authorization_denied');
    expect(event.details).toContain('insufficient_role');
  });

  it('returns 403 for an insufficient company role', async () => {
    mocks.getAuthUser.mockResolvedValue(principal({ companyRole: 'member' }));
    const route = secureRoute(
      { resource: 'company.billing', action: 'update', companyRoles: ['owner', 'admin'] },
      () => ({ ok: true }),
    );

    const response = await route(request());

    expect(response.status).toBe(403);
  });

  it('lets administrators satisfy role requirements', async () => {
    for (const role of ADMIN_ROLES) {
      mocks.getAuthUser.mockResolvedValue(principal({ role, companyRole: 'member' }));
      const route = secureRoute(
        { resource: 'admin.settings', action: 'update', roles: ['manager'], companyRoles: ['owner'] },
        (ctx: SecureContext) => ({ role: ctx.principal.role }),
      );
      const response = await route(request());
      expect(response.status, `role ${role} must be allowed`).toBe(200);
    }
  });

  it('refuses an API key that lacks the required scope', async () => {
    mocks.authenticateV1.mockResolvedValue(principal({ kind: 'apiKey', keyId: 'key-1', scopes: ['agents:read'] }));
    const route = secureRoute({ resource: 'agents', action: 'create', scope: 'agents:write' }, () => ({ ok: true }));

    const response = await route(request());

    expect(response.status).toBe(403);
    const event = mocks.securityEventCreate.mock.calls.at(-1)[0].data;
    expect(event.details).toContain('missing_scope');
  });

  it('accepts a wildcard-scoped API key', async () => {
    mocks.authenticateV1.mockResolvedValue(principal({ kind: 'apiKey', keyId: 'key-1', scopes: ['*'] }));
    const route = secureRoute({ resource: 'agents', action: 'create', scope: 'agents:write' }, () => ({ ok: true }));

    expect((await route(request())).status).toBe(200);
  });
});

describe('secureRoute — validation', () => {
  it('returns 422 with field issues for an invalid body', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute(
      { resource: 'test', action: 'create', body: z.object({ name: z.string().min(3) }) },
      () => ({ ok: true }),
    );

    const response = await route(request({ body: { name: 'a' } }));

    expect(response.status).toBe(422);
    const body = await read(response);
    expect(body.error.code).toBe('invalid_body');
    expect(body.error.details[0].path).toEqual(['name']);
  });

  it('returns 400 for invalid query parameters', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test', query: z.object({ page: z.coerce.number().int() }) }, () => ({ ok: true }));

    const response = await route(request({ search: { page: 'abc' } }));

    expect(response.status).toBe(400);
    expect((await read(response)).error.code).toBe('invalid_query');
  });

  it('returns 400 for malformed JSON', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test', body: z.object({ name: z.string() }) }, () => ({ ok: true }));

    const response = await route(request({ body: undefined }));

    expect(response.status).toBe(400);
    expect((await read(response)).error.code).toBe('invalid_json');
  });

  it('maps thrown ApiHttpError values to their status', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test' }, () => {
      throw new ApiHttpError(409, 'conflict', 'Duplicate slug');
    });

    const response = await route(request());

    expect(response.status).toBe(409);
    expect((await read(response)).error.code).toBe('conflict');
  });

  it('never leaks a stack trace on unexpected failures', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute({ resource: 'test' }, () => {
      throw new Error('connection string postgres://user:password@host/db');
    });

    const response = await route(request());

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain('internal_error');
    expect(text).not.toContain('password');
    expect(text).not.toContain('postgres://');
  });
});

describe('secureRoute — rate limiting', () => {
  it('returns 429 with retry-after and records an event when the bucket is exhausted', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      totalInWindow: 100,
    });
    const handler = vi.fn();
    const route = secureRoute(
      { resource: 'auth.login', action: 'create', rateLimit: { limit: 5, windowMs: 60_000 } },
      handler,
    );

    const response = await route(request());

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.securityEventCreate.mock.calls.at(-1)[0].data.type).toBe('rate_limit_exceeded');
  });

  it('cannot be bypassed by spoofed client headers', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute(
      { resource: 'test', action: 'create', rateLimit: { limit: 10, windowMs: 60_000 } },
      () => ({ ok: true }),
    );

    await route(request({ headers: { 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '1.1.1.1' } }));
    await route(request({ headers: { 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '2.2.2.2' } }));
    await route(request({ headers: { 'x-forwarded-for': '203.0.113.9' } }));

    const keys = mocks.checkRateLimit.mock.calls.map((call) => call[0]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('test:create:session:user-1');
  });

  it('rate-limits anonymous callers on a shared pre-auth bucket', async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 1000),
      totalInWindow: 50,
    });
    const route = secureRoute(
      { resource: 'auth.login', action: 'create', auth: 'optional', tenant: 'none', rateLimit: { limit: 5, windowMs: 60_000, preAuth: true } },
      () => ({ ok: true }),
    );

    const response = await route(request({ headers: { 'x-forwarded-for': '9.9.9.9' } }));

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit.mock.calls[0][0]).toBe('anon:auth.login:create');
  });
});

describe('security event hygiene', () => {
  it('redacts credentials and personal data from recorded metadata', () => {
    const redacted = redact({
      email: 'operator@example.test',
      password: 'hunter2',
      authorization: 'Bearer secret-token',
      apiKey: 'alo_live_123',
      nested: { token: 'abc', safe: 'visible' },
      note: 'x'.repeat(500),
    }) as Record<string, any>;

    expect(redacted.email).toBe('[redacted]');
    expect(redacted.password).toBe('[redacted]');
    expect(redacted.authorization).toBe('[redacted]');
    expect(redacted.apiKey).toBe('[redacted]');
    expect(redacted.nested).toEqual({ token: '[redacted]', safe: 'visible' });
    expect(String(redacted.note)).toHaveLength(201);
  });

  it('writes no request body, header or token into the audit record', async () => {
    mocks.getAuthUser.mockResolvedValue(principal());
    const route = secureRoute(
      { resource: 'test', action: 'create', body: z.object({ secret: z.string() }) },
      () => {
        throw new ApiHttpError(403, 'forbidden', 'nope');
      },
    );

    await route(request({ body: { secret: 'super-secret-value' }, headers: { authorization: 'Bearer tok' } }));

    const event = mocks.securityEventCreate.mock.calls.at(-1)[0].data;
    expect(event.details).not.toContain('super-secret-value');
    expect(event.details).not.toContain('tok');
  });
});

// ─── tenantTarget — shared tenant resolution for hand-written routes ─────

describe('tenantTarget', () => {
  const member = { role: 'operator', companyId: 'company-a' };
  const adminUser = { role: 'admin', companyId: 'company-a' };
  const superAdmin = { role: 'super_admin', companyId: 'company-a' };

  it('pins a member to their own tenant when nothing is requested', () => {
    expect(tenantTarget(member, null)).toEqual({ ok: true, companyId: 'company-a' });
  });

  it('allows a member to name their own tenant', () => {
    expect(tenantTarget(member, 'company-a')).toEqual({ ok: true, companyId: 'company-a' });
  });

  it('refuses a member naming another tenant', () => {
    const result = tenantTarget(member, 'company-b');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 403 });
  });

  it('refuses a tenant admin naming another tenant', () => {
    expect(tenantTarget(adminUser, 'company-b').ok).toBe(false);
  });

  it('lets a super admin administer any tenant', () => {
    expect(tenantTarget(superAdmin, 'company-b')).toEqual({ ok: true, companyId: 'company-b' });
    expect(tenantTarget(superAdmin, null)).toEqual({ ok: true, companyId: 'company-a' });
  });

  it('refuses a principal with no tenant', () => {
    const result = tenantTarget({ role: 'operator', companyId: null }, 'company-b');
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses an anonymous principal', () => {
    expect(tenantTarget(null, 'company-a').ok).toBe(false);
  });
});
