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
import { agentCompanyScope } from '@/lib/agent-access';
import type { AIRequest, AIResponse } from '@/lib/ai-router/types';
import { executeCompanyAIChat, CompanyAIError, type CompanyAIActor } from '@/lib/multi-tenant-ai/service';
import type { ModelRoutingProfile } from '@/lib/multi-tenant-ai/policy';
import { runToolLoop } from './tool-loop';
import { parseToolList, toolSchemasFor } from '@/lib/tools';
import { buildAgentContext, buildMinimalAgentSystemPrompt } from '@/lib/context-engine';
import {
  classifyTask, retrieveRelevantKnowledge,
  validateExecution, storeExecutionMemory, buildRAGContextSection,
} from './pipeline';
import { getEventBus } from '@/lib/event-bus';
import { validateInput, validateOutput } from '@/lib/ai-security/validator';

// ─── Shared routing policy ──────────────────────────────────────────

/**
 * Fail-closed routing outcomes are retained as deferred tasks, not reported as
 * successful or converted into an implicit paid-model fallback.
 */
const DEFERRED_ROUTING_CODES: ReadonlySet<string> = new Set([
  'NO_AUTHORIZED_MODEL',
  'QUOTA_UNKNOWN_OR_EXHAUSTED',
  'FREE_TIER_STATUS_UNKNOWN',
  'EXTERNAL_DATA_NOT_AUTHORIZED',
  'TOKEN_BUDGET_EXHAUSTED',
  'RATE_LIMITED_DEFERRED',
  'AUTHORIZED_ROUTE_FAILED',
]);

interface AIEmployeeExecutionPolicy {
  status: 'provisioned' | 'tested' | 'active';
  allowedTools: string[];
  forbiddenTools: string[];
  maxConcurrentTasks: number;
  maxTokensPerTask: number;
  dailyTokenBudget: number;
  timeoutSeconds: number;
}

function parsePolicyRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parsePolicyStringList(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

function boundedPolicyInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`AI employee ${name} policy is invalid; execution is blocked.`);
  }
  return value as number;
}

/**
 * Resolve identity controls independently from model selection. Missing table
 * (pre-migration rollout) preserves legacy behavior; once the table exists,
 * malformed rows and suspended/retired identities fail closed.
 */
async function loadAIEmployeeExecutionPolicy(companyId: string, agentDbId: string, agentDepartmentId: string): Promise<AIEmployeeExecutionPolicy | null> {
  let row: {
    departmentId: string;
    status: string;
    allowedTools: string;
    permissionProfile: string;
    resourceLimits: string;
  } | null;
  try {
    row = await db.aIEmployeeIdentity.findFirst({
      where: { companyId, agentDbId },
      select: { departmentId: true, status: true, allowedTools: true, permissionProfile: true, resourceLimits: true },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2021') return null;
    throw error;
  }
  if (!row) return null;
  if (row.departmentId !== agentDepartmentId) throw new Error('AI employee department assignment is inconsistent; execution is blocked.');
  if (row.status === 'suspended' || row.status === 'retired') throw new Error(`AI employee identity is ${row.status}; execution is blocked.`);
  if (row.status !== 'provisioned' && row.status !== 'tested' && row.status !== 'active') {
    throw new Error('AI employee lifecycle status is invalid; execution is blocked.');
  }

  const allowedTools = parsePolicyStringList(row.allowedTools);
  const profile = parsePolicyRecord(row.permissionProfile);
  const resourceLimits = parsePolicyRecord(row.resourceLimits);
  if (!allowedTools || !profile || !resourceLimits) throw new Error('AI employee permissions or resource policy is malformed; execution is blocked.');
  const profileForbidden = profile.forbiddenTools;
  if (!Array.isArray(profileForbidden) || !profileForbidden.every((tool) => typeof tool === 'string')) {
    throw new Error('AI employee forbidden-tool policy is malformed; execution is blocked.');
  }

  return {
    status: row.status,
    allowedTools,
    forbiddenTools: profileForbidden as string[],
    maxConcurrentTasks: boundedPolicyInteger(resourceLimits.maxConcurrentTasks, 'concurrency', 1, 5),
    maxTokensPerTask: boundedPolicyInteger(resourceLimits.maxTokensPerTask, 'token limit', 1, 32_768),
    dailyTokenBudget: boundedPolicyInteger(resourceLimits.dailyTokenBudget, 'daily token budget', 1, 10_000_000),
    timeoutSeconds: boundedPolicyInteger(resourceLimits.timeoutSeconds, 'timeout', 1, 3_600),
  };
}

/** Keep task capability/complexity separate from a provider/model identity. */
export function routingProfileForTask(classification: ReturnType<typeof classifyTask>): ModelRoutingProfile {
  switch (classification.suggestedModelTier) {
    case 'coding': return 'free_coding';
    case 'reasoning': return 'free_reasoning';
    case 'vision': return 'free_vision';
    // RAG/search tasks still need a chat completion here; embeddings are routed
    // separately by the RAG service through the free_embeddings profile.
    case 'embedding':
    case 'fast':
    case 'balanced':
    default: return 'free_general';
  }
}

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

  dequeueEligible(isEligible: (task: AgentTask) => boolean): AgentTask | undefined {
    const index = this.queue.findIndex(isEligible);
    return index >= 0 ? this.queue.splice(index, 1)[0] : undefined;
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
  private processingTaskIds = new Set<string>();
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
        ...agentCompanyScope(params.companyId, 'execute'),
      },
      select: { id: true, departmentId: true },
    })
    if (!agent) throw new Error('Agent is not active or available to this company')
    const employeePolicy = await loadAIEmployeeExecutionPolicy(params.companyId, agent.id, agent.departmentId)

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
      maxTokens: employeePolicy
        ? Math.max(1, Math.min(employeePolicy.maxTokensPerTask, Number.isFinite(params.maxTokens) ? Math.floor(params.maxTokens!) : employeePolicy.maxTokensPerTask))
        : params.maxTokens,
      timeoutMs: employeePolicy
        ? Math.max(1, Math.min(params.timeoutMs ?? DEFAULT_TIMEOUT_MS, employeePolicy.timeoutSeconds * 1000))
        : params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      employeeMaxConcurrentTasks: employeePolicy?.maxConcurrentTasks,
      employeeIdentityRequired: employeePolicy !== null,
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
      processing: this.processingTaskIds.size > 0,
      processingCount: this.processingTaskIds.size,
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
      if (task.userId && task.userId !== 'anonymous') {
        const membership = await db.companyUser.findUnique({
          where: { companyId_userId: { companyId: task.companyId, userId: task.userId } },
          select: { id: true },
        });
        if (!membership) throw new Error('Forbidden');
      }

      // Re-check both lifecycle and explicit company access at execution time;
      // queued work must not survive a revoked share or an agent deactivation.
      const agent = await db.agent.findFirst({
        where: {
          agentId: task.agentId,
          status: 'active',
          ...agentCompanyScope(task.companyId, 'execute'),
        },
        include: { department: { select: { companyId: true } } },
      });
      if (!agent) {
        throw new Error(`Active agent ${task.agentId} is not available to this company`);
      }
      agentDbId = agent.id;
      const employeePolicy = await loadAIEmployeeExecutionPolicy(task.companyId, agent.id, agent.departmentId);
      if (task.employeeIdentityRequired && !employeePolicy) {
        throw new Error('AI employee identity was removed while the task was queued; execution is blocked.');
      }
      task.maxTokens = employeePolicy
        ? Math.max(1, Math.min(employeePolicy.maxTokensPerTask, task.maxTokens ?? employeePolicy.maxTokensPerTask))
        : task.maxTokens;
      task.timeoutMs = employeePolicy
        ? Math.max(1, Math.min(task.timeoutMs ?? DEFAULT_TIMEOUT_MS, employeePolicy.timeoutSeconds * 1000))
        : task.timeoutMs;
      task.employeeMaxConcurrentTasks = employeePolicy?.maxConcurrentTasks;

      if (!this.stateManager.canExecute(task.agentId, task.companyId, employeePolicy?.maxConcurrentTasks ?? task.employeeMaxConcurrentTasks) ||
          !this.stateManager.acquireSlot(task.agentId, task.companyId, employeePolicy?.maxConcurrentTasks ?? task.employeeMaxConcurrentTasks)) {
        if (task.status === 'created') {
          this.stateManager.transition(taskId, 'ready', 'At capacity; requeued');
        }
        if (task.status === 'ready') {
          this.queue.enqueue(this.stateManager.getTask(taskId)!);
          return this.stateManager.getTask(taskId)!;
        }
        throw new Error('Execution capacity is unavailable');
      }
      slotAcquired = true;
      this.stateManager.transition(taskId, 'running', 'Execution started');

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
      const routingProfile = routingProfileForTask(taskClassification);
      const tenantDepartmentId = agent.department?.companyId === task.companyId
        ? agent.departmentId
        : undefined;

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
        // Preserve the agent's own operating instructions, but do not include
        // department details or materials that failed tenant-scope validation.
        systemPrompt = buildMinimalAgentSystemPrompt({
          agentName: agent.name,
          agentRole: agent.role,
          systemInstructions: agent.systemInstructions,
        });
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

      // Only tools this agent is explicitly allowed to call are advertised to
      // the model. Advertising a tool the policy will block wastes a turn and
      // teaches the model to hallucinate capability it does not have.
      const allowedToolNames = parseToolList(agent.allowedTools);
      const forbiddenToolNames = new Set([
        ...parseToolList(agent.forbiddenTools),
        ...(employeePolicy?.forbiddenTools ?? []),
      ]);
      const identityToolLimit = employeePolicy
        ? new Set(employeePolicy.status === 'active' ? employeePolicy.allowedTools : [])
        : null;
      const effectiveAllowedTools = allowedToolNames.filter((name) =>
        !forbiddenToolNames.has(name) && (!identityToolLimit || identityToolLimit.has(name)),
      );
      const toolSchemas = toolSchemasFor(effectiveAllowedTools);

      const routerRequest: AIRequest = {
        model: '', // capability profile chooses the model; never treat a tier label as a model ID
        messages,
        maxTokens: task.maxTokens ?? 4096,
        temperature: taskClassification.complexity === 'simple' ? 0.3 : 0.7,
        ...(toolSchemas.length > 0 ? { tools: toolSchemas } : {}),
      };
      const actor: CompanyAIActor = {
        companyId: task.companyId,
        userId: task.userId && task.userId !== 'anonymous' ? task.userId : 'system:agent-runtime',
        role: 'system',
      };
      const runId = typeof task.context?.runId === 'string' ? task.context.runId : undefined;
      const dataClassification = task.riskLevel === 'critical' || task.riskLevel === 'high'
        ? 'restricted' as const
        : 'confidential' as const;
      let modelCallSequence = 0;
      let modelFallback = false;
      let fallbackAttempts = 0;

      const callCompanyModel = async (request: AIRequest): Promise<AIResponse> => {
        const routed = await executeCompanyAIChat(actor, { ...request, model: '' }, {
          profile: routingProfile,
          dataClassification,
          agentId: agent.id,
          ...(tenantDepartmentId ? { departmentId: tenantDepartmentId } : {}),
          ...(runId ? { runId } : {}),
          taskId,
          requestId: `${taskId}:model:${++modelCallSequence}`,
        });
        if (routed.fallbackUsed) {
          modelFallback = true;
          fallbackAttempts += Math.max(0, routed.attempts - 1);
          try {
            getEventBus().publish({
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'agent.task.self_healed',
              source: task.agentId,
              companyId: task.companyId,
              ...(task.userId && task.userId !== 'anonymous' ? { userId: task.userId } : {}),
              data: {
                taskId,
                agentId: task.agentId,
                profile: routingProfile,
                selectedModel: routed.response.model,
                attempts: routed.attempts,
                fallbackAttempts: routed.attempts - 1,
                latencyMs: Date.now() - startTime,
              },
              priority: 'high',
              timestamp: new Date(),
              correlationId: taskId,
            }).catch(() => {});
          } catch { /* Event delivery must not block an execution. */ }
        }
        return routed.response;
      };

      let aiResponse: AIResponse = await callCompanyModel(routerRequest);

      // If the model asked for tools, execute them and let it continue through
      // the exact same tenant policy, usage ledger, and bounded route fallback.
      let toolLoopSteps = 0;
      let toolResults: Array<{ toolName: string; ok: boolean; error?: string; blocked?: boolean; durationMs: number }> = [];
      let offeredTools: string[] = [];
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0 && toolSchemas.length > 0) {
        const loop = await runToolLoop({
          chat: (req) => callCompanyModel(req),
          request: routerRequest,
          initialResponse: aiResponse,
          agent: {
            agentId: agent.agentId,
            agentDbId: agent.id,
            name: agent.name,
            departmentId: tenantDepartmentId,
            allowedTools: employeePolicy ? JSON.stringify(effectiveAllowedTools) : agent.allowedTools,
            forbiddenTools: employeePolicy ? JSON.stringify([...forbiddenToolNames]) : agent.forbiddenTools,
          },
          context: {
            companyId: task.companyId,
            ...(task.userId ? { userId: task.userId } : {}),
            taskId,
            approvalId: task.approvalId ?? null,
          },
          tools: toolSchemas,
        });
        aiResponse = loop.response;
        toolLoopSteps = loop.steps;
        offeredTools = loop.offeredTools;
        toolResults = loop.toolResults.map((result) => ({
          toolName: result.toolName,
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
          ...(result.blocked ? { blocked: true } : {}),
          durationMs: result.durationMs,
        }));
      } else if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0 && toolSchemas.length === 0) {
        // The model tried to call a tool but this agent has none: strip the
        // calls so the empty content is not persisted as a silent success.
        aiResponse = {
          ...aiResponse,
          content:
            aiResponse.content?.trim() ||
            'This agent has no approved tools, so no tool call could be executed for this task.',
          toolCalls: [],
          finishReason: 'stop',
        };
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
          ...(modelFallback ? { modelFallback: true, fallbackAttempts, routingProfile } : {}),
          ...(toolLoopSteps > 0 ? { toolLoopSteps, offeredTools } : {}),
          toolResults,
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
          status: 'completed',
          completedAt: new Date(),
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
            toolLoopSteps,
            toolResults,
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
      if (error instanceof CompanyAIError && DEFERRED_ROUTING_CODES.has(error.code)) {
        task.error = {
          code: error.code,
          message: errorMessage,
          retryable: error.code !== 'EXTERNAL_DATA_NOT_AUTHORIZED' && error.code !== 'TOKEN_BUDGET_EXHAUSTED',
          attempts: 1,
          maxRetries: 3,
          lastAttemptAt: new Date(),
        };
        if (task.status === 'running') {
          this.stateManager.transition(taskId, 'paused', `Model routing deferred: ${error.code}`);
        }
        try {
          getEventBus().publish({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'agent.task.deferred',
            source: task.agentId,
            companyId: task.companyId,
            ...(task.userId && task.userId !== 'anonymous' ? { userId: task.userId } : {}),
            data: { taskId, agentId: task.agentId, code: error.code, requestId: error.requestId, message: errorMessage },
            priority: task.priority,
            timestamp: new Date(),
            correlationId: taskId,
          }).catch(() => {});
        } catch { /* Event delivery must not block safe deferral. */ }

        if (agentDbId) {
          await db.agentRun.create({
            data: {
              id: task.id,
              agentId: agentDbId,
              companyId: task.companyId,
              input: task.input,
              status: 'deferred',
              instanceId: task.instanceId,
              requestId: task.id,
              userId: task.userId,
              priority: task.priority,
              riskScore: task.riskScore,
              securityFlags: JSON.stringify(task.securityFlags ?? []),
              approvalId: task.approvalId,
              error: error.code,
              errorMessage,
              durationMs: latency,
              completedAt: new Date(),
            },
          }).catch(() => { /* Deferred status remains visible in memory if persistence is unavailable. */ });
        }
        await db.auditLog.create({
          data: {
            action: 'agent_execution_deferred',
            resource: task.agentId,
            details: JSON.stringify({ taskId, companyId: task.companyId, errorCode: error.code, requestId: error.requestId, latencyMs: latency }),
            ...(task.userId && task.userId !== 'anonymous' ? { userId: task.userId } : {}),
          },
        }).catch(() => {});
        return this.stateManager.getTask(taskId)!;
      }

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
    const configuredConcurrency = Number.parseInt(process.env.AGENT_RUNTIME_MAX_PARALLEL_TASKS ?? '4', 10);
    const maxParallelTasks = Math.max(1, Math.min(16, Number.isFinite(configuredConcurrency) ? configuredConcurrency : 4));

    while (this.processingTaskIds.size < maxParallelTasks) {
      const task = this.queue.dequeueEligible((candidate) =>
        candidate.status === 'ready' && this.stateManager.canExecute(candidate.agentId, candidate.companyId),
      );
      if (!task) return;

      // runTask acquires the company/agent slot synchronously before its first
      // await, so each dispatch reserves capacity before the next loop pass.
      this.processingTaskIds.add(task.id);
      void this.runTask(task.id)
        .catch((err) => console.error(`[AgentRuntime] Task ${task.id} error:`, err))
        .finally(() => { this.processingTaskIds.delete(task.id); });
    }
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
    if (error instanceof CompanyAIError) return error.code;
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
