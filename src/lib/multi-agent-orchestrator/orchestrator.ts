/**
 * Multi-Agent Orchestrator
 * Executes multi-step tasks using the existing AgentExecutionEngine.
 * Supports sequential, parallel, conditional, delegation, aggregation, voting, consensus, review.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { executeAgentPipeline } from '@/lib/ai-workforce/execution-engine';
import { db } from '@/lib/db';
import { getEventBus } from '@/lib/event-bus';
import type {
  OrchestrationTask,
  OrchestrationStep,
  OrchestrationResult,
  ParallelExecutionConfig,
} from './types';
import {
  CONCURRENCY_LIMITS,
  ORCHESTRATION_PRIORITY_MAP,
  DEFAULT_PARALLEL_CONFIG,
} from './types';
import type { TaskPriority } from '@/lib/agent-runtime/types';

const OrchestrationTypeSchema = z.enum([
  'sequential', 'parallel', 'conditional', 'delegation', 'aggregation', 'voting', 'consensus', 'review',
]);
const OrchestrationStatusSchema = z.enum([
  'pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled',
]);
const OrchestrationStepStatusSchema = z.enum([
  'pending', 'running', 'waiting_approval', 'completed', 'failed', 'skipped',
]);
const PrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
const AggregationStrategySchema = z.enum(['first', 'last', 'voting', 'consensus', 'all', 'concatenate']);

const StoredStepSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  task: z.string(),
  dependsOn: z.array(z.string()).optional(),
  condition: z.string().optional(),
  timeoutMs: z.number().optional(),
  maxTokens: z.number().optional(),
  tools: z.array(z.string()).optional(),
  retryCount: z.number().optional(),
  status: OrchestrationStepStatusSchema.optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
  tokensUsed: z.number().optional(),
  model: z.string().optional(),
  executionId: z.string().optional(),
  approvalId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

const StoredResultSchema = z.object({
  finalOutput: z.string(),
  steps: z.array(StoredStepSchema),
  totalLatencyMs: z.number(),
  totalTokens: z.number(),
  costUsd: z.number().nullable(),
  agentIds: z.array(z.string()),
  modelUsed: z.array(z.string()),
});

const StoredTaskSchema = z.object({
  id: z.string(),
  type: OrchestrationTypeSchema,
  steps: z.array(StoredStepSchema),
  input: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  companyId: z.string(),
  userId: z.string(),
  departmentId: z.string().optional(),
  priority: PrioritySchema.optional(),
  status: OrchestrationStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  result: StoredResultSchema.optional(),
  error: z.string().optional(),
  parallelConfig: z.object({
    maxConcurrency: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    failFast: z.boolean().optional(),
    aggregationStrategy: AggregationStrategySchema.optional(),
  }).optional(),
});

type StoredStep = z.infer<typeof StoredStepSchema>;

function restoreStep(step: StoredStep): OrchestrationStep {
  const { startedAt, completedAt, ...rest } = step;
  return {
    ...rest,
    ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
    ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
  };
}

function restoreTask(value: string): OrchestrationTask | null {
  try {
    const parsedJson: unknown = JSON.parse(value);
    const parsed = StoredTaskSchema.safeParse(parsedJson);
    if (!parsed.success) return null;
    const { result: storedResult, ...taskData } = parsed.data;
    const result: OrchestrationResult | undefined = storedResult
      ? {
          ...storedResult,
          steps: storedResult.steps.map(restoreStep),
        }
      : undefined;
    return {
      ...taskData,
      steps: taskData.steps.map(restoreStep),
      createdAt: new Date(taskData.createdAt),
      updatedAt: new Date(taskData.updatedAt),
      ...(result ? { result } : {}),
    };
  } catch {
    return null;
  }
}

function numericMetadata(metadata: Record<string, unknown> | undefined, key: string): number {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class OrchestrationApprovalRequiredError extends Error {
  constructor(
    readonly executionId: string,
    readonly approvalId: string,
  ) {
    super(`Execution ${executionId} is paused for approval ${approvalId}`);
    this.name = 'OrchestrationApprovalRequiredError';
  }
}

// ─── Concurrency tracking ──────────────────────────────────────────

class ConcurrencyTracker {
  private globalActive = 0;
  private deptActive = new Map<string, number>();
  private agentActive = new Map<string, number>();
  private userActive = new Map<string, number>();
  private waiters: Array<() => void> = [];

  async acquire(params: {
    companyId: string;
    departmentId?: string;
    agentId: string;
    userId: string;
  }): Promise<void> {
    const departmentKey = params.departmentId ? `${params.companyId}:${params.departmentId}` : undefined;
    const agentKey = `${params.companyId}:${params.agentId}`;
    const userKey = `${params.companyId}:${params.userId}`;

    while (true) {
      if (this.globalActive >= CONCURRENCY_LIMITS.global) {
        await this.wait();
        continue;
      }
      if (departmentKey && (this.deptActive.get(departmentKey) ?? 0) >= CONCURRENCY_LIMITS.department) {
        await this.wait();
        continue;
      }
      if ((this.agentActive.get(agentKey) ?? 0) >= CONCURRENCY_LIMITS.agent) {
        await this.wait();
        continue;
      }
      if ((this.userActive.get(userKey) ?? 0) >= CONCURRENCY_LIMITS.user) {
        await this.wait();
        continue;
      }
      break;
    }

    this.globalActive++;
    if (departmentKey) {
      this.deptActive.set(departmentKey, (this.deptActive.get(departmentKey) ?? 0) + 1);
    }
    this.agentActive.set(agentKey, (this.agentActive.get(agentKey) ?? 0) + 1);
    this.userActive.set(userKey, (this.userActive.get(userKey) ?? 0) + 1);
  }

  release(params: {
    companyId: string;
    departmentId?: string;
    agentId: string;
    userId: string;
  }): void {
    this.globalActive = Math.max(0, this.globalActive - 1);
    if (params.departmentId) {
      const key = `${params.companyId}:${params.departmentId}`;
      const current = this.deptActive.get(key) ?? 0;
      this.deptActive.set(key, Math.max(0, current - 1));
    }
    const agentKey = `${params.companyId}:${params.agentId}`;
    const agentCurrent = this.agentActive.get(agentKey) ?? 0;
    this.agentActive.set(agentKey, Math.max(0, agentCurrent - 1));
    const userKey = `${params.companyId}:${params.userId}`;
    const userCurrent = this.userActive.get(userKey) ?? 0;
    this.userActive.set(userKey, Math.max(0, userCurrent - 1));

    // Wake up one waiter
    const waiter = this.waiters.shift();
    if (waiter) waiter();
  }

  getStatus() {
    return {
      global: { active: this.globalActive, limit: CONCURRENCY_LIMITS.global },
      departments: Object.fromEntries(this.deptActive),
      agents: Object.fromEntries(this.agentActive),
      users: Object.fromEntries(this.userActive),
    };
  }

  private wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

// ─── Orchestrator ──────────────────────────────────────────────────

export class MultiAgentOrchestrator {
  private concurrency = new ConcurrencyTracker();
  private eventBus = getEventBus();

  // ─── Public API ────────────────────────────────────────────────

  async executeTask(params: {
    type: OrchestrationTask['type'];
    steps: OrchestrationStep[];
    input: string;
    companyId: string;
    userId: string;
    departmentId?: string;
    priority?: OrchestrationTask['priority'];
    context?: Record<string, unknown>;
    parallelConfig?: Partial<ParallelExecutionConfig>;
  }): Promise<OrchestrationTask> {
    const membership = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
      select: { id: true },
    });
    if (!membership) throw new Error('Forbidden');

    const taskId = randomUUID();
    const now = new Date();
    const task: OrchestrationTask = {
      id: taskId,
      type: params.type,
      steps: params.steps.map((step) => ({ ...step, status: 'pending' })),
      input: params.input,
      context: params.context,
      companyId: params.companyId,
      userId: params.userId,
      departmentId: params.departmentId,
      priority: params.priority ?? 'P3',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      parallelConfig: params.parallelConfig,
    };

    const validationError = this.validateTask(task);
    if (validationError) throw new Error(validationError);

    const requestedAgentIds = [...new Set(task.steps.map((step) => step.agentId))];
    const authorizedAgents = await db.agent.findMany({
      where: {
        agentId: { in: requestedAgentIds },
        status: 'active',
        agentCompanyAccess: { some: { companyId: task.companyId } },
      },
      select: { id: true, agentId: true },
    });
    if (authorizedAgents.length !== requestedAgentIds.length) {
      throw new Error('One or more agents are not available to this company');
    }

    const rootAgent = authorizedAgents.find((agent) => agent.agentId === task.steps[0].agentId);
    if (!rootAgent) throw new Error('The primary orchestration agent is not available to this company');

    await db.agentRun.create({
      data: {
        id: task.id,
        agentId: rootAgent.id,
        agentName: 'Multi-agent orchestration',
        status: task.status,
        input: JSON.stringify({
          type: task.type,
          input: task.input,
          context: task.context ?? {},
          steps: task.steps,
          departmentId: task.departmentId ?? null,
          priority: task.priority ?? null,
          parallelConfig: task.parallelConfig ?? null,
        }),
        output: JSON.stringify(task),
        companyId: task.companyId,
        userId: task.userId,
        priority: this.mapPriority(task.priority),
        requestId: task.id,
        step: 'orchestration',
        stepNumber: 0,
        executionPlan: JSON.stringify({ type: task.type, parallelConfig: task.parallelConfig ?? null }),
      },
    });

    await this.emitEvent(task, 'orchestration.started', {
      taskId,
      type: task.type,
      stepCount: task.steps.length,
    });

    void this.runOrchestration(task, task.parallelConfig).catch(async (error: unknown) => {
      console.error(`[Orchestrator] Task ${taskId} failed:`, error);
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date();
      await this.persistTask(task).catch((persistError: unknown) => {
        console.error(`[Orchestrator] Failed to persist task ${taskId}:`, persistError);
      });
    });

    return task;
  }

  async getTaskStatus(taskId: string, companyId: string): Promise<OrchestrationTask | null> {
    const record = await db.agentRun.findFirst({
      where: { id: taskId, companyId, step: 'orchestration' },
      select: { output: true, status: true, errorMessage: true },
    });
    if (!record?.output) return null;

    const task = restoreTask(record.output);
    const status = OrchestrationStatusSchema.safeParse(record.status);
    if (!task || task.companyId !== companyId || !status.success) return null;
    task.status = status.data;
    task.error = record.errorMessage ?? task.error;

    if (task.status === 'waiting_approval') {
      let changed = false;
      for (const step of task.steps) {
        if (step.status !== 'waiting_approval' || !step.executionId) continue;
        const execution = await db.agentExecution.findFirst({
          where: { id: step.executionId, companyId, userId: task.userId },
          select: {
            status: true,
            executionOutput: true,
            errorMessage: true,
            durationMs: true,
            completedAt: true,
            agentRunId: true,
          },
        });
        if (!execution) {
          step.status = 'failed';
          step.error = 'Persisted approval execution was not found for this company';
          task.status = 'failed';
          task.error = step.error;
          changed = true;
          continue;
        }
        if (execution.status === 'completed' && execution.executionOutput !== null) {
          step.status = 'completed';
          step.result = execution.executionOutput;
          step.approvalId = undefined;
          step.error = undefined;
          step.completedAt = execution.completedAt ?? new Date();
          step.latencyMs = execution.durationMs ?? undefined;
          if (execution.agentRunId) {
            const run = await db.agentRun.findFirst({
              where: { id: execution.agentRunId, companyId },
              select: { model: true, tokensUsed: true },
            });
            if (run) {
              step.tokensUsed = run.tokensUsed;
              step.model = run.model ?? undefined;
            }
          }
          changed = true;
        } else if (execution.status === 'failed') {
          step.status = 'failed';
          step.error = execution.errorMessage ?? 'Approved execution failed';
          task.status = 'failed';
          task.error = step.error;
          changed = true;
        }
      }

      if (changed) {
        if (task.steps.some((step) => step.status === 'failed')) {
          task.status = 'failed';
          task.error = task.steps.find((step) => step.status === 'failed')?.error ?? 'Orchestration step failed';
        } else if (!task.steps.some((step) => step.status === 'waiting_approval')) {
          task.status = 'pending';
          task.error = undefined;
        }
        task.updatedAt = new Date();
        const claimed = await this.persistTask(task, 'waiting_approval');
        if (claimed && task.status === 'pending') {
          void this.runOrchestration(task, task.parallelConfig).catch(async (error: unknown) => {
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : String(error);
            task.updatedAt = new Date();
            await this.persistTask(task).catch(() => {});
          });
        }
      }
    }

    return task;
  }

  private async persistTask(
    task: OrchestrationTask,
    expectedStatus?: OrchestrationTask['status'],
  ): Promise<boolean> {
    const terminal = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
    const persisted = await db.agentRun.updateMany({
      where: {
        id: task.id,
        companyId: task.companyId,
        step: 'orchestration',
        ...(expectedStatus ? { status: expectedStatus } : {}),
      },
      data: {
        status: task.status,
        output: JSON.stringify(task),
        error: task.error ?? null,
        errorMessage: task.error ?? null,
        completedAt: terminal ? new Date() : null,
        ...(task.result ? { durationMs: task.result.totalLatencyMs } : {}),
      },
    });
    if (persisted.count !== 1 && !expectedStatus) {
      throw new Error('Persisted orchestration task was not found for this company');
    }
    return persisted.count === 1;
  }

  getConcurrencyStatus() {
    return this.concurrency.getStatus();
  }

  // ─── Internal: Main Execution ─────────────────────────────────

  private async runOrchestration(
    task: OrchestrationTask,
    parallelConfig?: Partial<ParallelExecutionConfig>,
  ): Promise<void> {
    const startTime = Date.now();
    const effectiveParallelConfig = parallelConfig ?? task.parallelConfig;
    task.status = 'running';
    task.updatedAt = new Date();

    try {
      await this.persistTask(task);
      let result: OrchestrationResult;

      switch (task.type) {
        case 'sequential':
          result = await this.executeSequential(task);
          break;
        case 'parallel':
          result = await this.executeParallel(task, effectiveParallelConfig);
          break;
        case 'conditional':
          result = await this.executeConditional(task);
          break;
        case 'delegation':
          result = await this.executeDelegation(task);
          break;
        case 'aggregation':
          result = await this.executeAggregation(task, effectiveParallelConfig);
          break;
        case 'voting':
          result = await this.executeVoting(task, effectiveParallelConfig);
          break;
        case 'consensus':
          result = await this.executeConsensus(task, effectiveParallelConfig);
          break;
        case 'review':
          result = await this.executeReview(task);
          break;
        default:
          throw new Error(`Unknown orchestration type: ${task.type}`);
      }

      result.totalLatencyMs = Date.now() - startTime;
      task.result = result;
      task.status = 'completed';
      task.updatedAt = new Date();
      await this.persistTask(task);

      await this.emitEvent(task, 'orchestration.completed', {
        taskId: task.id,
        totalLatencyMs: result.totalLatencyMs,
        totalTokens: result.totalTokens,
        costUsd: result.costUsd,
      });
    } catch (error: unknown) {
      const awaitingApproval = task.steps.some((step) => step.status === 'waiting_approval');
      task.status = awaitingApproval ? 'waiting_approval' : 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date();
      await this.persistTask(task);

      await this.emitEvent(task, awaitingApproval ? 'orchestration.waiting_approval' : 'orchestration.failed', {
        taskId: task.id,
        error: task.error,
      });
    }
  }

  // ─── Sequential Execution ──────────────────────────────────────

  private async executeSequential(task: OrchestrationTask): Promise<OrchestrationResult> {
    let chainInput = task.input;
    let totalTokens = 0;
    const modelUsed: string[] = [];

    for (const step of task.steps) {
      if (step.status === 'completed') {
        chainInput = step.result ?? chainInput;
        totalTokens += step.tokensUsed ?? 0;
        if (step.model) modelUsed.push(step.model);
        continue;
      }

      step.status = 'running';
      step.startedAt = new Date();
      await this.persistTask(task);

      try {
        const stepInput = this.buildStepInput(step, chainInput, task);
        const execResult = await this.executeStep(step, task, stepInput);

        step.result = execResult.content;
        step.status = 'completed';
        step.completedAt = new Date();
        step.latencyMs = step.completedAt.getTime() - step.startedAt.getTime();
        step.tokensUsed = numericMetadata(execResult.metadata, 'tokensUsed');
        step.model = stringMetadata(execResult.metadata, 'model');
        step.error = undefined;

        chainInput = execResult.content;
        totalTokens += step.tokensUsed;
        if (step.model) modelUsed.push(step.model);
        task.updatedAt = new Date();
        await this.persistTask(task);
      } catch (error: unknown) {
        if (error instanceof OrchestrationApprovalRequiredError) {
          step.status = 'waiting_approval';
          step.error = error.message;
          task.status = 'waiting_approval';
          task.error = error.message;
          task.updatedAt = new Date();
          await this.persistTask(task);
          throw error;
        }

        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        step.completedAt = new Date();
        task.updatedAt = new Date();
        await this.persistTask(task);

        const maxRetries = step.retryCount ?? 2;
        let retryAttempt = 0;
        let retrySuccess = false;
        while (retryAttempt < maxRetries && !retrySuccess) {
          retryAttempt++;
          try {
            step.status = 'running';
            step.error = undefined;
            await this.persistTask(task);
            const retryInput = this.buildStepInput(step, chainInput, task);
            const retryResult = await this.executeStepWithFallback(step, task, retryInput, retryAttempt);
            step.result = retryResult.content;
            step.status = 'completed';
            step.completedAt = new Date();
            step.latencyMs = step.completedAt.getTime() - (step.startedAt?.getTime() ?? step.completedAt.getTime());
            step.tokensUsed = numericMetadata(retryResult.metadata, 'tokensUsed');
            step.model = stringMetadata(retryResult.metadata, 'model');
            chainInput = retryResult.content;
            totalTokens += step.tokensUsed;
            if (step.model) modelUsed.push(step.model);
            retrySuccess = true;
            task.updatedAt = new Date();
            await this.persistTask(task);
          } catch (retryError: unknown) {
            if (retryError instanceof OrchestrationApprovalRequiredError) {
              step.status = 'waiting_approval';
              step.error = retryError.message;
              task.status = 'waiting_approval';
              task.error = retryError.message;
              task.updatedAt = new Date();
              await this.persistTask(task);
              throw retryError;
            }
            step.error = retryError instanceof Error ? retryError.message : String(retryError);
            task.updatedAt = new Date();
            await this.persistTask(task);
          }
        }

        if (!retrySuccess) {
          throw new Error(`Step ${step.id} failed after ${maxRetries} retries: ${step.error}`);
        }
      }
    }

    return {
      finalOutput: chainInput,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Parallel Execution ────────────────────────────────────────

  private async executeParallel(
    task: OrchestrationTask,
    config?: Partial<ParallelExecutionConfig>,
  ): Promise<OrchestrationResult> {
    const cfg = { ...DEFAULT_PARALLEL_CONFIG, ...config };
    const results = await this.executeWithConcurrency(task, cfg);

    const aggregated = this.aggregateResults(
      results.map((r) => r.content),
      cfg.aggregationStrategy,
    );

    const totalTokens = results.reduce((sum, result) => sum + numericMetadata(result.metadata, 'tokensUsed'), 0);
    const modelUsed = results
      .map((result) => stringMetadata(result.metadata, 'model'))
      .filter((model): model is string => model !== undefined);

    return {
      finalOutput: aggregated,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Conditional Execution ─────────────────────────────────────

  private async executeConditional(task: OrchestrationTask): Promise<OrchestrationResult> {
    let chainInput = task.input;
    let totalTokens = 0;
    const modelUsed: string[] = [];

    for (const step of task.steps) {
      if (step.status === 'completed') {
        chainInput = step.result ?? chainInput;
        totalTokens += step.tokensUsed ?? 0;
        if (step.model) modelUsed.push(step.model);
        continue;
      }

      if (step.condition && !this.evaluateCondition(step.condition, chainInput, task.context)) {
        step.status = 'skipped';
        task.updatedAt = new Date();
        await this.persistTask(task);
        continue;
      }

      if (step.dependsOn?.length) {
        const allDepsCompleted = step.dependsOn.every((depId) =>
          task.steps.find((candidate) => candidate.id === depId)?.status === 'completed',
        );
        if (!allDepsCompleted) {
          step.status = 'skipped';
          task.updatedAt = new Date();
          await this.persistTask(task);
          continue;
        }
      }

      step.status = 'running';
      step.startedAt = new Date();
      task.updatedAt = new Date();
      await this.persistTask(task);

      try {
        const stepInput = this.buildStepInput(step, chainInput, task);
        const execResult = await this.executeStep(step, task, stepInput);

        step.result = execResult.content;
        step.status = 'completed';
        step.completedAt = new Date();
        step.latencyMs = step.completedAt.getTime() - step.startedAt.getTime();
        step.tokensUsed = numericMetadata(execResult.metadata, 'tokensUsed');
        step.model = stringMetadata(execResult.metadata, 'model');
        step.error = undefined;

        chainInput = execResult.content;
        totalTokens += step.tokensUsed;
        if (step.model) modelUsed.push(step.model);
        task.updatedAt = new Date();
        await this.persistTask(task);
      } catch (error: unknown) {
        if (error instanceof OrchestrationApprovalRequiredError) {
          step.status = 'waiting_approval';
          step.error = error.message;
          task.status = 'waiting_approval';
          task.error = error.message;
          task.updatedAt = new Date();
          await this.persistTask(task);
          throw error;
        }

        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        step.completedAt = new Date();
        task.updatedAt = new Date();
        await this.persistTask(task);

        const maxRetries = step.retryCount ?? 1;
        let retryAttempt = 0;
        let retrySuccess = false;
        while (retryAttempt < maxRetries && !retrySuccess) {
          retryAttempt++;
          try {
            step.status = 'running';
            step.error = undefined;
            await this.persistTask(task);
            const retryInput = this.buildStepInput(step, chainInput, task);
            const retryResult = await this.executeStepWithFallback(step, task, retryInput, retryAttempt);
            step.result = retryResult.content;
            step.status = 'completed';
            step.completedAt = new Date();
            step.latencyMs = step.completedAt.getTime() - (step.startedAt?.getTime() ?? step.completedAt.getTime());
            step.tokensUsed = numericMetadata(retryResult.metadata, 'tokensUsed');
            step.model = stringMetadata(retryResult.metadata, 'model');
            chainInput = retryResult.content;
            totalTokens += step.tokensUsed;
            if (step.model) modelUsed.push(step.model);
            retrySuccess = true;
            task.updatedAt = new Date();
            await this.persistTask(task);
          } catch (retryError: unknown) {
            if (retryError instanceof OrchestrationApprovalRequiredError) {
              step.status = 'waiting_approval';
              step.error = retryError.message;
              task.status = 'waiting_approval';
              task.error = retryError.message;
              task.updatedAt = new Date();
              await this.persistTask(task);
              throw retryError;
            }
            step.error = retryError instanceof Error ? retryError.message : String(retryError);
            task.updatedAt = new Date();
            await this.persistTask(task);
          }
        }

        if (!retrySuccess) break;
      }
    }

    return {
      finalOutput: chainInput,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.filter((step) => step.status === 'completed').map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Delegation Execution ──────────────────────────────────────

  private async executeDelegation(task: OrchestrationTask): Promise<OrchestrationResult> {
    const targetAgentId = await this.findBestAgent(task);
    const step = task.steps[0];
    if (!step) throw new Error('Delegation requires at least one persisted step');
    if (step.status === 'completed' && step.result !== undefined) {
      return {
        finalOutput: step.result,
        steps: [...task.steps],
        totalLatencyMs: step.latencyMs ?? 0,
        totalTokens: step.tokensUsed ?? 0,
        costUsd: null,
        agentIds: [step.agentId],
        modelUsed: step.model ? [step.model] : [],
      };
    }

    step.agentId = targetAgentId;
    step.status = 'running';
    step.startedAt = new Date();
    await this.persistTask(task);

    const execResult = await this.executeStep(step, task, task.input);
    step.result = execResult.content;
    step.status = 'completed';
    step.completedAt = new Date();
    step.latencyMs = step.completedAt.getTime() - step.startedAt.getTime();
    step.tokensUsed = numericMetadata(execResult.metadata, 'tokensUsed');
    step.model = stringMetadata(execResult.metadata, 'model');
    task.updatedAt = new Date();
    await this.persistTask(task);

    return {
      finalOutput: execResult.content,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens: step.tokensUsed ?? 0,
      costUsd: null,
      agentIds: [targetAgentId],
      modelUsed: step.model ? [step.model] : [],
    };
  }

  // ─── Aggregation Execution ─────────────────────────────────────

  private async executeAggregation(
    task: OrchestrationTask,
    config?: Partial<ParallelExecutionConfig>,
  ): Promise<OrchestrationResult> {
    const cfg: ParallelExecutionConfig = { ...DEFAULT_PARALLEL_CONFIG, aggregationStrategy: 'concatenate', ...config };
    const results = await this.executeWithConcurrency(task, cfg);

    const aggregated = this.aggregateResults(
      results.map((r) => r.content),
      cfg.aggregationStrategy,
    );

    const totalTokens = results.reduce((sum, result) => sum + numericMetadata(result.metadata, 'tokensUsed'), 0);
    const modelUsed = results
      .map((result) => stringMetadata(result.metadata, 'model'))
      .filter((model): model is string => model !== undefined);

    return {
      finalOutput: aggregated,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Voting Execution ──────────────────────────────────────────

  private async executeVoting(
    task: OrchestrationTask,
    config?: Partial<ParallelExecutionConfig>,
  ): Promise<OrchestrationResult> {
    const cfg: ParallelExecutionConfig = { ...DEFAULT_PARALLEL_CONFIG, aggregationStrategy: 'voting', ...config };
    const results = await this.executeWithConcurrency(task, cfg);

    const majorityAnswer = this.selectByVoting(results.map((r) => r.content));

    const totalTokens = results.reduce((sum, result) => sum + numericMetadata(result.metadata, 'tokensUsed'), 0);
    const modelUsed = results
      .map((result) => stringMetadata(result.metadata, 'model'))
      .filter((model): model is string => model !== undefined);

    return {
      finalOutput: majorityAnswer,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Consensus Execution ───────────────────────────────────────

  private async executeConsensus(
    task: OrchestrationTask,
    config?: Partial<ParallelExecutionConfig>,
  ): Promise<OrchestrationResult> {
    const cfg: ParallelExecutionConfig = { ...DEFAULT_PARALLEL_CONFIG, aggregationStrategy: 'consensus', ...config };
    const results = await this.executeWithConcurrency(task, cfg);

    const consensusResult = this.buildConsensus(results.map((r) => r.content));

    const totalTokens = results.reduce((sum, result) => sum + numericMetadata(result.metadata, 'tokensUsed'), 0);
    const modelUsed = results
      .map((result) => stringMetadata(result.metadata, 'model'))
      .filter((model): model is string => model !== undefined);

    return {
      finalOutput: consensusResult,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Review Execution ──────────────────────────────────────────

  private async executeReview(task: OrchestrationTask): Promise<OrchestrationResult> {
    if (task.steps.length < 2) {
      throw new Error('Review orchestration requires at least 2 steps (producer + reviewer)');
    }

    const producer = task.steps[0];
    const reviewers = task.steps.slice(1);
    let producerResult: { content: string; metadata?: Record<string, unknown> };

    if (producer.status === 'completed' && producer.result !== undefined) {
      producerResult = {
        content: producer.result,
        metadata: {
          tokensUsed: producer.tokensUsed ?? 0,
          ...(producer.model ? { model: producer.model } : {}),
        },
      };
    } else {
      producer.status = 'running';
      producer.startedAt = new Date();
      await this.persistTask(task);
      try {
        producerResult = await this.executeStep(producer, task, task.input);
      } catch (error: unknown) {
        if (error instanceof OrchestrationApprovalRequiredError) {
          producer.status = 'waiting_approval';
          producer.error = error.message;
          task.status = 'waiting_approval';
          task.error = error.message;
          task.updatedAt = new Date();
          await this.persistTask(task);
        }
        throw error;
      }
      producer.result = producerResult.content;
      producer.status = 'completed';
      producer.completedAt = new Date();
      producer.latencyMs = producer.completedAt.getTime() - producer.startedAt.getTime();
      producer.tokensUsed = numericMetadata(producerResult.metadata, 'tokensUsed');
      producer.model = stringMetadata(producerResult.metadata, 'model');
      task.updatedAt = new Date();
      await this.persistTask(task);
    }

    const reviewInput = `Review the following output and provide feedback, corrections, or approval:

${producerResult.content}`;
    const reviewPromises = reviewers.map(async (reviewer) => {
      if (reviewer.status === 'completed' && reviewer.result !== undefined) {
        return {
          content: reviewer.result,
          metadata: {
            tokensUsed: reviewer.tokensUsed ?? 0,
            ...(reviewer.model ? { model: reviewer.model } : {}),
          },
        };
      }

      reviewer.status = 'running';
      reviewer.startedAt = new Date();
      await this.persistTask(task);
      try {
        const result = await this.executeStep(reviewer, task, reviewInput);
        reviewer.result = result.content;
        reviewer.status = 'completed';
        reviewer.completedAt = new Date();
        reviewer.latencyMs = reviewer.completedAt.getTime() - reviewer.startedAt.getTime();
        reviewer.tokensUsed = numericMetadata(result.metadata, 'tokensUsed');
        reviewer.model = stringMetadata(result.metadata, 'model');
        reviewer.error = undefined;
        task.updatedAt = new Date();
        await this.persistTask(task);
        return result;
      } catch (error: unknown) {
        if (error instanceof OrchestrationApprovalRequiredError) {
          reviewer.status = 'waiting_approval';
          reviewer.error = error.message;
          task.status = 'waiting_approval';
          task.error = error.message;
          task.updatedAt = new Date();
          await this.persistTask(task);
          throw error;
        }
        reviewer.status = 'failed';
        reviewer.error = error instanceof Error ? error.message : String(error);
        reviewer.completedAt = new Date();
        task.updatedAt = new Date();
        await this.persistTask(task);
        return { content: `Review failed: ${reviewer.error}`, metadata: {} };
      }
    });

    const settledReviews = await Promise.allSettled(reviewPromises);
    const reviewResults: Array<{ content: string; metadata?: Record<string, unknown> }> = [];
    for (const result of settledReviews) {
      if (result.status === 'rejected') throw result.reason;
      reviewResults.push(result.value);
    }

    const reviewSection = reviewResults
      .map((result, index) => `### Reviewer ${index + 1} (${reviewers[index].agentId})\n${result.content}`)
      .join('\n\n');
    const finalOutput = `## Original Output\n${producerResult.content}\n\n## Reviews\n${reviewSection}`;
    const totalTokens = numericMetadata(producerResult.metadata, 'tokensUsed') +
      reviewResults.reduce((sum, result) => sum + numericMetadata(result.metadata, 'tokensUsed'), 0);
    const modelUsed = [
      stringMetadata(producerResult.metadata, 'model'),
      ...reviewResults.map((result) => stringMetadata(result.metadata, 'model')),
    ].filter((model): model is string => model !== undefined);

    return {
      finalOutput,
      steps: [...task.steps],
      totalLatencyMs: 0,
      totalTokens,
      costUsd: null,
      agentIds: task.steps.map((step) => step.agentId),
      modelUsed: [...new Set(modelUsed)],
    };
  }

  // ─── Step Execution ────────────────────────────────────────────

  private async executeStep(
    step: OrchestrationStep,
    task: OrchestrationTask,
    input: string,
  ): Promise<{ content: string; metadata?: Record<string, unknown> }> {
    const priority = this.mapPriority(task.priority);

    await this.concurrency.acquire({
      companyId: task.companyId,
      departmentId: task.departmentId,
      agentId: step.agentId,
      userId: task.userId,
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const agent = await db.agent.findFirst({
        where: {
          agentId: step.agentId,
          status: 'active',
          agentCompanyAccess: { some: { companyId: task.companyId } },
        },
        select: { id: true },
      });
      if (!agent) throw new Error('Step agent is not active or available to this company');

      const instance = await db.agentInstance.findFirst({
        where: { agentId: agent.id, companyId: task.companyId, status: 'active' },
        orderBy: { installedAt: 'asc' },
        select: { id: true },
      });
      if (!instance) throw new Error('Step agent has no active company instance');

      const timeoutMs = step.timeoutMs ?? DEFAULT_PARALLEL_CONFIG.timeoutMs;
      const executionInput: Record<string, unknown> = {
        task: input,
        orchestrationTaskId: task.id,
        orchestrationStepId: step.id,
        ...(task.context ? { orchestrationContext: task.context } : {}),
      };
      const executePromise = executeAgentPipeline(instance.id, executionInput, {
        companyId: task.companyId,
        userId: task.userId,
        priority,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Step ${step.id} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      const executionResult = await Promise.race([executePromise, timeoutPromise]);

      step.executionId = executionResult.executionId;
      if (executionResult.needsApproval && executionResult.approvalId) {
        step.approvalId = executionResult.approvalId;
        step.status = 'waiting_approval';
        step.error = `Approval ${executionResult.approvalId} is required`;
        task.status = 'waiting_approval';
        task.error = step.error;
        task.updatedAt = new Date();
        await this.persistTask(task);
        throw new OrchestrationApprovalRequiredError(executionResult.executionId, executionResult.approvalId);
      }
      if (!executionResult.success) {
        throw new Error(executionResult.error ?? 'Agent runtime execution did not complete');
      }

      const execution = await db.agentExecution.findFirst({
        where: { id: executionResult.executionId, companyId: task.companyId },
        select: { executionOutput: true, agentRunId: true },
      });
      if (!execution?.executionOutput) {
        throw new Error('Completed agent output was not persisted');
      }

      const agentRun = execution.agentRunId
        ? await db.agentRun.findFirst({
            where: { id: execution.agentRunId, companyId: task.companyId },
            select: { model: true, latencyMs: true, tokensUsed: true, reviewResult: true },
          })
        : null;
      const metadata: Record<string, unknown> = {};
      if (agentRun?.model) metadata.model = agentRun.model;
      if (typeof agentRun?.latencyMs === 'number') metadata.latencyMs = agentRun.latencyMs;
      if (agentRun) metadata.tokensUsed = agentRun.tokensUsed;
      if (agentRun?.reviewResult) {
        try {
          const parsedReview: unknown = JSON.parse(agentRun.reviewResult);
          if (isRecord(parsedReview)) {
            const review = parsedReview;
            if (typeof review.taskClassification === 'string') metadata.taskClassification = review.taskClassification;
            if (typeof review.ragResults === 'number') metadata.ragResults = review.ragResults;
          }
        } catch {
          // Older execution records may not contain JSON review metadata.
        }
      }

      return { content: execution.executionOutput, metadata };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      this.concurrency.release({
        companyId: task.companyId,
        departmentId: task.departmentId,
        agentId: step.agentId,
        userId: task.userId,
      });
    }
  }

  // ─── Parallel Execution with Concurrency Limit ─────────────────

  private async executeWithConcurrency(
    task: OrchestrationTask,
    config: ParallelExecutionConfig,
  ): Promise<Array<{ content: string; metadata?: Record<string, unknown> }>> {
    const results: Array<{ content: string; metadata?: Record<string, unknown> } | undefined> =
      new Array(task.steps.length);
    const alreadyResolved = new Set<string>();
    for (let index = 0; index < task.steps.length; index++) {
      const step = task.steps[index];
      if (step.status === 'completed' || step.status === 'skipped') alreadyResolved.add(step.id);
      if (step.status === 'completed' && step.result !== undefined) {
        results[index] = {
          content: step.result,
          metadata: {
            tokensUsed: step.tokensUsed ?? 0,
            ...(step.model ? { model: step.model } : {}),
          },
        };
      }
    }

    const pendingSteps = task.steps.filter((step) => step.status !== 'completed' && step.status !== 'skipped');
    const orderedSteps = this.topologicalSort(pendingSteps);
    const completedSteps = new Set(alreadyResolved);
    const waves = this.buildWaves(orderedSteps, completedSteps);

    for (const scheduledWave of waves) {
      const wave: OrchestrationStep[] = [];
      for (const step of scheduledWave) {
        const dependenciesCompleted = (step.dependsOn ?? []).every((dependencyId) =>
          task.steps.find((candidate) => candidate.id === dependencyId)?.status === 'completed',
        );
        if (dependenciesCompleted) {
          wave.push(step);
        } else {
          step.status = 'skipped';
          step.error = 'A prerequisite step did not complete';
          task.updatedAt = new Date();
          await this.persistTask(task);
        }
      }

      if (wave.length === 0) continue;
      const waveResults = await this.executeWave(wave, task, config, completedSteps);
      for (let index = 0; index < wave.length; index++) {
        const step = wave[index];
        const resultIndex = task.steps.findIndex((candidate) => candidate.id === step.id);
        if (resultIndex >= 0) {
          results[resultIndex] = waveResults[index];
          if (step.status === 'completed') completedSteps.add(step.id);
        }
      }

      if (config.failFast && wave.some((step) => step.status === 'failed')) break;
    }

    return results.filter((result): result is { content: string; metadata?: Record<string, unknown> } => result !== undefined);
  }

  private async executeWave(
    wave: OrchestrationStep[],
    task: OrchestrationTask,
    config: ParallelExecutionConfig,
    _completedSteps: Set<string>,
  ): Promise<Array<{ content: string; metadata?: Record<string, unknown> }>> {
    const semaphore = new Semaphore(config.maxConcurrency);
    const promises = wave.map(async (step) => {
      await semaphore.acquire();
      try {
        step.status = 'running';
        step.startedAt = new Date();
        task.updatedAt = new Date();
        await this.persistTask(task);

        const stepInput = this.buildStepInput(step, task.input, task);
        const result = await this.executeStep(step, task, stepInput);

        step.result = result.content;
        step.status = 'completed';
        step.completedAt = new Date();
        step.latencyMs = step.completedAt.getTime() - step.startedAt.getTime();
        step.tokensUsed = numericMetadata(result.metadata, 'tokensUsed');
        step.model = stringMetadata(result.metadata, 'model');
        step.error = undefined;
        task.updatedAt = new Date();
        await this.persistTask(task);
        return result;
      } catch (error: unknown) {
        if (error instanceof OrchestrationApprovalRequiredError) {
          step.status = 'waiting_approval';
          step.error = error.message;
          task.status = 'waiting_approval';
          task.error = error.message;
          task.updatedAt = new Date();
          await this.persistTask(task);
          throw error;
        }
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        step.completedAt = new Date();
        task.updatedAt = new Date();
        await this.persistTask(task);
        return { content: '', metadata: {} };
      } finally {
        semaphore.release();
      }
    });

    const settled = await Promise.allSettled(promises);
    const results: Array<{ content: string; metadata?: Record<string, unknown> }> = [];
    for (const result of settled) {
      if (result.status === 'rejected') throw result.reason;
      results.push(result.value);
    }
    return results;
  }

  // ─── Dependency Graph ──────────────────────────────────────────

  private topologicalSort(steps: OrchestrationStep[]): OrchestrationStep[] {
    const visited = new Set<string>();
    const result: OrchestrationStep[] = [];
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);

      const step = stepMap.get(stepId);
      if (!step) return;

      // Visit dependencies first
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          visit(depId);
        }
      }

      result.push(step);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return result;
  }

  private buildWaves(sortedSteps: OrchestrationStep[], completedSteps: Set<string> = new Set()): OrchestrationStep[][] {
    const waves: OrchestrationStep[][] = [];
    const assigned = new Set<string>(completedSteps);

    for (const step of sortedSteps) {
      if (assigned.has(step.id)) continue;

      // Find all steps that can run together (dependencies are in assigned)
      const wave: OrchestrationStep[] = [];
      for (const s of sortedSteps) {
        if (assigned.has(s.id)) continue;
        const depsSatisfied =
          !s.dependsOn || s.dependsOn.every((d) => assigned.has(d));
        if (depsSatisfied) {
          wave.push(s);
        }
      }

      for (const s of wave) {
        assigned.add(s.id);
      }
      waves.push(wave);
    }

    return waves;
  }

  // ─── Aggregation Strategies ────────────────────────────────────

  private aggregateResults(
    results: string[],
    strategy: ParallelExecutionConfig['aggregationStrategy'],
  ): string {
    switch (strategy) {
      case 'first':
        return results[0] ?? '';
      case 'last':
        return results[results.length - 1] ?? '';
      case 'concatenate':
        return results
          .filter(Boolean)
          .map((r, i) => `### Result ${i + 1}\n${r}`)
          .join('\n\n');
      case 'voting':
        return this.selectByVoting(results);
      case 'consensus':
        return this.buildConsensus(results);
      case 'all':
        return JSON.stringify(results, null, 2);
      default:
        return results.join('\n\n');
    }
  }

  private selectByVoting(results: string[]): string {
    if (results.length === 0) return '';
    if (results.length === 1) return results[0];

    // Simple majority: group by normalized text, pick most common
    const counts = new Map<string, { text: string; count: number }>();
    for (const r of results) {
      const normalized = r.trim().toLowerCase().slice(0, 200);
      const existing = counts.get(normalized);
      if (existing) {
        existing.count++;
      } else {
        counts.set(normalized, { text: r, count: 1 });
      }
    }

    // Return the most common result
    let best = results[0];
    let bestCount = 0;
    for (const entry of counts.values()) {
      if (entry.count > bestCount) {
        bestCount = entry.count;
        best = entry.text;
      }
    }

    return best;
  }

  private buildConsensus(results: string[]): string {
    if (results.length === 0) return '';
    if (results.length === 1) return results[0];

    // Build a consensus by combining all unique points
    const allLines = results.flatMap((r) => r.split('\n').filter((l) => l.trim()));
    const uniqueLines = [...new Set(allLines.map((l) => l.trim()))];

    return `## Consensus Output\n\n${uniqueLines.join('\n')}`;
  }

  // ─── Delegation: Find Best Agent ────────────────────────────────

  private async findBestAgent(task: OrchestrationTask): Promise<string> {
    if (task.steps.length > 0 && task.steps[0].agentId) {
      return task.steps[0].agentId;
    }

    const departmentFilter = task.departmentId ? { departmentId: task.departmentId } : {};
    const agents = await db.agent.findMany({
      where: {
        ...departmentFilter,
        status: 'active',
        agentCompanyAccess: { some: { companyId: task.companyId } },
      },
      take: 1,
    });
    if (agents.length > 0) return agents[0].agentId;

    const fallback = await db.agent.findFirst({
      where: {
        status: 'active',
        agentCompanyAccess: { some: { companyId: task.companyId } },
      },
    });
    if (!fallback) throw new Error('No active company-accessible agents available for delegation');
    return fallback.agentId;
  }

  // ─── Condition Evaluation ──────────────────────────────────────

  private evaluateCondition(
    condition: string,
    _input: string,
    context?: Record<string, unknown>,
  ): boolean {
    // Simple condition evaluation supporting:
    // - context.field == "value"
    // - context.field != "value"
    // - context.field exists
    // - input.length > N
    try {
      // Check for equality conditions: context.field == "value"
      const eqMatch = condition.match(/^context\.(\w+)\s*==\s*"?([^"]+)"?$/);
      if (eqMatch) {
        const ctxValue = context?.[eqMatch[1]];
        return String(ctxValue) === eqMatch[2];
      }

      // Check for inequality: context.field != "value"
      const neqMatch = condition.match(/^context\.(\w+)\s*!=\s*"?([^"]+)"?$/);
      if (neqMatch) {
        const ctxValue = context?.[neqMatch[1]];
        return String(ctxValue) !== neqMatch[2];
      }

      // Check for existence: context.field exists
      const existsMatch = condition.match(/^context\.(\w+)\s+exists$/);
      if (existsMatch) {
        return context?.[existsMatch[1]] !== undefined;
      }

      // Check for input length: input.length > N
      const lengthMatch = condition.match(/^input\.length\s*(>|<|>=|<=|==)\s*(\d+)$/);
      if (lengthMatch) {
        const op = lengthMatch[1];
        const val = parseInt(lengthMatch[2], 10);
        const len = _input.length;
        switch (op) {
          case '>': return len > val;
          case '<': return len < val;
          case '>=': return len >= val;
          case '<=': return len <= val;
          case '==': return len === val;
          default: return true;
        }
      }

      // Default: treat as truthy JS expression (unsafe — only simple values)
      return Boolean(context?.[condition]);
    } catch {
      // On evaluation error, default to running the step
      return true;
    }
  }

  // ─── Retry with Fallback Agent ────────────────────────────────

  private async executeStepWithFallback(
    step: OrchestrationStep,
    task: OrchestrationTask,
    input: string,
    attempt: number,
  ): Promise<{ content: string; metadata?: Record<string, unknown> }> {
    // On first retry, try the same agent. On subsequent retries, try fallback agent.
    if (attempt > 1) {
      const fallbackAgentId = await this.findFallbackAgent(step.agentId, task);
      if (fallbackAgentId) {
        step.agentId = fallbackAgentId;
        return this.executeStep(step, task, input);
      }
    }
    return this.executeStep(step, task, input);
  }

  private async findFallbackAgent(
    failedAgentId: string,
    task: OrchestrationTask,
  ): Promise<string | null> {
    const departmentFilter = task.departmentId ? { departmentId: task.departmentId } : {};
    const agents = await db.agent.findMany({
      where: {
        ...departmentFilter,
        status: 'active',
        agentId: { not: failedAgentId },
        agentCompanyAccess: { some: { companyId: task.companyId } },
      },
      take: 1,
    });
    if (agents.length > 0) return agents[0].agentId;

    const fallback = await db.agent.findFirst({
      where: {
        status: 'active',
        agentId: { not: failedAgentId },
        agentCompanyAccess: { some: { companyId: task.companyId } },
      },
    });
    return fallback?.agentId ?? null;
  }

  // ─── Task Decomposition ─────────────────────────────────────────

  /**
   * Decompose a complex task into subtasks based on the input description.
   * Returns an array of OrchestrationSteps that can be executed.
   */
  async decomposeTask(params: {
    input: string;
    companyId: string;
    userId: string;
    departmentId?: string;
    maxSubtasks?: number;
  }): Promise<OrchestrationStep[]> {
    const membership = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
      select: { id: true },
    });
    if (!membership) throw new Error('Forbidden');

    const maxSubtasks = Math.min(Math.max(params.maxSubtasks ?? 5, 1), 50);
    const departmentFilter = params.departmentId ? { departmentId: params.departmentId } : {};
    let agents = await db.agent.findMany({
      where: {
        ...departmentFilter,
        status: 'active',
        agentCompanyAccess: { some: { companyId: params.companyId } },
      },
      take: maxSubtasks,
    });

    if (agents.length === 0) {
      agents = await db.agent.findMany({
        where: {
          status: 'active',
          agentCompanyAccess: { some: { companyId: params.companyId } },
        },
        take: maxSubtasks,
      });
    }
    if (agents.length === 0) throw new Error('No active company-accessible agents available for task decomposition');

    const steps: OrchestrationStep[] = [];
    for (let index = 0; index < agents.length; index++) {
      steps.push({
        id: `sub_${index + 1}`,
        agentId: agents[index].agentId,
        task: params.input,
        dependsOn: index > 0 ? [`sub_${index}`] : [],
        status: 'pending',
        timeoutMs: 60_000,
        retryCount: 2,
      });
    }
    return steps;
  }

  // ─── Agent Selection by Skill ────────────────────────────────────

  /**
   * Find the best agent for a task based on required skills.
   * Scores agents by matching their allowedSkills against the required skills.
   */
  async findBestAgentBySkills(params: {
    requiredSkills: string[];
    departmentId?: string;
    companyId: string;
  }): Promise<string | null> {
    const departmentFilter = params.departmentId ? { departmentId: params.departmentId } : {};
    const agents = await db.agent.findMany({
      where: {
        ...departmentFilter,
        status: 'active',
        agentCompanyAccess: { some: { companyId: params.companyId } },
      },
      select: { agentId: true, allowedSkills: true },
    });
    if (agents.length === 0) return null;

    let bestAgent: string | null = null;
    let bestScore = -1;
    for (const agent of agents) {
      let skills: string[] = [];
      try {
        const parsed: unknown = JSON.parse(agent.allowedSkills || '[]');
        if (Array.isArray(parsed)) skills = parsed.filter((skill): skill is string => typeof skill === 'string');
      } catch {
        skills = [];
      }

      const matchCount = params.requiredSkills.filter((skill) => skills.includes(skill)).length;
      const score = matchCount / Math.max(params.requiredSkills.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent.agentId;
      }
    }
    return bestAgent;
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private buildStepInput(
    step: OrchestrationStep,
    chainInput: string,
    task: OrchestrationTask,
  ): string {
    // If step has a specific task, use it; otherwise use the chain input
    if (step.task && step.task !== chainInput) {
      return `${step.task}\n\nContext from previous steps:\n${chainInput}`;
    }
    return chainInput;
  }

  private mapPriority(
    priority?: OrchestrationTask['priority'],
  ): TaskPriority {
    if (!priority) return 'normal';
    return ORCHESTRATION_PRIORITY_MAP[priority] ?? 'normal';
  }

  private validateTask(task: OrchestrationTask): string | null {
    if (!task.steps || task.steps.length === 0) {
      return 'Orchestration task must have at least one step';
    }
    if (!task.companyId) {
      return 'companyId is required';
    }
    if (!task.userId) {
      return 'userId is required';
    }
    if (!task.input) {
      return 'input is required';
    }

    // Validate step dependencies exist
    const stepIds = new Set(task.steps.map((s) => s.id));
    for (const step of task.steps) {
      if (!step.id) {
        return 'Every step must have an id';
      }
      if (!step.agentId) {
        return `Step ${step.id} must have an agentId`;
      }
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            return `Step ${step.id} depends on unknown step ${depId}`;
          }
        }
      }
    }

    // Check for circular dependencies
    if (this.hasCircularDependency(task.steps)) {
      return 'Circular dependency detected in steps';
    }

    return null;
  }

  private hasCircularDependency(steps: OrchestrationStep[]): boolean {
    const visited = new Set<string>();
  const recursionStack = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.id, s]));

  const dfs = (stepId: string): boolean => {
    if (recursionStack.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    recursionStack.add(stepId);

    const step = stepMap.get(stepId);
    if (step?.dependsOn) {
      for (const depId of step.dependsOn) {
        if (dfs(depId)) return true;
      }
    }

    recursionStack.delete(stepId);
    return false;
  };

  for (const step of steps) {
    if (dfs(step.id)) return true;
  }

  return false;
  }

  private async emitEvent(
    task: OrchestrationTask,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventBus.publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: `orchestrator.${eventType}`,
        source: 'multi-agent-orchestrator',
        companyId: task.companyId,
        userId: task.userId,
        data,
        priority: 'normal',
        timestamp: new Date(),
        correlationId: task.id,
      });
    } catch {
      // Event bus failure is non-critical
    }
  }
}

// ─── Semaphore ──────────────────────────────────────────────────────

class Semaphore {
  private current = 0;
  private waiters: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    this.current = Math.max(0, this.current - 1);
    const waiter = this.waiters.shift();
    if (waiter) {
      this.current++;
      waiter();
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────

let _instance: MultiAgentOrchestrator | null = null;
export function getOrchestrator(): MultiAgentOrchestrator {
  if (!_instance) _instance = new MultiAgentOrchestrator();
  return _instance;
}
