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

const mockSettingsFindMany = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockSettingsDelete = vi.fn();
const mockSettingsUpdate = vi.fn();
const mockSettingsCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findMany: (...args: unknown[]) => mockSettingsFindMany(...args),
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
      update: (...args: unknown[]) => mockSettingsUpdate(...args),
      create: (...args: unknown[]) => mockSettingsCreate(...args),
    },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'admin' }),
}));

import { GET as MEDIA_GET, DELETE as MEDIA_DELETE } from '@/app/api/media/route';
import { GET as FOLDERS_GET, POST as FOLDERS_POST } from '@/app/api/media/folders/route';

describe('GET /api/media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list media files with pagination', async () => {
    mockSettingsFindMany.mockResolvedValueOnce([
      {
        key: 'media:file:file-1',
        value: JSON.stringify({
          id: 'file-1',
          name: 'photo.jpg',
          url: '/storage/photo.jpg',
          size: 1024,
          type: 'image',
          mimeType: 'image/jpeg',
          folder: 'all',
          tags: ['nature'],
          thumbnailUrl: null,
          uploadedBy: 'user-1',
          createdAt: '2025-01-15T00:00:00Z',
          updatedAt: '2025-01-15T00:00:00Z',
        }),
      },
    ]);

    const req = new MockNextRequest('http://localhost/api/media');
    const response = await MEDIA_GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
  });

  it('should filter by folder type', async () => {
    mockSettingsFindMany.mockResolvedValue([]);
    const req = new MockNextRequest('http://localhost/api/media?folder=image');
    const response = await MEDIA_GET(req as any);
    expect(response.status).toBe(200);
  });

  it('should search by name and tags', async () => {
    mockSettingsFindMany.mockResolvedValue([]);
    const req = new MockNextRequest('http://localhost/api/media?search=landscape');
    const response = await MEDIA_GET(req as any);
    expect(response.status).toBe(200);
  });

  it('should return empty list when no files', async () => {
    mockSettingsFindMany.mockResolvedValue([]);
    const req = new MockNextRequest('http://localhost/api/media');
    const response = await MEDIA_GET(req as any);
    const data = await response.json();
    expect(data.data).toHaveLength(0);
  });
});

describe('DELETE /api/media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when ids array is missing', async () => {
    const req = new MockNextRequest('http://localhost/api/media', {});
    const response = await MEDIA_DELETE(req as any);
    expect(response.status).toBe(400);
  });

  it('should delete files by ids', async () => {
    mockSettingsDelete.mockResolvedValue({});
    const req = new MockNextRequest('http://localhost/api/media', { ids: ['file-1', 'file-2'] });
    const response = await MEDIA_DELETE(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data.deleted).toBe(2);
  });
});

describe('GET /api/media/folders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list folders', async () => {
    mockSettingsFindMany.mockResolvedValueOnce([]); // folders
    mockSettingsFindMany.mockResolvedValueOnce([]); // file counts

    const req = new MockNextRequest('http://localhost/api/media/folders');
    const response = await FOLDERS_GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.data)).toBe(true);
  });
});

describe('POST /api/media/folders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when name is empty', async () => {
    const req = new MockNextRequest('http://localhost/api/media/folders', { name: '' });
    const response = await FOLDERS_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when name is missing', async () => {
    const req = new MockNextRequest('http://localhost/api/media/folders', {});
    const response = await FOLDERS_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should create a folder and return 201', async () => {
    mockSettingsFindUnique.mockResolvedValue(null); // no duplicate
    mockSettingsCreate.mockResolvedValue({});

    const req = new MockNextRequest('http://localhost/api/media/folders', { name: 'Vacation Photos' });
    const response = await FOLDERS_POST(req as any);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.data.name).toBe('Vacation Photos');
  });

  it('should return 409 for duplicate folder name', async () => {
    mockSettingsFindUnique.mockResolvedValue({ key: 'media:folder:Existing' });

    const req = new MockNextRequest('http://localhost/api/media/folders', { name: 'Existing' });
    const response = await FOLDERS_POST(req as any);
    expect(response.status).toBe(409);
  });
});