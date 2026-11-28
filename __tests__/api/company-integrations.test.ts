// @vitest-environment node
/**
 * /api/company/integrations — authorization, tenant isolation, encryption,
 * masking and audit logging.
 *
 * The auth layer and Prisma client are mocked (unit scope); field encryption is
 * the REAL implementation, so the ciphertext assertions are meaningful.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    integrationCredential: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/api-auth', () => ({ requireCompanyAuth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: mocks.db }));

import { GET, POST, DELETE } from '@/app/api/company/integrations/route';

const companyId = 'company-current';
const SECRET = 'crm-read-only-key-DO-NOT-STORE-PLAINTEXT';

function postRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function deleteRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-0123456789abcdef';
  mocks.auth.mockResolvedValue({ userId: 'admin-1', companyId, role: 'admin', companyRole: 'owner' });
  mocks.db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.db));
  mocks.db.auditEvent.create.mockResolvedValue({ id: 'audit-1' });
});

describe('GET /api/company/integrations', () => {
  it('queries only the caller tenant and never returns ciphertext', async () => {
    mocks.db.integrationCredential.findMany.mockResolvedValue([
      {
        id: 'cred-1', integrationType: 'crm.alo-lead-api', name: 'Staging', baseUrl: 'https://crm.example',
        secretFingerprint: 'fp1', settings: '{}', status: 'connected', createdBy: 'admin-1',
        lastVerifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(mocks.db.integrationCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId } }),
    );
    expect(body.data[0].hasSecret).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/encryptedSecret|v1:/);
  });
});

describe('POST /api/company/integrations', () => {
  it('rejects a non-manager with 403 and performs no write', async () => {
    mocks.auth.mockResolvedValue({ userId: 'staff-1', companyId, role: 'account_manager', companyRole: 'member' });
    const res = await POST(postRequest({ integrationType: 'crm.alo-lead-api', name: 'X CRM', baseUrl: 'https://x.example', secret: SECRET }));
    expect(res.status).toBe(403);
    expect(mocks.db.integrationCredential.create).not.toHaveBeenCalled();
  });

  it('refuses to store a secret when no encryption key is configured', async () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.APP_SECRET;
    const res = await POST(postRequest({ integrationType: 'crm.alo-lead-api', name: 'X CRM', baseUrl: 'https://x.example', secret: SECRET }));
    expect(res.status).toBe(503);
    expect(mocks.db.integrationCredential.create).not.toHaveBeenCalled();
  });

  it('encrypts the secret, returns only a fingerprint and audits without the secret', async () => {
    mocks.db.integrationCredential.findFirst.mockResolvedValue(null);
    mocks.db.integrationCredential.create.mockResolvedValue({
      id: 'cred-new', companyId, integrationType: 'crm.alo-lead-api', name: 'Staging',
      baseUrl: 'https://crm.example', secretFingerprint: 'fp-new', status: 'configured',
      createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await POST(postRequest({
      integrationType: 'crm.alo-lead-api', name: 'Staging', baseUrl: 'https://crm.example', secret: SECRET,
      settings: { model: 'qwen3:8b' },
    }));
    expect(res.status).toBe(201);

    const data = mocks.db.integrationCredential.create.mock.calls[0][0].data;
    expect(data.companyId).toBe(companyId);
    expect(data.encryptedSecret).toMatch(/^v2:/);
    expect(data.encryptedSecret).not.toContain(SECRET);
    expect(data.secretFingerprint).toBeTruthy();

    const body = await res.json();
    expect(body.data.hasSecret).toBe(true);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain('encryptedSecret');

    const audit = mocks.db.auditEvent.create.mock.calls[0][0].data;
    expect(audit.companyId).toBe(companyId);
    expect(audit.action).toBe('company.integration.create');
    expect(JSON.stringify(audit)).not.toContain(SECRET);
  });

  it('rejects tenant injection through the request body', async () => {
    const res = await POST(postRequest({
      companyId: 'company-other', integrationType: 'crm.alo-lead-api', name: 'X',
      baseUrl: 'https://x.example', secret: SECRET,
    }));
    expect(res.status).toBe(400);
    expect(mocks.db.integrationCredential.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/company/integrations', () => {
  it('cannot delete another tenant’s credential', async () => {
    mocks.db.integrationCredential.findFirst.mockResolvedValue(null);
    const res = await DELETE(deleteRequest({ id: 'cred-foreign' }));
    expect(res.status).toBe(404);
    expect(mocks.db.integrationCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cred-foreign', companyId } }),
    );
    expect(mocks.db.integrationCredential.delete).not.toHaveBeenCalled();
  });

  it('deletes an owned credential and audits the action', async () => {
    mocks.db.integrationCredential.findFirst.mockResolvedValue({ id: 'cred-1', integrationType: 'crm.alo-lead-api', name: 'Staging' });
    mocks.db.integrationCredential.delete.mockResolvedValue({});
    const res = await DELETE(deleteRequest({ id: 'cred-1' }));
    expect(res.status).toBe(200);
    expect(mocks.db.integrationCredential.delete).toHaveBeenCalledWith({ where: { id: 'cred-1' } });
    expect(mocks.db.auditEvent.create).toHaveBeenCalled();
  });

  it('refuses deletion by a non-manager', async () => {
    mocks.auth.mockResolvedValue({ userId: 'staff-1', companyId, role: 'account_manager', companyRole: 'member' });
    const res = await DELETE(deleteRequest({ id: 'cred-1' }));
    expect(res.status).toBe(403);
    expect(mocks.db.integrationCredential.delete).not.toHaveBeenCalled();
  });
});
