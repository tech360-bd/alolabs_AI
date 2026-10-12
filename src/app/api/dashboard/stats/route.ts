import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const [
      totalAgents,
      activeAgents,
      totalDepartments,
      totalCompanies,
      activeCompanies,
      totalWorkflows,
      totalSkills,
      pendingApprovals,
      todayUsage,
      totalUsage,
      totalTokens,
      blockedActions,
      paymentGuardBlocks,
      protectionBlocked,
      recentTasks,
      companyUsage,
      topAgents,
      topDepartments,
      recentAuditLogs,
      completedTasks,
      failedTasks,
      pendingTasks,
      inProgressTasks,
    ] = await Promise.all([
      db.agent.count(),
      db.agent.count({ where: { status: 'active' } }),
      db.department.count(),
      db.company.count(),
      db.company.count({ where: { status: 'active' } }),
      db.workflow.count(),
      db.skill.count(),
      db.approval.count({ where: { status: 'pending' } }),
      db.usageLog.count({ where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      db.usageLog.count(),
      db.usageLog.aggregate({ _sum: { tokensOrLocalUsed: true } }),
      db.protectionLog.count({ where: { blocked: true } }),
      db.paymentGuardLog.count({ where: { blocked: true } }),
      db.protectionLog.count({ where: { blocked: true } }),
      db.task.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { title: true, status: true, priority: true, createdAt: true },
      }),
      db.usageLog.groupBy({
        by: ['companyName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      db.usageLog.groupBy({
        by: ['agentName'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      db.department.findMany({
        orderBy: { sortOrder: 'asc' },
        take: 10,
        select: { name: true, slug: true, agentCount: true },
      }),
      db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: { select: { name: true } } },
      }),
      db.task.count({ where: { status: 'completed' } }),
      db.task.count({ where: { status: 'failed' } }),
      db.task.count({ where: { status: 'pending' } }),
      db.task.count({ where: { status: 'in_progress' } }),
    ]);

    return NextResponse.json({
      agents: {
        total: totalAgents,
        active: activeAgents,
        byStatus: { active: activeAgents, locked: 0, disabled: 0 },
      },
      companies: {
        total: totalCompanies,
        active: activeCompanies,
      },
      usage: {
        today: todayUsage,
        total: totalUsage,
        totalTokens: totalTokens._sum.tokensOrLocalUsed || 0,
        byCompanyToday: companyUsage.map((c) => ({
          companyName: c.companyName || 'Unknown',
          logs: c._count.id,
          tokens: c._sum.tokensOrLocalUsed || 0,
        })),
      },
      tasks: {
        total: completedTasks + failedTasks + pendingTasks + inProgressTasks,
        completed: completedTasks,
        failed: failedTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
      },
      security: {
        pendingApprovals,
        blockedActions,
        paymentGuardBlocked: paymentGuardBlocks,
        protectionBlocked,
      },
      infrastructure: {
        workflows: totalWorkflows,
        departments: totalDepartments,
        skills: totalSkills,
      },
      topDepartments,
      topAgents: topAgents.map((a) => ({
        agentName: a.agentName || 'Unknown',
        count: a._count.id,
      })),
      recentTasks: recentTasks.map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt?.toISOString(),
      })),
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
        user: log.user ? { name: log.user.name } : undefined,
      })),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}