/**
 * Governance runtime — state loading, audit and approval binding.
 *
 * The database is replaced with a small in-test double so these tests can prove
 * the *enforcement* behaviour (what gets blocked, what gets audited) without a
 * live database. The approval-binding suite proves that a caller-supplied id
 * cannot authorise anything on its own.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState: {
  settings: Array<{ key: string; value: string }>;
  settingsFails: boolean;
  approvals: Array<Record<string, unknown>>;
  users: Record<string, { role: string }>;
  memberships: Record<string, { role: string }>;
} = {
  settings: [],
  settingsFails: false,
  approvals: [],
  users: {},
  memberships: {},
};

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      findMany: async () => {
        if (dbState.settingsFails) throw new Error('settings table unavailable');
        return dbState.settings;
      },
    },
    approval: {
      findFirst: async ({ where }: { where: { id: string; companyId?: string } }) =>
        dbState.approvals.find(
          (row) => row.id === where.id && (!where.companyId || row.companyId === where.companyId),
        ) ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => dbState.users[where.id] ?? null,
    },
    companyUser: {
      findUnique: async ({ where }: { where: { companyId_userId: { companyId: string; userId: string } } }) => {
        const { companyId, userId } = where.companyId_userId;
        return dbState.memberships[`${companyId}:${userId}`] ?? null;
      },
    },
  },
}));

const auditCalls: Array<Record<string, unknown>> = [];
vi.mock('@/lib/audit-events', () => ({
  writeAuditEvent: async (event: Record<string, unknown>) => {
    auditCalls.push(event);
  },
}));

const {
  enforceGovernance,
  loadGovernanceState,
  resetGovernanceStateCache,
  verifyToolApproval,
} = await import('@/lib/governance/runtime');
const { buildApprovalBinding, digestActionPayload } = await import('@/lib/governance/approval-binding');

const baseRequest = {
  action: 'test',
  actionClass: 'write.project' as const,
  resource: 'project:p1',
  companyId: 'company-a',
  callerCompanyId: 'company-a',
  actor: { userId: 'user-1', role: 'developer' as const, companyId: 'company-a' },
  surface: 'customer_workspace' as const,
};

beforeEach(() => {
  dbState.settings = [];
  dbState.settingsFails = false;
  dbState.approvals = [];
  dbState.users = {};
  dbState.memberships = {};
  auditCalls.length = 0;
  resetGovernanceStateCache();
});

describe('loadGovernanceState', () => {
  it('reads the canonical emergency keys written by /api/emergency', async () => {
    dbState.settings = [
      { key: 'emergency_global_stop', value: JSON.stringify({ enabled: true }) },
      { key: 'emergency_disable_paid', value: JSON.stringify({ enabled: true }) },
    ];
    const state = await loadGovernanceState({ refresh: true });
    expect(state.globalStop).toBe(true);
    expect(state.paidDisabled).toBe(true);
    expect(state.readOnly).toBe(false);
    expect(state.source).toBe('database');
  });

  it('also honours the legacy /api/emergency/action namespace', async () => {
    dbState.settings = [
      { key: 'emergency:read_only_mode', value: JSON.stringify({ active: true }) },
      { key: 'emergency:stop_all_communication', value: JSON.stringify({ active: true }) },
    ];
    const state = await loadGovernanceState({ refresh: true });
    expect(state.readOnly).toBe(true);
    expect(state.externalCommsStopped).toBe(true);
  });

  it('treats malformed values as off rather than crashing', async () => {
    dbState.settings = [{ key: 'emergency_global_stop', value: 'not-json{' }];
    const state = await loadGovernanceState({ refresh: true });
    expect(state.globalStop).toBe(false);
    expect(state.source).toBe('database');
  });

  it('degrades safely when the settings table cannot be read', async () => {
    dbState.settingsFails = true;
    const state = await loadGovernanceState({ refresh: true });
    expect(state.source).toBe('unavailable');
    expect(state.globalStop).toBe(false);
    expect(state.detail).toMatch(/unavailable/);
  });

  it('caches within the TTL and refreshes on demand', async () => {
    dbState.settings = [{ key: 'emergency_global_stop', value: JSON.stringify({ enabled: true }) }];
    expect((await loadGovernanceState()).globalStop).toBe(true);

    dbState.settings = [];
    expect((await loadGovernanceState()).globalStop).toBe(true);
    expect((await loadGovernanceState({ refresh: true })).globalStop).toBe(false);
  });
});

describe('enforceGovernance', () => {
  it('blocks execution while the emergency stop is active and audits the denial', async () => {
    dbState.settings = [{ key: 'emergency_global_stop', value: JSON.stringify({ enabled: true }) }];
    const decision = await enforceGovernance(baseRequest);
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((violation) => violation.policyId)).toContain('EMERG-GLOBAL-STOP');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].action).toBe('governance.deny');
    expect(JSON.stringify(auditCalls[0])).not.toMatch(/secret|password/i);
  });

  it('does not write an audit event for an ordinary allowance', async () => {
    const decision = await enforceGovernance({ ...baseRequest, actionClass: 'knowledge.read' });
    expect(decision.outcome).toBe('allow');
    expect(auditCalls).toHaveLength(0);
  });

  it('audits a degraded allowance so fail-open is never silent', async () => {
    dbState.settingsFails = true;
    const decision = await enforceGovernance({ ...baseRequest, actionClass: 'knowledge.read' });
    expect(decision.outcome).toBe('allow');
    expect(decision.degraded).toBe(true);
    expect(auditCalls).toHaveLength(1);
  });

  it('denies high-impact work when the emergency state is unreadable', async () => {
    dbState.settingsFails = true;
    const decision = await enforceGovernance({ ...baseRequest, actionClass: 'data.delete' });
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((violation) => violation.policyId)).toContain('EMERG-STATE-UNVERIFIED');
  });
});

function seedApproval(overrides: Partial<Record<string, unknown>> = {}) {
  const binding = buildApprovalBinding({
    actionClass: 'external.communicate',
    action: 'send_email',
    resource: 'tool:send_email',
    payload: { tool: 'send_email', args: { to: 'a@example.com' } },
    requestedAt: new Date('2026-11-25T00:00:00Z'),
  });
  const row = {
    id: 'apr-1',
    type: 'external_cost',
    status: 'approved',
    companyId: 'company-a',
    requestJson: JSON.stringify({ binding }),
    expiresAt: new Date(Date.now() + 60_000),
    reviewedBy: 'reviewer-1',
    reviewedAt: new Date(),
    ...overrides,
  };
  dbState.approvals = [row];
  return row;
}

const claim = {
  approvalId: 'apr-1',
  companyId: 'company-a',
  toolName: 'send_email',
  args: { to: 'a@example.com' },
  actionClass: 'external.communicate' as const,
  allowedApproverRoles: ['admin' as const, 'organization_owner' as const],
};

describe('verifyToolApproval', () => {
  it('verifies a correctly bound approval from an authorised reviewer', async () => {
    seedApproval();
    dbState.users = { 'reviewer-1': { role: 'admin' } };
    const result = await verifyToolApproval(claim);
    expect(result.verified).toBe(true);
  });

  it('rejects an approval from a different organisation', async () => {
    seedApproval({ companyId: 'company-b' });
    dbState.users = { 'reviewer-1': { role: 'admin' } };
    const result = await verifyToolApproval(claim);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/not found|organisation/i);
  });

  it('rejects an expired approval', async () => {
    seedApproval({ expiresAt: new Date(Date.now() - 1_000) });
    dbState.users = { 'reviewer-1': { role: 'admin' } };
    const result = await verifyToolApproval(claim);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('rejects a pending or rejected approval', async () => {
    seedApproval({ status: 'pending' });
    dbState.users = { 'reviewer-1': { role: 'admin' } };
    const result = await verifyToolApproval(claim);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/not approved|pending/i);
  });

  it('rejects an approval whose payload no longer matches the call', async () => {
    seedApproval();
    dbState.users = { 'reviewer-1': { role: 'admin' } };
    const result = await verifyToolApproval({ ...claim, args: { to: 'attacker@example.com' } });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/payload|arguments/i);
  });

  it('rejects a legacy approval with no action binding', async () => {
    seedApproval({ requestJson: JSON.stringify({ note: 'legacy' }) });
    dbState.users = { 'reviewer-1': { role: 'admin' } };
    const result = await verifyToolApproval(claim);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/not bound|legacy/i);
  });

  it('rejects an approval granted by a role that cannot approve this action', async () => {
    seedApproval();
    dbState.users = { 'reviewer-1': { role: 'member' } };
    const result = await verifyToolApproval(claim);
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/role/i);
  });

  it('rejects a missing approval id without touching the database', async () => {
    const result = await verifyToolApproval({ ...claim, approvalId: '' });
    expect(result.verified).toBe(false);
  });

  it('bindings are stable across key order but change when arguments change', () => {
    expect(digestActionPayload({ a: 1, b: 2 })).toBe(digestActionPayload({ b: 2, a: 1 }));
    expect(digestActionPayload({ a: 1 })).not.toBe(digestActionPayload({ a: 2 }));
  });
});
