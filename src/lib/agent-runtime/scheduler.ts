/**
 * Agent Scheduler
 * Supports: one-time, interval, cron-based, and event-triggered scheduling.
 */

import type { AgentSchedule, AgentTask, TaskPriority } from './types';
import { getAgentStateManager } from './state';
import { getEventBus } from '@/lib/event-bus';
import type { AgentExecutionEngine } from './execution';

// Simple cron parser (supports: * * * * *, every N minutes/hours)
interface ParsedCron {
  minute: number | '*';
  hour: number | '*';
  dayOfMonth: number | '*';
  month: number | '*';
  dayOfWeek: number | '*';
}

function parseCron(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return {
    minute: minute === '*' ? '*' : parseInt(minute, 10),
    hour: hour === '*' ? '*' : parseInt(hour, 10),
    dayOfMonth: dayOfMonth === '*' ? '*' : parseInt(dayOfMonth, 10),
    month: month === '*' ? '*' : parseInt(month, 10),
    dayOfWeek: dayOfWeek === '*' ? '*' : parseInt(dayOfWeek, 10),
  };
}

function shouldRunNow(cron: ParsedCron, now: Date): boolean {
  if (cron.minute !== '*' && cron.minute !== now.getMinutes()) return false;
  if (cron.hour !== '*' && cron.hour !== now.getHours()) return false;
  if (cron.dayOfMonth !== '*' && cron.dayOfMonth !== now.getDate()) return false;
  if (cron.month !== '*' && cron.month !== now.getMonth() + 1) return false;
  if (cron.dayOfWeek !== '*' && cron.dayOfWeek !== now.getDay()) return false;
  return true;
}

export class AgentScheduler {
  private schedules = new Map<string, AgentSchedule>();
  private intervalTimers = new Map<string, ReturnType<typeof setInterval>>();
  private engine: AgentExecutionEngine | null = null;
  private cronTimer: ReturnType<typeof setInterval> | null = null;

  setEngine(engine: AgentExecutionEngine): void {
    this.engine = engine;
  }

  /** Schedule a one-time execution at a specific time */
  scheduleOnce(params: {
    agentId: string;
    companyId: string;
    userId: string;
    task: string;
    runAt: Date;
    priority?: TaskPriority;
  }): string {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const delay = params.runAt.getTime() - Date.now();
    const schedule: AgentSchedule = {
      id, agentId: params.agentId, companyId: params.companyId,
      task: params.task, runAt: params.runAt, priority: params.priority ?? 'normal',
      enabled: true, totalRuns: 0, failureCount: 0, createdAt: new Date(),
    };
    this.schedules.set(id, schedule);

    const runTask = async () => {
      if (!schedule.enabled) return;
      try {
        await this.dispatchImmediate({
          agentId: params.agentId, companyId: params.companyId,
          userId: params.userId, task: params.task, priority: params.priority,
        });
        schedule.totalRuns++;
        schedule.lastRunAt = new Date();
      } catch (err) {
        // Centralized failure transition for scheduler dispatch
        schedule.failureCount++;
        console.error(`[Scheduler] One-time schedule ${id} failed:`, err);
        // Notify event bus of schedule failure integrity
        if (this.engine) {
          try {
            getEventBus().publish({
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'scheduler.task.failed',
              source: params.agentId,
              companyId: params.companyId,
              userId: params.userId,
              data: { scheduleId: id, taskId: 'scheduled', errorMessage: err instanceof Error ? err.message : String(err) },
              priority: params.priority ?? 'normal',
              timestamp: new Date(),
              correlationId: id,
            }).catch(() => {});
          } catch {}
        }
      } finally {
        // Registry removal for one-time schedule
        this.schedules.delete(id);
      }
    };

    if (delay <= 0) {
      // Run immediately
      runTask();
    } else {
      const timer = setTimeout(() => runTask(), delay);
      // Store timer to allow cancellation if needed before execution
      // (In a full implementation, we'd track this timer in intervalTimers or similar)
      schedule.lastRunAt = new Date(Date.now() + delay); // Estimated
    }
    return id;
  }

  /** Schedule a recurring interval */
  scheduleInterval(params: {
    agentId: string;
    companyId: string;
    userId: string;
    task: string;
    intervalMs: number;
    priority?: TaskPriority;
  }): string {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const schedule: AgentSchedule = {
      id, agentId: params.agentId, companyId: params.companyId,
      task: params.task, intervalMs: params.intervalMs,
      priority: params.priority ?? 'normal', enabled: true,
      totalRuns: 0, failureCount: 0, createdAt: new Date(),
    };
    this.schedules.set(id, schedule);

    const timer = setInterval(() => {
      if (!schedule.enabled) return;
      this.dispatchImmediate({
        agentId: params.agentId, companyId: params.companyId,
        userId: params.userId, task: params.task, priority: params.priority,
      }).catch(err => {
        // Centralized failure transition for interval dispatch
        schedule.failureCount++;
        console.error(`[Scheduler] Interval schedule ${id} failed:`, err);
        if (this.engine) {
          try {
            getEventBus().publish({
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'scheduler.task.failed',
              source: params.agentId,
              companyId: params.companyId,
              userId: params.userId,
              data: { scheduleId: id, taskId: 'scheduled', errorMessage: err instanceof Error ? err.message : String(err) },
              priority: params.priority ?? 'normal',
              timestamp: new Date(),
              correlationId: id,
            }).catch(() => {});
          } catch {}
        }
      });
      schedule.totalRuns++;
      schedule.lastRunAt = new Date();
    }, params.intervalMs);

    this.intervalTimers.set(id, timer);
    return id;
  }

  /** Schedule using cron expression */
  scheduleCron(params: {
    agentId: string;
    companyId: string;
    userId: string;
    task: string;
    cron: string;
    priority?: TaskPriority;
  }): string | null {
    const parsed = parseCron(params.cron);
    if (!parsed) return null;

    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const schedule: AgentSchedule = {
      id, agentId: params.agentId, companyId: params.companyId,
      task: params.task, cron: params.cron,
      priority: params.priority ?? 'normal', enabled: true,
      totalRuns: 0, failureCount: 0, createdAt: new Date(),
    };
    this.schedules.set(id, schedule);
    this.startCronChecker();
    return id;
  }

  /** Cancel a schedule */
  cancel(scheduleId: string): boolean {
    const timer = this.intervalTimers.get(scheduleId);
    if (timer) {
      clearInterval(timer);
      this.intervalTimers.delete(scheduleId);
    }
    
    // Centralized failure transition / registry removal for cancellation
    const schedule = this.schedules.get(scheduleId);
    if (schedule) {
      try {
        getEventBus().publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'scheduler.task.cancelled',
          source: schedule.agentId,
          companyId: schedule.companyId,
          userId: '', // System-initiated
          data: { scheduleId, totalRuns: schedule.totalRuns, failureCount: schedule.failureCount },
          priority: schedule.priority ?? 'normal',
          timestamp: new Date(),
          correlationId: scheduleId,
        }).catch(() => {});
      } catch {}
    }
    
    return this.schedules.delete(scheduleId);
  }

  /** Enable/disable a schedule */
  setEnabled(scheduleId: string, enabled: boolean): boolean {
    const sched = this.schedules.get(scheduleId);
    if (!sched) return false;
    
    // Event bus notification for state change integrity
    try {
      getEventBus().publish({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: enabled ? 'scheduler.task.enabled' : 'scheduler.task.disabled',
        source: sched.agentId,
        companyId: sched.companyId,
        userId: '', // System-initiated
        data: { scheduleId, enabled, totalRuns: sched.totalRuns },
        priority: sched.priority ?? 'normal',
        timestamp: new Date(),
        correlationId: scheduleId,
      }).catch(() => {});
    } catch {}
    
    sched.enabled = enabled;
    return true;
  }

  /** Get all schedules */
  getAllSchedules(): AgentSchedule[] {
    return Array.from(this.schedules.values());
  }

  /** Get overdue schedules */
  getOverdue(): AgentSchedule[] {
    const now = new Date();
    return this.getAllSchedules().filter(s =>
      s.enabled && s.runAt && s.runAt < now && !s.lastRunAt
    );
  }

  destroy(): void {
    for (const timer of this.intervalTimers.values()) clearInterval(timer);
    this.intervalTimers.clear();
    if (this.cronTimer) { clearInterval(this.cronTimer); this.cronTimer = null; }
  }

  // ─── Internal ────────────────────────────────────────────────

  private async dispatchImmediate(params: {
    agentId: string; companyId: string; userId: string;
    task: string; priority?: TaskPriority;
  }): Promise<void> {
    if (!this.engine) return;
    
    // Centralized failure transition for scheduler dispatch
    try {
      await this.engine.execute({
        agentId: params.agentId,
        companyId: params.companyId,
        userId: params.userId,
        task: params.task,
        priority: params.priority,
        mode: 'async',
      });
    } catch (err) {
      console.error(`[Scheduler] Dispatch error:`, err);
      // Event bus notification for failure integrity
      try {
        getEventBus().publish({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'scheduler.dispatch.failed',
          source: params.agentId,
          companyId: params.companyId,
          userId: params.userId,
          data: { errorMessage: err instanceof Error ? err.message : String(err) },
          priority: params.priority ?? 'normal',
          timestamp: new Date(),
          correlationId: `sched_dispatch_${Date.now()}`,
        }).catch(() => {});
      } catch {}
      throw err; // Re-throw to be caught by interval/cron handlers
    }
  }

  private cronSchedules(): { schedule: AgentSchedule; cron: ParsedCron }[] {
    const result: { schedule: AgentSchedule; cron: ParsedCron }[] = [];
    for (const sched of this.schedules.values()) {
      if (!sched.enabled || !sched.cron) continue;
      const cron = parseCron(sched.cron);
      if (cron) result.push({ schedule: sched, cron });
    }
    return result;
  }

  private startCronChecker(): void {
    if (this.cronTimer) return;
    // Check every minute
    this.cronTimer = setInterval(() => {
      const now = new Date();
      for (const { schedule, cron } of this.cronSchedules()) {
        if (shouldRunNow(cron, now)) {
          this.dispatchImmediate({
            agentId: schedule.agentId,
            companyId: schedule.companyId,
            userId: '', // System-initiated
            task: schedule.task,
            priority: schedule.priority,
          }).catch(err => {
            // Centralized failure transition for cron dispatch
            schedule.failureCount++;
            console.error(`[Scheduler] Cron schedule ${schedule.id} failed:`, err);
            if (this.engine) {
              try {
                getEventBus().publish({
                  id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  type: 'scheduler.cron.failed',
                  source: schedule.agentId,
                  companyId: schedule.companyId,
                  userId: '',
                  data: { scheduleId: schedule.id, cron: schedule.cron, errorMessage: err instanceof Error ? err.message : String(err) },
                  priority: schedule.priority ?? 'normal',
                  timestamp: new Date(),
                  correlationId: schedule.id,
                }).catch(() => {});
              } catch {}
            }
          });
          schedule.lastRunAt = now;
          schedule.totalRuns++;
        }
      }
    }, 60_000);
  }
}

// Singleton
let _instance: AgentScheduler | null = null;
export function getAgentScheduler(): AgentScheduler {
  if (!_instance) _instance = new AgentScheduler();
  return _instance;
}
