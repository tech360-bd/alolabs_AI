import { db } from '@/lib/db';
import { EVOLUTION_LEVELS } from './index';

interface EvolutionUpdateResult {
  newLevel?: number;
  newLevelName?: string;
  maturityDelta: number;
}

/**
 * Evolution Tracker: Calculates and updates agent evolution metrics.
 * Each agent evolves from Level 1 (Novice) to Level 10 (Industrial Model)
 * based on accumulated knowledge, confidence, sessions, and corrections.
 */
export class EvolutionTracker {

  /**
   * Update evolution for an agent after a learning event.
   */
  async updateEvolution(
    agentId: string,
    knowledgeGained: number,
    wasSuccess: boolean,
  ): Promise<EvolutionUpdateResult> {
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { name: true, departmentName: true, role: true, type: true },
    });
    if (!agent) return { maturityDelta: 0 };

    // Get or create evolution record
    let evolution = await db.agentEvolution.findUnique({ where: { agentId } });

    if (!evolution) {
      evolution = await db.agentEvolution.create({
        data: {
          agentId,
          level: 1,
          levelName: 'Novice',
          totalKnowledge: 0,
          totalSessions: 0,
          totalCorrections: 0,
          avgConfidence: 0,
          maturityScore: 0,
          knowledgeDensity: 0,
          protectiveScore: 100,
          modelReadiness: 0,
          domainCoverage: JSON.stringify([agent.departmentName]),
          strengthAreas: JSON.stringify([]),
          weakAreas: JSON.stringify([agent.role, agent.type]),
          evolutionPath: 'specialist',
          achievements: JSON.stringify([]),
        },
      });
    }

    const prevMaturity = evolution.maturityScore;

    // 1. Update totals
    const newTotalKnowledge = evolution.totalKnowledge + knowledgeGained;
    const newTotalSessions = evolution.totalSessions + 1;
    const newTotalCorrections = evolution.totalCorrections + (wasSuccess ? 0 : 1);

    // 2. Calculate average confidence from knowledge base
    const knowledgeStats = await db.agentMemory.aggregate({
      where: { agentId },
      _avg: { confidence: true },
      _count: true,
    });
    const avgConfidence = knowledgeStats._avg.confidence || 0;

    // 3. Calculate maturity score (0-100)
    //    Factors: knowledge volume, confidence, sessions, corrections (inverted)
    const knowledgeFactor = Math.min(40, (newTotalKnowledge / 250) * 40);
    const confidenceFactor = avgConfidence * 30;
    const sessionFactor = Math.min(15, (newTotalSessions / 50) * 15);
    const correctionPenalty = Math.min(15, (newTotalCorrections / (newTotalSessions || 1)) * 15);
    const maturityScore = Math.min(100, Math.max(0,
      knowledgeFactor + confidenceFactor + sessionFactor - correctionPenalty
    ));

    // 4. Knowledge density (knowledge per session)
    const knowledgeDensity = newTotalSessions > 0 ? newTotalKnowledge / newTotalSessions : 0;

    // 5. Protective score (starts at 100, decreases with violations)
    const protective = await db.agentProtectiveMode.findUnique({ where: { agentId } });
    const protectiveScore = protective
      ? Math.max(0, 100 - (protective.violationCount * 5))
      : 100;

    // 6. Model readiness (0-100) — how close to being a standalone model
    const modelReadiness = Math.min(100, (
      (maturityScore * 0.4) +
      (avgConfidence * 100 * 0.3) +
      (Math.min(1, newTotalKnowledge / 200) * 30)
    ));

    // 7. Determine domain coverage
    const categories = await db.agentMemory.groupBy({
      by: ['category'],
      where: { agentId },
      _count: true,
    });
    const coveredDomains = categories
      .filter(c => c._count >= 3)
      .map(c => c.category);
    const allDomains = ['domain', 'pattern', 'correction', 'strategy', 'tool_usage', 'communication'];
    const missingDomains = allDomains.filter(d => !coveredDomains.includes(d));

    // 8. Determine strengths and weaknesses
    const strengthAreas = categories
      .sort((a, b) => b._count - a._count)
      .slice(0, 3)
      .map(c => c.category);

    // 9. Determine evolution level
    let newLevel = evolution.level;
    let newLevelName = evolution.levelName;

    for (let i = EVOLUTION_LEVELS.length - 1; i >= 0; i--) {
      const lvl = EVOLUTION_LEVELS[i];
      if (maturityScore >= lvl.minMaturity && newTotalKnowledge >= lvl.minKnowledge) {
        newLevel = lvl.level;
        newLevelName = lvl.name;
        break;
      }
    }

    // 10. Generate achievements
    const achievements: string[] = JSON.parse(evolution.achievements || '[]');
    const prevLevel = evolution.level;

    if (newLevel > prevLevel) {
      achievements.push(`Evolved to ${newLevelName} (Level ${newLevel})`);
    }
    if (newTotalKnowledge >= 10 && !achievements.includes('10 Knowledge Units')) {
      achievements.push('10 Knowledge Units');
    }
    if (newTotalKnowledge >= 50 && !achievements.includes('50 Knowledge Units')) {
      achievements.push('50 Knowledge Units');
    }
    if (newTotalKnowledge >= 100 && !achievements.includes('100 Knowledge Units')) {
      achievements.push('100 Knowledge Units');
    }
    if (maturityScore >= 50 && !achievements.includes('50% Maturity')) {
      achievements.push('50% Maturity');
    }
    if (maturityScore >= 90 && !achievements.includes('90% Maturity')) {
      achievements.push('90% Maturity');
    }
    if (modelReadiness >= 80 && !achievements.includes('Model-Ready Candidate')) {
      achievements.push('Model-Ready Candidate');
    }
    if (avgConfidence >= 0.8 && !achievements.includes('High Confidence')) {
      achievements.push('High Confidence (80%+)');
    }
    if (coveredDomains.length >= 4 && !achievements.includes('Multi-Domain Knowledge')) {
      achievements.push('Multi-Domain Knowledge (4+ domains)');
    }

    // 11. Determine evolution path based on coverage
    let evolutionPath = evolution.evolutionPath;
    if (coveredDomains.length >= 5) evolutionPath = 'generalist';
    else if (coveredDomains.length >= 3) evolutionPath = 'hybrid';
    else if (newLevel >= 8) evolutionPath = 'industrial';

    // 12. Update evolution record
    await db.agentEvolution.update({
      where: { agentId },
      data: {
        level: newLevel,
        levelName: newLevelName,
        totalKnowledge: newTotalKnowledge,
        totalSessions: newTotalSessions,
        totalCorrections: newTotalCorrections,
        avgConfidence,
        maturityScore,
        knowledgeDensity,
        protectiveScore,
        modelReadiness,
        domainCoverage: JSON.stringify(coveredDomains),
        strengthAreas: JSON.stringify(strengthAreas),
        weakAreas: JSON.stringify(missingDomains),
        evolutionPath,
        achievements: JSON.stringify(achievements.slice(-20)),
        lastEvolvedAt: newLevel > prevLevel ? new Date() : evolution.lastEvolvedAt,
        nextEvolutionAt: this.calculateNextEvolution(maturityScore, newTotalKnowledge, newLevel),
        updatedAt: new Date(),
      },
    });

    return {
      newLevel: newLevel > prevLevel ? newLevel : undefined,
      newLevelName: newLevel > prevLevel ? newLevelName : undefined,
      maturityDelta: maturityScore - prevMaturity,
    };
  }

  /**
   * Get aggregate evolution stats across all agents.
   */
  async getGlobalStats() {
    const [totalAgents, totalEvolved] = await Promise.all([
      db.agent.count({ where: { status: 'active' } }),
      db.agentEvolution.count(),
    ]);

    const levelDist = await db.agentEvolution.groupBy({
      by: ['level'],
      _count: true,
    });

    const pathDist = await db.agentEvolution.groupBy({
      by: ['evolutionPath'],
      _count: true,
    });

    const avgScores = await db.agentEvolution.aggregate({
      _avg: { maturityScore: true, modelReadiness: true, avgConfidence: true, protectiveScore: true },
      _sum: { totalKnowledge: true, totalSessions: true, totalCorrections: true },
    });

    const totalKnowledge = await db.agentMemory.count();
    const recentSessions = await db.agentLearningSession.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const highLevelAgents = await db.agentEvolution.count({ where: { level: { gte: 6 } } });
    const modelReadyAgents = await db.agentEvolution.count({ where: { modelReadiness: { gte: 80 } } });

    return {
      totalAgents,
      totalEvolved,
      levelDistribution: levelDist.map(l => ({
        level: l.level,
        count: l._count,
        name: EVOLUTION_LEVELS[l.level - 1]?.name || 'Unknown',
      })),
      pathDistribution: pathDist.map(p => ({ path: p.evolutionPath, count: p._count })),
      avgMaturity: Math.round((avgScores._avg.maturityScore || 0) * 10) / 10,
      avgModelReadiness: Math.round((avgScores._avg.modelReadiness || 0) * 10) / 10,
      avgConfidence: Math.round((avgScores._avg.avgConfidence || 0) * 100),
      avgProtectiveScore: Math.round((avgScores._avg.protectiveScore || 0) * 10) / 10,
      totalKnowledge,
      totalSessions: avgScores._sum.totalSessions || 0,
      totalCorrections: avgScores._sum.totalCorrections || 0,
      recentSessions24h: recentSessions,
      highLevelAgents,
      modelReadyAgents,
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private calculateNextEvolution(maturity: number, knowledge: number, currentLevel: number): Date | null {
    if (currentLevel >= 10) return null;
    const nextLevel = EVOLUTION_LEVELS[currentLevel];
    if (!nextLevel) return null;
    // Estimate sessions needed based on current rate
    const maturityGap = nextLevel.minMaturity - maturity;
    const knowledgeGap = nextLevel.minKnowledge - knowledge;
    if (maturityGap <= 0 && knowledgeGap <= 0) return null;
    // Rough estimate: ~0.5 maturity per session, ~1 knowledge per session
    const sessionsNeeded = Math.max(maturityGap / 0.5, knowledgeGap / 1);
    const daysNeeded = Math.ceil(sessionsNeeded / 5); // ~5 sessions per day typical
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysNeeded);
    return nextDate;
  }
}
