import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agentFindFirst: vi.fn(),
  memoryCount: vi.fn(),
  memoryCreate: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryUpdate: vi.fn(),
  protectiveFindUnique: vi.fn(),
  protectiveUpdate: vi.fn(),
  learningSessionCreate: vi.fn(),
  auditCreate: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    agent: { findFirst: mocks.agentFindFirst },
    agentMemory: {
      count: mocks.memoryCount,
      create: mocks.memoryCreate,
      findMany: mocks.memoryFindMany,
      findFirst: mocks.memoryFindFirst,
      update: mocks.memoryUpdate,
    },
    agentProtectiveMode: { findUnique: mocks.protectiveFindUnique, update: mocks.protectiveUpdate },
    agentLearningSession: { create: mocks.learningSessionCreate },
    auditEvent: { create: mocks.auditCreate },
    $transaction: mocks.runTransaction,
  },
}));

import { LearningEngine } from '@/lib/agent-learning/learning-engine';

function protectiveMode(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    maxKnowledgePerDay: 50,
    safetyLevel: 'standard',
    learningScope: 'task_domain',
    allowedDomains: '[]',
    blockedPatterns: '[]',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runTransaction.mockImplementation((callback: (transaction: unknown) => unknown) => callback({
    agent: { findFirst: mocks.agentFindFirst },
    agentMemory: {
      count: mocks.memoryCount,
      create: mocks.memoryCreate,
      findMany: mocks.memoryFindMany,
      findFirst: mocks.memoryFindFirst,
      update: mocks.memoryUpdate,
    },
    agentProtectiveMode: { findUnique: mocks.protectiveFindUnique, update: mocks.protectiveUpdate },
    agentLearningSession: { create: mocks.learningSessionCreate },
    auditEvent: { create: mocks.auditCreate },
  }));
  mocks.agentFindFirst.mockResolvedValue({ id: 'agent-1' });
  mocks.memoryCount.mockResolvedValue(0);
  mocks.memoryCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'memory-1', ...args.data }));
  mocks.memoryFindMany.mockResolvedValue([]);
  mocks.memoryFindFirst.mockResolvedValue(null);
  mocks.memoryUpdate.mockResolvedValue({});
  mocks.protectiveFindUnique.mockResolvedValue(protectiveMode());
  mocks.protectiveUpdate.mockResolvedValue({});
  mocks.learningSessionCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'session-1', ...args.data }));
});

describe('controlled agent learning', () => {
  it('stores learning as unverified candidates and does not advance evolution', async () => {
    const result = await new LearningEngine().learn({
      agentId: 'agent-1',
      actorUserId: 'user-1',
      companyId: 'company-a',
      triggerType: 'task_completion',
      taskInput: 'Describe the task pattern handled by the team.',
      taskOutput: 'A successful approach documents the reviewed operational workflow and the evidence used to complete it.',
      wasSuccess: true,
    });

    expect(result).toMatchObject({ status: 'pending_review', verified: false, maturityDelta: 0 });
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.candidateCount).toBe(mocks.memoryCreate.mock.calls.length);
    expect(mocks.memoryCreate).toHaveBeenCalled();
    for (const call of mocks.memoryCreate.mock.calls) {
      expect(call[0].data).not.toHaveProperty('isVerified', true);
      expect(call[0].data.companyId).toBe('company-a');
    }
    expect(mocks.learningSessionCreate.mock.calls[0][0].data.status).toBe('pending_review');
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: 'user-1', action: 'agent_learning.session.create', resourceId: 'session-1' }),
    }));
    expect(mocks.protectiveUpdate).not.toHaveBeenCalled();
  });

  it('filters failure diagnostics before they can be stored as candidate knowledge', async () => {
    const result = await new LearningEngine().learn({
      agentId: 'agent-1',
      actorUserId: 'user-1',
      companyId: 'company-a',
      triggerType: 'task_completion',
      wasSuccess: false,
      error: 'exploit attempt triggered a security rejection',
    });

    expect(result).toMatchObject({ status: 'no_candidate', verified: false, candidateCount: 0, blockedCount: 1 });
    expect(mocks.memoryCreate).not.toHaveBeenCalled();
    expect(mocks.protectiveUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ violationCount: { increment: 1 } }),
    }));
  });

  it('only returns human-verified knowledge to prompt-injection consumers', async () => {
    mocks.memoryFindMany.mockResolvedValue([{ content: 'approved fact', category: 'domain', confidence: 0.9 }]);

    const result = await new LearningEngine().getTopKnowledge('agent-1', 'company-a');

    expect(result).toHaveLength(1);
    expect(mocks.memoryFindMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company-a', isVerified: true });
  });

  it('does not reinforce an unverified learning candidate', async () => {
    mocks.memoryFindFirst.mockResolvedValue({ id: 'memory-1', companyId: 'company-a', isVerified: false });

    await expect(new LearningEngine().reinforceKnowledge('memory-1', 'company-a', true)).rejects.toThrow(/human-verified/);
    expect(mocks.memoryUpdate).not.toHaveBeenCalled();
  });
});
