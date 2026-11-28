import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const SECRET = 'proxy-jwt-test-secret-long-enough-for-hmac';

function token(audience: 'internal' | 'client', secret = SECRET) {
  return jwt.sign({
    userId: audience === 'client' ? 'client-user' : 'staff-user',
    role: audience === 'client' ? 'client' : 'admin',
    jti: `${audience}-session-id`,
    aud: audience,
  }, secret, { algorithm: 'HS256', expiresIn: '5m' });
}

function apiRequest(path: string, bearer?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

describe('request proxy JWT enforcement', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it('requires Bearer credentials on private APIs', async () => {
    const response = await proxy(apiRequest('/api/internal/clients'));
    expect(response.status).toBe(401);
  });

  it('rejects a forged or unsupported JWT before forwarding', async () => {
    const forged = token('internal', 'attacker-controlled-secret-long-enough');
    const response = await proxy(apiRequest('/api/internal/clients', forged));
    expect(response.status).toBe(401);
  });

  it('verifies the JWT and forwards the authenticated user id for an internal call', async () => {
    const response = await proxy(apiRequest('/api/internal/clients', token('internal')));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-alo-authenticated-user-id')).toBe('staff-user');
  });

  it('rewrites a client JWT probing an internal endpoint to the denial route', async () => {
    const response = await proxy(apiRequest('/api/internal/clients', token('client')));
    expect(new URL(response.headers.get('x-middleware-rewrite')!).pathname).toBe('/api/access-denied');
  });

  it('allows each signed audience only on its own route group', async () => {
    const client = await proxy(apiRequest('/api/portal/projects', token('client')));
    const staff = await proxy(apiRequest('/api/internal/clients', token('internal')));
    expect(client.headers.get('x-middleware-next')).toBe('1');
    expect(staff.headers.get('x-middleware-next')).toBe('1');

    const staffOnPortal = await proxy(apiRequest('/api/portal/projects', token('internal')));
    expect(new URL(staffOnPortal.headers.get('x-middleware-rewrite')!).pathname).toBe('/api/access-denied');
  });

  it('rejects unverified session-token cookie bypasses on /api/v1 and /api/v1/platform', async () => {
    const forgedJwt = token('internal', 'attacker-controlled-secret-long-enough');
    for (const path of ['/api/v1/runs', '/api/v1/platform/chat']) {
      const bogusCookieRes = await proxy(
        new NextRequest(`http://localhost${path}`, {
          headers: { cookie: 'session-token=not-a-valid-token' },
        }),
      );
      expect(bogusCookieRes.status, path).toBe(401);

      const forgedCookieRes = await proxy(
        new NextRequest(`http://localhost${path}`, {
          headers: { cookie: `session-token=${forgedJwt}` },
        }),
      );
      expect(forgedCookieRes.status, path).toBe(401);
    }

    const validCookieRes = await proxy(
      new NextRequest('http://localhost/api/v1/platform/chat', {
        headers: { cookie: `session-token=${token('internal')}` },
      }),
    );
    expect(validCookieRes.status).toBe(200);
    expect(validCookieRes.headers.get('x-middleware-next')).toBe('1');
    expect(validCookieRes.headers.get('x-middleware-request-x-alo-authenticated-user-id')).toBe('staff-user');
  });

  it('supports Bearer alo_ keys on /api/v1 and Bearer alo_pk_ keys on /api/v1/platform while rejecting malformed or misplaced keys', async () => {
    const companyKey = 'alo_company_valid_12345678';
    const platformKey = 'alo_pk_platform_valid_12345678';

    expect((await proxy(apiRequest('/api/v1/runs', companyKey))).status).toBe(200);
    expect((await proxy(apiRequest('/api/v1/platform/chat', platformKey))).status).toBe(200);

    // Cross-plane & non-v1 rejection
    expect((await proxy(apiRequest('/api/v1/platform/chat', companyKey))).status).toBe(401);
    expect((await proxy(apiRequest('/api/v1/runs', platformKey))).status).toBe(401);
    expect((await proxy(apiRequest('/api/agents', companyKey))).status).toBe(401);

    // Malformed keys rejected
    for (const badKey of ['alo_', 'alo_x', 'alo_pk_', 'alo_pk_short', 'alo_bad key']) {
      expect((await proxy(apiRequest('/api/v1/runs', badKey))).status, badKey).toBe(401);
      expect(
        (
          await proxy(
            new NextRequest('http://localhost/api/v1/platform/chat', {
              headers: { 'x-api-key': badKey },
            }),
          )
        ).status,
        `x-api-key ${badKey}`,
      ).toBe(401);
    }
  });

  it('never trusts unverified JWT claims when JWT_SECRET is missing or invalid', async () => {
    const prevSecret = process.env.JWT_SECRET;
    const prevDev = (globalThis as { __aloDevJwtSecret?: string }).__aloDevJwtSecret;
    delete process.env.JWT_SECRET;
    delete (globalThis as { __aloDevJwtSecret?: string }).__aloDevJwtSecret;
    try {
      const forged = token('internal', 'any-secret-longer-than-32-characters!');
      const apiRes = await proxy(apiRequest('/api/internal/clients', forged));
      expect(apiRes.status).toBe(401);

      const pageRes = await proxy(
        new NextRequest('http://localhost/dashboard', {
          headers: { cookie: `session-token=${forged}` },
        }),
      );
      expect(pageRes.status).toBeGreaterThanOrEqual(300);
      expect(new URL(pageRes.headers.get('location')!).pathname).toBe('/login');
    } finally {
      process.env.JWT_SECRET = prevSecret;
      (globalThis as { __aloDevJwtSecret?: string }).__aloDevJwtSecret = prevDev;
    }
  });
});
