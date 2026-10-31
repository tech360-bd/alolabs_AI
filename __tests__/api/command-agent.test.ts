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
      findFirst: vi.fn(async () => ({ id: 'co_other', name: 'Other Co', slug: 'other', status: 'active' })),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.slug === 'alo-labs' || where.id === 'co_own'
          ? { id: 'co_own', name: 'ALO Labs', slug: 'alo-labs', status: 'active' }
          : null),
    },
    aIProviderConfig: { count: vi.fn(async () => 1) },
  },
}));
const runMock = vi.fn(async () => ({
  content: 'Done.', provider: 'groq', model: 'qwen/qwen3-32b', profile: 'free_general',
  steps: 0, skillsUsed: [], skillsRejected: [], trace: [], images: [], requestIds: ['req_1'],
}));
vi.mock('@/lib/command-agent/agent', () => ({
  runCommandAgent: (...args: unknown[]) => runMock(...(args as [])),
  clearCommandSessions: vi.fn(() => 1),
  COMMAND_AGENT_PROFILES: ['free_general', 'free_coding', 'free_reasoning', 'local_general', 'local_fast'],
  CompanyAIError: class CompanyAIError extends Error {
    constructor(message: string, public status: number, public code: string, public requestId?: string) { super(message); }
  },
}));
vi.mock('@/lib/security/rate-limiter', () => ({ checkEndpointLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/audit-events', () => ({ writeAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/multi-tenant-ai/service', () => ({ listCompanyAIModels: vi.fn(async () => []) }));

import { POST } from '@/app/api/command-agent/chat/route';
import { GET as catalogGET } from '@/app/api/command-agent/catalog/route';

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/command-agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  runMock.mockResolvedValue({
    content: 'Done.', provider: 'groq', model: 'qwen/qwen3-32b', profile: 'free_general',
    steps: 0, skillsUsed: [], skillsRejected: [], trace: [], images: [], requestIds: ['req_1'],
  });
});

describe('Command Agent access control', () => {
  it('rejects unauthenticated callers', async () => {
    requireAuthMock.mockRejectedValue(new Error('Unauthorized'));
    expect((await post({ message: 'hi' })).status).toBe(401);
  });

  it('rejects non-admin company members', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'u1', role: 'viewer', companyId: 'co_own', companyRole: 'employee' });
    expect((await post({ message: 'hi' })).status).toBe(403);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('allows a Super Admin (default company) and returns the agent result', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'root', role: 'super_admin' });
    const response = await post({ message: 'Weather in Dhaka?' });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean; response: string; model: string };
    expect(json.success).toBe(true);
    expect(json.model).toBe('qwen/qwen3-32b');
  });

  it('allows a company Admin for their own company', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'u2', role: 'admin', companyId: 'co_own', companyRole: 'admin' });
    expect((await post({ message: 'Pipeline summary' })).status).toBe(200);
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'co_own' }));
  });

  it('refuses a company Admin targeting another company', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'u2', role: 'admin', companyId: 'co_own', companyRole: 'admin' });
    expect((await post({ message: 'hi', targetCompany: 'other' })).status).toBe(404);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('validates the request body', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'root', role: 'super_admin' });
    expect((await post({ message: '' })).status).toBe(400);
    expect((await post({ message: 'hi', profile: 'paid_please' })).status).toBe(400);
  });

  it('catalogue requires Super Admin / Admin too', async () => {
    requireAuthMock.mockResolvedValue({ userId: 'u3', role: 'viewer', companyId: 'co_own', companyRole: 'employee' });
    expect((await catalogGET()).status).toBe(403);
  });
});
