import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { EVOLUTION_LEVELS } from '@/lib/agent-learning';

function safeConfig(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const params = new URL(req.url).searchParams;
    const page = parseInt(params.get('page') || '1');
    const limit = parseInt(params.get('limit') || '20');
    const where = params.get('agentId') ? { id: params.get('agentId')! } : {};
    const [agents, total] = await Promise.all([
      db.agent.findMany({ where, skip: (page - 1) * limit, take: limit,
        include: { memory: { select: { useCount: true, successCount: true } }, _count: { select: { tasks: true } } } }),
      db.agent.count({ where }),
    ]);
    return NextResponse.json({
      data: agents.map((agent) => {
        const uses = agent.memory.reduce((sum, item) => sum + item.useCount, 0);
        const successes = agent.memory.reduce((sum, item) => sum + item.successCount, 0);
        const config = safeConfig(agent.selfImprovement);
        return {
          id: agent.id, agentId: agent.agentId, agentName: agent.name, department: agent.departmentName,
          role: agent.role, type: agent.type, level: null, levelName: 'Untracked',
          totalKnowledge: agent.memory.length, totalSessions: agent._count.tasks,
          totalCorrections: null, avgConfidence: uses > 0 ? successes / uses : null,
          maturityScore: null, knowledgeDensity: null, protectiveScore: null, modelReadiness: null,
          domainCoverage: [], strengthAreas: [], weakAreas: [],
          evolutionPath: config.evolutionPath ?? null, lastEvolvedAt: null, nextEvolutionAt: null,
          achievements: [], createdAt: agent.createdAt,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      levels: EVOLUTION_LEVELS,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth();
    const { agentId, evolutionPath } = await req.json();
    if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    const agent = await db.agent.findUnique({ where: { id: agentId }, select: { selfImprovement: true } });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    const config = { ...safeConfig(agent.selfImprovement), ...(evolutionPath ? { evolutionPath } : {}) };
    await db.agent.update({ where: { id: agentId }, data: { selfImprovement: JSON.stringify(config) } });
    return NextResponse.json({ data: { agentId, evolutionPath: config.evolutionPath ?? null } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
