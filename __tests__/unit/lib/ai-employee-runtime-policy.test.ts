// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from '../../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));
vi.mock('@/lib/ai-router', () => ({
  ensureRouterSynced: vi.fn(async () => ({ getProviderSummaries: () => [], getProvider: () => null })),
}));

import { CompanyAIError, executeCompanyAIChat } from '@/lib/multi-tenant-ai/service';

const actor = { companyId: 'company-1', userId: 'user-1', role: 'admin' };
const request = { model: '', messages: [{ role: 'user' as const, content: 'run a small test' }], maxTokens: 8 };
const options = { profile: 'free_general' as const, agentId: 'agent-db-1' };

function seedCompanyAndAgent(status: string, dailyTokenBudget = 1000) {
  fakeDb.db.company.create({ data: { id: 'company-1', slug: 'company-1', name: 'Test Company', status: 'active', paidApiAllowed: false } });
  fakeDb.db.agent.create({ data: { id: 'agent-db-1', agentId: 'AGENT-0001', name: 'Test agent', status: 'active', companyId: 'company-1', departmentId: 'department-1' } });
  fakeDb.db.aIEmployeeIdentity.create({ data: {
    id: 'identity-1', companyId: 'company-1', departmentId: 'department-1', agentDbId: 'agent-db-1', status,
    resourceLimits: JSON.stringify({ maxConcurrentTasks: 2, maxTokensPerTask: 1000, dailyTokenBudget, timeoutSeconds: 180 }),
  } });
}

beforeEach(() => fakeDb.reset());

describe('AI employee runtime policy', () => {
  it('blocks suspended and retired identities before model routing', async () => {
    seedCompanyAndAgent('suspended');
    await expect(executeCompanyAIChat(actor, request, options)).rejects.toMatchObject<Partial<CompanyAIError>>({
      status: 403,
      code: 'AI_EMPLOYEE_INACTIVE',
    });
  });

  it('rejects a mismatched identity-to-agent department assignment', async () => {
    seedCompanyAndAgent('active');
    await fakeDb.db.aIEmployeeIdentity.update({ where: { id: 'identity-1' }, data: { departmentId: 'department-other' } });
    await expect(executeCompanyAIChat(actor, request, options)).rejects.toMatchObject({
      status: 403,
      code: 'AI_EMPLOYEE_ASSIGNMENT_MISMATCH',
    });
  });

  it('enforces the identity daily token budget before any provider call', async () => {
    seedCompanyAndAgent('active', 1);
    try {
      await executeCompanyAIChat(actor, request, options);
      throw new Error('expected token budget to block the call');
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyAIError);
      expect(error).toMatchObject({ status: 429, code: 'AI_EMPLOYEE_DAILY_BUDGET_EXHAUSTED' });
    }
    expect(fakeDb.rows('modelUsageRecord')).toHaveLength(1);
    expect(fakeDb.rows('modelUsageRecord')[0].status).toBe('blocked');
  });

  it('propagates an already-aborted task signal before creating a provider attempt', async () => {
    seedCompanyAndAgent('active');
    const controller = new AbortController();
    const reason = new Error('Agent task exceeded its 1000 ms timeout.');
    controller.abort(reason);
    await expect(executeCompanyAIChat(actor, { ...request, signal: controller.signal }, options)).rejects.toBe(reason);
    expect(fakeDb.rows('modelUsageRecord')).toHaveLength(0);
  });
});
