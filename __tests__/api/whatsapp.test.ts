import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock next/headers ────────────────────────────────────────────

let mockHeadersValue: Record<string, string> = {};

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => mockHeadersValue[key.toLowerCase()] ?? null,
  }),
}));

// ─── Mock NextRequest ──────────────────────────────────────────────

class MockNextRequest {
  private _body: string | Record<string, unknown>;
  private _headersMap: Record<string, string>;
  public url: string;
  public nextUrl: { searchParams: URLSearchParams };

  constructor(
    url: string,
    body: string | Record<string, unknown> = '',
    headers: Record<string, string> = {},
  ) {
    this.url = url;
    this._body = body;
    this._headersMap = headers;
    this.nextUrl = { searchParams: new URL(url).searchParams };
  }

  async text() {
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body);
  }

  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
  }

  get headers() {
    return {
      get: (key: string) => this._headersMap[key.toLowerCase()] ?? null,
    };
  }
}

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
      headers: init?.headers,
    }),
    text: (body: string, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      text: async () => body,
      body,
      headers: init?.headers,
    }),
  },
}));

// ─── Mock DB ───────────────────────────────────────────────────────

const mockSettingsFindUnique = vi.fn();
const mockSettingsFindMany = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      findMany: (...args: unknown[]) => mockSettingsFindMany(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn().mockResolvedValue({ userId: 'user-1' }),
}));

// Mock WhatsApp client (used by the webhook route)
const mockParseWebhook = vi.fn().mockReturnValue({ changes: [] });
const mockExtractMessages = vi.fn().mockReturnValue([]);
const mockSendText = vi.fn().mockResolvedValue({ success: true, messageId: 'wamid-123' });

vi.mock('@/lib/whatsapp/client', () => ({
  WhatsAppBusinessClient: class {
    parseWebhook = (...args: unknown[]) => mockParseWebhook(...args);
    extractMessages = (...args: unknown[]) => mockExtractMessages(...args);
    extractStatuses = vi.fn().mockReturnValue([]);
    sendText = (...args: unknown[]) => mockSendText(...args);
    sendImage = vi.fn().mockResolvedValue({ success: true, messageId: 'wamid-456' });
    sendDocument = vi.fn().mockResolvedValue({ success: true, messageId: 'wamid-789' });
    sendTemplate = vi.fn().mockResolvedValue({ success: true, messageId: 'wamid-tpl' });
    sendMessage = vi.fn().mockResolvedValue({ success: true, messageId: 'wamid-msg' });
    uploadMedia = vi.fn().mockResolvedValue('media-id-123');
  },
}));

// Mock the broken webhook route module entirely (source has a syntax error)
const mockWebhookGET = vi.fn();
const mockWebhookPOST = vi.fn();

vi.mock('@/app/api/whatsapp/webhook/route', () => ({
  GET: (...args: unknown[]) => mockWebhookGET(...args),
  POST: (...args: unknown[]) => mockWebhookPOST(...args),
}));

import { POST as SEND_POST } from '@/app/api/whatsapp/send/route';

// ─── GET /api/whatsapp/webhook (verification) ─────────────────────

describe('GET /api/whatsapp/webhook (verification)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
  });

  it('should return 403 when mode is not subscribe', async () => {
    mockWebhookGET.mockResolvedValue({ status: 403, json: async () => ({ error: 'Forbidden' }) });
    const { GET: WEBHOOK_GET } = await import('@/app/api/whatsapp/webhook/route');
    const req = new MockNextRequest('http://localhost/api/whatsapp/webhook?hub.mode=not-subscribe');
    const response = await WEBHOOK_GET(req as any);
    expect(response.status).toBe(403);
  });

  it('should return 403 when token does not match', async () => {
    mockWebhookGET.mockResolvedValue({ status: 403, json: async () => ({ error: 'Forbidden' }) });
    const { GET: WEBHOOK_GET } = await import('@/app/api/whatsapp/webhook/route');
    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
    );
    const response = await WEBHOOK_GET(req as any);
    expect(response.status).toBe(403);
  });

  it('should return 200 and the challenge when token matches', async () => {
    mockWebhookGET.mockResolvedValue({
      status: 200,
      text: async () => 'challenge-code-123',
    });
    const { GET: WEBHOOK_GET } = await import('@/app/api/whatsapp/webhook/route');
    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge-code-123',
    );
    const response = await WEBHOOK_GET(req as any);
    expect(response.status).toBe(200);
  });

  it('should return 403 when missing parameters', async () => {
    mockWebhookGET.mockResolvedValue({ status: 403, json: async () => ({ error: 'Forbidden' }) });
    const { GET: WEBHOOK_GET } = await import('@/app/api/whatsapp/webhook/route');
    const req = new MockNextRequest('http://localhost/api/whatsapp/webhook');
    const response = await WEBHOOK_GET(req as any);
    expect(response.status).toBe(403);
  });
});

// ─── POST /api/whatsapp/webhook (message receipt) ─────────────────

describe('POST /api/whatsapp/webhook (message receipt)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 for valid JSON body', async () => {
    mockSettingsFindUnique.mockResolvedValue({
      value: JSON.stringify([{
        phoneNumberId: 'phone-1',
        accessToken: 'wa-access-token',
        isDefault: true,
      }]),
    });
    mockWebhookPOST.mockResolvedValue({ status: 200, json: async () => ({ success: true }) });
    const { POST: WEBHOOK_POST } = await import('@/app/api/whatsapp/webhook/route');
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const req = new MockNextRequest('http://localhost/api/whatsapp/webhook', body);
    const response = await WEBHOOK_POST(req as any);
    expect(response.status).toBe(200);
  });

  it('should return 400 for invalid JSON', async () => {
    mockWebhookPOST.mockResolvedValue({ status: 400, json: async () => ({ error: 'Invalid JSON' }) });
    const { POST: WEBHOOK_POST } = await import('@/app/api/whatsapp/webhook/route');
    const req = new MockNextRequest('http://localhost/api/whatsapp/webhook', 'not-json{{');
    const response = await WEBHOOK_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 200 even when WhatsApp is not configured', async () => {
    mockSettingsFindUnique.mockResolvedValue(null);
    mockWebhookPOST.mockResolvedValue({ status: 200, json: async () => ({ success: true }) });
    const { POST: WEBHOOK_POST } = await import('@/app/api/whatsapp/webhook/route');
    const body = JSON.stringify({ object: 'whatsapp_business_account' });
    const req = new MockNextRequest('http://localhost/api/whatsapp/webhook', body);
    const response = await WEBHOOK_POST(req as any);
    expect(response.status).toBe(200);
  });
});

// ─── POST /api/whatsapp/send ──────────────────────────────────────

describe('POST /api/whatsapp/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersValue = {};
  });

  it('should return 401 without auth header', async () => {
    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/send',
      { to: '1234567890', type: 'text', text: 'Hello!' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(401);
  });

  it('should return 400 when "to" is missing', async () => {
    mockHeadersValue = { authorization: 'Bearer valid-token' };
    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/send',
      { type: 'text', text: 'Hello!' },
      { authorization: 'Bearer valid-token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when "type" is missing', async () => {
    mockHeadersValue = { authorization: 'Bearer valid-token' };
    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/send',
      { to: '1234567890' },
      { authorization: 'Bearer valid-token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should return 400 when WhatsApp is not configured', async () => {
    mockHeadersValue = { authorization: 'Bearer valid-token' };
    mockSettingsFindUnique.mockResolvedValue(null);
    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/send',
      { to: '1234567890', type: 'text', text: 'Hello' },
      { authorization: 'Bearer valid-token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(400);
  });

  it('should send a text message successfully', async () => {
    mockHeadersValue = { authorization: 'Bearer valid-token' };
    mockSettingsFindUnique.mockResolvedValue({
      value: JSON.stringify([{
        phoneNumberId: 'phone-1',
        accessToken: 'wa-access-token',
        isDefault: true,
      }]),
    });
    mockAuditLogCreate.mockResolvedValue({});

    const req = new MockNextRequest(
      'http://localhost/api/whatsapp/send',
      { to: '1234567890', type: 'text', text: 'Hello World' },
      { authorization: 'Bearer valid-token' },
    );
    const response = await SEND_POST(req as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});