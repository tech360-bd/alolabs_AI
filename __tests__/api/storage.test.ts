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

// These are route contract unit tests; real authentication/tenant isolation is
// separately exercised via isolated standalone HTTP and two actual memberships.
const mockRequireCompanyAuth = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireCompanyAuth: (...args: unknown[]) => mockRequireCompanyAuth(...args),
}));

// Mock storage module
const mockStorageUpload = vi.fn();
const mockStorageDownload = vi.fn();
const mockStorageDelete = vi.fn();
const mockStorageList = vi.fn();
const mockStorageGetMetadata = vi.fn();

vi.mock('@/lib/storage', () => ({
  getStorage: () => ({
    upload: (...args: unknown[]) => mockStorageUpload(...args),
    download: (...args: unknown[]) => mockStorageDownload(...args),
    delete: (...args: unknown[]) => mockStorageDelete(...args),
    list: (...args: unknown[]) => mockStorageList(...args),
    getMetadata: (...args: unknown[]) => mockStorageGetMetadata(...args),
  }),
  StorageFactory: {
    createStorage: () => ({
      upload: (...args: unknown[]) => mockStorageUpload(...args),
      download: (...args: unknown[]) => mockStorageDownload(...args),
      delete: (...args: unknown[]) => mockStorageDelete(...args),
      list: (...args: unknown[]) => mockStorageList(...args),
    getMetadata: (...args: unknown[]) => mockStorageGetMetadata(...args),
      verifySignedUrl: vi.fn().mockReturnValue(true),
    }),
  },
  LocalStorageProvider: vi.fn(),
}));

import { GET as FILES_GET, DELETE as FILES_DELETE } from '@/app/api/storage/files/route';

describe('GET /api/storage/files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAuth.mockResolvedValue({ userId: 'user-1', companyId: 'tenant-1' });
    mockStorageGetMetadata.mockResolvedValue({ id: '2025-01-15/abc-file.txt', companyId: 'tenant-1' });
  });

  it('should return 401 without auth token for list', async () => {
    mockRequireCompanyAuth.mockRejectedValue(new Error('Unauthorized'));
    const req = new MockNextRequest('http://localhost/api/storage/files');
    const response = await FILES_GET(req as any);
    expect(response.status).toBe(401);
  });

  it('should list files when authenticated', async () => {
    mockStorageList.mockResolvedValue([
      {
        id: '2025-01-15/abc-photo.jpg',
        filename: 'abc-photo.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        url: '/api/storage/files?key=...',
        uploadedBy: 'system',
        companyId: 'tenant-1',
        createdAt: new Date(),
      },
      { id: 'other-tenant.txt', companyId: 'tenant-2' },
    ]);

    const req = new MockNextRequest(
      'http://localhost/api/storage/files',
      {},
      { authorization: 'Bearer valid-token' },
    );
    const response = await FILES_GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.files).toHaveLength(1);
    expect(data.files[0].companyId).toBe('tenant-1');
    expect(data.pagination).toBeDefined();
  });

  it('should return empty list when no files', async () => {
    mockStorageList.mockResolvedValue([]);
    const req = new MockNextRequest(
      'http://localhost/api/storage/files',
      {},
      { authorization: 'Bearer valid-token' },
    );
    const response = await FILES_GET(req as any);
    const data = await response.json();
    expect(data.files).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });
});

describe('DELETE /api/storage/files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAuth.mockResolvedValue({ userId: 'user-1', companyId: 'tenant-1' });
    mockStorageGetMetadata.mockResolvedValue({ id: '2025-01-15/abc-file.txt', companyId: 'tenant-1' });
  });

  it('should return 401 without auth', async () => {
    mockRequireCompanyAuth.mockRejectedValue(new Error('Unauthorized'));
    const req = new MockNextRequest('http://localhost/api/storage/files', { key: 'file.txt' });
    const response = await FILES_DELETE(req as any);
    expect(response.status).toBe(401);
  });

  it('should return 400 when key is missing', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/storage/files',
      {},
      { authorization: 'Bearer token' },
    );
    const response = await FILES_DELETE(req as any);
    expect(response.status).toBe(400);
  });

  it('should delete a file successfully', async () => {
    mockStorageDelete.mockResolvedValue(undefined);
    const req = new MockNextRequest(
      'http://localhost/api/storage/files',
      { key: '2025-01-15/abc-file.txt' },
      { authorization: 'Bearer token' },
    );
    const response = await FILES_DELETE(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deleted).toBe('2025-01-15/abc-file.txt');
  });

  it('must not delete a file owned by a different tenant', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'tenant-2.txt', companyId: 'tenant-2' });
    const req = new MockNextRequest('http://localhost/api/storage/files',
      { key: 'tenant-2.txt' }, { authorization: 'Bearer token' });
    const response = await FILES_DELETE(req as any);
    expect(response.status).toBe(404);
    expect(mockStorageDelete).not.toHaveBeenCalled();
  });

  it('should return 500 on storage error', async () => {
    mockStorageDelete.mockRejectedValue(new Error('File not found'));
    const req = new MockNextRequest(
      'http://localhost/api/storage/files',
      { key: 'missing.txt' },
      { authorization: 'Bearer token' },
    );
    const response = await FILES_DELETE(req as any);
    expect(response.status).toBe(500);
  });
});