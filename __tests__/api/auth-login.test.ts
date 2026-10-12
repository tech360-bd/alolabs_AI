import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock NextRequest
class MockNextRequest {
  private body: Record<string, string>;
  private headersMap: Record<string, string>;

  constructor(body: Record<string, string>, headers: Record<string, string> = {}) {
    this.body = body;
    this.headersMap = headers;
  }

  async json() {
    return this.body;
  }

  get headers() {
    return {
      get: (key: string) => this.headersMap[key] ?? null,
    };
  }
}

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
    }),
  },
}));

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockSettingsUpsert = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
    settings: {
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
    },
  },
}));

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createSessionToken: vi.fn().mockResolvedValue('session-token-abc'),
}));

import { POST } from '@/app/api/auth/login/route';
import { compare } from 'bcrypt';

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when email is missing', async () => {
    const request = new MockNextRequest({ password: 'test123' });
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Email and password are required');
  });

  it('should return 400 when password is missing', async () => {
    const request = new MockNextRequest({ email: 'test@alo.com' });
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Email and password are required');
  });

  it('should return 401 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const request = new MockNextRequest({ email: 'nonexistent@alo.com', password: 'pass' });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain('Invalid email or password');
  });

  it('should return 403 when user is disabled', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'disabled@alo.com',
      name: 'Disabled',
      role: 'user',
      isActive: false,
      passwordHash: 'hash',
    });
    const request = new MockNextRequest({ email: 'disabled@alo.com', password: 'pass' });
    const response = await POST(request as any);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Account is disabled');
  });

  it('should return 401 when password is wrong', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@alo.com',
      name: 'Test',
      role: 'admin',
      isActive: true,
      passwordHash: 'hashed',
    });
    vi.mocked(compare).mockResolvedValue(false);
    const request = new MockNextRequest({ email: 'test@alo.com', password: 'wrong' });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
  });

  it('should return user + token on successful login (no MFA)', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@alo.com',
      name: 'Test User',
      role: 'admin',
      isActive: true,
      passwordHash: 'hashed',
      otpEnabled: false,
    });
    vi.mocked(compare).mockResolvedValue(true);
    mockUserUpdate.mockResolvedValue({});
    mockAuditLogCreate.mockResolvedValue({});

    const request = new MockNextRequest({ email: 'test@alo.com', password: 'correct' });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.email).toBe('test@alo.com');
    expect(data.user.role).toBe('admin');
    expect(data.token).toBe('session-token-abc');
    expect(data.user.mfaRequired).toBeUndefined();
  });

  it('should return MFA pending when user has OTP enabled', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-mfa',
      email: 'mfa@alo.com',
      name: 'MFA User',
      role: 'admin',
      isActive: true,
      passwordHash: 'hashed',
      otpEnabled: true,
    });
    vi.mocked(compare).mockResolvedValue(true);

    const request = new MockNextRequest({ email: 'mfa@alo.com', password: 'correct' });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mfaPending).toBe(true);
    expect(data.token).toBeNull();
    expect(data.user.mfaRequired).toBe(true);
    expect(data.tempToken).toBeDefined();
  });

  it('should return 500 on unexpected error', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('DB crashed'));
    const request = new MockNextRequest({ email: 'test@alo.com', password: 'pass' });
    const response = await POST(request as any);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Internal server error');
  });
});