/**
 * GET /api/enterprise/overview
 * Dashboard stats for the enterprise — public for dashboard (auth optional).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(); // optional — works with or without Bearer token

    const [
      agentsCount,
      activeAgents,
      departmentsCount,
      skillsCount,
      activeSkills,
      sopsCount,
      activeSops,
      knowledgeNodes,
      pendingApprovals,
      recentTasks,
    ] = await Promise.all([
      db.agent.count(),
      db.agent.count({ where: { status: 'active' } }),
      db.department.count(),
      db.skill.count(),
      db.skill.count({ where: { status: 'active' } }),
      db.enterpriseSOP.count(),
      db.enterpriseSOP.count({ where: { status: 'active' } }),
      db.knowledgeNode.count(),
      db.approval.count({ where: { status: 'pending' } }),
      db.task.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      overview: {
        agents: { total: agentsCount, active: activeAgents },
        departments: departmentsCount,
        skills: { total: skillsCount, active: activeSkills },
        sops: { total: sopsCount, active: activeSops },
        knowledgeNodes,
        pendingApprovals,
      },
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Enterprise overview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
