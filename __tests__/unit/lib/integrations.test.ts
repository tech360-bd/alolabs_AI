import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  integrationRegistry,
  isAllowedIntegrationUrl,
  joinUrl,
  guardedFetch,
  IntegrationError,
  twentyAdapter,
  twentyListPeople,
  twentyCreatePerson,
  frappeListDocs,
  httpsmsSendSms,
  rsshubFetchRoute,
  submitVideoJob,
  getVideoJob,
} from '@/lib/integrations';
import type { ConnectorContext } from '@/lib/integrations';

const companyCtx = (overrides: Partial<ConnectorContext> = {}): ConnectorContext => ({
  companyId: 'company_test',
  credential: {
    baseUrl: 'https://crm.example.com',
    apiKey: 'test-key',
    extras: { ownerPhoneNumber: '+8801700000000' },
  },
  ...overrides,
});

// Deterministic JSON response helper.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('integration URL guard (SSRF)', () => {
  it('blocks http and private targets by default', () => {
    expect(isAllowedIntegrationUrl('http://example.com').allowed).toBe(false);
    expect(isAllowedIntegrationUrl('https://localhost/x').allowed).toBe(false);
    expect(isAllowedIntegrationUrl('https://10.0.0.5/api').allowed).toBe(false);
    expect(isAllowedIntegrationUrl('https://192.168.1.1/api').allowed).toBe(false);
    expect(isAllowedIntegrationUrl('https://svc.internal/api').allowed).toBe(false);
    expect(isAllowedIntegrationUrl('https://box.local/api').allowed).toBe(false);
  });

  it('allows public https and, when opted in, private targets', () => {
    expect(isAllowedIntegrationUrl('https://api.example.com/v1').allowed).toBe(true);
    expect(isAllowedIntegrationUrl('http://10.0.0.5/api', { allowInsecure: true }).allowed).toBe(true);
  });

  it('rejects unparsable URLs', () => {
    expect(isAllowedIntegrationUrl('not a url').allowed).toBe(false);
  });
});

describe('integration registry', () => {
  it('rejects AVOID-strategy adapters (fail closed)', () => {
    expect(() =>
      integrationRegistry.register({
        id: 'test.avoid',
        category: 'automation',
        licenseClass: 'source-available',
        strategy: 'AVOID',
        description: 'x',
        upstreamRepo: 'x/y',
        testConnection: async () => ({ ok: true, durationMs: 0, audit: { adapter: '', operation: '', companyId: '' } }),
      }),
    ).toThrow(/AVOID/);
  });

  it('has the Wave-1 adapters bootstrapped', () => {
    const ids = integrationRegistry.catalog().map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'crm.twenty',
        'crm.frappe',
        'messaging.httpsms',
        'content.rsshub',
        'media.video',
      ]),
    );
  });

  it('require() throws for unknown adapters', () => {
    expect(() => integrationRegistry.require('crm.nope')).toThrow(/unknown adapter/);
  });
});

describe('guardedFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses blocked targets without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(guardedFetch('test', 'http://169.254.169.254/latest/meta-data')).rejects.toThrow(IntegrationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls fetch with the guarded URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await guardedFetch('test', 'https://api.example.com/v1/ping');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/ping');
  });
});

describe('Twenty CRM connector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists people with bearer auth and cursor paging', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { people: [{ id: 'p1', name: 'Ada', email: 'ada@example.com' }] },
        page_info: { hasNextPage: true, endCursor: 'c-2' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await twentyListPeople(companyCtx(), { limit: 1 });
    expect(result.ok).toBe(true);
    expect(result.data?.people[0].id).toBe('p1');
    expect(result.data?.nextCursor).toBe('c-2');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://crm.example.com/rest/people?limit=1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('creates a person via POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'p9', name: 'Bob' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await twentyCreatePerson(companyCtx(), { name: 'Bob' });
    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe('p9');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(url).toContain('/rest/people');
  });

  it('normalizes API failures into ok:false results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500)));
    const result = await twentyListPeople(companyCtx());
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(500);
  });

  it('testConnection verifies reachability', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { companies: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await twentyAdapter.testConnection(companyCtx());
    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('rest/companies');
  });
});

describe('Frappe connector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists docs with token auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'LEAD-0001', lead_name: 'A' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await frappeListDocs(companyCtx(), 'CRM Lead', { limit: 5 });
    expect(result.ok).toBe(true);
    expect(result.data?.[0].name).toBe('LEAD-0001');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api/resource/CRM%20Lead');
    expect((init.headers as Record<string, string>).Authorization).toBe('token test-key');
  });
});

describe('httpSMS connector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends SMS with x-api-key and owner phone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'm1', status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await httpsmsSendSms(companyCtx(), { to: '+8801700000001', content: 'hello' });
    expect(result.ok).toBe(true);
    expect(result.data?.messageId).toBe('m1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://crm.example.com/v1/messages/send');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect(JSON.parse(String(init.body))).toMatchObject({
      phoneNumber: '+8801700000000',
      to: '+8801700000001',
    });
  });
});

describe('RSSHub connector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes feed items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [{ title: 'T1', url: 'https://x/1', date_published: '2026-11-10', description: 'd' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await rsshubFetchRoute(companyCtx(), 'github/trending/daily', { limit: 10 });
    expect(result.ok).toBe(true);
    expect(result.data?.[0]).toMatchObject({ title: 'T1', source: 'github/trending/daily' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('https://crm.example.com/github/trending/daily?');
    expect(url).toContain('format=json');
  });
});

describe('video generation connector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits a Wan2.2 job', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ job_id: 'j1' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await submitVideoJob(companyCtx(), { prompt: 'a cat', mode: 'text-to-video' });
    expect(result.ok).toBe(true);
    expect(result.data?.jobId).toBe('j1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/video/jobs');
    expect(JSON.parse(String(init.body)).model).toBe('wan2.2-5b');
  });

  it('rejects license-blocked models (fail closed)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await submitVideoJob(companyCtx(), {
      prompt: 'x',
      mode: 'text-to-video',
      model: 'hunyuan-video-13b' as 'wan2.2-5b',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/license-blocked/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires imageUrl for image-to-video', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const result = await submitVideoJob(companyCtx(), { prompt: 'x', mode: 'image-to-video' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/imageUrl/);
  });

  it('polls job status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'succeeded', video_url: 'https://cdn.example/v.mp4' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getVideoJob(companyCtx(), 'j1');
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe('succeeded');
    expect(result.data?.videoUrl).toBe('https://cdn.example/v.mp4');
  });
});

describe('utility', () => {
  it('joinUrl trims slashes', () => {
    expect(joinUrl('https://a.example/', '/x/y')).toBe('https://a.example/x/y');
  });
});
