import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock NextRequest ──────────────────────────────────────────────

class MockNextRequest {
  private _body: Record<string, unknown>;
  private _url: string;

  constructor(url: string, body: Record<string, unknown> = {}) {
    this._url = url;
    this._body = body;
  }

  async json() {
    return this._body;
  }

  get url() {
    return this._url;
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

// ─── Mock Session Manager ──────────────────────────────────────────

const mockListUserSessions = vi.fn();
const mockDestroySession = vi.fn();
const mockDestroyAllUserSessions = vi.fn();
const mockCreateSession = vi.fn();

vi.mock('@/lib/security/session-manager', () => ({
  listUserSessions: (...args: unknown[]) => mockListUserSessions(...args),
  destroySession: (...args: unknown[]) => mockDestroySession(...args),
  destroyAllUserSessions: (...args: unknown[]) => mockDestroyAllUserSessions(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));

// ─── Mock API Auth ──────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'admin' }),
  requireRole: vi.fn().mockResolvedValue({ userId: 'admin-1', role: 'super_admin' }),
}));

// ─── Mock Secret Manager ───────────────────────────────────────────

const mockListSecrets = vi.fn();
const mockValidateSecrets = vi.fn();
const mockGetSecret = vi.fn();
const mockSetSecret = vi.fn();
const mockRotateSecret = vi.fn();

vi.mock('@/lib/security/secret-manager', () => ({
  listSecrets: (...args: unknown[]) => mockListSecrets(...args),
  validateSecrets: (...args: unknown[]) => mockValidateSecrets(...args),
  getSecret: (...args: unknown[]) => mockGetSecret(...args),
  setSecret: (...args: unknown[]) => mockSetSecret(...args),
  rotateSecret: (...args: unknown[]) => mockRotateSecret(...args),
}));

// ─── Mock DB for secrets route ──────────────────────────────────────

const mockSettingsDeleteMany = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: (...args: unknown[]) => mockSettingsDeleteMany(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redisDel: vi.fn().mockResolvedValue(1),
}));

import {
  GET as SESSION_GET,
  DELETE as SESSION_DELETE,
  POST as SESSION_POST,
} from '@/app/api/security/session/route';

import {
  GET as SECRETS_GET,
  POST as SECRETS_POST,
  DELETE as SECRETS_DELETE,
} from '@/app/api/security/secrets/route';

// ─── Session API Tests ─────────────────────────────────────────────

describe('GET /api/security/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list sessions with masked IPs', async () => {
    const now = new Date().toISOString();
    mockListUserSessions.mockResolvedValue([
      {
        token: '',
        metadata: {
          userId: 'user-1',
          userAgent: 'Chrome/120',
          ipAddress: '192.168.1.100',
          device: 'Desktop',
          createdAt: now,
          lastActivityAt: now,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        isActive: true,
      },
    ]);

    const response = await SESSION_GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].ipAddress).toBe('192.168.*.*');
    expect(data.total).toBe(1);
  });

  it('should mask device when not provided', async () => {
    mockListUserSessions.mockResolvedValue([]);
    const response = await SESSION_GET();
    expect(response.status).toBe(200);
  });
});

describe('DELETE /api/security/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when no token or sessionCreatedAt', async () => {
    const req = new MockNextRequest('http://localhost/api/security/session', {});
    const response = await SESSION_DELETE(req as any);
    expect(response.status).toBe(400);
  });

  it('should destroy session by token', async () => {
    mockDestroySession.mockResolvedValue(true);
    const req = new MockNextRequest('http://localhost/api/security/session', { token: 'session-token' });
    const response = await SESSION_DELETE(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should return 404 when session not found', async () => {
    mockDestroySession.mockResolvedValue(false);
    const req = new MockNextRequest('http://localhost/api/security/session', { token: 'nonexistent' });
    const response = await SESSION_DELETE(req as any);
    expect(response.status).toBe(404);
  });
});

describe('POST /api/security/session (logout all others)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report no other sessions when only 1 exists', async () => {
    mockListUserSessions.mockResolvedValue([{ token: '', metadata: { createdAt: '' }, isActive: true }]);
    const req = new MockNextRequest('http://localhost/api/security/session', {});
    const response = await SESSION_POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.terminatedCount).toBe(0);
  });

  it('should destroy all other sessions', async () => {
    mockListUserSessions.mockResolvedValue([
      { token: '', metadata: { createdAt: '2025-01-01' }, isActive: true },
      { token: '', metadata: { createdAt: '2025-01-02' }, isActive: true },
      { token: '', metadata: { createdAt: '2025-01-03' }, isActive: true },
    ]);
    mockDestroyAllUserSessions.mockResolvedValue(3);
    mockCreateSession.mockResolvedValue('new-token');

    const req = new MockNextRequest('http://localhost/api/security/session', {
      currentToken: 'keep-this',
    });
    const response = await SESSION_POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.terminatedCount).toBe(3);
  });
});

// ─── Secrets API Tests ─────────────────────────────────────────────

describe('GET /api/security/secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list secrets with validation status', async () => {
    mockListSecrets.mockResolvedValue([
      { key: 'JWT_SECRET', source: 'env' },
      { key: 'CUSTOM_KEY', source: 'db' },
    ]);
    mockValidateSecrets.mockResolvedValue({
      APP_SECRET: true,
      JWT_SECRET: true,
      ENCRYPTION_KEY: false,
    });

    const response = await SECRETS_GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.secrets).toHaveLength(2);
    expect(data.validation).toBeDefined();
    expect(data.total).toBe(2);
  });
});

describe('POST /api/security/secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when key is missing', async () => {
    const req = new MockNextRequest('http://localhost/api/security/secrets', { value: 'secret' });
    const response = await SECRETS_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid key format', async () => {
    const req = new MockNextRequest('http://localhost/api/security/secrets', {
      key: 'not-valid-key',
      value: 'secret12345678',
    });
    const response = await SECRETS_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when value is too short', async () => {
    const req = new MockNextRequest('http://localhost/api/security/secrets', {
      key: 'MY_SECRET',
      value: 'short',
    });
    const response = await SECRETS_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should set a secret successfully', async () => {
    mockSetSecret.mockResolvedValue(undefined);
    mockGetSecret.mockResolvedValue('my-super-secret-value');
    mockAuditLogCreate.mockResolvedValue({});

    const req = new MockNextRequest('http://localhost/api/security/secrets', {
      key: 'MY_API_KEY',
      value: 'my-secret-value-12345678',
    });
    const response = await SECRETS_POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.maskedValue).toContain('****');
  });

  it('should rotate a secret', async () => {
    mockRotateSecret.mockResolvedValue('new-rotated-value-32bytes!!');
    const req = new MockNextRequest('http://localhost/api/security/secrets', {
      key: 'ROTATE_ME',
      rotate: true,
    });
    const response = await SECRETS_POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.value).toBe('new-rotated-value-32bytes!!');
  });
});

describe('DELETE /api/security/secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when key param is missing', async () => {
    const req = new MockNextRequest('http://localhost/api/security/secrets');
    const response = await SECRETS_DELETE(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 404 when secret not found', async () => {
    mockSettingsDeleteMany.mockResolvedValue({ count: 0 });
    const req = new MockNextRequest('http://localhost/api/security/secrets?key=NONEXISTENT');
    const response = await SECRETS_DELETE(req as any);
    expect(response.status).toBe(404);
  });

  it('should delete a secret', async () => {
    mockSettingsDeleteMany.mockResolvedValue({ count: 1 });
    mockAuditLogCreate.mockResolvedValue({});
    const req = new MockNextRequest('http://localhost/api/security/secrets?key=MY_SECRET');
    const response = await SECRETS_DELETE(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});