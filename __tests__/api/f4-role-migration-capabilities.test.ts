import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ROLE_MAPPING, SPEC_ROLES, dryRunRoleMigration, capabilitiesFor, lostCapabilities, applyMigration } from '@/lib/role-migration';

/**
 * F4: Role migration — backward-compatible capability handling.
 *
 * Verifies that a migration NEVER reduces a user's effective capabilities
 * without explicit confirmation, and that legacy roles retain their
 * capabilities through the mapping.
 */

const { mockUserFindMany, mockRoleMigrationFindMany, mockRoleMigrationFindUnique, mockUserUpdate, mockRoleMigrationUpdate, mockAuditLogCreate } = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockRoleMigrationFindMany: vi.fn(),
  mockRoleMigrationFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockRoleMigrationUpdate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a), update: (...a: unknown[]) => mockUserUpdate(...a) },
    roleMigration: { findMany: (...a: unknown[]) => mockRoleMigrationFindMany(...a), findUnique: (...a: unknown[]) => mockRoleMigrationFindUnique(...a), update: (...a: unknown[]) => mockRoleMigrationUpdate(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditLogCreate(...a) },
    $transaction: vi.fn((ops: unknown[]) => Promise.all((ops as Promise<unknown>[]).map((p) => p.catch(() => null)))),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRoleMigrationFindMany.mockResolvedValue([]);
  mockUserUpdate.mockResolvedValue({});
  mockRoleMigrationUpdate.mockResolvedValue({});
  mockAuditLogCreate.mockResolvedValue({});
});

describe('F4: capabilitiesFor', () => {
  it('returns the full capability set for super_admin (legacy)', () => {
    const caps = capabilitiesFor('super_admin');
    expect(caps.has('platform_admin')).toBe(true);
    expect(caps.has('ai_workforce_admin')).toBe(true);
    expect(caps.has('security_admin')).toBe(true);
    expect(caps.has('infrastructure_admin')).toBe(true);
    expect(caps.has('approve')).toBe(true);
  });

  it('returns the full capability set for platform_super_admin (spec)', () => {
    const caps = capabilitiesFor('platform_super_admin');
    expect(caps.has('platform_admin')).toBe(true);
    expect(caps.has('ai_workforce_admin')).toBe(true);
  });

  it('returns a scoped set for api_consumer', () => {
    const caps = capabilitiesFor('api_consumer');
    expect(caps.has('api_consumer')).toBe(true);
    expect(caps.has('read')).toBe(true);
    expect(caps.has('platform_admin')).toBe(false);
  });

  it('returns an empty set for unknown roles', () => {
    expect(capabilitiesFor('unknown_role').size).toBe(0);
  });
});

describe('F4: lostCapabilities', () => {
  it('detects no loss when super_admin → platform_super_admin (equivalent)', () => {
    const lost = lostCapabilities('super_admin', 'platform_super_admin');
    expect(lost).toEqual([]);
  });

  it('detects loss when super_admin → tenant_admin (loses platform_admin, ai_workforce_admin, etc.)', () => {
    const lost = lostCapabilities('super_admin', 'tenant_admin');
    expect(lost).toContain('platform_admin');
    expect(lost).toContain('ai_workforce_admin');
    expect(lost).toContain('ai_model_admin');
    expect(lost).toContain('security_admin');
    expect(lost).toContain('infrastructure_admin');
  });

  it('detects loss when admin → api_consumer (loses approve)', () => {
    const lost = lostCapabilities('admin', 'api_consumer');
    expect(lost).toContain('approve');
    expect(lost).toContain('tenant_admin');
  });

  it('detects no loss when viewer → api_consumer (equivalent)', () => {
    const lost = lostCapabilities('viewer', 'api_consumer');
    expect(lost).toEqual([]);
  });
});

describe('F4: applyMigration — capability-loss guard', () => {
  it('rejects a migration that loses capabilities without explicit confirmation', async () => {
    mockRoleMigrationFindUnique.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      oldRole: 'super_admin',
      newRole: 'tenant_admin',
      status: 'pending',
      notes: null,
    });
    const result = await applyMigration('m1', 'operator-1');
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/would lose capabilities/);
    expect(result.lostCapabilities).toContain('platform_admin');
    // Verify NO write occurred.
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('allows a migration that loses capabilities WHEN notes contain CONFIRM_CAPABILITY_LOSS', async () => {
    mockRoleMigrationFindUnique.mockResolvedValue({
      id: 'm2',
      userId: 'u2',
      oldRole: 'super_admin',
      newRole: 'tenant_admin',
      status: 'pending',
      notes: 'Operator reviewed. CONFIRM_CAPABILITY_LOSS',
    });
    const result = await applyMigration('m2', 'operator-1');
    expect(result.applied).toBe(true);
    expect(result.lostCapabilities).toContain('platform_admin');
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it('allows a migration with no capability loss without confirmation', async () => {
    mockRoleMigrationFindUnique.mockResolvedValue({
      id: 'm3',
      userId: 'u3',
      oldRole: 'viewer',
      newRole: 'api_consumer',
      status: 'pending',
      notes: null,
    });
    const result = await applyMigration('m3', 'operator-1');
    expect(result.applied).toBe(true);
    expect(result.lostCapabilities).toEqual([]);
  });

  it('never migrates a platform administrator into a role that loses platform_admin without confirmation', async () => {
    mockRoleMigrationFindUnique.mockResolvedValue({
      id: 'm4',
      userId: 'u4',
      oldRole: 'super_admin',
      newRole: 'security_admin', // loses platform_admin
      status: 'pending',
      notes: null,
    });
    const result = await applyMigration('m4', 'operator-1');
    expect(result.applied).toBe(false);
    expect(result.lostCapabilities).toContain('platform_admin');
  });
});
