import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, v1ProjectAccess, V1Error } from '@/lib/v1';
import { createArtifact, listArtifacts } from '@/lib/artifacts';

/**
 * /api/v1/artifacts — list (GET) or create (POST) artifacts.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const q = request.nextUrl.searchParams;
  const { artifacts, total } = await listArtifacts({
    companyId: identity.companyId,
    ...(q.get('projectId') ? { projectId: q.get('projectId')! } : {}),
    ...(q.get('taskId') ? { taskId: q.get('taskId')! } : {}),
    ...(q.get('runId') ? { runId: q.get('runId')! } : {}),
    ...(q.get('type') ? { type: q.get('type')! } : {}),
    limit,
    offset,
  });
  return { artifacts, total, limit, offset };
});

const CreateArtifactSchema = z.object({
  name: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(50),
  content: z.string().max(5_000_000),
  projectId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateArtifactSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }
  if (parsed.data.projectId) await v1ProjectAccess(parsed.data.projectId, identity.companyId);
  const artifact = await createArtifact({
    ...parsed.data,
    metadata: parsed.data.metadata ?? {},
    companyId: identity.companyId,
    ...(identity.kind === 'session' ? { createdBy: identity.userId } : {}),
  });
  return artifact;
});
