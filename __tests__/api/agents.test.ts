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
}

// Create a proper mock with auth header
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

const mockAgentFindMany = vi.fn();
const mockAgentCount = vi.fn();

const mockCompanyUserFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    agent: {
      findMany: (...args: unknown[]) => mockAgentFindMany(...args),
      count: (...args: unknown[]) => mockAgentCount(...args),
    },
    companyUser: {
      findMany: (...args: unknown[]) => mockCompanyUserFindMany(...args),
    },
  },
}));

import { GET } from '@/app/api/agents/route';

describe('GET /api/agents', () => {
  const mockAgents = [
    {
      id: '1',
      agentId: 'agent-001',
      name: 'Sales Bot',
      slug: 'sales-bot',
      departmentName: 'Sales',
      role: 'assistant',
      status: 'active',
      version: '1.0.0',
      purpose: 'Handle sales inquiries',
      department: { slug: 'sales' },
    },
    {
      id: '2',
      agentId: 'agent-002',
      name: 'Support Bot',
      slug: 'support-bot',
      departmentName: 'Support',
      role: 'assistant',
      status: 'active',
      version: '1.2.0',
      purpose: 'Customer support',
      department: { slug: 'support' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentFindMany.mockResolvedValue(mockAgents);
    mockAgentCount.mockResolvedValue(2);
    mockCompanyUserFindMany.mockResolvedValue([{ companyId: 'tenant-a' }]);
  });

  it('scopes the query to the caller tenant memberships (tenant isolation)', async () => {
    const request = createMockRequest('http://localhost/api/agents');
    await GET(request);
    expect(mockAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: { in: ['tenant-a'] } }) }),
    );
    expect(mockAgentCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: { in: ['tenant-a'] } }) }),
    );
  });

  it('returns no agents to a caller with no tenant membership, without querying agents', async () => {
    mockCompanyUserFindMany.mockResolvedValue([]);
    const request = createMockRequest('http://localhost/api/agents');
    const response = await GET(request);
    const data = await response.json();
    expect(data.data).toEqual([]);
    expect(data.total).toBe(0);
    expect(mockAgentFindMany).not.toHaveBeenCalled();
  });

  it('never filters on a tenant the caller does not belong to', async () => {
    mockCompanyUserFindMany.mockResolvedValue([{ companyId: 'tenant-a' }, { companyId: 'tenant-b' }]);
    const request = createMockRequest('http://localhost/api/agents?search=bot');
    await GET(request);
    const call = mockAgentFindMany.mock.calls[0][0] as { where: { companyId: { in: string[] } } };
    expect(call.where.companyId.in.sort()).toEqual(['tenant-a', 'tenant-b']);
    expect(call.where.companyId.in).not.toContain('tenant-c');
  });

  it('should return agent list', async () => {
    const request = createMockRequest('http://localhost/api/agents');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveLength(2);
    expect(data.data[0].name).toBe('Sales Bot');
    expect(data.data[1].name).toBe('Support Bot');
  });

  it('should include pagination metadata', async () => {
    const request = createMockRequest('http://localhost/api/agents');
    const response = await GET(request);
    const data = await response.json();
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
    expect(data.totalPages).toBe(1);
  });

  it('should support page and limit parameters', async () => {
    const request = createMockRequest('http://localhost/api/agents?page=2&limit=10');
    const response = await GET(request);
    const data = await response.json();
    expect(data.page).toBe(2);
    expect(data.limit).toBe(10);
    // Verify Prisma skip/take were called correctly
    expect(mockAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10, // (page-1) * limit = (2-1)*10
        take: 10,
      })
    );
  });

  it('should support search filtering', async () => {
    const request = createMockRequest('http://localhost/api/agents?search=sales');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mockAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'sales' },
        }),
      })
    );
  });

  it('should support department filtering', async () => {
    const request = createMockRequest('http://localhost/api/agents?department=sales');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mockAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          department: { slug: 'sales' },
        }),
      })
    );
  });

  it('should handle empty results', async () => {
    mockAgentFindMany.mockResolvedValue([]);
    mockAgentCount.mockResolvedValue(0);
    const request = createMockRequest('http://localhost/api/agents');
    const response = await GET(request);
    const data = await response.json();
    expect(data.data).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('should clamp limit to max 100', async () => {
    const request = createMockRequest('http://localhost/api/agents?limit=500');
    const response = await GET(request);
    const data = await response.json();
    expect(data.limit).toBe(100);
  });

  it('should ensure page is at least 1', async () => {
    const request = createMockRequest('http://localhost/api/agents?page=-1');
    const response = await GET(request);
    const data = await response.json();
    expect(data.page).toBe(1);
  });

  it('should return 500 on database error', async () => {
    mockAgentFindMany.mockRejectedValue(new Error('DB error'));
    const request = createMockRequest('http://localhost/api/agents');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
  });
});
