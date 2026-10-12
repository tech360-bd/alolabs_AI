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
const mockSettingsUpsert = vi.fn();
const mockSettingsDelete = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findMany: (...args: unknown[]) => mockSettingsFindMany(...args),
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      upsert: (...args: unknown[]) => mockSettingsUpsert(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user-1' }),
}));

vi.mock('@/lib/email/smtp', () => ({
  SMTPEmailService: vi.fn().mockImplementation(function(this: any) {
    this.send = vi.fn().mockResolvedValue({ success: true, messageId: '<msg-123@alolabs.ai>' });
  }),
}));

vi.mock('@/lib/email/tracking', () => ({
  EmailTrackingService: vi.fn().mockImplementation(function(this: any) {
    this.generateTrackingPixel = vi.fn().mockReturnValue('<img src="/track" />');
    this.recordDelivered = vi.fn();
  }),
}));

// ─── Email Accounts Tests ───────────────────────────────────────────

import { GET as ACCOUNTS_GET, POST as ACCOUNTS_POST } from '@/app/api/email/accounts/route';

describe('GET /api/email/accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without auth', async () => {
    const req = new MockNextRequest('http://localhost/api/email/accounts');
    const response = await ACCOUNTS_GET(req as any);
    expect(response.status).toBe(401);
  });

  it('should list accounts with masked passwords', async () => {
    mockSettingsFindMany.mockResolvedValue([
      {
        key: 'email:account:acc-1',
        value: JSON.stringify({
          id: 'acc-1',
          label: 'Work Email',
          email: 'work@example.com',
          provider: 'gmail',
          imap: { host: 'imap.gmail.com', port: 993, tls: true },
          smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
          auth: { user: 'work@example.com', pass: 'super-secret' },
          isActive: true,
          lastSyncAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      },
    ]);

    const req = new MockNextRequest(
      'http://localhost/api/email/accounts',
      {},
      { authorization: 'Bearer token' },
    );
    const response = await ACCOUNTS_GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.count).toBe(1);
    expect(data.data[0].auth.pass).toBe('••••••••');
  });

  it('should return 500 on database error', async () => {
    mockSettingsFindMany.mockRejectedValue(new Error('DB error'));
    const req = new MockNextRequest(
      'http://localhost/api/email/accounts',
      {},
      { authorization: 'Bearer token' },
    );
    const response = await ACCOUNTS_GET(req as any);
    expect(response.status).toBe(500);
  });
});

describe('POST /api/email/accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without auth', async () => {
    const req = new MockNextRequest('http://localhost/api/email/accounts', { email: 'test@test.com' });
    const response = await ACCOUNTS_POST(req as any);
    expect(response.status).toBe(401);
  });

  it('should return 400 when required fields are missing', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/email/accounts',
      { email: 'test@test.com' },
      { authorization: 'Bearer token' },
    );
    const response = await ACCOUNTS_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should create an account and return 201', async () => {
    mockSettingsUpsert.mockResolvedValue({});
    const req = new MockNextRequest(
      'http://localhost/api/email/accounts',
      {
        email: 'new@example.com',
        label: 'New Account',
        provider: 'gmail',
        imap: { host: 'imap.gmail.com', port: 993, tls: true },
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        auth: { user: 'new@example.com', pass: 'password123' },
      },
      { authorization: 'Bearer token' },
    );
    const response = await ACCOUNTS_POST(req as any);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.data.email).toBe('new@example.com');
    expect(data.data.auth.pass).toBe('••••••••');
  });
});

// ─── Email Send Tests ───────────────────────────────────────────────

import { POST as SEND_POST } from '@/app/api/email/send/route';

describe('POST /api/email/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without auth', async () => {
    const req = new MockNextRequest('http://localhost/api/email/send', {});
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(401);
  });

  it('should return 400 when accountId is missing', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/email/send',
      { to: ['user@example.com'], subject: 'Test', html: '<p>Hi</p>' },
      { authorization: 'Bearer token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when to is empty', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/email/send',
      { accountId: 'acc-1', subject: 'Test', html: '<p>Hi</p>' },
      { authorization: 'Bearer token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when subject is missing', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/email/send',
      { accountId: 'acc-1', to: ['user@example.com'], html: '<p>Hi</p>' },
      { authorization: 'Bearer token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when both html and text are missing', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/email/send',
      { accountId: 'acc-1', to: ['user@example.com'], subject: 'Test' },
      { authorization: 'Bearer token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 404 when account not found', async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    const req = new MockNextRequest(
      'http://localhost/api/email/send',
      {
        accountId: 'nonexistent',
        to: ['user@example.com'],
        subject: 'Test',
        html: '<p>Hi</p>',
      },
      { authorization: 'Bearer token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(404);
  });

  it('should send email successfully', async () => {
    mockSettingsFindUnique.mockResolvedValue({
      value: JSON.stringify({
        id: 'acc-1',
        email: 'work@example.com',
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        auth: { user: 'work@example.com', pass: 'secret' },
      }),
    });
    mockSettingsUpsert.mockResolvedValue({});

    const req = new MockNextRequest(
      'http://localhost/api/email/send',
      {
        accountId: 'acc-1',
        to: ['recipient@example.com'],
        subject: 'Hello World',
        html: '<p>Test email body</p>',
      },
      { authorization: 'Bearer token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.messageId).toBeDefined();
  });
});

// ─── Email Inbox Tests ──────────────────────────────────────────────

import { GET as INBOX_GET } from '@/app/api/email/inbox/route';

describe('GET /api/email/inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 without auth', async () => {
    const req = new MockNextRequest('http://localhost/api/email/inbox');
    const response = await INBOX_GET(req as any);
    expect(response.status).toBe(401);
  });

  it('should return paginated email list', async () => {
    mockSettingsFindMany.mockResolvedValue([
      {
        key: 'email:message:acc-1:msg1',
        value: JSON.stringify({
          id: 'msg1',
          accountId: 'acc-1',
          from: 'sender@example.com',
          to: ['user@example.com'],
          cc: [],
          subject: 'Test Email',
          html: '<p>Body</p>',
          text: 'Body',
          hasAttachments: false,
          folder: 'INBOX',
          isRead: false,
          receivedAt: new Date().toISOString(),
          rawHeaders: {},
        }),
      },
    ]);

    const req = new MockNextRequest(
      'http://localhost/api/email/inbox',
      {},
      { authorization: 'Bearer token' },
    );
    const response = await INBOX_GET(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.page).toBe(1);
    expect(data.unreadCount).toBe(1);
  });

  it('should filter by accountId', async () => {
    mockSettingsFindMany.mockResolvedValue([]);
    const req = new MockNextRequest(
      'http://localhost/api/email/inbox?accountId=acc-1',
      {},
      { authorization: 'Bearer token' },
    );
    const response = await INBOX_GET(req as any);
    expect(response.status).toBe(200);
  });

  it('should return empty list when no messages', async () => {
    mockSettingsFindMany.mockResolvedValue([]);
    const req = new MockNextRequest(
      'http://localhost/api/email/inbox',
      {},
      { authorization: 'Bearer token' },
    );
    const response = await INBOX_GET(req as any);
    const data = await response.json();
    expect(data.data).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });
});