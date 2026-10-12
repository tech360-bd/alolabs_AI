import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { EVOLUTION_LEVELS } from '@/lib/agent-learning';

export async function GET() {
  try {
    await requireAuth();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [agents, recentMemory, allMemory] = await Promise.all([
      db.agent.findMany({
        take: 10,
        include: { _count: { select: { memory: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      db.agentMemory.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { agent: { select: { agentId: true, name: true, departmentName: true } } },
      }),
      db.agentMemory.findMany({ select: { category: true, useCount: true, successCount: true } }),
    ]);

    const categories = new Map<string, { count: number; successes: number; uses: number }>();
    for (const entry of allMemory) {
      const item = categories.get(entry.category) ?? { count: 0, successes: 0, uses: 0 };
      item.count += 1;
      item.successes += entry.successCount;
      item.uses += entry.useCount;
      categories.set(entry.category, item);
    }
    const daily = new Map<string, number>();
    for (const entry of recentMemory) {
      const day = entry.createdAt.toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) || 0) + 1);
    }

    return NextResponse.json({
      global: {
        totalAgents: await db.agent.count(),
        totalKnowledge: allMemory.length,
        levelDistribution: [],
      },
      topAgents: agents.map((agent) => ({
        agentId: agent.agentId,
        name: agent.name,
        department: agent.departmentName,
        role: agent.role,
        type: agent.type,
        level: null,
        levelName: 'Untracked',
        maturityScore: null,
        modelReadiness: null,
        totalKnowledge: agent._count.memory,
        avgConfidence: null,
        evolutionPath: null,
        achievements: [],
      })),
      recentSessions: recentMemory.map((entry) => ({
        id: entry.id,
        agentId: entry.agent.agentId,
        agentName: entry.agent.name,
        department: entry.agent.departmentName,
        triggerType: 'memory',
        knowledgeGained: 1,
        insights: [entry.content],
        corrections: [],
        durationMs: null,
        status: 'persisted',
        createdAt: entry.createdAt,
      })),
      knowledgeByCategory: Array.from(categories, ([category, item]) => ({
        category,
        count: item.count,
        avgConfidence: item.uses > 0 ? Math.round((item.successes / item.uses) * 100) : null,
      })),
      dailyLearningRate: Array.from(daily, ([date, sessions]) => ({ date, sessions }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      levelDetails: EVOLUTION_LEVELS.map((level) => ({
        level: level.level,
        name: level.name,
        count: 0,
        minMaturity: level.minMaturity,
        minKnowledge: level.minKnowledge,
      })),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
