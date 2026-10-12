import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
const mockTokenBudgetFindUnique = vi.fn();
const mockTokenBudgetUpdate = vi.fn();
const mockTokenUsageCreate = vi.fn();
const mockAlertFindFirst = vi.fn();
const mockAlertUpdate = vi.fn();
const mockAlertCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    tokenBudget: {
      findUnique: (...args: unknown[]) => mockTokenBudgetFindUnique(...args),
      update: (...args: unknown[]) => mockTokenBudgetUpdate(...args),
    },
    tokenUsage: {
      create: (...args: unknown[]) => mockTokenUsageCreate(...args),
    },
    alert: {
      findFirst: (...args: unknown[]) => mockAlertFindFirst(...args),
      update: (...args: unknown[]) => mockAlertUpdate(...args),
      create: (...args: unknown[]) => mockAlertCreate(...args),
    },
  },
}));

import { checkTokenBudget, recordTokenUsage } from '@/lib/token-guard';

describe('token-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkTokenBudget', () => {
    it('should allow all when no budget is configured', async () => {
      mockTokenBudgetFindUnique.mockResolvedValue(null);
      const result = await checkTokenBudget('company-1', 100);
      expect(result.allowed).toBe(true);
      expect(result.monthlyUsed).toBe(0);
      expect(result.dailyUsed).toBe(0);
    });

    it('should allow when usage is well under budget', async () => {
      mockTokenBudgetFindUnique.mockResolvedValue({
        monthlyBudget: 1_000_000,
        dailyBudget: 100_000,
        monthlyUsed: 100_000,
        dailyUsed: 10_000,
        warningThreshold: 0.8,
        lastResetAt: new Date(),
      });

      const result = await checkTokenBudget('company-1', 1000);
      expect(result.allowed).toBe(true);
      expect(result.monthlyBudget).toBe(1_000_000);
      expect(result.dailyBudget).toBe(100_000);
    });

    it('should block when monthly budget would be exceeded', async () => {
      mockTokenBudgetFindUnique.mockResolvedValue({
        monthlyBudget: 1_000_000,
        dailyBudget: 100_000,
        monthlyUsed: 999_000,
        dailyUsed: 10_000,
        warningThreshold: 0.8,
        lastResetAt: new Date(),
      });

      const result = await checkTokenBudget('company-1', 2_000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Monthly token budget exceeded');
    });

    it('should block when daily budget would be exceeded', async () => {
      mockTokenBudgetFindUnique.mockResolvedValue({
        monthlyBudget: 10_000_000,
        dailyBudget: 100_000,
        monthlyUsed: 10_000,
        dailyUsed: 99_000,
        warningThreshold: 0.8,
        lastResetAt: new Date(),
      });

      const result = await checkTokenBudget('company-1', 2_000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily token budget exceeded');
    });

    it('should allow at exactly the budget limit', async () => {
      mockTokenBudgetFindUnique.mockResolvedValue({
        monthlyBudget: 1_000_000,
        dailyBudget: 200_000,
        monthlyUsed: 900_000,
        dailyUsed: 100_000,
        warningThreshold: 0.8,
        lastResetAt: new Date(),
      });

      const result = await checkTokenBudget('company-1', 100_000);
      expect(result.allowed).toBe(true);
    });

    it('should fire a warning alert when crossing warning threshold', async () => {
      mockTokenBudgetFindUnique.mockResolvedValue({
        monthlyBudget: 1_000_000,
        dailyBudget: 1_000_000,
        monthlyUsed: 750_000,
        dailyUsed: 750_000,
        warningThreshold: 0.8,
        lastResetAt: new Date(),
      });

      mockAlertFindFirst.mockResolvedValue(null);
      mockAlertCreate.mockResolvedValue({});

      const result = await checkTokenBudget('company-1', 100_000);
      expect(result.allowed).toBe(true);
      expect(mockAlertCreate).toHaveBeenCalled();
    });

    it('should reset daily counter when day has changed', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockTokenBudgetFindUnique.mockResolvedValue({
        monthlyBudget: 1_000_000,
        dailyBudget: 100_000,
        monthlyUsed: 500_000,
        dailyUsed: 99_000, // This should be reset
        warningThreshold: 0.8,
        lastResetAt: yesterday,
      });

      mockTokenBudgetUpdate.mockResolvedValue({});

      const result = await checkTokenBudget('company-1', 1000);
      expect(result.allowed).toBe(true);
      expect(mockTokenBudgetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dailyUsed: 0 }),
        })
      );
    });
  });

  describe('recordTokenUsage', () => {
    it('should increment budget counters and record usage', async () => {
      mockTokenBudgetUpdate.mockResolvedValue({});
      mockTokenUsageCreate.mockResolvedValue({});

      await recordTokenUsage('company-1', 500, {
        agentId: 'agent-1',
        taskId: 'task-1',
        model: 'deepseek-v3',
        promptTokens: 300,
        completionTokens: 200,
        costEstimate: 0.01,
      });

      expect(mockTokenBudgetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1' },
          data: expect.objectContaining({
            monthlyUsed: { increment: 500 },
            dailyUsed: { increment: 500 },
          }),
        })
      );

      expect(mockTokenUsageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            totalTokens: 500,
            promptTokens: 300,
            completionTokens: 200,
            model: 'deepseek-v3',
          }),
        })
      );
    });

    it('should silently ignore if budget record does not exist', async () => {
      mockTokenBudgetUpdate.mockRejectedValue(new Error('Not found'));
      mockTokenUsageCreate.mockResolvedValue({});

      // Should not throw
      await recordTokenUsage('nonexistent-company', 100);
      expect(mockTokenBudgetUpdate).toHaveBeenCalled();
    });

    it('should work without metadata', async () => {
      mockTokenBudgetUpdate.mockResolvedValue({});

      await recordTokenUsage('company-1', 100);
      expect(mockTokenUsageCreate).not.toHaveBeenCalled();
    });
  });
});