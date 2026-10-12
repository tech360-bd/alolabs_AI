import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, v1ProjectAccess, V1Error } from '@/lib/v1';
import { createRun, listRuns } from '@/lib/runs';

/**
 * /api/v1/runs — list runs (GET) or start a run (POST).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const status = request.nextUrl.searchParams.get('status') ?? undefined;
  const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined;
  const { runs, total } = await listRuns({
    companyId: identity.companyId,
    ...(status ? { status } : {}),
    ...(projectId ? { projectId } : {}),
    limit,
    offset,
  });
  return { runs, total, limit, offset };
});

const CreateRunSchema = z.object({
  objective: z.string().trim().min(1).max(10000),
  projectId: z.string().min(1).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateRunSchema.safeParse(body);
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
  return { runId: result.runId, status: result.status, eventsUrl: `/api/runs/${result.runId}/events` };
});
