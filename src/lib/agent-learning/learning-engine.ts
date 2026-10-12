import { db } from '@/lib/db';
import { ProtectiveFilter } from './protective-filter';
import { EvolutionTracker } from './evolution-tracker';
import { EVOLUTION_LEVELS, SAFETY_LEVELS } from './index';

interface LearningInput {
  agentId: string;
  companyId: string;
  triggerType: 'task_completion' | 'feedback' | 'scheduled' | 'manual' | 'cross_agent';
  triggerDetail?: string;
  agentRunId?: string;
  taskOutput?: string;
  taskInput?: string;
  wasSuccess?: boolean;
  error?: string;
  corrections?: string[];
  insights?: string[];
}

interface LearningResult {
  sessionId: string;
  knowledgeCreated: number;
  confidenceDelta: number;
  newLevel?: number;
  newLevelName?: string;
  maturityDelta: number;
  insightsExtracted: string[];
  correctionsApplied: string[];
  blockedCount: number;
}

export class LearningEngine {
  private protectiveFilter: ProtectiveFilter;
  private evolutionTracker: EvolutionTracker;

  constructor() {
    this.protectiveFilter = new ProtectiveFilter();
    this.evolutionTracker = new EvolutionTracker();
  }

  /**
   * Main learning loop: extract knowledge from a task completion or feedback,
   * filter through protective mode, store verified knowledge, update evolution.
   */
  async learn(input: LearningInput): Promise<LearningResult> {
    const startTime = Date.now();

    const access = await db.agentCompanyAccess.findFirst({
      where: { agentId: input.agentId, companyId: input.companyId },
      select: { id: true },
    })
    if (!access) throw new Error('Agent is not available to this company')

    // 1. Get current knowledge count for this company and agent
    const knowledgeBefore = await db.agentMemory.count({ where: { agentId: input.agentId, companyId: input.companyId } });

    // 2. Get protective mode config
    const protective = await db.agentProtectiveMode.findUnique({
      where: { agentId: input.agentId },
    });

    if (protective && !protective.enabled) {
      return this.createSession(input, knowledgeBefore, knowledgeBefore, [], [], 0, startTime);
    }

    // 3. Check daily knowledge limit
    if (protective) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await db.agentMemory.count({
        where: { agentId: input.agentId, companyId: input.companyId, createdAt: { gte: todayStart } },
      });
      if (todayCount >= protective.maxKnowledgePerDay) {
        return this.createSession(input, knowledgeBefore, knowledgeBefore, [], ['Daily knowledge limit reached'], 0, startTime);
      }
    }

    // 4. Extract knowledge from input
    const rawInsights = await this.extractInsights(input);
    const rawCorrections = input.corrections || [];

    // 5. Filter through protective mode
    const allContent = [...rawInsights, ...rawCorrections];
    const configuredSafetyLevel = protective?.safetyLevel;
    const safetyLevel = SAFETY_LEVELS.find((level) => level === configuredSafetyLevel) ?? 'strict';
    const learningScopes = ['task_domain', 'cross_domain', 'open', 'restricted'] as const;
    const learningScope = learningScopes.find((scope) => scope === protective?.learningScope) ?? 'task_domain';
    const filteredContent = this.protectiveFilter.filter(
      allContent,
      safetyLevel,
      learningScope,
      protective?.allowedDomains ? JSON.parse(protective.allowedDomains) : [],
      protective?.blockedPatterns ? JSON.parse(protective.blockedPatterns) : [],
    );

    const blockedCount = allContent.length - filteredContent.length;
    const safeInsights = filteredContent.filter(c => !rawCorrections.includes(c));
    const safeCorrections = filteredContent.filter(c => rawCorrections.includes(c));

    // 6. Store knowledge entries
    let knowledgeCreated = 0;
    for (const insight of safeInsights) {
      const category = this.categorize(insight, input);
      await db.agentMemory.create({
        data: {
          agentId: input.agentId,
          companyId: input.companyId,
          category,
          content: insight,
          source: input.triggerType,
          confidence: 0.5,
          temperature: 'hot',
          tags: JSON.stringify([input.triggerType, category]),
        },
      });
      knowledgeCreated++;
    }

    for (const correction of safeCorrections) {
      await db.agentMemory.create({
        data: {
          agentId: input.agentId,
          companyId: input.companyId,
          category: 'correction',
          content: correction,
          source: input.triggerType,
          confidence: 0.6,
          temperature: 'hot',
          tags: JSON.stringify([input.triggerType, 'correction']),
        },
      });
      knowledgeCreated++;
    }

    // 7. If task failed, extract error patterns
    if (input.wasSuccess === false && input.error) {
      const errorPattern = `Error pattern: ${input.error.substring(0, 200)}`;
      await db.agentMemory.create({
        data: {
          agentId: input.agentId,
          companyId: input.companyId,
          category: 'correction',
          content: errorPattern,
          source: 'experience',
          confidence: 0.4,
          temperature: 'hot',
          tags: JSON.stringify(['error', 'pattern']),
        },
      });
      knowledgeCreated++;
    }

    // 8. Update evolution
    const knowledgeAfter = knowledgeBefore + knowledgeCreated;
    const evolutionUpdate = await this.evolutionTracker.updateEvolution(
      input.agentId,
      knowledgeCreated,
      input.wasSuccess !== false,
    );

    // 9. Record violation if content was blocked
    if (blockedCount > 0 && protective) {
      await db.agentProtectiveMode.update({
        where: { agentId: input.agentId },
        data: { violationCount: { increment: 1 }, lastViolationAt: new Date() },
      });
    }

    return this.createSession(
      input,
      knowledgeBefore,
      knowledgeAfter,
      safeInsights,
      safeCorrections,
      blockedCount,
      startTime,
      evolutionUpdate,
    );
  }

  /**
   * Get top knowledge for an agent (for prompt injection)
   */
  async getTopKnowledge(agentId: string, companyId: string, limit = 20): Promise<string[]> {
    const knowledge = await db.agentMemory.findMany({
      where: { agentId, companyId, confidence: { gte: 0.4 } },
      orderBy: [{ confidence: 'desc' }, { useCount: 'desc' }],
      take: limit,
      select: { content: true, category: true, confidence: true },
    });
    return knowledge.map(k => `[${k.category}] (${(k.confidence * 100).toFixed(0)}%) ${k.content}`);
  }

  /**
   * Reinforce knowledge after successful reuse
   */
  async reinforceKnowledge(knowledgeId: string, companyId: string, success: boolean): Promise<void> {
    const existing = await db.agentMemory.findFirst({ where: { id: knowledgeId, companyId } })
    if (!existing) throw new Error('Knowledge entry not found for this company')
    const update = success
      ? { useCount: { increment: 1 }, successCount: { increment: 1 } }
      : { useCount: { increment: 1 }, failCount: { increment: 1 } };

    const knowledge = await db.agentMemory.update({ where: { id: existing.id }, data: update });

    // Recalculate confidence based on success rate
    const total = knowledge.useCount || 1;
    const successRate = (knowledge.successCount || 0) / total;
    const newConfidence = Math.min(0.95, 0.3 + (successRate * 0.65));

    // Update temperature based on recency
    const daysSinceCreation = (Date.now() - knowledge.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const temperature = daysSinceCreation < 1 ? 'hot' : daysSinceCreation < 7 ? 'warm' : 'cold';

    await db.agentMemory.update({
      where: { id: knowledgeId },
      data: { confidence: newConfidence, temperature, updatedAt: new Date() },
    });
  }

  /**
   * Batch learning for multiple agents (e.g., after department task)
   */
  async batchLearn(inputs: LearningInput[]): Promise<Map<string, LearningResult>> {
    const results = new Map<string, LearningResult>();
    for (const input of inputs) {
      try {
        const result = await this.learn(input);
        results.set(input.agentId, result);
      } catch (err) {
        console.error(`Learning failed for agent ${input.agentId}:`, err);
      }
    }
    return results;
  }

  // ── Private helpers ──────────────────────────────────────────

  private async extractInsights(input: LearningInput): Promise<string[]> {
    const insights: string[] = [];

    // From explicit insights
    if (input.insights?.length) {
      insights.push(...input.insights);
    }

    // From task output — extract key patterns
    if (input.taskOutput && input.taskOutput.length > 20) {
      const output = input.taskOutput;
      // Extract domain-specific knowledge
      if (output.length > 50) {
        insights.push(`Domain context: ${output.substring(0, 300)}`);
      }

      // Extract strategy patterns
      if (input.wasSuccess && output.length > 100) {
        insights.push(`Successful approach: ${output.substring(0, 200)}`);
      }
    }

    // From task input — extract what the agent was asked to do
    if (input.taskInput && input.taskInput.length > 20) {
      insights.push(`Task pattern handled: ${input.taskInput.substring(0, 200)}`);
    }

    return insights.filter(i => i.length > 10 && i.length < 2000);
  }

  private categorize(insight: string, input: LearningInput): string {
    const lower = insight.toLowerCase();
    if (lower.includes('error') || lower.includes('fix') || lower.includes('correction') || lower.includes('mistake')) {
      return 'correction';
    }
    if (lower.includes('pattern') || lower.includes('approach') || lower.includes('strategy') || lower.includes('method')) {
      return 'strategy';
    }
    if (lower.includes('tool') || lower.includes('api') || lower.includes('function') || lower.includes('integration')) {
      return 'tool_usage';
    }
    if (lower.includes('communicat') || lower.includes('response') || lower.includes('message') || lower.includes('reply')) {
      return 'communication';
    }
    if (lower.includes('domain') || lower.includes('context') || lower.includes('knowledge')) {
      return 'domain';
    }
    return 'pattern';
  }

  private async createSession(
    input: LearningInput,
    knowledgeBefore: number,
    knowledgeAfter: number,
    insights: string[],
    corrections: string[],
    blockedCount: number,
    startTime: number,
    evolutionUpdate?: { newLevel?: number; newLevelName?: string; maturityDelta: number },
  ): Promise<LearningResult> {
    const session = await db.agentLearningSession.create({
      data: {
        agentId: input.agentId,
        companyId: input.companyId,
        agentRunId: input.agentRunId,
        triggerType: input.triggerType,
        triggerDetail: input.triggerDetail,
        knowledgeBefore,
        knowledgeAfter,
        insights: JSON.stringify(insights),
        corrections: JSON.stringify(corrections),
        durationMs: Date.now() - startTime,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return {
      sessionId: session.id,
      knowledgeCreated: knowledgeAfter - knowledgeBefore,
      confidenceDelta: 0,
      newLevel: evolutionUpdate?.newLevel,
      newLevelName: evolutionUpdate?.newLevelName,
      maturityDelta: evolutionUpdate?.maturityDelta || 0,
      insightsExtracted: insights,
      correctionsApplied: corrections,
      blockedCount,
    };
  }
}
