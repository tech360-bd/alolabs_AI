import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * Tenant-isolation tests for the generated CRUD handlers.
 *
 * The Prisma delegate is a recording fake, so the tests assert on the exact
 * `where` clauses the generated handlers build — the property that decides
 * whether one tenant can reach another tenant's rows.
 */

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  authenticateV1: vi.fn(),
  checkRateLimit: vi.fn(),
  securityEventCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock('@/lib/v1-auth', () => ({ authenticateV1: mocks.authenticateV1 }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db', () => ({
  db: {
    securityEvent: { create: mocks.securityEventCreate },
    auditLog: { create: mocks.auditLogCreate },
    crmContact: {
      findMany: mocks.findMany,
      count: mocks.count,
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.delete,
    },
  },
}));

import { secureCrud } from '@/lib/api/secure-crud';

const TENANT_A = 'company-a';
const TENANT_B = 'company-b';

function request(body?: unknown, search: Record<string, string> = {}): NextRequest {
  return {
    headers: { get: () => null },
    nextUrl: { searchParams: new URLSearchParams(search) },
    url: 'https://alolabs.net/api/crm/contacts',
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as NextRequest;
}

const handlers = secureCrud({
  resource: 'crm.contacts',
  model: 'crmContact',
  label: 'CrmContact',
  createSchema: z.object({ name: z.string().min(1), email: z.string().email().optional() }),
  updateSchema: z.object({ name: z.string().min(1).optional() }),
  searchFields: ['name', 'email'],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUser.mockResolvedValue({
    userId: 'user-1',
    role: 'operator',
    email: 'operator@example.test',
    name: 'Operator',
    companyId: TENANT_A,
    companyRole: 'member',
  });
  mocks.authenticateV1.mockResolvedValue(null);
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
    totalInWindow: 1,
  });
  mocks.findMany.mockResolvedValue([{ id: 'c1', companyId: TENANT_A, name: 'Ada' }]);
  mocks.count.mockResolvedValue(1);
  mocks.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'c9', ...args.data }));
  mocks.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'c1', ...args.data }));
  mocks.delete.mockResolvedValue({ id: 'c1' });
  mocks.auditLogCreate.mockResolvedValue({ id: 'audit-1' });
  mocks.securityEventCreate.mockResolvedValue({ id: 'se-1' });
});

describe('secureCrud — read isolation', () => {
  it('scopes list queries to the caller tenant and paginates', async () => {
    const response = await handlers.GET(request(undefined, { page: '2', limit: '5' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ page: 2, limit: 5, total: 1, pages: 1 });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
    expect(mocks.findMany.mock.calls[0][0].skip).toBe(5);
    expect(mocks.findMany.mock.calls[0][0].take).toBe(5);
    expect(mocks.count.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });

  it('keeps the tenant filter when a free-text search is applied', async () => {
    await handlers.GET(request(undefined, { search: 'ada' }));

    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(TENANT_A);
    expect(where.OR).toEqual([{ name: { contains: 'ada' } }, { email: { contains: 'ada' } }]);
  });

  it('cannot be tricked into listing another tenant by a query parameter', async () => {
    await handlers.GET(request(undefined, { companyId: TENANT_B }));

    expect(mocks.findMany.mock.calls[0][0].where.companyId).toBe(TENANT_A);
  });
});

describe('secureCrud — write isolation', () => {
  it('stamps the principal tenant on create instead of trusting the body', async () => {
    const response = await handlers.POST(request({ name: 'New' }));

    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toEqual({ name: 'New', companyId: TENANT_A });
  });

  it('rejects a create that carries another tenant’s id in the body', async () => {
    const response = await handlers.POST(request({ name: 'New', companyId: TENANT_B }));

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('writes an audit entry for creates', async () => {
    await handlers.POST(request({ name: 'New' }));

    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1);
    const entry = mocks.auditLogCreate.mock.calls[0][0].data;
    expect(entry).toMatchObject({ action: 'create', resource: 'CrmContact', userId: 'user-1' });
  });

  it('refuses to update a record owned by another tenant (404, no write)', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'c1', companyId: TENANT_B, name: 'Other' });

    const response = await handlers.PUT(request({ id: 'c1', name: 'Hijacked' }));

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates a record owned by the caller tenant and audits the change', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'c1', companyId: TENANT_A, name: 'Ada' });

    const response = await handlers.PUT(request({ id: 'c1', name: 'Renamed' }));

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { id: 'c1' }, data: { name: 'Renamed', companyId: TENANT_A } });
    expect(mocks.auditLogCreate.mock.calls[0][0].data.action).toBe('update');
  });

  it('refuses to delete a record owned by another tenant (404, no delete)', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'c1', companyId: TENANT_B });

    const response = await handlers.DELETE(request(undefined, { id: 'c1' }));

    expect(response.status).toBe(404);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('deletes a record owned by the caller tenant and audits it', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'c1', companyId: TENANT_A });

    const response = await handlers.DELETE(request(undefined, { id: 'c1' }));

    expect(response.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(mocks.auditLogCreate.mock.calls[0][0].data.action).toBe('delete');
  });

  it('rejects an invalid payload with 422 before touching the database', async () => {
    const response = await handlers.POST(request({ name: '' }));

    expect(response.status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rate-limits mutations by default', async () => {
    await handlers.POST(request({ name: 'New' }));

    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit.mock.calls[0][0]).toBe('crm.contacts:create:session:user-1');
  });
});

describe('secureCrud — authentication', () => {
  it('rejects anonymous callers on every verb', async () => {
    mocks.getAuthUser.mockResolvedValue(null);
    mocks.authenticateV1.mockResolvedValue(null);

    for (const run of [
      () => handlers.GET(request()),
      () => handlers.POST(request({ name: 'x' })),
      () => handlers.PUT(request({ id: 'c1', name: 'x' })),
      () => handlers.DELETE(request(undefined, { id: 'c1' })),
    ]) {
      const response = await run();
      expect(response.status).toBe(401);
    }
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
