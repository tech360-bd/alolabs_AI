import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(_req: NextRequest) {
  try {
    await requireAuth();
    const departments = await db.department.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            type: true,
            role: true,
            _count: { select: { memory: true, tasks: true } },
          },
        },
      },
    });

    const result = departments.map((department) => {
      const typeDistribution: Record<string, number> = {};
      for (const agent of department.agents) {
        typeDistribution[agent.type] = (typeDistribution[agent.type] || 0) + 1;
      }
      const totalKnowledge = department.agents.reduce(
        (sum, agent) => sum + agent._count.memory,
        0,
      );
      return {
        id: department.id,
        name: department.name,
        slug: department.slug,
        description: department.description,
        agentCount: department.agents.length,
        totalKnowledge,
        avgMaturity: null,
        avgModelReadiness: null,
        levelDistribution: { Untracked: department.agents.length },
        typeDistribution,
        topAgents: department.agents.slice(0, 5).map((agent) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          role: agent.role,
          evolution: null,
          knowledgeCount: agent._count.memory,
        })),
      };
    });

    return NextResponse.json({
      data: result,
      global: {
        totalDepartments: result.length,
        totalAgents: result.reduce((sum, department) => sum + department.agentCount, 0),
        totalKnowledge: result.reduce((sum, department) => sum + department.totalKnowledge, 0),
        avgMaturity: null,
        avgModelReadiness: null,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
