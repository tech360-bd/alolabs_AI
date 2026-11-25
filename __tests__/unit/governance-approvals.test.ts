/**
 * Bound-approval lifecycle (Phase B2).
 *
 * Proves the full loop that Phase B could not: a consequential action is blocked,
 * an approval is created for that exact payload, a human with an allowed role
 * approves it, the action passes *once*, and a replay is refused.
 *
 * Also proves the HTTP gate's contract (403 + approval id vs. 403 deny vs. allow)
 * and that the approval record never contains the customer's message body.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ApprovalRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  requestJson: string;
  status: string;
  requestedBy: string | null;
  companyId: string | null;
  riskLevel: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const state: {
  approvals: ApprovalRow[];
  users: Record<string, { role: string }>;
  memberships: Record<string, { role: string }>;
  settings: Array<{ key: string; value: string }>;
  auditFails: boolean;
  updateCount: number | null;
} = {
  approvals: [],
  users: {},
  memberships: {},
  settings: [],
  auditFails: false,
  updateCount: null,
};

let nextId = 1;

vi.mock('@/lib/db', () => ({
  db: {
    settings: { findMany: async () => state.settings },
    approval: {
      create: async ({ data }: { data: Partial<ApprovalRow> }) => {
        const row: ApprovalRow = {
          id: `apr-${nextId++}`,
          type: data.type ?? 'tool_approval',
          title: data.title ?? '',
          description: data.description ?? null,
          requestJson: data.requestJson ?? '{}',
          status: data.status ?? 'pending',
          requestedBy: data.requestedBy ?? null,
          companyId: data.companyId ?? null,
          riskLevel: data.riskLevel ?? null,
          reviewedBy: data.reviewedBy ?? null,
          reviewedAt: data.reviewedAt ?? null,
          expiresAt: data.expiresAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.approvals.push(row);
        return { id: row.id };
      },
      findFirst: async ({ where }: { where: { id: string; companyId?: string } }) =>
        state.approvals.find(
          (row) => row.id === where.id && (!where.companyId || row.companyId === where.companyId),
        ) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; companyId?: string; status?: string; requestJson?: string };
        data: Partial<ApprovalRow>;
      }) => {
        if (state.updateCount !== null) return { count: state.updateCount };
        const matches = state.approvals.filter(
          (row) =>
            row.id === where.id &&
            (!where.companyId || row.companyId === where.companyId) &&
            (!where.status || row.status === where.status) &&
            (!where.requestJson || row.requestJson === where.requestJson),
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => state.users[where.id] ?? null,
    },
    companyUser: {
      findUnique: async ({ where }: { where: { companyId_userId: { companyId: string; userId: string } } }) => {
        const { companyId, userId } = where.companyId_userId;
        return state.memberships[`${companyId}:${userId}`] ?? null;
      },
    },
  },
}));

vi.mock('@/lib/audit-events', () => ({
  writeAuditEvent: async (event: Record<string, unknown>) => {
    if (state.auditFails) throw new Error('audit unavailable');
    auditEvents.push(event);
  },
}));

// The gate returns NextResponse objects; a minimal double is enough to assert the
// status code and JSON body without booting the Next.js runtime.
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}));

const auditEvents: Array<Record<string, unknown>> = [];

const {
  approvalTypeForAction,
  consumeApproval,
  createBoundApproval,
  defaultApproversFor,
  extractApprovalId,
  isApprovalConsumed,
  verifyBoundApproval,
} = await import('@/lib/governance/approvals');
const { enforceHttpGovernance } = await import('@/lib/governance/http');

const EMAIL_PAYLOAD = {
  accountId: 'acc-1',
  to: ['customer@example.com'],
  subject: 'Your renewal',
  bodyHash: 'f'.repeat(64),
  attachments: [],
};

const EMAIL_ACTION = 'Send outbound email';
const EMAIL_RESOURCE = 'email:acc-1';
const EMAIL_CLASS = 'external.communicate' as const;

beforeEach(() => {
  state.approvals = [];
  state.users = {};
  state.memberships = {};
  state.settings = [];
  state.auditFails = false;
  state.updateCount = null;
  auditEvents.length = 0;
  nextId = 1;
});

async function approvedEmailApproval(overrides: { reviewerId?: string; payload?: unknown } = {}) {
  const created = await createBoundApproval({
    companyId: 'company-a',
    requestedBy: 'requester-1',
    actionClass: EMAIL_CLASS,
    action: EMAIL_ACTION,
    resource: EMAIL_RESOURCE,
    payload: overrides.payload ?? EMAIL_PAYLOAD,
    riskLevel: 'high',
    requiredApprovers: ['organization_owner'],
    description: 'Send the renewal mail',
  });
  const row = state.approvals.find((candidate) => candidate.id === created.id)!;
  row.status = 'approved';
  row.reviewedBy = overrides.reviewerId ?? 'owner-1';
  row.reviewedAt = new Date();
  return row;
}

describe('createBoundApproval', () => {
  it('persists a pending, tenant-scoped approval bound to the exact payload', async () => {
    const created = await createBoundApproval({
      companyId: 'company-a',
      requestedBy: 'requester-1',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
      requiredApprovers: ['organization_owner'],
    });

    expect(created.id).toMatch(/^apr-/);
    expect(created.binding.digest).toHaveLength(64);
    const row = state.approvals[0];
    expect(row.status).toBe('pending');
    expect(row.companyId).toBe('company-a');
    expect(row.type).toBe('public_publish');
    expect(row.riskLevel).toBe('high');
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(row.requestJson).toContain(created.binding.digest);
    expect(auditEvents.map((event) => event.action)).toContain('governance.approval.requested');
  });

  it('never stores the message body in the approval record', async () => {
    await createBoundApproval({
      companyId: 'company-a',
      requestedBy: 'requester-1',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: { ...EMAIL_PAYLOAD, secretBody: 'CONFIDENTIAL-MESSAGE-BODY' },
    });
    const serialised = JSON.stringify(state.approvals[0]);
    expect(serialised).not.toContain('CONFIDENTIAL-MESSAGE-BODY');
  });

  it('caps the requested lifetime at 24 hours', async () => {
    const created = await createBoundApproval({
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
      expiresInMinutes: 999_999,
    });
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000 + 5_000);
  });

  it('fails loudly when the approval cannot be audited', async () => {
    state.auditFails = true;
    await expect(
      createBoundApproval({
        companyId: 'company-a',
        actionClass: EMAIL_CLASS,
        action: EMAIL_ACTION,
        resource: EMAIL_RESOURCE,
        payload: EMAIL_PAYLOAD,
      }),
    ).rejects.toThrow(/could not be audited/);
  });
});

describe('verifyBoundApproval', () => {
  it('accepts a matching approval from an organisation owner', async () => {
    await approvedEmailApproval();
    state.memberships['company-a:owner-1'] = { role: 'owner' };

    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
      allowedApproverRoles: ['organization_owner', 'project_manager'],
    });
    expect(result.verified).toBe(true);
    expect(result.reason).toMatch(/verified/i);
  });

  it('prefers the tenant role over a generic platform role', async () => {
    await approvedEmailApproval();
    state.users['owner-1'] = { role: 'user' };
    state.memberships['company-a:owner-1'] = { role: 'owner' };

    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
      allowedApproverRoles: ['organization_owner'],
    });
    expect(result.verified).toBe(true);
  });

  it('rejects a reviewer whose role may not approve this class', async () => {
    await approvedEmailApproval({ reviewerId: 'dev-1' });
    state.memberships['company-a:dev-1'] = { role: 'member' };

    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
      allowedApproverRoles: ['organization_owner', 'project_manager'],
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/role/i);
  });

  it('rejects a payload that changed after review', async () => {
    await approvedEmailApproval();
    state.memberships['company-a:owner-1'] = { role: 'owner' };

    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: { ...EMAIL_PAYLOAD, to: ['attacker@example.com'] },
      allowedApproverRoles: ['organization_owner'],
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/payload|arguments/i);
  });

  it('rejects an approval from another tenant', async () => {
    await approvedEmailApproval();
    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-b',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/not found|organisation/i);
  });

  it('rejects an expired approval', async () => {
    const row = await approvedEmailApproval();
    row.expiresAt = new Date(Date.now() - 1_000);
    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('rejects a pending approval', async () => {
    await createBoundApproval({
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
    });
    const result = await verifyBoundApproval({
      approvalId: 'apr-1',
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/pending/);
  });
});

describe('consumeApproval (single use, GAP-004)', () => {
  it('consumes an approved approval exactly once', async () => {
    await approvedEmailApproval();

    const first = await consumeApproval('apr-1', 'company-a', 'requester-1');
    expect(first.consumed).toBe(true);
    expect(isApprovalConsumed(state.approvals[0].requestJson)).toBe(true);
    expect(auditEvents.map((event) => event.action)).toContain('governance.approval.consumed');

    const second = await consumeApproval('apr-1', 'company-a', 'requester-1');
    expect(second.consumed).toBe(false);
    expect(second.reason).toMatch(/already been used/i);
  });

  it('refuses to consume a pending approval', async () => {
    await createBoundApproval({
      companyId: 'company-a',
      actionClass: EMAIL_CLASS,
      action: EMAIL_ACTION,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
    });
    const result = await consumeApproval('apr-1', 'company-a');
    expect(result.consumed).toBe(false);
    expect(result.reason).toMatch(/not approved|pending/);
  });

  it('refuses when another writer wins the compare-and-set', async () => {
    await approvedEmailApproval();
    state.updateCount = 0;
    const result = await consumeApproval('apr-1', 'company-a');
    expect(result.consumed).toBe(false);
    expect(result.reason).toMatch(/atomically|already used/i);
  });

  it('refuses to consume across tenants', async () => {
    await approvedEmailApproval();
    const result = await consumeApproval('apr-1', 'company-b');
    expect(result.consumed).toBe(false);
    expect(result.reason).toMatch(/not found|organisation/i);
  });
});

describe('HTTP governance gate', () => {
  const gate = (overrides: Partial<Parameters<typeof enforceHttpGovernance>[0]> = {}) =>
    enforceHttpGovernance({
      companyId: 'company-a',
      userId: 'requester-1',
      companyRole: 'member',
      action: EMAIL_ACTION,
      actionClass: EMAIL_CLASS,
      resource: EMAIL_RESOURCE,
      payload: EMAIL_PAYLOAD,
      approvalId: null,
      ...overrides,
    });

  it('blocks an unapproved external communication and creates a bound approval', async () => {
    const result = await gate();
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.response.status).toBe(403);
    const body = result.response.body as Record<string, unknown>;
    expect(body.code).toBe('GOVERNANCE_APPROVAL_REQUIRED');
    expect(typeof body.approvalId).toBe('string');
    expect(result.approvalId).toBe(body.approvalId);
    expect(state.approvals).toHaveLength(1);
    expect(state.approvals[0].companyId).toBe('company-a');
  });

  it('allows the action once with a verified approval, then refuses the replay', async () => {
    await approvedEmailApproval();
    state.memberships['company-a:owner-1'] = { role: 'owner' };

    const first = await gate({ approvalId: 'apr-1' });
    expect(first.allowed).toBe(true);
    expect(isApprovalConsumed(state.approvals[0].requestJson)).toBe(true);

    const replay = await gate({ approvalId: 'apr-1' });
    expect(replay.allowed).toBe(false);
    if (replay.allowed) return;
    expect(replay.response.status).toBe(409);
    expect((replay.response.body as Record<string, unknown>).code).toBe('APPROVAL_CONSUMPTION_FAILED');
  });

  it('refuses an approval bound to different content', async () => {
    await approvedEmailApproval();
    state.memberships['company-a:owner-1'] = { role: 'owner' };

    const result = await gate({
      approvalId: 'apr-1',
      payload: { ...EMAIL_PAYLOAD, to: ['someone-else@example.com'] },
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    const body = result.response.body as Record<string, unknown>;
    expect(body.code).toBe('GOVERNANCE_APPROVAL_REQUIRED');
    expect(String(body.error)).toMatch(/not valid/i);
    // A replay of the original approval is still possible for the original payload.
    expect(state.approvals[0].status).toBe('approved');
  });

  it('denies outright for a class the policy forbids, without offering an approval', async () => {
    const result = await gate({
      action: 'Execute downloaded script',
      actionClass: 'code.execute.untrusted',
      resource: 'sandbox:none',
      payload: { url: 'https://example.com/x.sh' },
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.response.status).toBe(403);
    const body = result.response.body as Record<string, unknown>;
    expect(body.code).toBe('GOVERNANCE_DENIED');
    expect(result.approvalId).toBeNull();
    expect(state.approvals).toHaveLength(0);
  });
});

describe('mapping helpers', () => {
  it('maps action classes to reviewer-visible approval types', () => {
    expect(approvalTypeForAction('content.publish')).toBe('public_publish');
    expect(approvalTypeForAction('deploy.production')).toBe('deployment');
    expect(approvalTypeForAction('data.delete')).toBe('file_delete');
    expect(approvalTypeForAction('financial.transact')).toBe('financial_final');
    expect(approvalTypeForAction('write.project')).toBe('tool_approval');
  });

  it('separates platform-level approvals from tenant-level ones', () => {
    expect(defaultApproversFor('deploy.production')).toEqual(['super_admin']);
    expect(defaultApproversFor('content.publish')).toContain('project_manager');
    expect(defaultApproversFor('data.delete')).toContain('organization_owner');
  });

  it('reads the approval id from header first, then body', () => {
    expect(extractApprovalId('  apr-9 ', 'apr-1')).toBe('apr-9');
    expect(extractApprovalId(null, 'apr-1')).toBe('apr-1');
    expect(extractApprovalId('', '')).toBeNull();
  });
});
