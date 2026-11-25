/**
 * GET /api/command-agent/runs/[id] (Phase C2).
 *
 * The route is the reload path for a run timeline, so its contract is mostly
 * about refusing the wrong caller: unauthenticated, non-admin, another tenant,
 * and a non-command-run artifact must all fail closed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAuthMock = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  canManageCompany: (user: { role: string; companyRole?: string }) =>
    user.role === 'super_admin' || user.companyRole === 'owner' || user.companyRole === 'admin',
}));
vi.mock('@/lib/db', () => ({
  db: {
    company: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.id === 'co_own' || where.slug === 'alo-labs'
          ? { id: where.id ?? 'co_own', name: 'ALO Labs', slug: 'alo-labs', status: 'active' }
          : null),
      findFirst: vi.fn(async ({ where }: { where: { OR?: Array<{ id?: string; slug?: string }> } }) => {
        const term = where.OR?.[0]?.id ?? where.OR?.[1]?.id;
        return term === 'co_other' ? { id: 'co_other', name: 'Other Co', slug: 'other', status: 'active' } : null;
      }),
    },
  },
}));

const getRunMock = vi.fn();
vi.mock('@/lib/command-agent/run-store', () => ({
  getCommandRun: (...args: unknown[]) => getRunMock(...(args as [])),
}));

import { GET } from '@/app/api/command-agent/runs/[id]/route';

function request(id: string, query = '') {
  return GET(
    new NextRequest(`http://localhost/api/command-agent/runs/${encodeURIComponent(id)}${query}`),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 'root', role: 'super_admin' });
  getRunMock.mockResolvedValue({
    id: 'run_1', status: 'completed', events: [{ seq: 1, at: '2026-11-25T10:00:00Z', type: 'final', data: {} }],
    createdAt: '2026-11-25T10:00:00Z', updatedAt: '2026-11-25T10:00:01Z', sessionId: 's1',
    profile: 'free_general', provider: 'groq', model: 'llama-free', truncated: false,
  });
});

describe('GET /api/command-agent/runs/[id]', () => {
  it('returns the stored timeline for an authorised caller', async () => {
    const response = await request('run_1');
    expect(response.status).toBe(200);
    const json = await response.json() as { success: boolean; run: { id: string; events: unknown[] } };
    expect(json.success).toBe(true);
    expect(json.run.id).toBe('run_1');
    expect(json.run.events).toHaveLength(1);
  });

  it('rejects unauthenticated callers', async () => {
    requireAuthMock.mockRejectedValue(new Error('Unauthorized'));
    expect((await request('run_1')).status).toBe(401);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it('rejects non-admin members before touching the run store', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'u1', role: 'viewer', companyId: 'co_own', companyRole: 'employee' });
    expect((await request('run_1')).status).toBe(403);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown runs, another tenant, and non-run artifacts alike', async () => {
    getRunMock.mockResolvedValue(null);
    const response = await request('run_other');
    expect(response.status).toBe(404);
    // Tenant scoping is enforced by the store call, not by the client.
    expect(getRunMock).toHaveBeenCalledWith('run_other', expect.any(String));
  });

  it('rejects an oversized run id without a lookup', async () => {
    const response = await request('x'.repeat(201));
    expect(response.status).toBe(400);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it('resolves the requested tenant for a super admin', async () => {
    await request('run_1', '?targetCompany=co_other');
    expect(getRunMock).toHaveBeenCalledWith('run_1', 'co_other');
  });
});
