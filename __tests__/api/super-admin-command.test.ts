// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/super-admin/command — the operational entry point of the Command
 * Center.
 *
 * The contract under test is the one that separates it from the advisory chat:
 * an accepted instruction is always written down (a `Command` row plus a durable
 * run, or a precise approval), and a gated or cross-tenant request is refused
 * *before* anything executes.
 */

const requireRoleMock = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}));

const rateLimitMock = vi.fn();
vi.mock('@/lib/security/rate-limiter', () => ({
  checkEndpointLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

const auditMock = vi.fn();
vi.mock('@/lib/audit-events', () => ({
  writeAuditEvent: (...args: unknown[]) => auditMock(...args),
}));

const createRunMock = vi.fn();
const listRunsMock = vi.fn();
vi.mock('@/lib/runs', () => ({
  createRun: (...args: unknown[]) => createRunMock(...args),
  listRuns: (...args: unknown[]) => listRunsMock(...args),
}));

const commandCreate = vi.fn();
const commandUpdate = vi.fn();
const approvalCreate = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    command: {
      create: (...args: unknown[]) => commandCreate(...args),
      update: (...args: unknown[]) => commandUpdate(...args),
    },
    approval: { create: (...args: unknown[]) => approvalCreate(...args) },
  },
}));

import { GET, POST } from '@/app/api/super-admin/command/route';

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/super-admin/command', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ALO_SYSTEM_OPERATORS;
  requireRoleMock.mockResolvedValue({ userId: 'user_root', role: 'super_admin', companyId: 'co_a', email: 'root@alo.test' });
  rateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000, limit: 20 });
  commandCreate.mockResolvedValue({ id: 'cmd_1' });
  commandUpdate.mockResolvedValue({ id: 'cmd_1' });
  approvalCreate.mockResolvedValue({ id: 'apr_1', type: 'deployment' });
  createRunMock.mockResolvedValue({ runId: 'run_1', status: 'queued' });
  listRunsMock.mockResolvedValue({ runs: [], total: 0 });
});

describe('POST /api/super-admin/command — authorisation', () => {
  it('returns 401 for an anonymous caller', async () => {
    requireRoleMock.mockRejectedValue(new Error('Unauthorized'));
    const response = await post({ instruction: 'Show me the running agents' });
    expect(response.status).toBe(401);
    expect(commandCreate).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-super-admin role', async () => {
    requireRoleMock.mockRejectedValue(new Error('Forbidden'));
    const response = await post({ instruction: 'Show me the running agents' });
    expect(response.status).toBe(403);
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the operator is over the instruction limit', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 5_000, limit: 20 });
    const response = await post({ instruction: 'Show me the running agents' });
    expect(response.status).toBe(429);
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const response = await post({ instruction: '' });
    expect(response.status).toBe(400);
    expect(commandCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/super-admin/command — dispatch', () => {
  it('persists a command and a durable run for a read-only instruction', async () => {
    const response = await post({ instruction: 'Show me which agents are running and what they are doing' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('dispatched');
    expect(body.runId).toBe('run_1');
    expect(body.streamUrl).toBe('/api/runs/run_1/events');
    expect(body.intent.id).toBe('inspect_agents');

    expect(commandCreate).toHaveBeenCalledTimes(1);
    expect(commandCreate.mock.calls[0][0].data).toMatchObject({
      parsedIntent: 'inspect_agents',
      userId: 'user_root',
    });
    expect(createRunMock).toHaveBeenCalledTimes(1);
    expect(createRunMock.mock.calls[0][0]).toMatchObject({
      objective: 'Show me which agents are running and what they are doing',
      companyId: 'co_a',
      commandId: 'cmd_1',
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'super_admin.command.dispatched', resourceId: 'run_1', companyId: 'co_a' }),
    );
  });

  it('stops a production instruction at an approval and starts no run', async () => {
    const response = await post({ instruction: 'Deploy the approved changes to production' });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.status).toBe('approval_required');
    expect(body.approvalId).toBe('apr_1');
    expect(body.reason).toMatch(/approval gate/i);

    expect(approvalCreate).toHaveBeenCalledTimes(1);
    const approval = approvalCreate.mock.calls[0][0].data;
    expect(approval.type).toBe('deployment');
    expect(approval.companyId).toBe('co_a');
    expect(approval.riskLevel).toBe('high');
    // The reviewer approves the work order, not a summary of it.
    const request = JSON.parse(approval.requestJson);
    expect(request.intent).toBe('deploy_to_production');
    expect(request.steps.length).toBeGreaterThan(0);
    expect(commandUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }),
    );
    expect(createRunMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'super_admin.command.approval_required', resourceId: 'apr_1' }),
    );
  });

  it('does not write anything for a preview request', async () => {
    const response = await post({ instruction: 'Review https://github.com/owner/repo for security issues', previewOnly: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preview).toBe(true);
    expect(body.plan.intent.id).toBe('inspect_repository');
    expect(body.capability.label).toBeTruthy();
    expect(commandCreate).not.toHaveBeenCalled();
    expect(createRunMock).not.toHaveBeenCalled();
    expect(approvalCreate).not.toHaveBeenCalled();
  });

  it('reports a queue failure instead of claiming a run started', async () => {
    createRunMock.mockRejectedValue(new Error('queue unavailable'));
    const response = await post({ instruction: 'Inspect host capacity and report headroom' });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/queue unavailable/i);
    expect(commandUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});

describe('POST /api/super-admin/command — tenant boundaries', () => {
  it('refuses another company without the system scope', async () => {
    const response = await post({ instruction: 'Inspect host capacity', companyId: 'co_b', reason: 'auditing the other tenant' });
    expect(response.status).toBe(403);
    expect(commandCreate).not.toHaveBeenCalled();
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it('refuses another company without a reason even when the scope is held', async () => {
    process.env.ALO_SYSTEM_OPERATORS = 'user_root';
    const response = await post({ instruction: 'Inspect host capacity', companyId: 'co_b' });
    expect(response.status).toBe(400);
    expect(commandCreate).not.toHaveBeenCalled();
  });

  it('allows a scoped operator to dispatch for another company', async () => {
    process.env.ALO_SYSTEM_OPERATORS = 'root@alo.test';
    const response = await post({
      instruction: 'Inspect host capacity',
      companyId: 'co_b',
      reason: 'requested by the other tenant owner',
    });
    expect(response.status).toBe(200);
    expect(createRunMock.mock.calls[0][0].companyId).toBe('co_b');
  });

  it('refuses when no company can be resolved', async () => {
    requireRoleMock.mockResolvedValue({ userId: 'user_x', role: 'super_admin', companyId: '', email: 'x@alo.test' });
    const response = await post({ instruction: 'Inspect host capacity' });
    expect(response.status).toBe(400);
    expect(createRunMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/super-admin/command', () => {
  it('lists only the caller company’s runs', async () => {
    listRunsMock.mockResolvedValue({
      runs: [{ id: 'run_9', objective: 'Inspect capacity', status: 'completed', createdAt: new Date('2026-11-27T10:00:00Z') }],
      total: 1,
    });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listRunsMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'co_a' }));
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].runId).toBe('run_9');
    expect(body.intents.map((intent: { id: string }) => intent.id)).toContain('inspect_repository');
  });

  it('returns an empty list, not another tenant’s data, when the operator has no company', async () => {
    requireRoleMock.mockResolvedValue({ userId: 'user_x', role: 'super_admin', companyId: '', email: 'x@alo.test' });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.runs).toEqual([]);
    expect(listRunsMock).not.toHaveBeenCalled();
  });
});
