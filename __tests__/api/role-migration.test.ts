import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLE_MAPPING, SPEC_ROLES, dryRunRoleMigration } from '@/lib/role-migration';

/**
 * Decision 2: Explicit role migration — unit tests.
 */

const { mockUserFindMany, mockRoleMigrationFindMany } = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockRoleMigrationFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    roleMigration: { findMany: (...args: unknown[]) => mockRoleMigrationFindMany(...args) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRoleMigrationFindMany.mockResolvedValue([]);
});

describe('ROLE_MAPPING', () => {
  it('maps super_admin → platform_super_admin', () => {
    expect(ROLE_MAPPING.super_admin).toBe('platform_super_admin');
  });

  it('maps admin → tenant_admin (conservative — not platform_super_admin)', () => {
    expect(ROLE_MAPPING.admin).toBe('tenant_admin');
  });

  it('maps customer-facing roles → api_consumer', () => {
    expect(ROLE_MAPPING.manager).toBe('api_consumer');
    expect(ROLE_MAPPING.operator).toBe('api_consumer');
    expect(ROLE_MAPPING.viewer).toBe('api_consumer');
  });
});

describe('SPEC_ROLES', () => {
  it('contains all 7 spec roles', () => {
    expect(SPEC_ROLES.size).toBe(7);
    expect(SPEC_ROLES.has('platform_super_admin')).toBe(true);
    expect(SPEC_ROLES.has('ai_workforce_admin')).toBe(true);
    expect(SPEC_ROLES.has('ai_model_admin')).toBe(true);
    expect(SPEC_ROLES.has('security_admin')).toBe(true);
    expect(SPEC_ROLES.has('infrastructure_admin')).toBe(true);
    expect(SPEC_ROLES.has('tenant_admin')).toBe(true);
    expect(SPEC_ROLES.has('api_consumer')).toBe(true);
  });
});

describe('dryRunRoleMigration', () => {
  it('does not write anything (read-only)', async () => {
    mockUserFindMany.mockResolvedValue([]);
    const result = await dryRunRoleMigration();
    expect(result.totalUsers).toBe(0);
    expect(result.proposed).toEqual([]);
    expect(result.mappable).toBe(0);
  });

  it('proposes mappings for known roles', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'admin@alolabs.net', role: 'admin', isActive: true },
      { id: 'u2', email: 'viewer@alolabs.net', role: 'viewer', isActive: true },
    ]);
    const result = await dryRunRoleMigration();
    expect(result.proposed).toHaveLength(2);
    expect(result.proposed[0].proposedRole).toBe('tenant_admin');
    expect(result.proposed[1].proposedRole).toBe('api_consumer');
  });

  it('flags unknown roles (does not auto-map them)', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u3', email: 'mystery@alolabs.net', role: 'god_mode', isActive: true },
    ]);
    const result = await dryRunRoleMigration();
    expect(result.unknownRoles).toHaveLength(1);
    expect(result.unknownRoles[0].currentRole).toBe('god_mode');
    expect(result.proposed).toHaveLength(0);
  });

  it('skips users already mapped to spec roles', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u4', email: 'already@alolabs.net', role: 'platform_super_admin', isActive: true },
    ]);
    const result = await dryRunRoleMigration();
    expect(result.alreadyMapped).toBe(1);
    expect(result.proposed).toHaveLength(0);
  });

  it('detects conflicts between existing and proposed mappings', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u5', email: 'conflict@alolabs.net', role: 'admin', isActive: true },
    ]);
    mockRoleMigrationFindMany.mockResolvedValue([
      { userId: 'u5', oldRole: 'admin', newRole: 'api_consumer', status: 'pending' },
    ]);
    const result = await dryRunRoleMigration();
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].existingMapping).toBe('api_consumer');
    expect(result.conflicts[0].proposedMapping).toBe('tenant_admin');
  });

  it('skips inactive users', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u6', email: 'inactive@alolabs.net', role: 'admin', isActive: false },
    ]);
    const result = await dryRunRoleMigration();
    expect(result.totalUsers).toBe(1);
    expect(result.proposed).toHaveLength(0);
    expect(result.alreadyMapped).toBe(0);
  });

  it('never proposes elevation to a role higher than the source', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u7', email: 'viewer@alolabs.net', role: 'viewer', isActive: true },
    ]);
    const result = await dryRunRoleMigration();
    expect(result.proposed[0].proposedRole).toBe('api_consumer');
    expect(SPEC_ROLES.has(result.proposed[0].proposedRole)).toBe(true);
  });
});
