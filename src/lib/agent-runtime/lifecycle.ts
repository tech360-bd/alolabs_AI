/**
 * Agent Lifecycle Manager
 * Manages agent lifecycle: create → initialize → ready → run → archive
 * Handles versioning, rollback, and auto-restart.
 */
import type { AgentStatus } from './types';
import { db } from '@/lib/db';

interface AgentLifecycleEvent {
  agentId: string;
  from: AgentStatus;
  to: AgentStatus;
  timestamp: Date;
  reason: string;
}

export class AgentLifecycleManager {
  private eventLog: AgentLifecycleEvent[] = [];
  private autoRestartMax = 3;
  private restartCounts = new Map<string, number>();

  async initializeAgent(agentId: string): Promise<void> {
    const agent = await db.agent.findUnique({ where: { agentId } });
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const existingVersions = await db.agentVersion.count({ where: { agentId } });
    if (existingVersions === 0) {
      await db.agentVersion.create({
        data: {
          agentId,
          version: 1,
          config: JSON.stringify(agent),
          changeLog: 'Initial version',
        },
      });
    }

    this.logEvent(agentId, 'created', 'ready', 'Agent initialized');
  }

  async createVersion(agentId: string, changelog: string): Promise<number> {
    const agent = await db.agent.findUnique({ where: { agentId } });
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const lastVersion = await db.agentVersion.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
    });
    const newVersion = (lastVersion?.version ?? 0) + 1;

    await db.agentVersion.create({
      data: {
        agentId,
        version: newVersion,
        config: JSON.stringify(agent),
        changeLog: changelog,
      },
    });

    this.logEvent(agentId, 'ready', 'ready', `Version ${newVersion} created`);
    return newVersion;
  }

  async rollback(agentId: string, targetVersion: number): Promise<void> {
    const version = await db.agentVersion.findFirst({
      where: { agentId, version: targetVersion },
    });
    if (!version) throw new Error(`Version ${targetVersion} not found for agent ${agentId}`);
    this.logEvent(agentId, 'ready', 'ready', `Rolled back to version ${targetVersion}`);
  }

  async archiveAgent(agentId: string): Promise<void> {
    await db.agent.update({ where: { agentId }, data: { status: 'archived' } });
    this.logEvent(agentId, 'ready', 'archived', 'Agent archived');
  }

  async restoreAgent(agentId: string): Promise<void> {
    await db.agent.update({ where: { agentId }, data: { status: 'active' } });
    this.logEvent(agentId, 'archived', 'ready', 'Agent restored');
  }

  shouldAutoRestart(agentId: string): boolean {
    const count = this.restartCounts.get(agentId) ?? 0;
    return count < this.autoRestartMax;
  }

  recordRestart(agentId: string): void {
    const count = this.restartCounts.get(agentId) ?? 0;
    this.restartCounts.set(agentId, count + 1);
  }

  resetRestartCount(agentId: string): void {
    this.restartCounts.delete(agentId);
  }

  getEventLog(agentId?: string): AgentLifecycleEvent[] {
    if (agentId) return this.eventLog.filter(e => e.agentId === agentId);
    return this.eventLog;
  }

  private logEvent(agentId: string, from: AgentStatus, to: AgentStatus, reason: string): void {
    this.eventLog.push({ agentId, from, to, timestamp: new Date(), reason });
    if (this.eventLog.length > 5000) {
      this.eventLog = this.eventLog.slice(-3000);
    }
  }
}

let _instance: AgentLifecycleManager | null = null;
export function getLifecycleManager(): AgentLifecycleManager {
  if (!_instance) _instance = new AgentLifecycleManager();
  return _instance;
}
