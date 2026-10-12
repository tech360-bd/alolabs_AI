import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getOrchestrator } from '@/lib/orchestrator';
import { z } from 'zod';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';

const AgentRunSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  task: z.string().min(1, 'task is required'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // A run must belong to the caller's tenant, not to a shared pseudo tenant.
    const user = await requireCompanyAuth();

    // Rate limit per user
    const rl = await checkEndpointLimit('/api/enterprise/agents/run', user.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = AgentRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { agentId, task } = parsed.data;

    const orchestrator = getOrchestrator();
    const orchestratorResult = await orchestrator.execute({
      task,
      userId: user.userId,
      companyId: user.companyId,
      preferredAgentId: agentId,
    });

    return NextResponse.json({ success: true, data: orchestratorResult });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[/api/enterprise/agents/run]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
