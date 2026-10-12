import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRequest(url: string) {
  return { url } as unknown as import('next/server').NextRequest;
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

const mockModelRegistryFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    modelRegistry: {
      findMany: (...args: unknown[]) => mockModelRegistryFindMany(...args),
    },
  },
}));

// Mock api-auth to bypass auth
vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: '1', role: 'admin' }),
}));

import { GET } from '@/app/api/models/route';

describe('GET /api/models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return model list with defaults when DB is empty', async () => {
    mockModelRegistryFindMany.mockResolvedValue([]);
    const request = createMockRequest('http://localhost/api/models');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.total).toBeGreaterThan(0);

    // Should include default models
    const modelIds = data.data.map((m: { modelId: string }) => m.modelId);
    expect(modelIds).toContain('deepseek-v3');
    expect(modelIds).toContain('deepseek-r1');
    expect(modelIds).toContain('llama-3-70b');
  });

  it('should return DB models when they exist', async () => {
    mockModelRegistryFindMany.mockResolvedValue([
      {
        id: '1',
        modelId: 'custom-model',
        name: 'Custom Model',
        provider: 'openai',
        costPer1kTokens: 0.01,
        maxContext: 4096,
        capabilities: '["chat","completion"]',
        status: 'active',
        healthStatus: 'healthy',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const request = createMockRequest('http://localhost/api/models');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0].modelId).toBe('custom-model');
    expect(data.data[0].capabilities).toEqual(['chat', 'completion']);
  });

  it('should return 401 when auth fails', async () => {
    const { requireAuth } = await import('@/lib/api-auth');
    vi.mocked(requireAuth).mockRejectedValueOnce(new Error('Unauthorized'));

    const request = createMockRequest('http://localhost/api/models');
    const response = await GET(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 500 on database error', async () => {
    mockModelRegistryFindMany.mockRejectedValue(new Error('DB error'));
    const request = createMockRequest('http://localhost/api/models');
    const response = await GET(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
  });

  it('should have default models with correct structure', async () => {
    mockModelRegistryFindMany.mockResolvedValue([]);
    const request = createMockRequest('http://localhost/api/models');
    const response = await GET(request);
    const data = await response.json();

    for (const model of data.data) {
      expect(model).toHaveProperty('modelId');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('provider');
      expect(model).toHaveProperty('capabilities');
      expect(model).toHaveProperty('status');
      expect(Array.isArray(model.capabilities)).toBe(true);
    }
  });
});