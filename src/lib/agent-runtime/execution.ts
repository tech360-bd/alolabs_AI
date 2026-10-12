/**
 * Agent Execution Engine
 * The CORE of the agent runtime. Connects AI router to real agent execution.
 * Enhanced with: Event Bus integration, self-healing model fallback, approval checks.
 */

import type {
  AgentTask, ExecutionResult, ExecutionError, TokenUsage,
  TaskPriority, DelegationResult,
} from './types';
import { DEFAULT_TIMEOUT_MS, MAX_DELEGATION_DEPTH, PRIORITY_WEIGHTS } from './types';
import { getAgentStateManager } from './state';
import { getAgentHealthMonitor } from './health';
import { db } from '@/lib/db';
import { getRouter } from '@/lib/ai-router';
import { buildAgentContext } from '@/lib/context-engine';
import {
  classifyTask, selectModelForTask, retrieveRelevantKnowledge,
  validateExecution, storeExecutionMemory, buildRAGContextSection,
} from './pipeline';
import { getEventBus } from '@/lib/event-bus';
import { validateInput, validateOutput } from '@/lib/ai-security/validator';

// ─── Model Fallback Constants ────────────────────────────────────────

/** Error codes eligible for model fallback self-healing */
export const FALLBACK_RETRYABLE_ERRORS: ReadonlySet<string> = new Set([
  'CIRCUIT_OPEN',
  'TIMEOUT',
  'RATE_LIMITED',
]);

/** Model fallback chain: reasoning → balanced → fast → coding */
export const MODEL_FALLBACK_CHAIN: Readonly<Record<string, string>> = {
  'reasoning': 'balanced',
  'balanced': 'fast',
  'fast': 'coding',
};

// ─── Execution Queue (priority-sorted) ─────────────────────────────

class PriorityQueue {
  private queue: AgentTask[] = [];

  enqueue(task: AgentTask): void {
    const weight = PRIORITY_WEIGHTS[task.priority] ?? 10;
    // Insert sorted by priority (highest first)
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      const existingWeight = PRIORITY_WEIGHTS[this.queue[i].priority] ?? 10;
      if (weight > existingWeight) {
        this.queue.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.queue.push(task);
  }

  dequeue(): AgentTask | undefined {
    return this.queue.shift();
  }

  remove(taskId: string): void {
    this.queue = this.queue.filter(t => t.id !== taskId);
  }

  peek(): AgentTask | undefined {
    return this.queue[0];
  }

  get size(): number {
    return this.queue.length;
  }

  all(): AgentTask[] {
    return [...this.queue];
  }
}

// ─── Execution Engine ──────────────────────────────────────────────

export class AgentExecutionEngine {
  private stateManager: ReturnType<typeof getAgentStateManager>;
  private healthMonitor: ReturnType<typeof getAgentHealthMonitor>;
  private queue = new PriorityQueue();
  private processing = false;
  private delegationDepth = new Map<string, number>(); // taskId -> depth
  private abortControllers = new Map<string, AbortController>();
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.stateManager = getAgentStateManager();
    this.healthMonitor = getAgentHealthMonitor();
    this.startDispatcher();
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Submit a task for execution.
   * If async, queues and returns immediately.
   * If sync, blocks until completion.
   */
  async execute(params: {
    agentId: string;
    companyId: string;
    userId: string;
    task: string;
    priority?: TaskPriority;
    systemPrompt?: string;
    context?: Record<string, unknown>;
    tools?: string[];
    maxTokens?: number;
    timeoutMs?: number;
    mode?: 'sync' | 'async';
    parentTaskId?: string;
    delegationDepth?: number;
    instanceId?: string;
    approvalExecutionId?: string;
    approvalId?: string;
    approvedBy?: string;
  }): Promise<AgentTask> {
    const agent = await db.agent.findFirst({
      where: {
        agentId: params.agentId,
        status: 'active',
        agentCompanyAccess: { some: { companyId: params.companyId } },
      },
      select: { id: true },
    })
    if (!agent) throw new Error('Agent is not active or available to this company')

    if (params.userId && params.userId !== 'anonymous') {
      const membership = await db.companyUser.findUnique({
        where: { companyId_userId: { companyId: params.companyId, userId: params.userId } },
        select: { id: true },
      })
      if (!membership) throw new Error('Forbidden')
    }

    if (params.instanceId) {
      const instance = await db.agentInstance.findFirst({
        where: { id: params.instanceId, agentId: agent.id, companyId: params.companyId, status: 'active' },
        select: { id: true },
      })
      if (!instance) throw new Error('Active agent instance not found for this company')
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mode = params.mode ?? 'async';

    const agentTask: AgentTask = {
      id: taskId,
      agentId: params.agentId,
      companyId: params.companyId,
      userId: params.userId,
      instanceId: params.instanceId,
      approvalExecutionId: params.approvalExecutionId,
      approvalId: params.approvalId,
      approvedBy: params.approvedBy,
      parentTaskId: params.parentTaskId,
      tier: 'worker',
      priority: params.priority ?? 'normal',
      riskLevel: 'low',
      status: 'created',
      mode: mode === 'sync' ? 'sync' : 'async',
      input: params.task,
      context: params.context,
      systemPrompt: params.systemPrompt,
      tools: params.tools,
      maxTokens: params.maxTokens,
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.stateManager.createTask(agentTask);

    if (mode === 'sync') {
      return this.runTask(taskId);
    }

    // Async: enqueue
    this.stateManager.transition(taskId, 'ready', 'Queued for execution');
    this.queue.enqueue(this.stateManager.getTask(taskId)!);

    return this.stateManager.getTask(taskId)!;
  }

  /** Cancel a running task */
  cancel(taskId: string): boolean {
    const task = this.stateManager.getTask(taskId);
    if (!task) return false;
    if (task.status !== 'running' && task.status !== 'ready') return false;

    this.queue.remove(taskId);
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    try {
      this.stateManager.transition(taskId, 'failed', 'Cancelled by user');
    } catch { /* already in terminal state */ }
    return true;
  }

  /** Delegate a task to another agent */
  async delegate(params: {
    sourceTaskId: string;
    targetAgentId: string;
    task: string;
    context?: Record<string, unknown>;
  }): Promise<ExecutionResult> {
    const sourceTask = this.stateManager.getTask(params.sourceTaskId);
    if (!sourceTask) throw new Error(`Source task ${params.sourceTaskId} not found`);

    const currentDepth = this.delegationDepth.get(params.sourceTaskId) ?? 0;
    if (currentDepth >= MAX_DELEGATION_DEPTH) {
      throw new Error(`Max delegation depth (${MAX_DELEGATION_DEPTH}) exceeded`);
    }

    const result = await this.execute({
      agentId: params.targetAgentId,
      companyId: sourceTask.companyId,
      userId: sourceTask.userId,
      task: params.task,
      context: { ...params.context, delegatedFrom: params.sourceTaskId },
      mode: 'sync',
      parentTaskId: params.sourceTaskId,
      delegationDepth: currentDepth + 1,
    });

    return result.result!;
  }

  /** Get current queue status */
  getStatus() {
    return {
      queueDepth: this.queue.size,
      activeTasks: this.stateManager.getActiveTasks().length,
      processing: this.processing,
    };
  }

  /** Get all queued tasks */
  getQueue(): AgentTask[] {
    return this.queue.all();
  }

  destroy(): void {
    if (this.dispatchTimer) {
      clearInterval(this.dispatchTimer);
      this.dispatchTimer = null;
    }
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.stateManager.destroy();
  }

  // ─── Internal: Task Runner ─────────────────────────────────────

  private async runTask(taskId: string): Promise<AgentTask> {
    const task = this.stateManager.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const startTime = Date.now();
    let slotAcquired = false;
    let agentDbId: string | undefined;
    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    try {
      if (!this.stateManager.canExecute(task.agentId, task.companyId) ||
          !this.stateManager.acquireSlot(task.agentId, task.companyId)) {
        if (task.status === 'created') {
          this.stateManager.transition(taskId, 'ready', 'At capacity; requeued');
          this.queue.enqueue(this.stateManager.getTask(taskId)!);
          return this.stateManager.getTask(taskId)!;
        }
        throw new Error('Execution capacity is unavailable');
      }
      slotAcquired = true;
      this.stateManager.transition(taskId, 'running', 'Execution started');

      const agent = await db.agent.findUnique({ where: { agentId: task.agentId } });
      if (!agent || agent.status !== 'active') {
        throw new Error(`Active agent ${task.agentId} was not found`);
      }
      agentDbId = agent.id;

      const inputValidation = await validateInput(
        { task: task.input, context: task.context ?? {} },
        { companyId: task.companyId, agentId: agent.id },
      );
      task.riskScore = inputValidation.riskScore;
      task.securityFlags = inputValidation.flags;
      task.riskLevel = inputValidation.riskScore >= 0.8
        ? 'critical'
        : inputValidation.riskScore >= 0.5
          ? 'high'
          : inputValidation.riskScore >= 0.2
            ? 'medium'
            : 'low';

      if (!inputValidation.valid) {
        const message = `Input blocked by security validation: ${inputValidation.flags.join(', ')}`;
        task.error = {
          code: 'INPUT_VALIDATION_FAILED',
          message,
          retryable: false,
          attempts: 1,
          maxRetries: 0,
          lastAttemptAt: new Date(),
        };
        this.stateManager.transition(taskId, 'failed', message);
        this.healthMonitor.recordFailure(task.agentId, Date.now() - startTime, message);
        return this.stateManager.getTask(taskId)!;
      }

      const needsApproval =
        task.priority === 'critical' ||
        task.priority === 'high' ||
        task.riskScore >= 0.5;

      if (needsApproval) {
        const approvalExecutionId = task.approvalExecutionId;
        if (!approvalExecutionId) {
          throw new Error('A persisted AgentExecution is required before requesting approval');
        }

        const persistedExecution = await db.agentExecution.findFirst({
          where: {
            id: approvalExecutionId,
            companyId: task.companyId,
            userId: task.userId,
            status: { in: ['running', 'approval_required'] },
          },
          select: { id: true },
        });
        if (!persistedExecution) {
          throw new Error('Approval is not bound to an active company-scoped AgentOS execution');
        }

        if (!task.approvalId) {
          const approval = await db.$transaction(async (transaction) => {
            const currentExecution = await transaction.agentExecution.findFirst({
              where: {
                id: approvalExecutionId,
                companyId: task.companyId,
                userId: task.userId,
                status: 'running',
                approvalId: null,
              },
              select: { id: true },
            });
            if (!currentExecution) {
              throw new Error('Execution is no longer eligible for a new approval');
            }

            const createdApproval = await transaction.approval.create({
              data: {
                type: 'agent_action',
                title: `Agent execution approval: ${agent.name}`,
                description: `Risk score ${task.riskScore?.toFixed(2)}; flags: ${task.securityFlags?.join(', ') || 'priority policy'}`,
                requestJson: JSON.stringify({
                  agentId: task.agentId,
                  taskId,
                  inputLength: task.input.length,
                  riskScore: task.riskScore,
                  flags: task.securityFlags,
                }),
                requestedBy: task.userId,
                companyId: task.companyId,
                riskLevel: task.riskLevel === 'low' ? 'high' : task.riskLevel,
                executionId: currentExecution.id,
              },
            });

            const linked = await transaction.agentExecution.updateMany({
              where: {
                id: currentExecution.id,
                companyId: task.companyId,
                userId: task.userId,
                status: 'running',
                approvalId: null,
              },
              data: {
                approvalId: createdApproval.id,
                status: 'approval_required',
                step: 'approval',
                stepNumber: 4,
                riskScore: task.riskScore,
                securityFlags: JSON.stringify(task.securityFlags ?? []),
                validatedInput: task.input,
              },
            });
            if (linked.count !== 1) {
              throw new Error('Execution changed before the approval could be linked');
            }
            return createdApproval;
          });

          task.approvalId = approval.id;
          const message = 'Human approval is required before this execution can continue';
          task.error = {
            code: 'APPROVAL_REQUIRED',
            message,
            retryable: false,
            attempts: 1,
            maxRetries: 0,
            lastAttemptAt: new Date(),
          };
          this.stateManager.transition(taskId, 'waiting_approval', message);
          return this.stateManager.getTask(taskId)!;
        }

        const approvedRecord = await db.approval.findFirst({
          where: {
            id: task.approvalId,
            companyId: task.companyId,
            executionId: approvalExecutionId,
            status: 'approved',
          },
          select: { id: true },
        });
        if (!approvedRecord) {
          throw new Error('A current, company-scoped approval is required');
        }
      }

      const taskClassification = classifyTask(task.input, agent.role, agent.type);
      const selectedModel = selectModelForTask(taskClassification);

      try {
        getEventBus().publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'agent.task.started',
          source: task.agentId,
          companyId: task.companyId,
          userId: task.userId,
          data: {
            taskId,
            agentId: task.agentId,
            companyId: task.companyId,
            priority: task.priority,
            modelTier: taskClassification.suggestedModelTier,
          },
          priority: task.priority,
          timestamp: new Date(),
          correlationId: taskId,
        }).catch(() => {});
      } catch { /* Event delivery must not block an execution. */ }

      let ragContext;
      let ragSection = '';
      try {
        ragContext = await retrieveRelevantKnowledge(task.input, agent.departmentId, 3, task.companyId);
        if (ragContext.results.length > 0) ragSection = buildRAGContextSection(ragContext);
      } catch (ragError) {
        console.warn(`[AgentRuntime] Company-scoped RAG retrieval failed for ${task.agentId}:`, ragError);
      }

      let systemPrompt: string;
      let estimatedContextTokens: number | undefined;
      const contextSourceNames = new Set<string>();
      try {
        const builtContext = await buildAgentContext({ agentId: task.agentId, companyId: task.companyId, task: task.input });
        systemPrompt = builtContext.systemPrompt;
        estimatedContextTokens = builtContext.contextTokens;
        for (const [source, count] of Object.entries(builtContext.sources)) {
          if (count > 0) contextSourceNames.add(source);
        }
        if (ragSection) {
          systemPrompt += `\n\n${ragSection}`;
          contextSourceNames.add('rag');
        }
      } catch (contextError) {
        console.warn(`[AgentRuntime] Context engine failed for ${task.agentId}:`, contextError);
        systemPrompt = `You are ${agent.name}, a ${agent.role} AI employee in the ${agent.departmentName} department at ALO Labs. Respond accurately and professionally. Do not claim to have used tools or data that were not provided.`;
        if (ragSection) {
          systemPrompt += `\n\n${ragSection}`;
          contextSourceNames.add('rag');
        }
      }
      const contextSources = [...contextSourceNames].sort().join(',');

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: task.input },
      ];
      if (task.context && Object.keys(task.context).length > 0) {
        messages.splice(1, 0, {
          role: 'user' as const,
          content: `Additional context:\n${JSON.stringify(task.context, null, 2)}`,
        });
      }

      const router = getRouter();
      const originalModel = selectedModel;
      const routerRequest = {
        model: selectedModel,
        messages,
        maxTokens: task.maxTokens ?? 4096,
        temperature: taskClassification.complexity === 'simple' ? 0.3 : 0.7,
      };

      const routingContext = {
        taskId,
        runId: typeof task.context?.runId === 'string' ? task.context.runId : undefined,
        taskType: `agent.task.${taskClassification.complexity}`,
      };
      let aiResponse;
      let modelFallback = false;
      let fallbackTriggerError: string | undefined;
      try {
        aiResponse = await router.chat(routerRequest, task.companyId, task.agentId, routingContext);
      } catch (routerError) {
        const routerErrorCode = this.classifyError(routerError);
        if (!FALLBACK_RETRYABLE_ERRORS.has(routerErrorCode)) throw routerError;

        const fallbackModel = MODEL_FALLBACK_CHAIN[originalModel];
        if (!fallbackModel) throw routerError;
        try {
          aiResponse = await router.chat(
            { ...routerRequest, model: fallbackModel },
            task.companyId,
            task.agentId,
            routingContext,
          );
          modelFallback = true;
          fallbackTriggerError = routerErrorCode;
        } catch {
          throw routerError;
        }
      }

      if (modelFallback) {
        try {
          getEventBus().publish({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'agent.task.self_healed',
            source: task.agentId,
            companyId: task.companyId,
            userId: task.userId,
            data: {
              taskId,
              agentId: task.agentId,
              originalModel,
              fallbackModel: aiResponse.model,
              triggerErrorCode: fallbackTriggerError,
              latencyMs: Date.now() - startTime,
            },
            priority: 'high',
            timestamp: new Date(),
            correlationId: taskId,
          }).catch(() => {});
        } catch { /* Event delivery must not block an execution. */ }
      }

      const outputValidation = await validateOutput(aiResponse.content, {
        companyId: task.companyId,
        agentId: agent.id,
      });
      if (!outputValidation.valid) {
        throw new Error(`Output blocked by security validation: ${outputValidation.flags.join(', ')}`);
      }

      this.stateManager.recordTokens(task.companyId, aiResponse.usage.totalTokens);
      const tokenUsage: TokenUsage = {
        promptTokens: aiResponse.usage.promptTokens,
        completionTokens: aiResponse.usage.completionTokens,
        totalTokens: aiResponse.usage.totalTokens,
      };
      const validation = validateExecution(aiResponse.content, task.input, agent.role);
      const result: ExecutionResult = {
        content: aiResponse.content,
        metadata: {
          model: aiResponse.model,
          finishReason: aiResponse.finishReason,
          latencyMs: aiResponse.latencyMs,
          contextSources,
          ...(typeof estimatedContextTokens === 'number' ? { estimatedContextTokens } : {}),
          taskClassification: taskClassification.suggestedModelTier,
          heuristicValidationScore: validation.score,
          heuristicValidationPassed: validation.passed,
          securityValidationPassed: outputValidation.valid,
          ragResults: ragContext?.results.length ?? 0,
          promptTokens: aiResponse.usage.promptTokens,
          completionTokens: aiResponse.usage.completionTokens,
          totalTokens: aiResponse.usage.totalTokens,
          ...(modelFallback ? { modelFallback: true, originalModel } : {}),
        },
      };

      const durationMs = Date.now() - startTime;
      const agentRun = await db.agentRun.create({
        data: {
          id: task.id,
          agentId: agent.id,
          agentName: agent.name,
          input: task.input,
          output: aiResponse.content,
          durationMs,
          model: aiResponse.model,
          tokensUsed: aiResponse.usage.totalTokens,
          companyId: task.companyId,
          latencyMs: aiResponse.latencyMs,
          contextSources,
          status: 'running',
          instanceId: task.instanceId,
          requestId: task.id,
          userId: task.userId,
          priority: task.priority,
          riskScore: task.riskScore,
          securityFlags: JSON.stringify(task.securityFlags ?? []),
          validatedInput: task.input,
          approvalId: task.approvalId,
          step: 'execution',
          stepNumber: 5,
          reviewResult: JSON.stringify({
            heuristicValidation: validation,
            securityValidation: outputValidation,
            heuristicValidationScore: validation.score,
            heuristicValidationPassed: validation.passed,
            securityValidationPassed: outputValidation.valid,
            taskClassification: taskClassification.suggestedModelTier,
            ragResults: ragContext?.results.length ?? 0,
            promptTokens: aiResponse.usage.promptTokens,
            completionTokens: aiResponse.usage.completionTokens,
          }),
        },
      });

      result.metadata = { ...result.metadata, agentRunId: agentRun.id };
      task.result = result;
      task.tokenUsage = tokenUsage;
      this.stateManager.transition(taskId, 'completed', 'Execution succeeded');

      try {
        getEventBus().publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'agent.task.completed',
          source: task.agentId,
          companyId: task.companyId,
          userId: task.userId,
          data: {
            taskId,
            agentId: task.agentId,
            model: aiResponse.model,
            latencyMs: Date.now() - startTime,
            promptTokens: aiResponse.usage.promptTokens,
            completionTokens: aiResponse.usage.completionTokens,
            contextSources,
            heuristicValidationScore: validation.score,
          },
          priority: task.priority,
          timestamp: new Date(),
          correlationId: taskId,
        }).catch(() => {});
      } catch { /* Event delivery must not block an execution. */ }

      await storeExecutionMemory({
        agentDbId: agent.id,
        companyId: task.companyId,
        taskId,
        task: task.input,
        result: aiResponse.content,
        model: aiResponse.model,
        latencyMs: Date.now() - startTime,
        validation,
        contextSources,
      });

      this.healthMonitor.recordSuccess(task.agentId, Date.now() - startTime);
      await db.auditLog.create({
        data: {
          action: 'agent_execution',
          resource: task.agentId,
          details: JSON.stringify({
            taskId,
            agentId: task.agentId,
            companyId: task.companyId,
            status: 'completed',
            tokens: tokenUsage.totalTokens,
            latencyMs: Date.now() - startTime,
          }),
          ...(task.userId && task.userId !== 'anonymous' ? { userId: task.userId } : {}),
        },
      }).catch(() => { /* Audit persistence is best-effort; task output is already stored. */ });

      return this.stateManager.getTask(taskId)!;
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retryable = this.isRetryable(error);
      const errorCode = this.classifyError(error);

      try {
        getEventBus().publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'agent.task.failed',
          source: task.agentId,
          companyId: task.companyId,
          userId: task.userId,
          data: { taskId, agentId: task.agentId, errorCode, errorMessage, latencyMs: latency },
          priority: task.priority,
          timestamp: new Date(),
          correlationId: taskId,
        }).catch(() => {});
      } catch { /* Event delivery must not block failure handling. */ }

      task.error = {
        code: errorCode,
        message: errorMessage,
        retryable,
        attempts: (task.error?.attempts ?? 0) + 1,
        maxRetries: 3,
        lastAttemptAt: new Date(),
      };
      if (task.status === 'running' || task.status === 'ready' || task.status === 'created') {
        try {
          this.stateManager.transition(taskId, 'failed', `Execution failed: ${errorMessage}`);
        } catch { /* Preserve the recorded failure if the transition has already occurred. */ }
      }
      this.healthMonitor.recordFailure(task.agentId, latency, errorMessage);

      if (agentDbId) {
        await db.agentRun.create({
          data: {
            id: task.id,
            agentId: agentDbId,
            companyId: task.companyId,
            input: task.input,
            status: 'failed',
            instanceId: task.instanceId,
            requestId: task.id,
            userId: task.userId,
            priority: task.priority,
            riskScore: task.riskScore,
            securityFlags: JSON.stringify(task.securityFlags ?? []),
            approvalId: task.approvalId,
            error: errorCode,
            errorMessage,
            durationMs: latency,
            completedAt: new Date(),
          },
        }).catch(() => { /* Failure record persistence is best-effort. */ });
      }

      await db.auditLog.create({
        data: {
          action: 'agent_execution_failed',
          resource: task.agentId,
          details: JSON.stringify({ taskId, companyId: task.companyId, errorCode, latencyMs: latency }),
          ...(task.userId && task.userId !== 'anonymous' ? { userId: task.userId } : {}),
        },
      }).catch(() => {});

      return this.stateManager.getTask(taskId)!;
    } finally {
      this.abortControllers.delete(taskId);
      const currentTask = this.stateManager.getTask(taskId);
      if (slotAcquired && currentTask &&
          !['completed', 'failed', 'timed_out'].includes(currentTask.status)) {
        this.stateManager.releaseSlot(task.companyId);
      }
    }
  }

  // ─── Internal: Dispatcher ──────────────────────────────────────

  private startDispatcher(): void {
    // Process queue every 500ms
    this.dispatchTimer = setInterval(() => {
      this.processQueue();
    }, 500);
  }

  private processQueue(): void {
    if (this.processing) return;
    if (this.queue.size === 0) return;

    const task = this.queue.dequeue();
    if (!task) return;

    // Skip if no longer in ready state
    if (task.status !== 'ready') return;

    this.processing = true;
    this.runTask(task.id)
      .catch((err) => console.error(`[AgentRuntime] Task ${task.id} error:`, err))
      .finally(() => { this.processing = false; });
  }

  // ─── Internal: Helpers ─────────────────────────────────────────

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('circuit')
      );
    }
    return false;
  }

  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('timeout')) return 'TIMEOUT';
      if (msg.includes('rate limit') || msg.includes('429')) return 'RATE_LIMITED';
      if (msg.includes('circuit')) return 'CIRCUIT_OPEN';
      if (msg.includes('not found')) return 'NOT_FOUND';
      if (msg.includes('auth') || msg.includes('unauthorized')) return 'AUTH_ERROR';
      if (msg.includes('budget') || msg.includes('token')) return 'BUDGET_EXCEEDED';
    }
    return 'UNKNOWN_ERROR';
  }

  private async createAuditLog(
    task: AgentTask,
    _status: string,
    _latency: number,
  ): Promise<void> {
    // Audit logging is done in the runTask success/failure paths
    // This method is a hook point for extensibility
  }
}

// Singleton
let _instance: AgentExecutionEngine | null = null;
export function getExecutionEngine(): AgentExecutionEngine {
  if (!_instance) _instance = new AgentExecutionEngine();
  return _instance;
}
