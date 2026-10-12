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

  get cookies() {
    return {
      get: (name: string) => (name === 'session-token' ? this._headersMap['cookie-session-token'] || null : null),
    };
  }
}

// Helper to create an authenticated request for GET /api/auth/me
function createAuthRequest() {
  return new MockNextRequest('/api/auth/me', {}, { authorization: 'Bearer valid-token' }) as unknown as import('next/server').NextRequest;
}

// ─── Mock NextResponse ─────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
      cookies: {
        set: vi.fn(),
      },
    }),
  },
}));

// ─── Mock DB ───────────────────────────────────────────────────────

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockSettingsUpsert = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockSettingsDelete = vi.fn();

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
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
    },
  },
}));

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createSessionToken: vi.fn().mockResolvedValue('session-token-abc'),
  verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'admin@alo.com', role: 'admin' }),
  deleteSessionToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({
    get: (key: string) => {
      if (key === 'x-user-id') return 'user-1';
      return null;
    },
  }),
}));

import { POST } from '@/app/api/auth/login/route';
import { GET } from '@/app/api/auth/me/route';
import { POST as LOGOUT_POST } from '@/app/api/auth/logout/route';
import { compare } from 'bcrypt';

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/auth/login ─────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('should return 400 when email is missing', async () => {
      const request = new MockNextRequest('/api/auth/login', { password: 'test123' });
      const response = await POST(request as any);
      expect(response.status).toBe(400);
    });

    it('should return 400 when password is missing', async () => {
      const request = new MockNextRequest('/api/auth/login', { email: 'test@alo.com' });
      const response = await POST(request as any);
      expect(response.status).toBe(400);
    });

    it('should return 401 when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const request = new MockNextRequest('/api/auth/login', {
        email: 'nonexistent@alo.com',
        password: 'pass',
      });
      const response = await POST(request as any);
      expect(response.status).toBe(401);
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
      const request = new MockNextRequest('/api/auth/login', {
        email: 'disabled@alo.com',
        password: 'pass',
      });
      const response = await POST(request as any);
      expect(response.status).toBe(403);
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
      const request = new MockNextRequest('/api/auth/login', {
        email: 'test@alo.com',
        password: 'wrong',
      });
      const response = await POST(request as any);
      expect(response.status).toBe(401);
    });

    it('should return user + token on successful login', async () => {
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

      const request = new MockNextRequest('/api/auth/login', {
        email: 'test@alo.com',
        password: 'correct',
      });
      const response = await POST(request as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.email).toBe('test@alo.com');
      expect(data.token).toBe('session-token-abc');
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

      const request = new MockNextRequest('/api/auth/login', {
        email: 'mfa@alo.com',
        password: 'correct',
      });
      const response = await POST(request as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.mfaPending).toBe(true);
    });

    it('should return 500 on unexpected error', async () => {
      mockUserFindUnique.mockRejectedValue(new Error('DB crashed'));
      const request = new MockNextRequest('/api/auth/login', {
        email: 'test@alo.com',
        password: 'pass',
      });
      const response = await POST(request as any);
      expect(response.status).toBe(500);
    });
  });

  // ─── GET /api/auth/me ─────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('should return user data when authenticated', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@alo.com',
        name: 'Test User',
        role: 'admin',
        isActive: true,
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const request = createAuthRequest();
      const response = await GET(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.email).toBe('test@alo.com');
    });

    it('should return 404 when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const request = createAuthRequest();
      const response = await GET(request);
      expect(response.status).toBe(404);
    });

    it('should return 500 on database error', async () => {
      mockUserFindUnique.mockRejectedValue(new Error('DB error'));
      const request = createAuthRequest();
      const response = await GET(request);
      expect(response.status).toBe(500);
    });
  });

  // ─── POST /api/auth/logout ────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('should return success on logout', async () => {
      const request = new MockNextRequest('/api/auth/logout', {
        token: 'some-token',
      });
      const response = await LOGOUT_POST(request as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return success even without a token', async () => {
      const request = new MockNextRequest('/api/auth/logout', {});
      const response = await LOGOUT_POST(request as any);
      expect(response.status).toBe(200);
    });

    it('should return 500 when deleteSessionToken throws', async () => {
      // Make the auth mock's deleteSessionToken reject
      const { deleteSessionToken } = await import('@/lib/auth');
      vi.mocked(deleteSessionToken).mockRejectedValueOnce(new Error('DB error'));

      const request = new MockNextRequest('/api/auth/logout', {
        token: 'some-token',
      });
      const response = await LOGOUT_POST(request as any);
      expect(response.status).toBe(500);
    });
  });
});
