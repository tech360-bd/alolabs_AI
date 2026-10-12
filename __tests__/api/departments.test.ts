import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock auth ────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'admin@alo.com', role: 'admin' }),
}));

// ─── Mock NextRequest ─────────────────────────────────────────────

class MockNextRequest {
  private _url: string;
  private _headersMap: Record<string, string>;

  constructor(url: string, headers: Record<string, string> = {}) {
    this._url = url;
    this._headersMap = headers;
  }

  get url() {
    return this._url;
  }

  get headers() {
    return {
      get: (key: string) => this._headersMap[key.toLowerCase()] ?? null,
    };
  }

  async json() {
    return {};
  }
}

function createMockRequest(url: string) {
  return new MockNextRequest(url, { authorization: 'Bearer valid-session-token' }) as unknown as import('next/server').NextRequest;
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

const mockDepartmentFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    department: {
      findMany: (...args: unknown[]) => mockDepartmentFindMany(...args),
    },
  },
}));

import { GET } from '@/app/api/departments/route';

describe('GET /api/departments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return department tree as a flat list sorted by sortOrder', async () => {
    mockDepartmentFindMany.mockResolvedValue([
      {
        id: '1',
        name: 'Sales',
        slug: 'sales',
        description: 'Sales department',
        sortOrder: 1,
        status: 'active',
        _count: { agents: 5 },
      },
      {
        id: '2',
        name: 'Engineering',
        slug: 'engineering',
        description: 'Engineering department',
        sortOrder: 2,
        status: 'active',
        _count: { agents: 10 },
      },
    ]);

    const request = createMockRequest('http://localhost/api/departments');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.data).toHaveLength(2);
    expect(data.data[0].name).toBe('Sales');
    expect(data.data[0].agentCount).toBe(5);
    expect(data.data[1].name).toBe('Engineering');
    expect(data.data[1].agentCount).toBe(10);
  });

  it('should include required fields in each department', async () => {
    mockDepartmentFindMany.mockResolvedValue([
      {
        id: '1',
        name: 'HR',
        slug: 'hr',
        description: 'Human Resources',
        sortOrder: 0,
        status: 'active',
        _count: { agents: 3 },
      },
    ]);

    const request = createMockRequest('http://localhost/api/departments');
    const response = await GET(request);
    const data = await response.json();
    const dept = data.data[0];

    expect(dept).toHaveProperty('id');
    expect(dept).toHaveProperty('name');
    expect(dept).toHaveProperty('slug');
    expect(dept).toHaveProperty('description');
    expect(dept).toHaveProperty('agentCount');
    expect(dept).toHaveProperty('sortOrder');
    expect(dept).toHaveProperty('status');
  });

  it('should query with orderBy sortOrder asc', async () => {
    mockDepartmentFindMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost/api/departments');
    await GET(request);

    expect(mockDepartmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { sortOrder: 'asc' },
      })
    );
  });

  it('should query with include _count for agents', async () => {
    mockDepartmentFindMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost/api/departments');
    await GET(request);

    expect(mockDepartmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { agents: true } },
        }),
      })
    );
  });

  it('should handle empty departments', async () => {
    mockDepartmentFindMany.mockResolvedValue([]);

    const request = createMockRequest('http://localhost/api/departments');
    const response = await GET(request);
    const data = await response.json();
    expect(data.data).toHaveLength(0);
  });

  it('should return 500 on database error', async () => {
    mockDepartmentFindMany.mockRejectedValue(new Error('DB error'));

    const request = createMockRequest('http://localhost/api/departments');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
  });
});
