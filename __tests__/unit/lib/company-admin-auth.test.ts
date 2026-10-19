import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ verifySessionToken: vi.fn() }));

import { canManageCompany } from '@/lib/api-auth';

describe('company administration authorization', () => {
  it('allows a Super Admin to manage an explicitly selected company', () => {
    expect(canManageCompany({ role: 'super_admin', companyRole: undefined })).toBe(true);
  });

  it('allows only owner/admin membership roles to administer their company', () => {
    expect(canManageCompany({ role: 'user', companyRole: 'owner' })).toBe(true);
    expect(canManageCompany({ role: 'user', companyRole: 'admin' })).toBe(true);
    expect(canManageCompany({ role: 'user', companyRole: 'manager' })).toBe(false);
    expect(canManageCompany({ role: 'user', companyRole: 'employee' })).toBe(false);
    expect(canManageCompany({ role: 'admin', companyRole: undefined })).toBe(false);
  });
});
