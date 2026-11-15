import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { findInternalDetail } from '@/lib/client-services/client-safe';
import { tenantDb } from '@/lib/portal/tenant-db';

const STATUSES = ['pending', 'in_progress', 'completed'];

function clientSafe(...values: (string | null | undefined)[]) {
  const findings = findInternalDetail(values.filter(Boolean).join('\n'));
  if (findings.length) throw new InternalError(422, `This text refers to internal systems and cannot be shown to a client (${findings.map((f) => f.label).join(', ')}).`);
}

/** POST /api/internal/client-projects/:id/milestones — add an approved milestone. */
export const POST = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const project = await db.clientProject.findUnique({ where: { id }, select: { companyId: true } });
  if (!project) throw new InternalError(404, 'Client project not found.');
  const body = await readJsonBody(ctx.request);
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  if (!title) throw new InternalError(400, 'title is required.');
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null;
  clientSafe(title, description);
  const dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new InternalError(400, 'Invalid dueDate.');
  const tdb = tenantDb(project.companyId);
  const milestone = await tdb.clientProjectMilestone.create({
    data: { projectId: id, title, description, dueDate, sortOrder: await tdb.clientProjectMilestone.count({ where: { projectId: id } }) },
  });
  return { milestone };
});

/** PATCH /api/internal/client-projects/:id/milestones — update one. Body: { milestoneId, status?, title?, dueDate? } */
export const PATCH = internalRoute<{ id: string }>(CLIENT_SERVICE_ROLES, async (ctx, { id }) => {
  const project = await db.clientProject.findUnique({ where: { id }, select: { companyId: true } });
  if (!project) throw new InternalError(404, 'Client project not found.');
  const body = await readJsonBody(ctx.request);
  if (typeof body.milestoneId !== 'string') throw new InternalError(400, 'milestoneId is required.');
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(String(body.status))) throw new InternalError(400, 'Invalid status.');
    data.status = body.status;
    data.completedAt = body.status === 'completed' ? new Date() : null;
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    clientSafe(body.title);
    data.title = body.title.trim().slice(0, 200);
  }
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
  const milestone = await tenantDb(project.companyId).clientProjectMilestone.updateOwned(body.milestoneId, data, { projectId: id });
  if (!milestone) throw new InternalError(404, 'Milestone not found.');
  return { milestone };
});
