import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const departmentId = url.searchParams.get('departmentId');
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const sortBy = url.searchParams.get('sortBy') || 'maturity';

    const where: Record<string, unknown> = { status: 'active' };
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { purpose: { contains: search } },
        { departmentName: { contains: search } },
      ];
    }

    const orderBy: Record<string, string> = {};
    orderBy[sortBy === 'name' ? 'name' : 'id'] = 'asc';

    const [agents, total] = await Promise.all([
      db.agent.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { memory: true, tasks: true } },
        },
      }),
      db.agent.count({ where }),
    ]);

    return NextResponse.json({
      data: agents.map((agent) => ({
        id: agent.id,
        agentId: agent.agentId,
        name: agent.name,
        slug: agent.slug,
        type: agent.type,
        role: agent.role,
        purpose: agent.purpose,
        departmentId: agent.departmentId,
        departmentName: agent.departmentName,
        // Evolution/protective records are not part of the deployed Prisma schema.
        evolution: null,
        protectiveMode: null,
        knowledgeCount: agent._count.memory,
        sessionCount: agent._count.tasks,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
