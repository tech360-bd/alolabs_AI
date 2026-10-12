import { NextRequest, NextResponse } from 'next/server';
import { getExecutionEngine, getAgentStateManager } from '@/lib/agent-runtime';
import { getAuthUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const engine = getExecutionEngine();
    const stateManager = getAgentStateManager();

    const engineStatus = engine.getStatus();
    const queue = engine.getQueue();
    const activeTasks = stateManager.getActiveTasks();
    const overdueTasks = stateManager.getOverdueTasks();
    const resourceUsage = stateManager.getResourceUsage(user.userId ?? user.userId);

    return NextResponse.json({
      success: true,
      data: {
        engine: engineStatus,
        queue: queue.map(t => ({
          id: t.id, agentId: t.agentId, priority: t.priority,
          input: t.input.slice(0, 100), status: t.status,
          createdAt: t.createdAt,
        })),
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        resourceUsage,
      },
    });
  } catch (error) {
    console.error('[/api/agent-runtime/status]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}