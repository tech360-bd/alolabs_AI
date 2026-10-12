/**
 * AgentOS v1 API authentication — session Bearer and X-API-Key paths,
 * tenant scoping, expiry and scope enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { fakeDb, resetAgentOsMocks } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));
vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn(),
}));

import { authenticateV1, hasScope } from '@/lib/v1-auth';
import { verifySessionToken } from '@/lib/auth';

class MockRequest {
  private _headers: Record<string, string>;
  constructor(headers: Record<string, string> = {}) {
    this._headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  }
  get headers() {
    return { get: (key: string) => this._headers[key.toLowerCase()] ?? null };
  }
}

const req = (headers: Record<string, string>) => new MockRequest(headers) as unknown as import('next/server').NextRequest;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

beforeEach(() => {
  resetAgentOsMocks();
  vi.mocked(verifySessionToken).mockReset();
  fakeDb.db.user.create({
    data: { id: 'user-1', email: 'admin@alo.com', name: 'Admin', role: 'admin', isActive: true },
  });
  fakeDb.db.company.create({
    data: { id: 'company-1', name: 'ALO Education', slug: 'alo-education', status: 'active' },
  });
  fakeDb.db.companyUser.create({
    data: { id: 'cu-1', companyId: 'company-1', userId: 'user-1', role: 'admin' },
  });
});

describe('authenticateV1', () => {
  it('authenticates a session Bearer token and resolves the tenant', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({ userId: 'user-1' });

    const identity = await authenticateV1(req({ authorization: 'Bearer session-token' }));
    expect(identity).toBeTruthy();
    expect(identity!.userId).toBe('user-1');
    expect(identity!.companyId).toBe('company-1');
    expect(identity!.kind).toBe('session');
  });

  it('authenticates an X-API-Key (sha256 of the stored hash)', async () => {
    const rawKey = 'REDACTED_EXAMPLE_CREDENTIAL';
    fakeDb.db.companyApiKey.create({
      data: {
        id: 'key-1',
        keyHash: sha256(rawKey),
        keyPrefix: 'alo_labs',
        keySuffix: '6789',
        scopes: JSON.stringify(['runs:read', 'runs:write']),
        isActive: true,
        companyId: 'company-1',
      },
    });

    const identity = await authenticateV1(req({ 'x-api-key': rawKey }));
    expect(identity).toBeTruthy();
    expect(identity!.kind).toBe('apiKey');
    expect(identity!.companyId).toBe('company-1');
    expect(identity!.scopes).toEqual(['runs:read', 'runs:write']);
    // lastUsedAt recorded
    const key = fakeDb.rows('companyApiKey')[0];
    expect(key.lastUsedAt).toBeTruthy();
  });

  it('authenticates an Authorization: Bearer alo_… API key', async () => {
    const rawKey = 'REDACTED_EXAMPLE_CREDENTIAL';
    fakeDb.db.companyApiKey.create({
      data: {
        id: 'key-2',
        keyHash: sha256(rawKey),
        keyPrefix: 'alo_labs',
        keySuffix: '3210',
        scopes: JSON.stringify(['*']),
        isActive: true,
        companyId: 'company-1',
      },
    });

    const identity = await authenticateV1(req({ authorization: `Bearer ${rawKey}` }));
    expect(identity).toBeTruthy();
    expect(identity!.kind).toBe('apiKey');
  });

  it('rejects an unknown API key', async () => {
    const identity = await authenticateV1(req({ 'x-api-key': 'alo_labs_wrong' }));
    expect(identity).toBeNull();
  });

  it('rejects a revoked (isActive=false) API key', async () => {
    const rawKey = 'alo_labs_revoked0000000';
    fakeDb.db.companyApiKey.create({
      data: {
        id: 'key-3',
        keyHash: sha256(rawKey),
        keyPrefix: 'alo_labs',
        keySuffix: '0000',
        scopes: JSON.stringify(['*']),
        isActive: false,
        companyId: 'company-1',
      },
    });
    const identity = await authenticateV1(req({ 'x-api-key': rawKey }));
    expect(identity).toBeNull();
  });

  it('rejects an expired API key', async () => {
    const rawKey = 'alo_labs_expired00000';
    fakeDb.db.companyApiKey.create({
      data: {
        id: 'key-4',
        keyHash: sha256(rawKey),
        keyPrefix: 'alo_labs',
        keySuffix: 'd000',
        scopes: JSON.stringify(['*']),
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
        companyId: 'company-1',
      },
    });
    const identity = await authenticateV1(req({ 'x-api-key': rawKey }));
    expect(identity).toBeNull();
  });

  it('rejects requests with no credentials', async () => {
    expect(await authenticateV1(req({}))).toBeNull();
  });

  it('rejects a session token with no company membership', async () => {
    vi.mocked(verifySessionToken).mockResolvedValue({ userId: 'user-no-company' });
    expect(await authenticateV1(req({ authorization: 'Bearer session-token' }))).toBeNull();
  });
});

describe('hasScope', () => {
  const identityWith = (scopes: string[]) => ({ scopes }) as never;
  it('grants wildcard and exact scopes', () => {
    expect(hasScope(identityWith(['*']), 'runs:write')).toBe(true);
    expect(hasScope(identityWith(['runs:read', 'runs:write']), 'runs:write')).toBe(true);
    expect(hasScope(identityWith(['runs:read']), 'runs:write')).toBe(false);
    expect(hasScope(identityWith([]), 'runs:read')).toBe(false);
  });
});
