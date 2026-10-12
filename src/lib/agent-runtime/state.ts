/**
 * Agent State Manager
 * Tracks agent task states with in-memory + DB-backed persistence.
 * Enforces valid state transitions and records state history.
 */

import { db } from '@/lib/db';
import type { AgentStatus, AgentTask, StateTransition, ResourceLimits, ResourceUsage } from './types';
import { isValidTransition, DEFAULT_RESOURCE_LIMITS } from './types';

class StateStore {
  private tasks = new Map<string, AgentTask>();
  private history: StateTransition[] = [];
  private resourceUsage = new Map<string, ResourceUsage>();
  private activeExecutions = new Map<string, number>(); // companyId -> count

  get(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  set(task: AgentTask): void {
    this.tasks.set(task.id, task);
  }

  delete(taskId: string): void {
    this.tasks.delete(taskId);
  }

  all(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  byAgent(agentId: string): AgentTask[] {
    return this.all().filter((t) => t.agentId === agentId);
  }

  byCompany(companyId: string): AgentTask[] {
    return this.all().filter((t) => t.companyId === companyId);
  }

  getHistory(taskId?: string): StateTransition[] {
    if (taskId) return this.history.filter((h) => h.taskId === taskId);
    return this.history;
  }

  recordTransition(transition: StateTransition): void {
    this.history.push(transition);
    // Keep last 10,000 transitions in memory
    if (this.history.length > 10_000) {
      this.history = this.history.slice(-5_000);
    }
  }

  incrementActive(companyId: string): void {
    const current = this.activeExecutions.get(companyId) ?? 0;
    this.activeExecutions.set(companyId, current + 1);
  }

  decrementActive(companyId: string): void {
    const current = this.activeExecutions.get(companyId) ?? 0;
    this.activeExecutions.set(companyId, Math.max(0, current - 1));
  }

  getActiveCount(companyId: string): number {
    return this.activeExecutions.get(companyId) ?? 0;
  }

  getResourceUsage(companyId: string): ResourceUsage {
    const base = this.resourceUsage.get(companyId) ?? {
      activeExecutions: 0,
      tokensThisMinute: 0,
      tokensToday: 0,
      queueDepth: 0,
    };
    return {
      ...base,
      activeExecutions: this.getActiveCount(companyId),
    };
  }

  addTokens(companyId: string, tokens: number): void {
    const current = this.resourceUsage.get(companyId) ?? {
      activeExecutions: 0, tokensThisMinute: 0, tokensToday: 0, queueDepth: 0,
    };
    current.tokensThisMinute += tokens;
    current.tokensToday += tokens;
    this.resourceUsage.set(companyId, current);
  }

  setResourceUsage(companyId: string, usage: ResourceUsage): void {
    this.resourceUsage.set(companyId, usage);
  }

  resetMinuteTokens(): void {
    for (const usage of this.resourceUsage.values()) {
      usage.tokensThisMinute = 0;
    }
  }

  resetDailyTokens(): void {
    for (const usage of this.resourceUsage.values()) {
      usage.tokensToday = 0;
    }
  }

  size(): number {
    return this.tasks.size;
  }
}

export class AgentStateManager {
  private store = new StateStore();
  private limits: ResourceLimits;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(limits?: Partial<ResourceLimits>) {
    this.limits = { ...DEFAULT_RESOURCE_LIMITS, ...limits };
    this.startCleanup();
  }

  /**
   * Transition a task from one state to another.
   * Throws if the transition is invalid.
   */
  transition(taskId: string, to: AgentStatus, reason: string): AgentTask {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    if (!isValidTransition(task.status, to)) {
      throw new Error(
        `Invalid state transition: ${task.status} → ${to} for task ${taskId}. Valid: [${[...(VALID_TRANSITIONS_MAP[task.status] ?? [])].join(', ')}]`,
      );
    }

    const from = task.status;
    task.status = to;
    task.updatedAt = new Date();

    if (to === 'running') task.startedAt = task.startedAt ?? new Date();
    if (to === 'completed' || to === 'failed' || to === 'timed_out') {
      task.completedAt = new Date();
      this.store.decrementActive(task.companyId);
    }

    this.store.recordTransition({
      from, to, taskId, agentId: task.agentId, reason, timestamp: new Date(),
    });

    this.store.set(task);

    // Persist terminal state transitions to DB
    if (to === 'completed' || to === 'failed' || to === 'timed_out') {
      this.updateAgentRunStatus(task).catch(() => {});
    }

    return task;
  }

  /** Create a new task in 'created' state */
  createTask(task: AgentTask): AgentTask {
    task.status = 'created';
    task.createdAt = new Date();
    task.updatedAt = new Date();
    this.store.set(task);
    return task;
  }

  /** Acquire an execution slot. Returns true if under limits. */
  acquireSlot(agentId: string, companyId: string): boolean {
    const activeByCompany = this.store.getActiveCount(companyId);
    if (activeByCompany >= this.limits.maxConcurrentPerCompany) return false;

    const agentActive = this.store.byAgent(agentId).filter(
      (t) => t.status === 'running' || t.status === 'waiting_approval',
    ).length;
    if (agentActive >= this.limits.maxConcurrentPerAgent) return false;

    this.store.incrementActive(companyId);
    return true;
  }

  /** Release an execution slot */
  releaseSlot(companyId: string): void {
    this.store.decrementActive(companyId);
  }

  /** Check if an agent can accept more work */
  canExecute(agentId: string, companyId: string): boolean {
    const usage = this.store.getResourceUsage(companyId);
    if (usage.activeExecutions >= this.limits.maxConcurrentPerCompany) return false;
    const agentRunning = this.store.byAgent(agentId).filter(
      (t) => t.status === 'running',
    ).length;
    if (agentRunning >= this.limits.maxConcurrentPerAgent) return false;
    return true;
  }

  /** Check token budget */
  checkTokenBudget(companyId: string, tokens: number): boolean {
    const usage = this.store.getResourceUsage(companyId);
    return (usage.tokensThisMinute + tokens) <= this.limits.maxTokensPerMinute &&
           (usage.tokensToday + tokens) <= this.limits.maxTokensPerDay;
  }

  /** Record token usage */
  recordTokens(companyId: string, tokens: number): void {
    this.store.addTokens(companyId, tokens);
  }

  // ─── Query methods ──────────────────────────────────────────────

  getTask(taskId: string): AgentTask | undefined {
    return this.store.get(taskId);
  }

  getTasksByAgent(agentId: string): AgentTask[] {
    return this.store.byAgent(agentId);
  }

  getTasksByCompany(companyId: string): AgentTask[] {
    return this.store.byCompany(companyId);
  }

  getActiveTasks(): AgentTask[] {
    return this.store.all().filter(
      (t) => t.status === 'running' || t.status === 'waiting_approval',
    );
  }

  getOverdueTasks(): AgentTask[] {
    const now = Date.now();
    return this.store.all().filter(
      (t) =>
        t.status === 'running' &&
        t.timeoutMs &&
        t.startedAt &&
        now - t.startedAt.getTime() > t.timeoutMs,
    );
  }

  getStateHistory(taskId?: string): StateTransition[] {
    return this.store.getHistory(taskId);
  }

  getResourceUsage(companyId: string): ResourceUsage {
    return this.store.getResourceUsage(companyId);
  }

  getAllResourceUsage(): Record<string, ResourceUsage> {
    const result: Record<string, ResourceUsage> = {};
    for (const task of this.store.all()) {
      if (!result[task.companyId]) {
        result[task.companyId] = this.store.getResourceUsage(task.companyId);
      }
    }
    return result;
  }

  // ─── Persistence Methods ──────────────────────────────────────

  /**
   * Recover incomplete tasks from DB on startup.
   * Loads AgentRun rows with status 'running' or 'waiting_approval' and
   * reconstructs in-memory AgentTask objects for crash recovery.
   */
  async recoverTasks(): Promise<AgentTask[]> {
    if (this.initialized) return [];

    try {
      const incompleteRuns = await db.agentRun.findMany({
        where: {
          status: { in: ['running', 'waiting_approval'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      const recovered: AgentTask[] = [];
      for (const run of incompleteRuns) {
        // Skip if already in memory
        if (this.store.get(run.id)) continue;

        let input: string = run.input;
        try {
          // input is stored as JSON string; try to parse for the raw input
          const parsed = JSON.parse(run.input);
          if (typeof parsed === 'string') input = parsed;
          else if (parsed.input) input = parsed.input;
        } catch {
          // keep raw string
        }

        const task: AgentTask = {
          id: run.id,
          agentId: run.agentId,
          companyId: run.companyId,
          userId: '', // Not stored in AgentRun; will be empty for recovered tasks
          tier: 'worker',
          priority: 'normal',
          riskLevel: 'low',
          status: run.status as AgentStatus,
          mode: 'async',
          input,
          maxTokens: undefined,
          timeoutMs: undefined,
          tokenUsage: run.tokensUsed ? {
            promptTokens: 0,
            completionTokens: run.tokensUsed,
            totalTokens: run.tokensUsed,
            costUsd: 0,
          } : undefined,
          createdAt: run.createdAt,
          updatedAt: run.createdAt,
          startedAt: run.createdAt,
        };

        this.store.set(task);
        recovered.push(task);
      }

      // Rebuild active execution counts from recovered tasks
      for (const task of recovered) {
        if (task.status === 'running' || task.status === 'waiting_approval') {
          this.store.incrementActive(task.companyId);
        }
      }

      this.initialized = true;
      return recovered;
    } catch (err) {
      console.warn('[StateManager] Failed to recover tasks from DB:', err);
      this.initialized = true;
      return [];
    }
  }

  /**
   * Persist currently active (running/waiting_approval) tasks to DB.
   * Called periodically or on graceful shutdown for crash recovery.
   */
  async persistActiveTasks(): Promise<number> {
    const activeTasks = this.getActiveTasks();
    if (activeTasks.length === 0) return 0;

    let persisted = 0;
    try {
      await Promise.all(
        activeTasks.map(async (task) => {
          await db.agentRun.upsert({
            where: { id: task.id },
            update: {
              status: task.status,
              latencyMs: task.startedAt
                ? Date.now() - task.startedAt.getTime()
                : null,
              tokensUsed: task.tokenUsage?.totalTokens ?? 0,
            },
            create: {
              id: task.id,
              agentId: task.agentId,
              agentName: undefined,
              status: task.status,
              input: typeof task.input === 'string' ? task.input : JSON.stringify(task.input),
              companyId: task.companyId,
              tokensUsed: task.tokenUsage?.totalTokens ?? 0,
            },
          });
          persisted++;
        }),
      );
    } catch (err) {
      console.warn('[StateManager] Failed to persist active tasks:', err);
    }
    return persisted;
  }

  /**
   * Persist current resource usage counters to the Settings table.
   * Stores per-company token counts as JSON for crash recovery.
   */
  async persistResourceUsage(): Promise<void> {
    const allUsage = this.getAllResourceUsage();
    if (Object.keys(allUsage).length === 0) return;

    try {
      const payload = JSON.stringify(allUsage);
      await db.settings.upsert({
        where: { key: 'agent_runtime_resource_usage' },
        update: { value: payload, type: 'json' },
        create: { key: 'agent_runtime_resource_usage', value: payload, type: 'json' },
      });
    } catch (err) {
      console.warn('[StateManager] Failed to persist resource usage:', err);
    }
  }

  /**
   * Load previously persisted resource usage counters from the Settings table.
   * Called on startup to restore token counters after a crash.
   */
  async loadResourceUsage(): Promise<void> {
    try {
      const row = await db.settings.findUnique({
        where: { key: 'agent_runtime_resource_usage' },
      });
      if (!row) return;

      const parsed = JSON.parse(row.value) as Record<string, ResourceUsage>;
      for (const [companyId, usage] of Object.entries(parsed)) {
        // Only restore daily token count (minute counters are ephemeral)
        this.store.setResourceUsage(companyId, {
          activeExecutions: 0, // will be rebuilt from recovered tasks
          tokensThisMinute: 0, // ephemeral — reset on restart
          tokensToday: usage.tokensToday ?? 0,
          queueDepth: usage.queueDepth ?? 0,
        });
      }
    } catch (err) {
      console.warn('[StateManager] Failed to load resource usage from DB:', err);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private startCleanup(): void {
    // Reset per-minute counters every 60s
    this.cleanupTimer = setInterval(() => {
      this.store.resetMinuteTokens();
    }, 60_000);
  }

  /**
   * Update the AgentRun row status in DB when a task reaches a terminal state.
   * Fire-and-forget.
   */
  private async updateAgentRunStatus(task: AgentTask): Promise<void> {
    try {
      await db.agentRun.updateMany({
        where: { id: task.id, status: { in: ['running', 'waiting_approval'] } },
        data: {
          status: task.status,
          completedAt: task.completedAt ?? new Date(),
          durationMs: task.startedAt && task.completedAt
            ? task.completedAt.getTime() - task.startedAt.getTime()
            : null,
          tokensUsed: task.tokenUsage?.totalTokens ?? 0,
        },
      });
    } catch (err) {
      console.warn(`[StateManager] Failed to update AgentRun status for ${task.id}:`, err);
    }
  }
}

// Needed for the transition error message
const VALID_TRANSITIONS_MAP: Record<string, string[]> = {
  created: ['initializing', 'ready', 'running', 'archived'],
  initializing: ['ready', 'running', 'failed', 'archived'],
  ready: ['running', 'degraded', 'archived'],
  running: ['completed', 'failed', 'timed_out', 'waiting_approval', 'paused', 'degraded'],
  degraded: ['running', 'ready', 'failed', 'archived'],
  waiting_approval: ['running', 'completed', 'failed'],
  paused: ['running', 'failed', 'archived'],
  completed: ['archived'],
  failed: ['ready', 'archived'],
  timed_out: ['ready', 'archived'],
  archived: [],
};

// Singleton
let _instance: AgentStateManager | null = null;
export function getAgentStateManager(limits?: Partial<ResourceLimits>): AgentStateManager {
  if (!_instance) _instance = new AgentStateManager(limits);
  return _instance;
}