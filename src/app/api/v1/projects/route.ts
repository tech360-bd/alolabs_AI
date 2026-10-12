import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, v1ProjectAccess, V1Error } from '@/lib/v1';
import { createProject, listProjects, createProjectRun } from '@/lib/projects';

/**
 * /api/v1/projects — list (GET) or create (POST) projects.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const { projects, total } = await listProjects({
    companyId: identity.companyId,
    limit,
    offset,
  });
  return { projects, total, limit, offset };
});

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.string().max(10000).optional(),
  description: z.string().max(5000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }
  const project = await createProject({
    name: parsed.data.name,
    ...(parsed.data.objective !== undefined ? { objective: parsed.data.objective } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.settings ? { settings: parsed.data.settings } : {}),
    companyId: identity.companyId,
    ...(identity.kind === 'session' ? { ownerId: identity.userId } : {}),
  });
  return project;
});

/**
 * POST /api/v1/projects/:id/runs — start a run inside a project.
 * (Handled by the catch-all below via query param; see runs subroute.)
 */
export const PUT = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<Record<string, unknown>>(request);
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const objective = typeof body.objective === 'string' ? body.objective : '';
  if (!projectId || !objective) {
    throw new V1Error('projectId and objective are required', 400, 'VALIDATION_ERROR');
  }
  await v1ProjectAccess(projectId, identity.companyId);
  const result = await createProjectRun(projectId, objective, identity.kind === 'session' ? identity.userId : undefined);
  return { runId: result.runId, status: result.status, eventsUrl: `/api/runs/${result.runId}/events` };
});
