import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireRole = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      data,
      json: async () => data,
    }),
  },
}));

class MockRequest {
  constructor(private readonly _url: string) {}
  get nextUrl() {
    return new URL(this._url);
  }
}

async function callRoute(query = '') {
  const { GET } = await import('@/app/api/super-admin/link-coverage/route');
  return (await GET(
    new MockRequest(`http://localhost:3011/api/super-admin/link-coverage${query}`) as never,
  )) as unknown as { status: number; data: Record<string, unknown> };
}

describe('GET /api/super-admin/link-coverage', () => {
  beforeEach(() => {
    requireRole.mockReset();
    requireRole.mockResolvedValue({ userId: 'u1', role: 'super_admin', email: 'a@b.c', name: 'Admin' });
  });

  it('requires the super_admin role', async () => {
    await callRoute();
    expect(requireRole).toHaveBeenCalledWith('super_admin');
  });

  it('returns the verified registry with a summary', async () => {
    const response = await callRoute();
    expect(response.status).toBe(200);

    const data = response.data as {
      summary: { links: number; evidencePaths: number; missingPaths: number; evidenceVerified: number };
      entries: { url: string }[];
      mode: string;
      registrySize: number;
    };

    expect(data.mode).toBe('live');
    expect(data.registrySize).toBe(45);
    expect(data.summary.links).toBe(45);
    expect(data.entries).toHaveLength(45);
    // The route really reads the working tree: every evidence file resolves.
    expect(data.summary.evidencePaths).toBeGreaterThan(100);
    expect(data.summary.evidenceVerified).toBe(data.summary.evidencePaths);
    expect(data.summary.missingPaths).toBe(0);
    expect(data.entries.map((entry) => entry.url)).toContain('https://openrouter.ai');
  });

  it('filters server-side by verdict, category and search text', async () => {
    const gaps = await callRoute('?verdict=gap');
    const gapEntries = (gaps.data as { entries: { verdict: string }[] }).entries;
    expect(gapEntries.length).toBeGreaterThan(0);
    expect(gapEntries.every((entry) => entry.verdict === 'gap')).toBe(true);

    const searched = await callRoute('?q=openrouter');
    const hits = (searched.data as { entries: { id: string }[] }).entries;
    expect(hits.map((entry) => entry.id)).toContain('openrouter');

    const missing = await callRoute('?onlyMissing=1');
    expect((missing.data as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it('rejects an unknown verdict with 400', async () => {
    const response = await callRoute('?verdict=done');
    expect(response.status).toBe(400);
    expect(response.data).toHaveProperty('error');
  });

  it('returns 403 for a non-super-admin caller', async () => {
    requireRole.mockRejectedValue(new Error('Forbidden'));
    const response = await callRoute();
    expect(response.status).toBe(403);
    expect(response.data).toEqual({ error: 'Forbidden' });
  });

  it('returns 401 when unauthenticated', async () => {
    requireRole.mockRejectedValue(new Error('Unauthorized'));
    const response = await callRoute();
    expect(response.status).toBe(401);
  });
});
