import { z } from 'zod';
import { v1Handler, v1Body, v1ProjectAccess, V1Error } from '@/lib/v1';
import { createRun } from '@/lib/runs';

/**
 * POST /api/v1/command — THE ONE COMMAND.
 *
 * Give ALO Labs AgentOS a high-level objective. The Master Orchestrator plans,
 * decomposes, routes agents/skills/models/tools, executes, QC-gates, repairs,
 * and assembles artifacts — durably and asynchronously.
 *
 * Body: { "objective": "Research the best UK universities for this student..." }
 * Returns 202 with { runId, status, eventsUrl }.
 */

const CommandSchema = z.object({
  objective: z.string().trim().min(1).max(10000),
  projectId: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CommandSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  if (parsed.data.projectId) await v1ProjectAccess(parsed.data.projectId, identity.companyId);
  const result = await createRun({
    objective: parsed.data.objective,
    ...(identity.kind === 'session' ? { userId: identity.userId } : {}),
    companyId: identity.companyId,
    ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
    ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
  });

  return {
    runId: result.runId,
    status: result.status,
    eventsUrl: `/api/runs/${result.runId}/events`,
    detailUrl: `/api/runs/${result.runId}`,
    accepted: true,
  };
});
