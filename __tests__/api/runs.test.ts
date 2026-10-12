/**
 * API tests for the AgentOS run endpoints:
 *   GET/POST /api/runs
 *   GET/DELETE /api/runs/:id
 *   GET/POST /api/projects
 *   GET/POST /api/artifacts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock auth (api-auth) ─────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user-1', companyId: 'company-1', role: 'admin' })),
  requireCompanyAuth: vi.fn(async () => ({ userId: 'user-1', companyId: 'company-1', role: 'admin' })),
}));

// ─── Mock NextRequest/NextResponse ────────────────────────────────

class MockNextRequest {
  private _url: string;
  private _headersMap: Record<string, string>;
  private _body: unknown;

  constructor(url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
    this._url = url;
    this._headersMap = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    this._body = init?.body;
  }

  get url() {
    return this._url;
  }
  get nextUrl() {
    return new URL(this._url);
  }
  get headers() {
    return { get: (key: string) => this._headersMap[key.toLowerCase()] ?? null };
  }
  async json() {
    return this._body;
  }
}

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new MockNextRequest(url, init) as unknown as import('next/server').NextRequest;
}

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      data,
      headers: new Map(Object.entries(init?.headers ?? {})),
    }),
  },
}));

// ─── Mock the AgentOS libs the routes delegate to ─────────────────

const createRunMock = vi.fn();
const listRunsMock = vi.fn();
const getRunDetailMock = vi.fn();
const cancelRunMock = vi.fn();

vi.mock('@/lib/runs', () => ({
  createRun: (...args: unknown[]) => createRunMock(...args),
  listRuns: (...args: unknown[]) => listRunsMock(...args),
  getRunDetail: (...args: unknown[]) => getRunDetailMock(...args),
  getRun: vi.fn(async () => null),
  cancelRun: (...args: unknown[]) => cancelRunMock(...args),
  getRunEvents: vi.fn(async () => []),
  RUN_QUEUE: 'agentos',
}));

const createProjectMock = vi.fn();
const listProjectsMock = vi.fn();

vi.mock('@/lib/projects', () => ({
  createProject: (...args: unknown[]) => createProjectMock(...args),
  listProjects: (...args: unknown[]) => listProjectsMock(...args),
  getProject: vi.fn(async () => null),
  getProjectDetail: vi.fn(async () => null),
  updateProject: vi.fn(async () => null),
  deleteProject: vi.fn(async () => true),
  createProjectRun: vi.fn(async () => ({ runId: 'run-x', status: 'queued' })),
}));

const createArtifactMock = vi.fn();
const listArtifactsMock = vi.fn();

vi.mock('@/lib/artifacts', () => ({
  createArtifact: (...args: unknown[]) => createArtifactMock(...args),
  listArtifacts: (...args: unknown[]) => listArtifactsMock(...args),
  getArtifact: vi.fn(async () => null),
  deleteArtifact: vi.fn(async () => true),
  verifyChecksum: vi.fn(() => true),
}));

import { GET as runsGET, POST as runsPOST } from '@/app/api/runs/route';
import { GET as runGET, DELETE as runDELETE } from '@/app/api/runs/[id]/route';
import { GET as projectsGET, POST as projectsPOST } from '@/app/api/projects/route';
import { GET as artifactsGET, POST as artifactsPOST } from '@/app/api/artifacts/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/runs', () => {
  it('creates a run and returns 202 with runId + eventsUrl', async () => {
    createRunMock.mockResolvedValue({ runId: 'run-123', status: 'queued' });

    const res = await runsPOST(req('http://localhost/api/runs', {
      method: 'POST',
      body: { objective: 'Research UK universities for a student.' },
    }));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.runId).toBe('run-123');
    expect(body.data.status).toBe('queued');
    expect(body.data.eventsUrl).toBe('/api/runs/run-123/events');
    expect(createRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ objective: 'Research UK universities for a student.', userId: 'user-1' }),
    );
  });

  it('rejects an empty objective with 400', async () => {
    const res = await runsPOST(req('http://localhost/api/runs', { method: 'POST', body: { objective: '' } }));
    expect(res.status).toBe(400);
    expect(createRunMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/runs', () => {
  it('lists runs scoped to the tenant', async () => {
    listRunsMock.mockResolvedValue({ runs: [{ id: 'run-1' }], total: 1 });
    const res = await runsGET(req('http://localhost/api/runs?limit=10&status=running'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: 'run-1' }]);
    expect(body.pagination.total).toBe(1);
    expect(listRunsMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1', status: 'running' }));
  });
});

describe('GET /api/runs/:id', () => {
  it('returns run detail', async () => {
    getRunDetailMock.mockResolvedValue({ run: { id: 'run-1', status: 'completed', companyId: 'company-1' }, tasks: [], artifacts: [], approvals: [], events: [] });
    const res = await runGET(req('http://localhost/api/runs/run-1'), params('run-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.run.id).toBe('run-1');
  });

  it('returns 404 for a missing run', async () => {
    getRunDetailMock.mockResolvedValue(null);
    const res = await runGET(req('http://localhost/api/runs/missing'), params('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when the run belongs to another tenant', async () => {
    getRunDetailMock.mockResolvedValue({ run: { id: 'run-1', companyId: 'other-company' }, tasks: [], artifacts: [], approvals: [], events: [] });
    const res = await runGET(req('http://localhost/api/runs/run-1'), params('run-1'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/runs/:id', () => {
  it('cancels a run', async () => {
    const { getRun } = await import('@/lib/runs');
    (getRun as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'run-1', companyId: 'company-1', status: 'running' });
    cancelRunMock.mockResolvedValue(true);
    const res = await runDELETE(req('http://localhost/api/runs/run-1', { method: 'DELETE' }), params('run-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('cancelled');
  });
});

describe('POST /api/projects', () => {
  it('creates a project', async () => {
    createProjectMock.mockResolvedValue({ id: 'proj-1', name: 'UK Admissions' });
    const res = await projectsPOST(req('http://localhost/api/projects', {
      method: 'POST',
      body: { name: 'UK Admissions', objective: 'Help students apply.' },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('proj-1');
    expect(createProjectMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'UK Admissions', companyId: 'company-1' }));
  });

  it('rejects a missing name with 400', async () => {
    const res = await projectsPOST(req('http://localhost/api/projects', { method: 'POST', body: {} }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects', () => {
  it('lists projects', async () => {
    listProjectsMock.mockResolvedValue({ projects: [{ id: 'p1' }], total: 1 });
    const res = await projectsGET(req('http://localhost/api/projects'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: 'p1' }]);
    expect(body.pagination.total).toBe(1);
  });
});

describe('POST /api/artifacts', () => {
  it('creates an artifact', async () => {
    createArtifactMock.mockResolvedValue({ id: 'art-1', name: 'report.md', checksum: 'abc' });
    const res = await artifactsPOST(req('http://localhost/api/artifacts', {
      method: 'POST',
      body: { name: 'report.md', type: 'report', content: '# Report' },
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('art-1');
  });

  it('rejects invalid input with 400', async () => {
    const res = await artifactsPOST(req('http://localhost/api/artifacts', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/artifacts', () => {
  it('lists artifacts', async () => {
    listArtifactsMock.mockResolvedValue({ artifacts: [], total: 0 });
    const res = await artifactsGET(req('http://localhost/api/artifacts'));
    expect(res.status).toBe(200);
  });
});
