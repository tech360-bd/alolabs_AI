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
});
