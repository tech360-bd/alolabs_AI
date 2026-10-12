/**
 * ALO Labs AI-EOS — Unified Orchestrator API
 *
 * THE main endpoint for the ONE unified system.
 * POST /   — Execute a task (auto-route to best agent)
 * GET    /   — Get orchestrator stats + recent activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getOrchestrator } from '@/lib/orchestrator';
import { z } from 'zod';

const ExecuteSchema = z.object({
  task: z.string().trim().min(1, 'Task is required').max(10000),
  conversationId: z.string().min(1).optional(),
  preferredAgentId: z.string().min(1).optional(),
});

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

// ─── POST: Execute a task through the unified orchestrator ─────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const parsed = ExecuteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { task, conversationId, preferredAgentId } = parsed.data;

    // Rate limit check (simple in-memory)
    const orchestrator = getOrchestrator();

    const result = await orchestrator.execute({
      task,
      userId: user.userId,
      companyId: user.companyId,
      conversationId,
      preferredAgentId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[/api/enterprise/orchestrator POST]', error);
    return errorResponse(error);
  }
}

// ─── GET: Orchestrator stats and recent activity ───────────────────
export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const orchestrator = getOrchestrator();

    const [stats, recentRuns] = await Promise.all([
      orchestrator.getStats(user.companyId),
      orchestrator.getRecentRuns(8, user.companyId),
    ]);

    return NextResponse.json({
      success: true,
      data: { stats, recentRuns },
    });
  } catch (error) {
    console.error('[/api/enterprise/orchestrator GET]', error);
    return errorResponse(error);
  }
}
