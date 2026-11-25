/**
 * Research API (Phase D).
 *
 * Tenant scoping and governance happen before any network call. Saving is opt-in
 * and always uses the caller's company — never a company supplied in the body.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireCompanyAuthMock = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireCompanyAuth: (...args: unknown[]) => requireCompanyAuthMock(...args),
}));
vi.mock('@/lib/security/rate-limiter', () => ({ checkEndpointLimit: vi.fn(async () => ({ allowed: true })) }));
const auditMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/audit-events', () => ({ writeAuditEvent: (...args: unknown[]) => auditMock(...args) }));
const governanceMock = vi.fn();
vi.mock('@/lib/governance/runtime', () => ({
  enforceGovernance: (...args: unknown[]) => governanceMock(...(args as [])),
}));
const analyzeMock = vi.fn();
vi.mock('@/lib/research/public-page', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/research/public-page')>();
  return { ...actual, analyzePublicPage: (...args: unknown[]) => analyzeMock(...(args as [])) };
});
const saveMock = vi.fn(async () => ({ id: 'art_research_1', checksum: 'abc' }));
const listMock = vi.fn(async () => []);
vi.mock('@/lib/research/research-store', () => ({
  saveResearchReport: (...args: unknown[]) => saveMock(...(args as [])),
  listResearchReports: (...args: unknown[]) => listMock(...(args as [])),
}));

import { POST, GET } from '@/app/api/research/analyze/route';

const analysis = {
  requestedUrl: 'https://alolabs.net/', finalUrl: 'https://alolabs.net/', status: 200,
  fetchedAt: '2026-11-25T10:00:00.000Z', bytes: 1200, truncated: false, sha256: 'f'.repeat(64),
  contentType: 'text/html', title: 'ALO Labs', description: '', lang: 'en', canonical: null, robotsMeta: null,
  headings: { h1: ['Hi'], h2: [], h3: [] }, links: { total: 1, internal: 0, external: 1, sample: [] },
  images: { total: 0, missingAlt: 0 }, forms: 0, scripts: 1, stack: [], issues: [], textExcerpt: 'Hi',
  access: { robots: 'allowed', restricted: false, signals: [] }, citations: [],
  timings: { fetchMs: 10, totalMs: 20 }, javascriptRendered: false as const,
};

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/research/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyAuthMock.mockResolvedValue({ userId: 'u1', companyId: 'co_own', role: 'admin' });
  governanceMock.mockResolvedValue({ outcome: 'allow', explanation: 'read-only public fetch' });
  analyzeMock.mockResolvedValue(analysis);
});

describe('POST /api/research/analyze', () => {
  it('returns evidence and saves under the caller’s company only', async () => {
    const response = await post({ url: 'https://alolabs.net/?utm=x#frag', save: true, note: 'competitor pricing' });
    expect(response.status).toBe(200);

    const json = await response.json() as {
      success: boolean; saved: { id: string };
      verification: { level: string; javascriptRendered: boolean; evidence: { sha256: string } };
    };
    expect(json.success).toBe(true);
    expect(json.saved.id).toBe('art_research_1');
    expect(json.verification).toMatchObject({ level: 'http_fetch', javascriptRendered: false });
    expect(json.verification.evidence.sha256).toBe('f'.repeat(64));

    expect(analyzeMock).toHaveBeenCalledWith('https://alolabs.net/?utm=x');
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'co_own',
      createdBy: 'u1',
      note: 'competitor pricing',
    }));
    expect(governanceMock).toHaveBeenCalledWith(expect.objectContaining({ actionClass: 'read.public', companyId: 'co_own' }));
  });

  it('records the request in the audit trail before fetching', async () => {
    await post({ url: 'https://alolabs.net/' });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'research.analyze.request',
      actorUserId: 'u1',
      companyId: 'co_own',
      details: expect.objectContaining({ url: 'https://alolabs.net/' }),
    }));
  });

  it('refuses to fetch when the request cannot be audited', async () => {
    auditMock.mockRejectedValueOnce(new Error('audit down'));
    const response = await post({ url: 'https://alolabs.net/' });
    expect(response.status).toBe(500);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('records the save with the artifact id and evidence hash', async () => {
    await post({ url: 'https://alolabs.net/', save: true });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'research.report.save',
      companyId: 'co_own',
      details: expect.objectContaining({ artifactId: 'art_research_1', sha256: 'f'.repeat(64) }),
    }));
  });

  it('requires approval instead of fetching when governance says so', async () => {
    governanceMock.mockResolvedValue({
      outcome: 'require_approval',
      explanation: 'Research on this host needs a human',
      requiredApprovers: ['owner'],
    });
    const response = await post({ url: 'https://alolabs.net/' });
    expect(response.status).toBe(409);
    const json = await response.json() as { approvers: string[] };
    expect(json.approvers).toEqual(['owner']);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('does not save unless asked', async () => {
    const response = await post({ url: 'https://alolabs.net/' });
    expect(response.status).toBe(200);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('refuses before fetching when governance denies', async () => {
    governanceMock.mockResolvedValue({ outcome: 'deny', explanation: 'emergency read-only stop' });
    const response = await post({ url: 'https://alolabs.net/' });
    expect(response.status).toBe(403);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('rejects private and non-http URLs without fetching', async () => {
    expect((await post({ url: 'http://127.0.0.1:3000/admin' })).status).toBe(400);
    expect((await post({ url: 'file:///etc/passwd' })).status).toBe(400);
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('surfaces an SSRF block as 403', async () => {
    analyzeMock.mockRejectedValue(new Error('Blocked by network safety policy: private address'));
    const response = await post({ url: 'https://internal.example/' });
    expect(response.status).toBe(403);
  });
});

describe('GET /api/research/analyze', () => {
  it('lists reports for the caller’s company', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith('co_own', 10);
  });
});
