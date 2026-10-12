/**
 * Self-Healing System
 * Auto-recovery, retry with backoff, rollback, and service recovery.
 */

import type { AgentStatus } from '@/lib/agent-runtime';
import { getAgentStateManager } from '@/lib/agent-runtime/state';
import { getAgentHealthMonitor } from '@/lib/agent-runtime/health';
import { getLifecycleManager } from '@/lib/agent-runtime/lifecycle';
import { getEventBus, EventTypes } from '@/lib/event-bus';

interface RecoveryAttempt {
  id: string;
  targetId: string;
  targetType: 'agent' | 'service' | 'queue' | 'workflow';
  strategy: 'retry' | 'restart' | 'rollback' | 'escalate';
  attemptNumber: number;
  maxAttempts: number;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'escalated';
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export class SelfHealingEngine {
  private attempts = new Map<string, RecoveryAttempt>();
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private maxRetryDelay = 60_000;

  start(): void {
    if (this.monitorTimer) return;
    // Check every 30 seconds for unhealthy agents
    this.monitorTimer = setInterval(() => this.checkAndRecover(), 30_000);
  }

  stop(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /** Manually trigger recovery for a target */
  async recover(params: {
    targetId: string;
    targetType: 'agent' | 'service' | 'queue' | 'workflow';
    strategy?: 'retry' | 'restart' | 'rollback' | 'escalate';
    error?: string;
  }): Promise<RecoveryAttempt> {
    const id = `recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const attempt: RecoveryAttempt = {
      id,
      targetId: params.targetId,
      targetType: params.targetType,
      strategy: params.strategy ?? this.determineStrategy(params.targetType),
      attemptNumber: this.countPreviousAttempts(params.targetId) + 1,
      maxAttempts: 3,
      status: 'pending',
      error: params.error,
      createdAt: new Date(),
    };

    this.attempts.set(id, attempt);
    return this.executeRecovery(id);
  }

  /** Get recovery history */
  getHistory(targetId?: string): RecoveryAttempt[] {
    const all = Array.from(this.attempts.values());
    if (targetId) return all.filter(a => a.targetId === targetId);
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Get recovery stats */
  getStats() {
    const all = this.getHistory();
    return {
      total: all.length,
      successful: all.filter(a => a.status === 'success').length,
      failed: all.filter(a => a.status === 'failed' || a.status === 'escalated').length,
      pending: all.filter(a => a.status === 'pending' || a.status === 'in_progress').length,
      byStrategy: {
        retry: all.filter(a => a.strategy === 'retry' && a.status === 'success').length,
        restart: all.filter(a => a.strategy === 'restart' && a.status === 'success').length,
        rollback: all.filter(a => a.strategy === 'rollback' && a.status === 'success').length,
        escalate: all.filter(a => a.strategy === 'escalate').length,
      },
    };
  }

  // ─── Internal ─────────────────────────────────────────────

  private async executeRecovery(id: string): Promise<RecoveryAttempt> {
    const attempt = this.attempts.get(id);
    if (!attempt) throw new Error(`Recovery attempt ${id} not found`);

    attempt.status = 'in_progress';
    attempt.startedAt = new Date();

    try {
      switch (attempt.strategy) {
        case 'retry':
          await this.executeRetry(attempt);
          break;
        case 'restart':
          await this.executeRestart(attempt);
          break;
        case 'rollback':
          await this.executeRollback(attempt);
          break;
        case 'escalate':
          this.executeEscalate(attempt);
          break;
      }
      attempt.status = (attempt.status as string) === 'escalated' ? 'escalated' : 'success';
    } catch (err) {
      attempt.status = 'failed';
      attempt.error = err instanceof Error ? err.message : String(err);
    } finally {
      attempt.completedAt = new Date();
    }

    // Emit event
    try {
      const bus = getEventBus();
      await bus.publish({
        id: `evt_${Date.now()}`,
        type: attempt.status === 'success' ? EventTypes.SYSTEM_RECOVERY : EventTypes.SYSTEM_ERROR,
        source: 'self-healing',
        companyId: '',
        data: {
          recoveryId: id, targetId: attempt.targetId,
          strategy: attempt.strategy, status: attempt.status,
        },
        priority: 'normal',
        timestamp: new Date(),
      });
    } catch {}

    return attempt;
  }

  private async executeRetry(attempt: RecoveryAttempt): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt.attemptNumber - 1), this.maxRetryDelay);
    await new Promise(resolve => setTimeout(resolve, delay));

    const stateManager = getAgentStateManager();
    const failedTasks = stateManager.getTasksByAgent(attempt.targetId)
      .filter(t => t.status === 'failed' && t.error?.retryable);

    for (const task of failedTasks.slice(0, 5)) {
      try {
        stateManager.transition(task.id, 'ready', `Self-healing retry #${attempt.attemptNumber}`);
      } catch { /* may not be valid from failed */ }
    }
  }

  private async executeRestart(attempt: RecoveryAttempt): Promise<void> {
    const lifecycle = getLifecycleManager();
    if (lifecycle.shouldAutoRestart(attempt.targetId)) {
      lifecycle.recordRestart(attempt.targetId);
      try {
        await lifecycle.initializeAgent(attempt.targetId);
      } catch { /* agent may not be in DB */ }
    }
  }

  private async executeRollback(attempt: RecoveryAttempt): Promise<void> {
    const lifecycle = getLifecycleManager();
    // Get the latest non-active version
    try {
      const { db } = await import('@/lib/db');
      const lastVersion = await db.agentVersion.findFirst({
        where: { agentId: attempt.targetId },
        orderBy: { version: 'desc' },
      });
      if (lastVersion) {
        await lifecycle.rollback(attempt.targetId, lastVersion.version);
      }
    } catch {}
  }

  private executeEscalate(attempt: RecoveryAttempt): void {
    attempt.status = 'escalated';
    console.warn(
      `[SelfHealing] ESCALATED: Target ${attempt.targetId} (${attempt.targetType}) ` +
      `could not be auto-recovered after ${attempt.attemptNumber} attempts. Manual intervention required.`
    );
  }

  private determineStrategy(targetType: string): 'retry' | 'restart' | 'rollback' | 'escalate' {
    switch (targetType) {
      case 'agent': return 'restart';
      case 'service': return 'restart';
      case 'queue': return 'retry';
      case 'workflow': return 'rollback';
      default: return 'retry';
    }
  }

  private countPreviousAttempts(targetId: string): number {
    return this.getHistory(targetId).length;
  }

  private async checkAndRecover(): Promise<void> {
    const monitor = getAgentHealthMonitor();
    const unhealthy = monitor.getUnhealthyAgents();

    for (const agent of unhealthy) {
      const recentRecoveries = this.getHistory(agent.agentId)
        .filter(r => r.createdAt.getTime() > Date.now() - 300_000); // last 5 min
      if (recentRecoveries.length > 0) continue; // already recovering

      await this.recover({
        targetId: agent.agentId,
        targetType: 'agent',
        error: `Health score ${agent.healthScore}, ${agent.consecutiveFailures} consecutive failures`,
      }).catch(err => console.error(`[SelfHealing] Auto-recovery failed for ${agent.agentId}:`, err));
    }
  }
}

// Singleton
let _instance: SelfHealingEngine | null = null;
export function getSelfHealingEngine(): SelfHealingEngine {
  if (!_instance) {
    _instance = new SelfHealingEngine();
    _instance.start();
  }
  return _instance;
}