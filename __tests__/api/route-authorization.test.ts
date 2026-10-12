import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route-level authorisation tests for the converted CRUD endpoints.
 *
 * These import the real route modules (only authentication, rate limiting and
 * the Prisma delegates are mocked) and assert the behaviour that matters:
 * anonymous callers are refused, a client cannot name another tenant, and a
 * record reached through another tenant's parent is invisible.
 */

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  authenticateV1: vi.fn(),
  checkRateLimit: vi.fn(),
  securityEventCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  companyMemory: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  agentCompanyAccess: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  featureFlag: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  crmNote: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  crmContact: { findUnique: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock('@/lib/v1-auth', () => ({ authenticateV1: mocks.authenticateV1 }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db', () => ({
  db: {
    securityEvent: { create: mocks.securityEventCreate },
    auditLog: { create: mocks.auditLogCreate },
    companyMemory: mocks.companyMemory,
    agentCompanyAccess: mocks.agentCompanyAccess,
    featureFlag: mocks.featureFlag,
    crmNote: mocks.crmNote,
    crmContact: mocks.crmContact,
  },
}));

import * as companyMemory from '@/app/api/company-memory/route';
import * as agentCompanyAccess from '@/app/api/agent-company-access/route';
import * as featureFlags from '@/app/api/feature-flags/route';
import * as crmNotes from '@/app/api/crm/notes/route';

const TENANT_A = 'company-a';
const TENANT_B = 'company-b';

function request(body?: unknown, search: Record<string, string> = {}): NextRequest {
  return {
    headers: { get: () => null },
    nextUrl: { searchParams: new URLSearchParams(search) },
    url: 'https://alolabs.net/api/test',
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as NextRequest;
}

function session(role = 'operator', companyId: string = TENANT_A) {
  mocks.getAuthUser.mockResolvedValue({
    userId: 'user-1',
    role,
    email: 'user@example.test',
    name: 'User',
    companyId,
    companyRole: 'member',
  });
  mocks.authenticateV1.mockResolvedValue(null);
}

async function statusOf(response: Response): Promise<{ status: number; body: any }> {
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUser.mockResolvedValue(null);
  mocks.authenticateV1.mockResolvedValue(null);
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
    totalInWindow: 1,
  });
  mocks.securityEventCreate.mockResolvedValue({ id: 'se-1' });
  mocks.auditLogCreate.mockResolvedValue({ id: 'audit-1' });

  for (const store of [mocks.companyMemory, mocks.agentCompanyAccess, mocks.featureFlag, mocks.crmNote]) {
    store.findMany.mockResolvedValue([]);
    store.count.mockResolvedValue(0);
    store.findUnique.mockResolvedValue(null);
    store.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'new-1', ...args.data }));
    store.update.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'new-1', ...args.data }));
    store.delete.mockResolvedValue({ id: 'new-1' });
  }
});

describe('converted CRUD routes reject anonymous callers', () => {
  const routes = [
    ['company-memory', companyMemory],
    ['agent-company-access', agentCompanyAccess],
    ['feature-flags', featureFlags],
    ['crm-notes', crmNotes],
  ] as const;

  for (const [name, route] of routes) {
    it(`${name}: every verb requires authentication`, async () => {
      for (const run of [
        () => route.GET(request()),
        () => route.POST(request({})),
        () => route.PUT(request({ id: 'x' })),
        () => route.DELETE(request(undefined, { id: 'x' })),
      ]) {
        const { status } = await statusOf((await run()) as Response);
        expect(status, `${name} must reject anonymous requests`).toBe(401);
      }
    });
  }
});

describe('company-memory — tenant column is server controlled', () => {
  it('refuses a create that names another tenant', async () => {
    session('operator', TENANT_A);

    const { status, body } = await statusOf((await companyMemory.POST(request({ companyId: TENANT_B, content: 'x' }))) as Response);

    expect(status).toBe(403);
    expect(body.error.code).toBe('tenant_mismatch');
    expect(mocks.companyMemory.create).not.toHaveBeenCalled();
    expect(mocks.securityEventCreate).toHaveBeenCalled();
    const event = mocks.securityEventCreate.mock.calls.at(-1)[0].data;
    expect(event.type).toBe('tenant_isolation_violation');
    expect(event.severity).toBe('critical');
  });

  it('writes the principal tenant even when the body names the right one', async () => {
    session('operator', TENANT_A);

    const { status } = await statusOf((await companyMemory.POST(request({ companyId: TENANT_A, content: 'x' }))) as Response);

    expect(status).toBe(201);
    // `category` comes from the schema default; `companyId` is server-set.
    expect(mocks.companyMemory.create.mock.calls[0][0].data).toMatchObject({ content: 'x', companyId: TENANT_A });
  });

  it('lists only the caller tenant’s rows', async () => {
    session('operator', TENANT_A);

    await companyMemory.GET(request());

    expect(mocks.companyMemory.findMany.mock.calls[0][0].where).toEqual({ companyId: TENANT_A });
  });

  it('refuses writes from a viewer', async () => {
    session('viewer', TENANT_A);

    const { status } = await statusOf((await companyMemory.POST(request({ content: 'x' }))) as Response);

    expect(status).toBe(403);
    expect(mocks.companyMemory.create).not.toHaveBeenCalled();
  });

  it('cannot delete a row owned by another tenant', async () => {
    session('operator', TENANT_A);
    mocks.companyMemory.findUnique.mockResolvedValue({ id: 'row-1', companyId: TENANT_B, content: 'x' });

    const { status } = await statusOf((await companyMemory.DELETE(request(undefined, { id: 'row-1' }))) as Response);

    expect(status).toBe(404);
    expect(mocks.companyMemory.delete).not.toHaveBeenCalled();
  });

  it('cannot update a row owned by another tenant', async () => {
    session('manager', TENANT_A);
    mocks.companyMemory.findUnique.mockResolvedValue({ id: 'row-1', companyId: TENANT_B, content: 'x' });

    const { status } = await statusOf((await companyMemory.PUT(request({ id: 'row-1', content: 'hijack' }))) as Response);

    expect(status).toBe(404);
    expect(mocks.companyMemory.update).not.toHaveBeenCalled();
  });
});

describe('feature-flags — administrative writes only', () => {
  it('lets an administrator toggle a flag', async () => {
    session('admin', TENANT_A);

    const { status } = await statusOf((await featureFlags.POST(request({ key: 'beta', name: 'Beta' }))) as Response);

    expect(status).toBe(201);
  });

  it('refuses an operator or manager creating a flag', async () => {
    for (const role of ['operator', 'manager', 'viewer']) {
      session(role, TENANT_A);
      const { status } = await statusOf((await featureFlags.POST(request({ key: 'beta', name: 'Beta' }))) as Response);
      expect(status, `${role} must not create feature flags`).toBe(403);
    }
    expect(mocks.featureFlag.create).not.toHaveBeenCalled();
  });

  it('still allows authenticated reads', async () => {
    session('viewer', TENANT_A);

    const { status } = await statusOf((await featureFlags.GET(request())) as Response);

    expect(status).toBe(200);
  });
});

describe('crm-notes — tenancy inherited through the parent contact', () => {
  it('creates a note on a contact owned by the caller tenant', async () => {
    session('operator', TENANT_A);
    mocks.crmContact.findUnique.mockResolvedValue({ companyId: TENANT_A });

    const { status } = await statusOf((await crmNotes.POST(request({ contactId: 'contact-1', content: 'hello' }))) as Response);

    expect(status).toBe(201);
    expect(mocks.crmNote.create.mock.calls[0][0].data).toMatchObject({ contactId: 'contact-1', content: 'hello' });
  });

  it('refuses to attach a note to another tenant’s contact', async () => {
    session('operator', TENANT_A);
    mocks.crmContact.findUnique.mockResolvedValue({ companyId: TENANT_B });

    const { status } = await statusOf((await crmNotes.POST(request({ contactId: 'contact-2', content: 'hello' }))) as Response);

    expect(status).toBe(404);
    expect(mocks.crmNote.create).not.toHaveBeenCalled();
  });

  it('refuses to attach a note to a contact that does not exist', async () => {
    session('operator', TENANT_A);
    mocks.crmContact.findUnique.mockResolvedValue(null);

    const { status } = await statusOf((await crmNotes.POST(request({ contactId: 'ghost', content: 'hello' }))) as Response);

    expect(status).toBe(400);
    expect(mocks.crmNote.create).not.toHaveBeenCalled();
  });

  it('scopes the note list through the contact relation', async () => {
    session('operator', TENANT_A);

    await crmNotes.GET(request());

    expect(mocks.crmNote.findMany.mock.calls[0][0].where).toEqual({ contact: { companyId: TENANT_A } });
  });

  it('cannot update or delete a note hanging off another tenant’s contact', async () => {
    session('operator', TENANT_A);
    mocks.crmNote.findUnique.mockResolvedValue({ id: 'note-1', contactId: 'contact-2', content: 'x' });
    mocks.crmContact.findUnique.mockResolvedValue({ companyId: TENANT_B });

    const updated = await statusOf((await crmNotes.PUT(request({ id: 'note-1', content: 'hijack' }))) as Response);
    const deleted = await statusOf((await crmNotes.DELETE(request(undefined, { id: 'note-1' }))) as Response);

    expect(updated.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(mocks.crmNote.update).not.toHaveBeenCalled();
    expect(mocks.crmNote.delete).not.toHaveBeenCalled();
  });
});

describe('agent-company-access — tenant grants', () => {
  it('refuses a grant written for another tenant', async () => {
    session('admin', TENANT_A);

    const { status } = await statusOf(
      (await agentCompanyAccess.POST(request({ agentId: 'agent-1', companyId: TENANT_B, accessLevel: 'read' }))) as Response,
    );

    expect(status).toBe(403);
    expect(mocks.agentCompanyAccess.create).not.toHaveBeenCalled();
  });

  it('accepts a grant for the caller tenant from an administrator', async () => {
    session('admin', TENANT_A);

    const { status } = await statusOf(
      (await agentCompanyAccess.POST(request({ agentId: 'agent-1', companyId: TENANT_A, accessLevel: 'read' }))) as Response,
    );

    expect(status).toBe(201);
    expect(mocks.agentCompanyAccess.create.mock.calls[0][0].data.companyId).toBe(TENANT_A);
  });

  it('refuses a grant from a non-administrator', async () => {
    session('operator', TENANT_A);

    const { status } = await statusOf(
      (await agentCompanyAccess.POST(request({ agentId: 'agent-1', companyId: TENANT_A, accessLevel: 'read' }))) as Response,
    );

    expect(status).toBe(403);
  });

  it('rejects an invalid payload with 422', async () => {
    session('admin', TENANT_A);

    const { status, body } = await statusOf((await agentCompanyAccess.POST(request({ agentId: '' }))) as Response);

    expect(status).toBe(422);
    expect(body.error.code).toBe('invalid_body');
  });
});
