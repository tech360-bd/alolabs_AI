import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';

function parseArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function utcDayStart(dayOffset: number, now = new Date()): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - dayOffset);
  return day;
}

export async function GET() {
  try {
    await requireRole('super_admin');
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [totalAgents, verifiedMemory, pendingMemory, correctionMemory, totalSessions, recentSessions24h,
      recentSessionRows, verifiedAgentGroups, categoryRows, protectionCount, protectionEnabledCount, protectionAggregate] = await Promise.all([
      db.agent.count(),
      db.agentMemory.count({ where: { isVerified: true } }),
      db.agentMemory.count({ where: { isVerified: false } }),
      db.agentMemory.count({ where: { isVerified: true, category: 'correction' } }),
      db.agentLearningSession.count(),
      db.agentLearningSession.count({ where: { createdAt: { gte: last24h } } }),
      db.agentLearningSession.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { agent: { select: { agentId: true, name: true, departmentName: true } } },
      }),
      db.agentMemory.groupBy({
        by: ['agentId'],
        where: { isVerified: true },
        _count: { id: true },
      }),
      db.agentMemory.findMany({ where: { isVerified: true }, distinct: ['category'], select: { category: true } }),
      db.agentProtectiveMode.count(),
      db.agentProtectiveMode.count({ where: { enabled: true } }),
      db.agentProtectiveMode.aggregate({ _sum: { violationCount: true } }),
    ]);

    const topAgentIds = verifiedAgentGroups
      .sort((a, b) => b._count.id - a._count.id || a.agentId.localeCompare(b.agentId))
      .slice(0, 10)
      .map((group) => group.agentId);
    const topAgentRows = await db.agent.findMany({
      where: { id: { in: topAgentIds } },
      select: { id: true, agentId: true, name: true, departmentName: true, role: true },
    });
    const topAgentById = new Map(topAgentRows.map((agent) => [agent.id, agent]));
    const topAgents = verifiedAgentGroups
      .filter((group) => topAgentIds.includes(group.agentId))
      .sort((a, b) => b._count.id - a._count.id || a.agentId.localeCompare(b.agentId))
      .flatMap((group) => {
        const agent = topAgentById.get(group.agentId);
        if (!agent) return [];
        return [{
          agentId: agent.agentId,
          name: agent.name,
          department: agent.departmentName,
          role: agent.role,
          level: null,
          levelName: 'Untracked',
          maturityScore: null,
          modelReadiness: null,
          totalKnowledge: group._count.id,
          avgConfidence: null,
          evolutionPath: null,
          achievements: [],
        }];
      });

    const knowledgeByCategory = await Promise.all(categoryRows.map(async ({ category }) => ({
      category,
      count: await db.agentMemory.count({ where: { isVerified: true, category } }),
      avgConfidence: null,
    })));

    const dailyLearningRate = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
      const start = utcDayStart(6 - index, now);
      const end = utcDayStart(5 - index, now);
      const sessions = await db.agentLearningSession.count({ where: { createdAt: { gte: start, lt: end } } });
      return { date: start.toISOString().slice(0, 10), sessions };
    }));

    return NextResponse.json({
      global: {
        totalAgents,
        totalEvolved: null,
        avgMaturity: null,
        avgModelReadiness: null,
        avgConfidence: null,
        avgProtectiveScore: null,
        totalKnowledge: verifiedMemory,
        pendingKnowledgeCandidates: pendingMemory,
        totalSessions,
        totalCorrections: correctionMemory,
        recentSessions24h,
        highLevelAgents: null,
        modelReadyAgents: null,
        levelDistribution: [],
        pathDistribution: [],
        protection: {
          configuredAgents: protectionCount,
          enabledAgents: protectionEnabledCount,
          recordedViolations: protectionAggregate._sum.violationCount ?? 0,
        },
      },
      topAgents,
      recentSessions: recentSessionRows.map((session) => ({
        id: session.id,
        agentId: session.agent.agentId,
        agentName: session.agent.name,
        department: session.agent.departmentName,
        triggerType: session.triggerType,
        candidateCount: Math.max(0, session.knowledgeAfter - session.knowledgeBefore),
        insights: parseArray(session.insights),
        corrections: parseArray(session.corrections),
        durationMs: session.durationMs,
        status: session.status,
        createdAt: session.createdAt,
      })),
      knowledgeByCategory,
      dailyLearningRate,
      levelDetails: [],
      metricsStatus: {
        evolutionBenchmarks: 'not_recorded',
        modelReadiness: 'not_recorded',
        protectiveScore: 'not_measured',
        memoryCountsIncludeOnlyVerifiedForKnowledge: true,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[Learning Dashboard] Failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
