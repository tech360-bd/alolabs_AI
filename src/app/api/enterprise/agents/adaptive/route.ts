import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getOrchestrator } from '@/lib/orchestrator';
import { z } from 'zod';

const AdaptiveRunSchema = z.object({
  task: z.string().min(1, 'task is required'),
  preferredAgentId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    const body = await request.json();
    const parsed = AdaptiveRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { task, preferredAgentId } = parsed.data;

    const orchestrator = getOrchestrator();
    const adaptiveResult = await orchestrator.executeAdaptive({
      task,
      userId: user.userId,
      companyId: user.companyId,
      preferredAgentId,
    });

    return NextResponse.json({ success: true, data: adaptiveResult });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[/api/enterprise/agents/adaptive]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
