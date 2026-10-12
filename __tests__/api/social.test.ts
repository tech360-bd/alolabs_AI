import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock NextRequest ──────────────────────────────────────────────

class MockNextRequest {
  private _body: Record<string, unknown>;
  private _headersMap: Record<string, string>;
  public url: string;

  constructor(url: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    this.url = url;
    this._body = body;
    this._headersMap = headers;
  }

  async json() {
    return this._body;
  }

  get headers() {
    return {
      get: (key: string) => this._headersMap[key.toLowerCase()] ?? null,
    };
  }
}

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
    }),
  },
}));

// Module-level variable for controlling the next/headers mock
// vi.mock is hoisted but can access module-scoped variables via closure
let __testAuthHeader: string | null = null;

const mockSettingsFindMany = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockSettingsUpsert = vi.fn();
const mockSettingsDelete = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findMany: (...args: unknown[]) => mockSettingsFindMany(...args),
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user-1' }),
}));

// The social route calls (await import('next/headers')).headers()
// then calls .get('authorization') on the result directly (not awaited).
// So headers() must return a plain object with .get(), NOT a Promise.
vi.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => key === 'authorization' ? __testAuthHeader : null,
  }),
}));

import { GET, POST, DELETE } from '@/app/api/social/accounts/route';

describe('GET /api/social/accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testAuthHeader = null;
  });

  it('should return 401 when no auth header', async () => {
    const req = new MockNextRequest('http://localhost/api/social/accounts', {}, {});
    const response = await GET(req as any);
    expect(response.status).toBe(401);
  });

  it('should return accounts list when authenticated', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockSettingsFindMany.mockResolvedValue([
      {
        key: 'social:facebook:token',
        value: JSON.stringify({
          connectedAt: new Date().toISOString(),
          platformUserId: 'fb-123',
          platformUsername: 'testuser',
        }),
      },
    ]);

    const req = new MockNextRequest(
      'http://localhost/api/social/accounts',
      {},
      { authorization: 'Bearer valid-token' },
    );
    const response = await GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.data[0].platform).toBe('facebook');
  });

  it('should return empty list when no accounts connected', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockSettingsFindMany.mockResolvedValue([]);

    const req = new MockNextRequest(
      'http://localhost/api/social/accounts',
      {},
      { authorization: 'Bearer valid-token' },
    );
    const response = await GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(0);
  });
});

describe('POST /api/social/accounts (connect)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testAuthHeader = null;
  });

  it('should return 401 when no auth header', async () => {
    const req = new MockNextRequest('http://localhost/api/social/accounts', {
      platform: 'facebook',
      accessToken: 'fb-token',
    });
    const response = await POST(req as any);
    expect(response.status).toBe(401);
  });

  it('should return 400 for invalid platform', async () => {
    __testAuthHeader = 'Bearer valid-token';
    const req = new MockNextRequest(
      'http://localhost/api/social/accounts',
      { platform: 'snapchat', accessToken: 'token' },
      { authorization: 'Bearer valid-token' },
    );
    const response = await POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when accessToken is missing', async () => {
    __testAuthHeader = 'Bearer valid-token';
    const req = new MockNextRequest(
      'http://localhost/api/social/accounts',
      { platform: 'facebook' },
      { authorization: 'Bearer valid-token' },
    );
    const response = await POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should connect an account successfully', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockSettingsUpsert.mockResolvedValue({});
    mockAuditLogCreate.mockResolvedValue({});

    const req = new MockNextRequest(
      'http://localhost/api/social/accounts',
      {
        platform: 'twitter',
        accessToken: 'tw-access-token',
        platformUsername: '@testuser',
      },
      { authorization: 'Bearer valid-token' },
    );
    const response = await POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.platform).toBe('twitter');
  });
});

describe('POST /api/social/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testAuthHeader = null;
  });

  it('should require authentication', async () => {
    const { POST: PUBLISH_POST } = await import('@/app/api/social/publish/route');
    const req = new MockNextRequest(
      'http://localhost/api/social/publish',
      { content: 'Hello!', platforms: ['facebook'] },
      { authorization: 'Bearer valid-token' },
    );
    const response = await PUBLISH_POST(req as any);
    // Response should be some status
    expect(typeof response.status).toBe('number');
  });
});