import { NextRequest, NextResponse } from 'next/server';
import { getAgentHealthMonitor, getAgentStateManager } from '@/lib/agent-runtime';
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request);

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    const monitor = getAgentHealthMonitor();

    if (agentId) {
      const health = monitor.getHealth(agentId);
      return NextResponse.json({ success: true, data: health });
    }

    const allHealth = monitor.getAllHealth();
    const unhealthy = monitor.getUnhealthyAgents();

    // Get agents from DB
    const dbAgents = await db.agent.findMany({
      where: tenantWhere(tenant),
      select: { agentId: true, name: true, status: true, type: true, role: true, version: true, createdAt: true },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: {
        totalAgents: dbAgents.length,
        activeAgents: dbAgents.filter(a => a.status === 'active').length,
        healthScores: allHealth,
        unhealthyAgents: unhealthy,
        agents: dbAgents,
      },
    });
  } catch (error) {
    console.error('[/api/agent-runtime/health]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}