/**
 * Self-Improvement System
 * Evaluates and optimizes agent prompts, workflows, and routing.
 * Rules: May improve prompts/workflows/routing. May NOT change security or escalate permissions.
 */

import type { AgentHealthSnapshot } from '@/lib/agent-runtime';
import { getAgentHealthMonitor } from '@/lib/agent-runtime';

interface OptimizationRecord {
  id: string;
  agentId: string;
  type: 'prompt' | 'workflow' | 'routing' | 'cost';
  before: string;
  after: string;
  improvement: number;
  appliedAt: Date;
  verifiedAt?: Date;
  verified: boolean;
}

interface PromptEvaluation {
  promptId: string;
  agentId: string;
  successRate: number;
  avgLatencyMs: number;
  avgTokens: number;
  errorCount: number;
  sampleSize: number;
  evaluatedAt: Date;
}

class SelfImprovementEngine {
  private optimizations: OptimizationRecord[] = [];
  private evaluations: PromptEvaluation[] = [];
  private minSampleSize = 10;
  private improvementThreshold = 0.1; // 10% improvement needed

  // ─── Evaluation ───────────────────────────────────────────

  /** Evaluate an agent's current performance */
  evaluateAgent(agentId: string): {
    health: AgentHealthSnapshot;
    recommendation: string;
    shouldOptimize: boolean;
  } {
    const monitor = getAgentHealthMonitor();
    const health = monitor.getHealth(agentId);

    const recommendations: string[] = [];
    let shouldOptimize = false;

    if (health.successRate < 0.8) {
      recommendations.push('Success rate below 80% — consider reviewing system prompt and tool definitions');
      shouldOptimize = true;
    }
    if (health.avgLatencyMs > 15_000) {
      recommendations.push('Average latency above 15s — consider reducing prompt complexity or switching to a faster model');
      shouldOptimize = true;
    }
    if (health.errorRate > 0.2) {
      recommendations.push('Error rate above 20% — investigate common error patterns');
      shouldOptimize = true;
    }
    if (health.consecutiveFailures >= 3) {
      recommendations.push(`${health.consecutiveFailures} consecutive failures — agent may need reset or prompt revision`);
      shouldOptimize = true;
    }
    if (health.healthScore >= 90) {
      recommendations.push('Agent is performing well — no changes recommended');
    }

    return {
      health,
      recommendation: recommendations.join('. '),
      shouldOptimize,
    };
  }

  /** Record a prompt optimization attempt */
  recordOptimization(params: {
    agentId: string; type: 'prompt' | 'workflow' | 'routing' | 'cost';
    before: string; after: string; improvement: number;
  }): OptimizationRecord {
    const record: OptimizationRecord = {
      id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agentId: params.agentId,
      type: params.type,
      before: params.before,
      after: params.after,
      improvement: params.improvement,
      appliedAt: new Date(),
      verified: false,
    };
    this.optimizations.push(record);
    return record;
  }

  /** Mark an optimization as verified (post-deployment check) */
  verifyOptimization(optimizationId: string, successful: boolean): void {
    const opt = this.optimizations.find(o => o.id === optimizationId);
    if (!opt) return;
    opt.verified = true;
    opt.verifiedAt = new Date();
    if (!successful) {
      // Auto-rollback recommendation
      console.warn(
        `[SelfImprovement] Optimization ${optimizationId} did not improve performance. Consider rolling back.`,
      );
    }
  }

  /** Get optimization history */
  getOptimizations(agentId?: string): OptimizationRecord[] {
    if (agentId) return this.optimizations.filter(o => o.agentId === agentId);
    return this.optimizations;
  }

  /** Get cost optimization suggestions */
  getCostSuggestions(): { agentId: string; currentCost: number; suggestion: string }[] {
    const monitor = getAgentHealthMonitor();
    const suggestions: { agentId: string; currentCost: number; suggestion: string }[] = [];

    for (const health of monitor.getAllHealth()) {
      if (health.totalExecutions < 20) continue;
      if (health.avgLatencyMs > 10_000) {
        suggestions.push({
          agentId: health.agentId,
          currentCost: 0,
          suggestion: `High latency (${health.avgLatencyMs}ms avg) — consider using a faster/smaller model for this agent`,
        });
      }
      if (health.errorRate > 0.15) {
        suggestions.push({
          agentId: health.agentId,
          currentCost: 0,
          suggestion: `High error rate (${(health.errorRate * 100).toFixed(1)}%) — review prompt and tool definitions`,
        });
      }
    }

    return suggestions;
  }
}

// Singleton
let _instance: SelfImprovementEngine | null = null;
export function getSelfImprovementEngine(): SelfImprovementEngine {
  if (!_instance) _instance = new SelfImprovementEngine();
  return _instance;
}
