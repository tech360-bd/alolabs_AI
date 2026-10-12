import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        department: { select: { name: true, slug: true } },
        memory: { orderBy: { updatedAt: 'desc' }, take: 50 },
        tasks: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { memory: true, tasks: true } },
      },
    });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const knowledge = agent.memory.map((entry) => ({
      id: entry.id,
      category: entry.category,
      content: entry.content,
      source: 'agent-memory',
      confidence: entry.useCount > 0 ? entry.successCount / entry.useCount : 0,
      useCount: entry.useCount,
      successCount: entry.successCount,
      temperature: entry.temperature,
      isVerified: entry.successCount > 0,
      tags: '[]',
      createdAt: entry.createdAt,
    }));
    const grouped = new Map<string, { category: string; count: number; averageConfidence: number }>();
    for (const entry of knowledge) {
      const current = grouped.get(entry.category) ?? { category: entry.category, count: 0, averageConfidence: 0 };
      current.averageConfidence = ((current.averageConfidence * current.count) + entry.confidence) / (current.count + 1);
      current.count += 1;
      grouped.set(entry.category, current);
    }

    return NextResponse.json({
      data: {
        ...agent,
        memory: undefined,
        tasks: undefined,
        knowledge,
        learningSessions: agent.tasks,
        evolution: null,
        protectiveMode: null,
        _count: {
          knowledge: agent._count.memory,
          learningSessions: agent._count.tasks,
          tasks: agent._count.tasks,
        },
      },
      knowledgeByCategory: Array.from(grouped.values()),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
