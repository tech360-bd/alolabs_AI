import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/metrics/client — client telemetry sink.
 *
 * The endpoint exists so `metricsCollector` has somewhere to send beacons. The
 * contract that matters is: it must never make a UI panel retry, and it must
 * reject oversized / malformed payloads without touching the database.
 */

class MockRequest {
  headers = new Headers();
  private _body: string;
  constructor(body: string) {
    this._body = body;
  }
  async text() {
    return this._body;
  }
}

const mockRequireCompanyAuth = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  requireCompanyAuth: () => mockRequireCompanyAuth(),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
    }),
  },
  // The route returns `new NextResponse(null, { status: 204 })` for dropped beacons.
  NextResponseCtor: class {},
}));

// `NextResponse` is both a namespace with `.json` and a constructible class in
// the real module; provide a class that also carries the static helper.
vi.mock('next/server', () => {
  class NextResponseStub {
    status: number | undefined;
    body: unknown;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status;
    }
    static json(data: unknown, init?: { status?: number }) {
      return { status: init?.status ?? 200, json: async () => data, data };
    }
  }
  return { NextRequest: class {}, NextResponse: NextResponseStub };
});

describe('POST /api/metrics/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireCompanyAuth.mockResolvedValue({ userId: 'user-1', companyId: 'company-1' });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: new Date(), totalInWindow: 0 });
  });

  const load = async () => (await import('@/app/api/metrics/client/route')).POST;

  it('drops beacons from anonymous callers with 204 (never 401)', async () => {
    mockRequireCompanyAuth.mockRejectedValue(new Error('Unauthorized'));
    const POST = await load();
    const res: any = await POST(
      new MockRequest(JSON.stringify({ kind: 'event', component: 'A', event: 'b' })) as any,
    );
    expect(res.status).toBe(204);
  });

  it('accepts a valid beacon and returns 204', async () => {
    const POST = await load();
    const res: any = await POST(
      new MockRequest(JSON.stringify({ kind: 'error', component: 'Panel', event: 'fetch_failed' })) as any,
    );
    expect(res.status).toBe(204);
  });

  it('rejects a malformed payload with 400 instead of throwing', async () => {
    const POST = await load();
    const res: any = await POST(new MockRequest('not-json') as any);
    expect(res.status).toBe(400);
  });

  it('rejects an unknown kind with 400', async () => {
    const POST = await load();
    const res: any = await POST(
      new MockRequest(JSON.stringify({ kind: 'evil', component: 'A', event: 'b' })) as any,
    );
    expect(res.status).toBe(400);
  });

  it('rejects oversized payloads with 413 before parsing', async () => {
    const POST = await load();
    const res: any = await POST(new MockRequest('x'.repeat(9_000)) as any);
    expect(res.status).toBe(413);
  });

  it('rate limits per principal and answers 429', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date(), totalInWindow: 200 });
    const POST = await load();
    const res: any = await POST(
      new MockRequest(JSON.stringify({ kind: 'event', component: 'A', event: 'b' })) as any,
    );
    expect(res.status).toBe(429);
  });
});
