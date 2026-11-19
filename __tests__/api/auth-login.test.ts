import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock NextRequest
class MockNextRequest {
  private body: Record<string, unknown>;
  private headersMap: Record<string, string>;

  constructor(body: Record<string, unknown>, headers: Record<string, string> = {}) {
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
// The real NextResponse has a mutable `cookies` bag, and the login route uses it
// to set the httpOnly `session-token` cookie that the server-side page gate
// reads. The mock must expose the same surface or the route throws (and used to
// fail with a 500 that looked like a login bug).
const setCookieMock = vi.fn();
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
      cookies: { set: setCookieMock },
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
// Select bcrypt's Promise overload (not its callback overload).
const compareAsync: (data: string, encrypted: string) => Promise<boolean> = compare;
import { createSessionToken } from '@/lib/auth';

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
    vi.mocked(compareAsync).mockResolvedValue(false);
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
    vi.mocked(compareAsync).mockResolvedValue(true);
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

  it('uses the 30-day remember-me lifetime for both the JWT and cookie', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-remembered',
      email: 'remembered@alo.com',
      name: 'Remembered User',
      role: 'admin',
      isActive: true,
      passwordHash: 'hashed',
      otpEnabled: false,
    });
    vi.mocked(compareAsync).mockResolvedValue(true);
    mockUserUpdate.mockResolvedValue({});
    mockAuditLogCreate.mockResolvedValue({});

    const request = new MockNextRequest(
      { email: 'remembered@alo.com', password: 'correct', rememberMe: true },
      { 'x-real-ip': '203.0.113.7', 'user-agent': 'Firefox/Linux' },
    );
    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(createSessionToken).toHaveBeenCalledWith('user-remembered', expect.objectContaining({
      method: 'password',
      ttlHours: 30 * 24,
      isRefreshToken: true,
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox/Linux',
    }));
    expect(setCookieMock).toHaveBeenCalledWith('session-token', 'session-token-abc', expect.objectContaining({
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
    }));
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
    vi.mocked(compareAsync).mockResolvedValue(true);

    const request = new MockNextRequest({ email: 'mfa@alo.com', password: 'correct', rememberMe: true });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mfaPending).toBe(true);
    expect(data.token).toBeNull();
    expect(data.user.mfaRequired).toBe(true);
    expect(data.tempToken).toBeDefined();

    const stored = mockSettingsUpsert.mock.calls[0][0];
    const pendingMetadata = JSON.parse(stored.create.value);
    expect(pendingMetadata).toMatchObject({ userId: 'user-mfa', rememberMe: true });
    expect(typeof pendingMetadata.createdAt).toBe('number');
    expect(createSessionToken).not.toHaveBeenCalled();
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