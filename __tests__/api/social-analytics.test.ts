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
    
    mockCanManageSocial.mockReturnValue(false);
    const { GET: GET_RELOADED } = await import('@/app/api/social/analytics/route');
    const req = new MockNextRequest('http://localhost/api/social/analytics?platform=facebook');
    const response = await GET_RELOADED(req as any);
    expect(response.status).toBe(403);
  });

  // ─── Provider error mapping ────────────────────────────────────────────────
  // These drive the exported `handleSocialAnalytics` seam with a stub fetcher,
  // so the mapping contract is tested without a live provider account or any
  // outbound network call.

  const importHandler = async () =>
    (await import('@/app/api/social/analytics/route')).handleSocialAnalytics;

  const callWith = async (url: string, stub: (p: string) => Promise<Record<string, unknown>>) => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken.mockResolvedValue({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } });
    const handler = await importHandler();
    const req = new MockNextRequest(url);
    return handler(req as any, stub as any);
  };

  it('should handle Facebook success (all providers success)', async () => {
    const response = await callWith(
      'http://localhost/api/social/analytics?platform=facebook',
      async () => ({ page_fans: 100 }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.platform).toBe('facebook');
    expect(data.data.page_fans).toBe(100);
  });

  const mappingCases: Array<[string, string, number]> = [
    ['Authentication failure', 'Authentication failure', 401],
    ['Permission failure', 'Permission failure', 403],
    ['Rate limit exceeded', 'Rate limit exceeded', 429],
    ['Provider unavailable', 'Provider unavailable', 503],
    ['Network error', 'Provider network error', 502],
    ['Request timeout', 'Request timeout', 504],
    ['Invalid JSON returned', 'Invalid provider response', 400],
    ['Invalid response shape', 'Invalid provider response', 400],
  ];

  for (const [thrown, expectedError, expectedStatus] of mappingCases) {
    it(`should handle provider failure: ${thrown}`, async () => {
      const response = await callWith(
        'http://localhost/api/social/analytics?platform=facebook',
        async () => { throw new Error(thrown); },
      );
      expect(response.status).toBe(expectedStatus);
      const data = await response.json();
      expect(data.error).toBe(expectedError);
    });
  }

  it('should handle partial provider success (fetchAll)', async () => {
    __testAuthHeader = 'Bearer valid-token';
    mockGetPlatformToken
      .mockResolvedValueOnce({ accessToken: 'fb-token', metadata: { pageId: 'page-1' } })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ accessToken: 'tw-token', metadata: { userId: 'user-1' } })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    let call = 0;
    const stub = async () => {
      call += 1;
      return call === 1 ? { page_fans: 100 } : { ok: true };
    };

    const handler = await importHandler();
    const req = new MockNextRequest('http://localhost/api/social/analytics?fetchAll=true');
    const response = await handler(req as any, stub as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(7);
    expect(data.data.find((r: any) => r.platform === 'facebook').data.page_fans).toBe(100);
    expect(data.data.find((r: any) => r.platform === 'instagram').data.error).toBe('No connected account');
  });
});
