import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/public/contact — the public website's enquiry form.
 *
 * The route is public by design, so its contract matters: validate, honeypot,
 * rate-limit per IP, record a CRM lead (CrmContact + CrmNote) and make a
 * best-effort SMTP notification. All of that is asserted here against mocked
 * Prisma + SMTP; no request leaves the process (paid-services guard stays on).
 */

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
    }),
  },
}));

const mockContactCreate = vi.fn();
const mockNoteCreate = vi.fn();
const mockSettingsFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    crmContact: { create: (...args: unknown[]) => mockContactCreate(...args) },
    crmNote: { create: (...args: unknown[]) => mockNoteCreate(...args) },
    settings: { findMany: (...args: unknown[]) => mockSettingsFindMany(...args) },
  },
}));

const mockSmtpSend = vi.fn();
vi.mock('@/lib/email/smtp', () => ({
  SMTPEmailService: class {
    send = mockSmtpSend;
  },
}));

import { POST } from '@/app/api/public/contact/route';

type RouteResponse = {
  status: number;
  json: () => Promise<Record<string, unknown>>;
};

// The rate limiter lives in module scope, so every call without an explicit IP
// gets a fresh one — otherwise tests would trip the 5-per-window limit.
let ipCounter = 0;

function post(body: unknown, ip?: string): Promise<RouteResponse> {
  const callerIp = ip || `203.0.113.${++ipCounter}`;
  return POST({
    headers: { get: (name: string) => (name === 'x-forwarded-for' ? callerIp : null) },
    // A raw string body (not JSON text) makes a real `request.json()` throw —
    // mirror that so the invalid-body branch is exercised faithfully.
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token');
      return body;
    },
  } as unknown as Parameters<typeof POST>[0]) as Promise<RouteResponse>;
}

const VALID = {
  name: 'Ayesha Rahman',
  email: 'Ayesha@Example.com',
  topic: 'AI engineering',
  message: 'We would like to scope a first deployment for our operations team.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockContactCreate.mockResolvedValue({ id: 'contact-1' });
  mockNoteCreate.mockResolvedValue({ id: 'note-1' });
  mockSettingsFindMany.mockResolvedValue([]);
  mockSmtpSend.mockResolvedValue({ ok: true });
});

describe('POST /api/public/contact — validation', () => {
  it('accepts a valid enquiry and records the CRM lead', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(mockContactCreate).toHaveBeenCalledTimes(1);
    const data = mockContactCreate.mock.calls[0][0].data;
    expect(data.firstName).toBe('Ayesha');
    expect(data.lastName).toBe('Rahman');
    expect(data.email).toBe('ayesha@example.com'); // lowercased
    expect(data.source).toBe('website-contact');
    expect(data.status).toBe('lead');
    expect(JSON.parse(data.tags)).toEqual(['website', 'ai-engineering']);
    expect(JSON.parse(data.metadata).page).toBe('alolabs.net');

    expect(mockNoteCreate).toHaveBeenCalledTimes(1);
    expect(mockNoteCreate.mock.calls[0][0].data.contactId).toBe('contact-1');
    expect(mockNoteCreate.mock.calls[0][0].data.createdBy).toBe('website-contact-form');
  });

  it('rejects a missing name', async () => {
    const res = await post({ ...VALID, name: '' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name/i);
    expect(mockContactCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid email address', async () => {
    const res = await post({ ...VALID, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/email/i);
    expect(mockContactCreate).not.toHaveBeenCalled();
  });

  it('rejects a message shorter than 10 characters', async () => {
    const res = await post({ ...VALID, message: 'short' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/message/i);
    expect(mockContactCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid JSON body', async () => {
    const res = await post('not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/body/i);
  });

  it('defaults the topic to General enquiry and the subject to Website enquiry', async () => {
    const res = await post({ name: 'Single Name', email: 'a@b.co', message: 'A message that is long enough.' });
    expect(res.status).toBe(200);
    const data = mockContactCreate.mock.calls[0][0].data;
    expect(JSON.parse(data.tags)).toContain('general-enquiry');
    expect(JSON.parse(data.metadata).subject).toBe('Website enquiry');
  });
});

describe('POST /api/public/contact — honeypot', () => {
  it('pretends success for a bot that fills the hidden field but records nothing', async () => {
    const res = await post({ ...VALID, company_website: 'https://spam.example' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(true);
    expect(mockContactCreate).not.toHaveBeenCalled();
    expect(mockNoteCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/public/contact — rate limiting', () => {
  it('allows five messages per window per IP and blocks the sixth', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 5; i++) {
      const ok = await post(VALID, ip);
      expect(ok.status).toBe(200);
    }
    const blocked = await post(VALID, ip);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).message).toMatch(/too many/i);
    expect(mockContactCreate).toHaveBeenCalledTimes(5);

    // A different address is unaffected.
    const other = await post(VALID, '198.51.100.78');
    expect(other.status).toBe(200);
  });
});

describe('POST /api/public/contact — house notification (best effort)', () => {
  it('reports delivered:false when no mail account is configured, and still records the lead', async () => {
    const res = await post(VALID);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(false);
    expect(mockContactCreate).toHaveBeenCalledTimes(1);
  });

  it('sends exactly one notification when an active SMTP account exists', async () => {
    mockSettingsFindMany.mockResolvedValue([
      {
        key: 'email:account:primary',
        value: JSON.stringify({
          email: 'hello@alolabs.net',
          smtp: { host: 'smtp.alolabs.net', port: 587 },
          auth: { user: 'hello@alolabs.net', pass: 'not-a-real-secret' },
          isActive: true,
        }),
      },
    ]);
    const res = await post(VALID);
    const body = await res.json();
    expect(body.delivered).toBe(true);
    expect(mockSmtpSend).toHaveBeenCalledTimes(1);
    const sent = mockSmtpSend.mock.calls[0][0];
    expect(sent.to).toEqual(['info@alolabs.net']);
    expect(sent.subject).toContain('Ayesha Rahman');
  });

  it('still records the lead when SMTP throws', async () => {
    mockSettingsFindMany.mockResolvedValue([
      {
        key: 'email:account:primary',
        value: JSON.stringify({
          smtp: { host: 'smtp.alolabs.net', port: 587 },
          auth: { user: 'hello@alolabs.net', pass: 'not-a-real-secret' },
        }),
      },
    ]);
    mockSmtpSend.mockRejectedValue(new Error('smtp down'));
    const res = await post(VALID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.delivered).toBe(false);
    expect(mockContactCreate).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/public/contact — persistence failure', () => {
  it('returns 502 and tells the caller to email the house address when the database write fails', async () => {
    mockContactCreate.mockRejectedValue(new Error('db unavailable'));
    const res = await post(VALID);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toContain('info@alolabs.net');
  });
});
