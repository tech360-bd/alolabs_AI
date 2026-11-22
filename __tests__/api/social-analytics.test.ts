import { describe, it, expect, vi } from 'vitest';

// ─── Mock NextRequest ──────────────────────────────────────────────

class MockNextRequest {
  private _url: string;
  private _searchParams: URLSearchParams;

  constructor(url: string) {
    this._url = url;
    try {
      this._searchParams = new URL(url).searchParams;
    } catch (e) {
      // Fallback for test URLs that might be mocked or incomplete
      this._searchParams = new URLSearchParams(url.split('?')[1] || '');
    }
  }

  get url(): string {
    return this._url;
  }

  get searchParams(): URLSearchParams {
    return this._searchParams;
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

// The social analytics route calls (await import('next/headers')).headers()
// then calls .get('authorization') on the result directly (not awaited).
let __testAuthHeader: string | null = null;

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => key === 'authorization' ? __testAuthHeader : null,
  }),
}));

const mockSettingsFindUnique = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockGetPlatformToken = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'admin' }),
}));

vi.mock('@/lib/social/platform-token', () => ({
  getPlatformToken: () => mockGetPlatformToken(),
}));

// Mock the credentials module at the top level
const mockCanManageSocial = vi.fn().mockReturnValue(true);
vi.mock('@/lib/social/credentials', () => ({
  canManageSocial: mockCanManageSocial,
}));

describe('GET /api/social/analytics (Remediation Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __testAuthHeader = null;
    mockGetPlatformToken.mockResolvedValue(null);
    mockAuditLogCreate.mockResolvedValue(undefined);
    mockCanManageSocial.mockReturnValue(true);
  });

  it('should return 401 when no auth header', async () => {
    // Re-import route after resetting mocks
    const { GET } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET(req as any);
    expect(response.status).toBe(401);
  });

  it('should return 403 when role cannot manage social', async () => {
    __testAuthHeader = 'Bearer valid-token';
    
    // Re-import the route module and mock canManageSocial directly
    mockCanManageSocial.mockReturnValue(false);
    
    // Re-import after mock to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(403);
  });

  it('should handle Facebook success (all providers success)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockResolvedValue({ page_fans: 100 }),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.platform).toBe('facebook');
    expect(data.data.page_fans).toBe(100);
  });

  it('should handle provider 401 (Authentication failure)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Authentication failure')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(401); // Now mapped to 401
    const data = await response.json();
    expect(data.error).toBe('Authentication failure');
  });

  it('should handle provider 403 (Permission failure)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Permission failure')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(403); // Now mapped to 403
    const data = await response.json();
    expect(data.error).toBe('Permission failure');
  });

  it('should handle provider 429 (Rate limit)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(429); // Now mapped to 429
    const data = await response.json();
    expect(data.error).toBe('Rate limit exceeded');
  });

  it('should handle provider 500 (Provider unavailable)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Provider unavailable')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(503); // Now mapped to 503
    const data = await response.json();
    expect(data.error).toBe('Provider unavailable');
  });

  it('should handle network connection failure', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Network error')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(502); // Now mapped to 502
    const data = await response.json();
    expect(data.error).toBe('Provider network error');
  });

  it('should handle timeout', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Request timeout')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(504); // Now mapped to 504
    const data = await response.json();
    expect(data.error).toBe('Request timeout');
  });

  it('should handle invalid JSON', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(400); // Now mapped to 400
    const data = await response.json();
    expect(data.error).toBe('Invalid provider response');
  });

  it('should handle unexpected response shape', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    
    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi.fn().mockRejectedValue(new Error('Invalid response shape')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(400); // Now mapped to 400
    const data = await response.json();
    expect(data.error).toBe('Invalid provider response');
  });

  it('should handle partial provider success (fetchAll)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    // First platform succeeds, second fails, third fails
    mockGetPlatformToken
      .mockResolvedValueOnce({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } })
      .mockResolvedValueOnce(null) // Instagram missing token
      .mockResolvedValueOnce({ accessToken: 'tw-token', metadata: { userId: 'user-1' } })
      .mockResolvedValueOnce(null) // LinkedIn missing token
      .mockResolvedValueOnce(null) // YouTube missing token
      .mockResolvedValueOnce(null) // TikTok missing token
      .mockResolvedValueOnce(null); // Pinterest missing token

    // Re-import the route module and mock fetchAnalyticsForPlatform directly
    const actualRoute = await import('@/app/api/social/analytics/route');
    vi.doMock('@/app/api/social/analytics/route', () => ({
      ...actualRoute,
      fetchAnalyticsForPlatform: vi
        .fn()
        .mockResolvedValueOnce({ page_fans: 100 })
        .mockRejectedValueOnce(new Error('Authentication failure'))
        .mockRejectedValueOnce(new Error('Permission failure'))
        .mockRejectedValueOnce(new Error('Provider unavailable'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Invalid provider response')),
    }));

    // Re-import to ensure the route uses the mocked version
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?fetchAll=true');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(7); // All 7 platforms
    expect(data.data.find((r: any) => r.platform === 'facebook').data.page_fans).toBe(100);
    expect(data.data.find((r: any) => r.platform === 'instagram').data.error).toBe('No connected account');
    expect(data.data.find((r: any) => r.platform === 'twitter').data.error).toBeDefined();
  });
});
