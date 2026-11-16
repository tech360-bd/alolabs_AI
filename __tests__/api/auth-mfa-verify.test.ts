import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const mockSettingsFindUnique = vi.fn();
const mockSettingsDelete = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockCreateSessionToken = vi.fn();
const mockVerifySessionToken = vi.fn();
const setCookieMock = vi.fn();

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      cookies: { set: setCookieMock },
    }),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      delete: (...args: unknown[]) => mockSettingsDelete(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  createSessionToken: (...args: unknown[]) => mockCreateSessionToken(...args),
  verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
}));

import { POST } from '@/app/api/auth/mfa/verify/route';

class MockNextRequest {
  constructor(
    private readonly body: Record<string, unknown>,
    private readonly headersMap: Record<string, string> = {},
  ) {}

  async json() {
    return this.body;
  }

  get headers() {
    return { get: (key: string) => this.headersMap[key] ?? null };
  }
}

function generateTotp(secretHex: string, timestamp: number): string {
  const counter = Math.floor(timestamp / 1000 / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', Buffer.from(secretHex, 'hex')).update(timeBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

describe('POST /api/auth/mfa/verify — login context', () => {
  const tempToken = 'one-time-mfa-token';
  const tempKey = `mfa_temp:${tempToken}`;
  const secret = Buffer.from('test-mfa-secret-material').toString('hex');
  const user = {
    id: 'mfa-user',
    email: 'mfa@example.com',
    name: 'MFA User',
    role: 'admin',
    isActive: true,
    otpEnabled: true,
    otpSecret: secret,
  };
  const tempEntries = new Map<string, { key: string; value: string }>();

  beforeEach(() => {
    vi.clearAllMocks();
    tempEntries.clear();
    mockSettingsFindUnique.mockImplementation(async ({ where }: { where: { key: string } }) => tempEntries.get(where.key) ?? null);
    mockSettingsDelete.mockImplementation(async ({ where }: { where: { key: string } }) => {
      tempEntries.delete(where.key);
      return {};
    });
    mockUserFindUnique.mockResolvedValue(user);
    mockUserUpdate.mockResolvedValue({});
    mockCreateSessionToken.mockResolvedValue('mfa-session-jwt');
    mockVerifySessionToken.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects and removes a pending token after its five-minute lifetime', async () => {
    tempEntries.set(tempKey, {
      key: tempKey,
      value: JSON.stringify({ userId: user.id, rememberMe: true, createdAt: Date.now() - 5 * 60 * 1000 }),
    });
    const request = new MockNextRequest({ tempToken, context: 'login', code: '123456' });

    const response = await POST(request as never);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Verification token has expired' });
    expect(mockSettingsDelete).toHaveBeenCalledWith({ where: { key: tempKey } });
    expect(tempEntries.has(tempKey)).toBe(false);
    expect(mockCreateSessionToken).not.toHaveBeenCalled();
  });

  it('carries remember-me through MFA, creates a 30-day session and consumes the pending token', async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    tempEntries.set(tempKey, {
      key: tempKey,
      value: JSON.stringify({ userId: user.id, rememberMe: true, createdAt: now }),
    });
    const code = generateTotp(secret, now);
    const request = new MockNextRequest(
      { tempToken, context: 'login', code },
      { 'x-real-ip': '203.0.113.9', 'user-agent': 'Firefox/Linux' },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: user.id }, token: 'mfa-session-jwt' });
    expect(mockCreateSessionToken).toHaveBeenCalledWith(user.id, expect.objectContaining({
      method: 'mfa',
      ttlHours: 30 * 24,
      isRefreshToken: true,
      ipAddress: '203.0.113.9',
      userAgent: 'Firefox/Linux',
    }));
    expect(setCookieMock).toHaveBeenCalledWith('session-token', 'mfa-session-jwt', expect.objectContaining({
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
    }));
    expect(mockSettingsDelete).toHaveBeenCalledWith({ where: { key: tempKey } });
    expect(tempEntries.has(tempKey)).toBe(false);

    const replay = await POST(request as never);
    expect(replay.status).toBe(401);
    expect(mockCreateSessionToken).toHaveBeenCalledTimes(1);
  });
});
