/**
 * Agent Health Monitor
 * Tracks execution metrics and computes health scores for each agent.
 * Uses hybrid in-memory cache + DB persistence for crash recovery.
 *
 * Identity model
 * ──────────────
 * Callers (the runtime, APIs) address agents by their business key
 * `Agent.agentId` (e.g. "ceo-agent"). The database rows `AgentHealth.agentId`
 * and `AgentRun.agentId` are foreign keys to the primary key `Agent.id`
 * (a cuid). Before 2026-10 this module wrote the business key straight into
 * the FK column, which produced orphan AgentHealth rows that referenced no
 * Agent. Every DB access now goes through `resolveAgent()`, which maps either
 * identifier to the canonical pair and refuses to persist for unknown agents.
 */

import { db } from '@/lib/db';
import type { AgentHealthSnapshot } from './types';

export interface ResolvedAgentIdentity {
  /** Primary key (Agent.id) — what FK columns must contain. */
  id: string;
  /** Business key (Agent.agentId) — what callers use. */
  agentId: string;
}

const identityCache = new Map<string, ResolvedAgentIdentity | null>();

/**
 * Resolve an agent by business key OR primary key. Results (including misses)
 * are cached per process; call `clearAgentIdentityCache()` after renaming or
 * deleting agents in tests.
 */
export async function resolveAgent(key: string): Promise<ResolvedAgentIdentity | null> {
  if (!key) return null;
  if (identityCache.has(key)) return identityCache.get(key) ?? null;
  const agent = await db.agent.findFirst({
    where: { OR: [{ agentId: key }, { id: key }] },
    select: { id: true, agentId: true },
  });
  const resolved = agent ? { id: agent.id, agentId: agent.agentId } : null;
  identityCache.set(key, resolved);
  if (resolved) {
    identityCache.set(resolved.id, resolved);
    identityCache.set(resolved.agentId, resolved);
  }
  return resolved;
}

export function clearAgentIdentityCache(): void {
  identityCache.clear();
}

interface HealthRecord {
  agentId: string;
  successCount: number;
  failCount: number;
  totalLatencyMs: number;
  recentLatencies: number[];  // last 100
  recentResults: boolean[];   // last 100: true=success
  lastExecutionAt: Date | null;
  lastErrorAt: Date | null;
  consecutiveFailures: number;
  lastError?: string;
}

class HealthStore {
  private records = new Map<string, HealthRecord>();
  private maxHistory = 100;
  private dbLoaded = new Set<string>(); // track which agents have been loaded from DB

  get(agentId: string): HealthRecord | undefined {
    return this.records.get(agentId);
  }

  getOrCreate(agentId: string): HealthRecord {
    let rec = this.records.get(agentId);
    if (!rec) {
      rec = {
        agentId,
        successCount: 0, failCount: 0, totalLatencyMs: 0,
        recentLatencies: [], recentResults: [],
        lastExecutionAt: null, lastErrorAt: null,
        consecutiveFailures: 0,
      };
      this.records.set(agentId, rec);
    }
    return rec;
  }

  set(agentId: string, rec: HealthRecord): void {
    this.records.set(agentId, rec);
    this.dbLoaded.add(agentId);
  }

  markLoaded(agentId: string): void {
    this.dbLoaded.add(agentId);
  }

  isLoaded(agentId: string): boolean {
    return this.dbLoaded.has(agentId);
  }

  recordSuccess(agentId: string, latencyMs: number): void {
    const rec = this.getOrCreate(agentId);
    rec.successCount++;
    rec.totalLatencyMs += latencyMs;
    rec.recentLatencies.push(latencyMs);
    if (rec.recentLatencies.length > this.maxHistory) rec.recentLatencies.shift();
    rec.recentResults.push(true);
    if (rec.recentResults.length > this.maxHistory) rec.recentResults.shift();
    rec.lastExecutionAt = new Date();
    rec.consecutiveFailures = 0;
  }

  recordFailure(agentId: string, latencyMs: number, error?: string): void {
    const rec = this.getOrCreate(agentId);
    rec.failCount++;
    rec.totalLatencyMs += latencyMs;
    rec.recentLatencies.push(latencyMs);
    if (rec.recentLatencies.length > this.maxHistory) rec.recentLatencies.shift();
    rec.recentResults.push(false);
    if (rec.recentResults.length > this.maxHistory) rec.recentResults.shift();
    rec.lastExecutionAt = new Date();
    rec.lastErrorAt = new Date();
    rec.consecutiveFailures++;
    if (error) rec.lastError = error;
  }

  all(): HealthRecord[] {
    return Array.from(this.records.values());
  }

  clear(agentId: string): void {
    this.records.delete(agentId);
    this.dbLoaded.delete(agentId);
  }
}

export class AgentHealthMonitor {
  private store = new HealthStore();
  private initialized = false;

  /** Record a successful execution */
  recordSuccess(agentId: string, latencyMs: number): void {
    this.store.recordSuccess(agentId, latencyMs);
    void this.upsertAgentHealthDB(agentId);
  }

  /** Record a failed execution */
  recordFailure(agentId: string, latencyMs: number, error?: string): void {
    this.store.recordFailure(agentId, latencyMs, error);
    void this.upsertAgentHealthDB(agentId);
  }

  /** Get health snapshot for a specific agent */
  getHealth(agentId: string): AgentHealthSnapshot {
    const rec = this.store.get(agentId);
    if (!rec) {
      // Not in memory — try computing from AgentRun table (lazy DB load)
      if (!this.store.isLoaded(agentId)) {
        this.loadHealthFromDB(agentId);
        const loaded = this.store.get(agentId);
        if (loaded) return this.computeSnapshot(loaded);
      }
      return {
        agentId, status: 'ready', healthScore: 100,
        successRate: 1, avgLatencyMs: 0, errorRate: 0,
        totalExecutions: 0, consecutiveFailures: 0, isDegraded: false,
      };
    }
    return this.computeSnapshot(rec);
  }

  /** Get health for all agents */
  getAllHealth(): AgentHealthSnapshot[] {
    // Ensure all DB-known agents are loaded
    if (!this.initialized) {
      this.load();
    }
    const knownIds = new Set<string>();
    for (const rec of this.store.all()) knownIds.add(rec.agentId);
    return Array.from(knownIds).map(id => this.getHealth(id));
  }

  /** Get only degraded or failing agents */
  getUnhealthyAgents(): AgentHealthSnapshot[] {
    return this.getAllHealth().filter(h => h.isDegraded || h.consecutiveFailures >= 3);
  }

  /** Reset health data for an agent */
  resetHealth(agentId: string): void {
    this.store.clear(agentId);
  }

  // ─── Persistence Methods ──────────────────────────────────────

  /**
   * Load all health records from DB into memory.
   * Called on startup for crash recovery.
   */
  async load(): Promise<void> {
    try {
      // Load from AgentHealth table for consecutiveFailures and status
      const healthRows = await db.agentHealth.findMany({
        orderBy: { checkedAt: 'desc' },
      });

      // Deduplicate by agent (keep latest per agent). Rows are keyed by the
      // business agentId; rows whose FK does not resolve to an Agent are
      // reported (never silently used) — scripts/db-integrity-audit.ts repairs them.
      const byAgent = new Map<string, typeof healthRows[0]>();
      let unresolved = 0;
      for (const row of healthRows) {
        const identity = await resolveAgent(row.agentId);
        if (!identity) { unresolved += 1; continue; }
        if (!byAgent.has(identity.agentId)) {
          byAgent.set(identity.agentId, row);
        }
      }
      if (unresolved > 0) {
        console.warn(`[HealthMonitor] ${unresolved} AgentHealth row(s) reference no Agent; run scripts/db-integrity-audit.ts`);
      }

      // For each agent with an AgentHealth record, supplement with AgentRun data
      for (const [agentId, healthRow] of byAgent) {
        await this.loadHealthFromDB(agentId, healthRow);
      }

      // Also load agents that have AgentRun records but no AgentHealth row
      const agentsWithRuns = await db.agentRun.groupBy({
        by: ['agentId'],
      });
      for (const { agentId: runAgentKey } of agentsWithRuns) {
        const identity = await resolveAgent(runAgentKey);
        if (!identity) continue;
        if (!byAgent.has(identity.agentId)) {
          await this.loadHealthFromDB(identity.agentId);
        }
      }

      this.initialized = true;
    } catch (err) {
      // DB may not be available on very first startup; degrade gracefully
      console.warn('[HealthMonitor] Failed to load from DB:', err);
      this.initialized = true;
    }
  }

  /**
   * Persist ALL in-memory records to DB.
   * For periodic saving (e.g., every 30s).
   */
  async persist(): Promise<void> {
    try {
      const allRecords = this.store.all();
      await Promise.all(
        allRecords.map(rec => this.upsertAgentHealthDB(rec.agentId)),
      );
    } catch (err) {
      console.warn('[HealthMonitor] Failed to persist to DB:', err);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private computeSnapshot(rec: HealthRecord): AgentHealthSnapshot {
    const total = rec.successCount + rec.failCount;
    const successRate = total > 0 ? rec.successCount / total : 1;
    const avgLatency = rec.recentLatencies.length > 0
      ? rec.recentLatencies.reduce((a, b) => a + b, 0) / rec.recentLatencies.length
      : 0;
    const errorRate = rec.recentResults.length > 0
      ? rec.recentResults.filter(r => !r).length / rec.recentResults.length
      : 0;

    // Health score: 0-100 based on success rate, latency, and failures
    const score = Math.round(
      (successRate * 50) +
      (Math.max(0, 1 - avgLatency / 30_000) * 30) +
      (Math.max(0, 1 - rec.consecutiveFailures / 5) * 20)
    );

    return {
      agentId: rec.agentId,
      status: rec.consecutiveFailures >= 5 ? 'failed' : rec.consecutiveFailures >= 3 ? 'degraded' : 'ready',
      healthScore: score,
      successRate: Math.round(successRate * 1000) / 1000,
      avgLatencyMs: Math.round(avgLatency),
      errorRate: Math.round(errorRate * 1000) / 1000,
      totalExecutions: total,
      lastExecutionAt: rec.lastExecutionAt ?? undefined,
      lastErrorAt: rec.lastErrorAt ?? undefined,
      consecutiveFailures: rec.consecutiveFailures,
      isDegraded: score < 50,
    };
  }

  /**
   * Load health data for a single agent from DB (AgentRun records).
   * Optionally accepts a pre-fetched AgentHealth row for consecutiveFailures.
   */
  private async loadHealthFromDB(
    agentId: string,
    healthRow?: { consecutiveFailures: number; status: string; lastHeartbeat: Date } | null,
  ): Promise<void> {
    try {
      // AgentRun.agentId holds Agent.id; translate the business key first.
      const identity = await resolveAgent(agentId);
      // Fetch the last 100 completed runs for this agent to reconstruct metrics
      const runs = identity
        ? await db.agentRun.findMany({
            where: {
              agentId: identity.id,
              status: { in: ['completed', 'failed', 'timed_out'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : [];

      if (runs.length === 0 && !healthRow) {
        this.store.markLoaded(agentId);
        return;
      }

      // If no runs but we have a healthRow, still create a minimal record
      if (runs.length === 0 && healthRow) {
        const rec: HealthRecord = {
          agentId,
          successCount: 0,
          failCount: 0,
          totalLatencyMs: 0,
          recentLatencies: [],
          recentResults: [],
          lastExecutionAt: healthRow.lastHeartbeat ?? null,
          lastErrorAt: null,
          consecutiveFailures: healthRow.consecutiveFailures,
        };
        this.store.set(agentId, rec);
        return;
      }

      // Reverse to chronological order, then take last 100
      const chronological = [...runs].reverse().slice(-100);

      let successCount = 0;
      let failCount = 0;
      let totalLatencyMs = 0;
      const recentLatencies: number[] = [];
      const recentResults: boolean[] = [];
      let lastExecutionAt: Date | null = null;
      let lastErrorAt: Date | null = null;
      let consecutiveFailures = 0;

      for (const run of chronological) {
        const isFailure = run.status === 'failed' || run.status === 'timed_out';
        const latency = run.latencyMs ?? run.durationMs ?? 0;

        if (isFailure) {
          failCount++;
          consecutiveFailures++;
          lastErrorAt = run.completedAt ?? run.createdAt;
        } else {
          successCount++;
          consecutiveFailures = 0;
        }

        totalLatencyMs += latency;
        recentLatencies.push(latency);
        recentResults.push(!isFailure);

        const execTime = run.completedAt ?? run.createdAt;
        if (!lastExecutionAt || execTime > lastExecutionAt) {
          lastExecutionAt = execTime;
        }
      }

      // Use DB-stored consecutiveFailures if available and more recent
      if (healthRow && healthRow.consecutiveFailures > consecutiveFailures) {
        consecutiveFailures = healthRow.consecutiveFailures;
      }

      const rec: HealthRecord = {
        agentId,
        successCount,
        failCount,
        totalLatencyMs,
        recentLatencies,
        recentResults,
        lastExecutionAt,
        lastErrorAt,
        consecutiveFailures,
      };
      this.store.set(agentId, rec);
    } catch (err) {
      console.warn(`[HealthMonitor] Failed to load health for agent ${agentId}:`, err);
      this.store.markLoaded(agentId);
    }
  }

  /**
   * Upsert the AgentHealth DB row for an agent.
   * This is fire-and-forget (errors logged, not thrown).
   */
  private upsertAgentHealthDB(agentId: string): Promise<void> {
    const rec = this.store.get(agentId);
    if (!rec) return Promise.resolve();

    const status = rec.consecutiveFailures >= 5
      ? 'failed'
      : rec.consecutiveFailures >= 3
        ? 'degraded'
        : 'healthy';

    // Fire-and-forget — don't block the caller. The FK column must hold
    // Agent.id, so the business key is resolved first; unknown agents are
    // never persisted (that is how orphan rows were created before).
    return resolveAgent(agentId)
      .then((identity) => {
        if (!identity) {
          console.warn(`[HealthMonitor] Not persisting health for unknown agent "${agentId}"`);
          return;
        }
        return db.agentHealth.upsert({
          where: { id: `health-${identity.id}` },
          update: {
            status,
            consecutiveFailures: rec.consecutiveFailures,
            lastHeartbeat: rec.lastExecutionAt ?? new Date(),
            checkedAt: new Date(),
          },
          create: {
            id: `health-${identity.id}`,
            agentId: identity.id,
            status,
            consecutiveFailures: rec.consecutiveFailures,
            lastHeartbeat: rec.lastExecutionAt ?? new Date(),
            checkedAt: new Date(),
          },
        }).then(() => undefined);
      })
      .catch((err: unknown) => {
        console.warn(`[HealthMonitor] Failed to upsert AgentHealth for ${agentId}:`, err);
      });
  }
}

// Singleton
let _instance: AgentHealthMonitor | null = null;
export function getAgentHealthMonitor(): AgentHealthMonitor {
  if (!_instance) _instance = new AgentHealthMonitor();
  return _instance;
}